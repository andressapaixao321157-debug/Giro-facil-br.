import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const states = new Set("AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" "));
const categories = new Set(["Carro","Moto","Caminhão","Utilitário","Máquinas e equipamentos","Embarcações","Imóvel para venda","Imóvel para aluguel","Roupas e acessórios","Objetos e diversos","Móveis e decoração","Eletrônicos","Casa e construção","Agro e pecuária","Esportes e lazer"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = (() => {
      const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (raw) { const parsed = JSON.parse(raw); if (parsed.default) return parsed.default as string; }
      const fallback = Deno.env.get("SUPABASE_ANON_KEY");
      if (fallback) return fallback;
      throw new Error("Chave pública Supabase não disponível.");
    })();
    const service = (() => {
      const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (raw) { const parsed = JSON.parse(raw); if (parsed.default) return parsed.default as string; }
      const fallback = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (fallback) return fallback;
      throw new Error("Chave privada Supabase não disponível.");
    })();
    const authorization = req.headers.get("Authorization");
    if (!authorization) return reply({ error: "Faça login." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);
    const admin = createClient(url, service);
    const userId = authData.user.id;
    const { data: profile, error: profileError } = await admin.from("perfis").select("papel").eq("id", userId).maybeSingle();
    if (profileError) throw profileError;
    const isAdmin = profile?.papel === "admin";
    const body = await req.json().catch(() => ({}));
    // Proteção explícita: nenhum agente ou endpoint automático pode bloquear contas.
    const forbiddenAccountControlActions = new Set(["block_user", "unblock_user", "suspend_user", "ban_user", "restrict_user"]);
    if (forbiddenAccountControlActions.has(String(body?.action ?? ""))) {
      return reply({ error: "Bloqueio e desbloqueio de contas não podem ser executados por robôs ou por este serviço." }, 403);
    }

    if (body?.action === "bulk_create_listings") {
      const { data: partner, error: partnerError } = await admin.from("partner_accounts")
        .select("user_id,business_name,status").eq("user_id", userId).maybeSingle();
      if (partnerError) throw partnerError;
      if (!isAdmin && (!partner || partner.status !== "ativo")) return reply({ error: "Somente parceiros aprovados podem cadastrar anúncios em lote." }, 403);
      const input = body.listings;
      if (!Array.isArray(input) || input.length < 1 || input.length > 20) return reply({ error: "Envie de 1 a 20 anúncios por lote." }, 400);
      const rows = [];
      for (let i = 0; i < input.length; i++) {
        const item = input[i] || {};
        const titulo = String(item.titulo ?? "").trim();
        const categoria = String(item.categoria ?? "").trim();
        const marca = String(item.marca ?? "").trim();
        const modelo = String(item.modelo ?? "").trim();
        const preco = Number(item.preco);
        const cidade = String(item.cidade ?? "").trim();
        const estado = String(item.estado ?? "").trim().toUpperCase();
        const whatsapp = String(item.whatsapp ?? "").replace(/\\D/g, "");
        const descricao = String(item.descricao ?? "").trim();
        const fotos = Array.isArray(item.fotos) ? item.fotos.map((x: unknown) => String(x).trim()).filter(Boolean) : [];
        const ano = item.ano === null || item.ano === "" || item.ano === undefined ? null : Number(item.ano);
        if (!titulo || !categories.has(categoria) || !marca || !modelo || !Number.isFinite(preco) || preco <= 0 || !cidade || !states.has(estado)) {
          return reply({ error: "Linha " + (i + 1) + ": informe título, uma categoria válida do Giro Fácil, marca, modelo, preço válido, cidade e UF válida." }, 400);
        }
        if (ano !== null && (!Number.isInteger(ano) || ano < 1900 || ano > new Date().getFullYear() + 1)) return reply({ error: "Linha " + (i + 1) + ": ano inválido." }, 400);
        if (fotos.length < 1 || fotos.some((photo: string) => { try { return new URL(photo).protocol !== "https:"; } catch { return true; } })) {
          return reply({ error: "Linha " + (i + 1) + ": inclua pelo menos uma foto real com endereço HTTPS." }, 400);
        }
        rows.push({ usuario_id: userId, titulo, categoria, marca, modelo, ano, preco, cidade, estado, whatsapp: whatsapp || null, descricao: descricao || null, fotos, status: "pendente", pagamento_status: "nao_pago" });
      }
      const { data, error } = await admin.from("anuncios").insert(rows).select("id,status");
      if (error) throw error;
      return reply({ success: true, count: data?.length || 0, listings: data || [], message: "Anúncios recebidos e enviados para revisão. Nenhum foi publicado ou marcado como pago." });
    }

    if (!isAdmin) return reply({ error: "Acesso restrito ao administrador." }, 403);

    if (body?.action === "review_partner_application") {
      const applicationId = String(body.applicationId ?? "");
      const decision = String(body.decision ?? "");
      if (!uuid(applicationId) || !["aprovado", "rejeitado"].includes(decision)) return reply({ error: "Dados de análise inválidos." }, 400);
      const { data: application, error: appError } = await admin.from("partner_applications")
        .select("id,user_id,business_name,business_type,status").eq("id", applicationId).maybeSingle();
      if (appError) throw appError;
      if (!application) return reply({ error: "Solicitação não encontrada." }, 404);
      if (application.status !== "pendente") return reply({ error: "Esta solicitação já foi analisada." }, 409);
      const { data: reviewed, error: reviewError } = await admin.from("partner_applications")
        .update({ status: decision, reviewed_at: new Date().toISOString(), reviewed_by: userId })
        .eq("id", applicationId).eq("status", "pendente").select("id").maybeSingle();
      if (reviewError) throw reviewError;
      if (!reviewed) return reply({ error: "A solicitação já foi alterada por outro administrador." }, 409);
      if (decision === "aprovado") {
        const { data: existing, error: existingError } = await admin.from("partner_accounts")
          .select("user_id").eq("user_id", application.user_id).maybeSingle();
        if (existingError) throw existingError;
        if (existing) {
          const { error } = await admin.from("partner_accounts").update({
            application_id: application.id, business_name: application.business_name,
            business_type: application.business_type, status: "ativo", approved_at: new Date().toISOString(), approved_by: userId,
          }).eq("user_id", application.user_id);
          if (error) throw error;
        } else {
          const { error } = await admin.from("partner_accounts").insert({
            user_id: application.user_id, application_id: application.id,
            business_name: application.business_name, business_type: application.business_type,
            status: "ativo", approved_by: userId,
          });
          if (error) throw error;
        }
      }
      return reply({ success: true, decision, businessName: application.business_name });
    }

    if (body?.action === "update_acquisition_lead") {
      const leadId = String(body.leadId ?? "");
      const next = String(body.status ?? "");
      if (!uuid(leadId) || !["novo", "em_contato", "qualificado", "convertido", "descartado"].includes(next)) return reply({ error: "Dados de atualização inválidos." }, 400);
      const { data, error } = await admin.from("acquisition_leads").update({ status: next, updated_at: new Date().toISOString() }).eq("id", leadId).select("id,status").maybeSingle();
      if (error) throw error;
      if (!data) return reply({ error: "Interessado não encontrado." }, 404);
      return reply({ success: true, lead: data });
    }

    if (body?.action === "moderate_listing") {
      const listingId = String(body.listingId ?? "");
      const nextStatus = String(body.status ?? "");
      if (!uuid(listingId)) return reply({ error: "ID de anúncio inválido." }, 400);
      if (!["ativo", "rejeitado"].includes(nextStatus)) return reply({ error: "Status de moderação inválido." }, 400);
      const { data: candidate, error: candidateError } = await admin.from("anuncios")
        .select("id,usuario_id,pagamento_status,status").eq("id", listingId).eq("status", "pendente").maybeSingle();
      if (candidateError) throw candidateError;
      if (!candidate) return reply({ error: "Anúncio pendente não encontrado ou já moderado." }, 404);
      if (nextStatus === "ativo") {
        const { data: owner, error: ownerError } = await admin.from("perfis").select("plano_status").eq("id", candidate.usuario_id).maybeSingle();
        if (ownerError) throw ownerError;
        // O administrador pode aprovar gratuitamente os próprios anúncios.
        // Anúncios de outros usuários continuam sujeitos à confirmação de pagamento/plano.
        const adminOwnListing = isAdmin && candidate.usuario_id === userId;
        const paidIndividually = candidate.pagamento_status === "pago";
        const coveredByPlan = candidate.pagamento_status === "plano" && owner?.plano_status === "ativo";
        if (!adminOwnListing && !paidIndividually && !coveredByPlan) {
          return reply({ error: "Não é possível aprovar: o pagamento do anúncio ainda não foi confirmado." }, 409);
        }
      }
      const { data: listing, error: moderationError } = await admin.from("anuncios").update({ status: nextStatus })
        .eq("id", listingId).eq("status", "pendente").select("id,status").maybeSingle();
      if (moderationError) throw moderationError;
      if (!listing) return reply({ error: "Anúncio pendente não encontrado ou já moderado." }, 404);
      return reply({ success: true, listing });
    }

    const [users, ads, pending, paid, orders, latestAds, boosts, stores, acquisitionLeads, acquisitionEvents, partnerApps, partnerAccounts] = await Promise.all([
      admin.from("perfis").select("id", { count: "exact", head: true }),
      admin.from("anuncios").select("id", { count: "exact", head: true }),
      admin.from("anuncios").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      admin.from("payment_orders").select("amount").eq("status", "PAID"),
      admin.from("payment_orders").select("id,user_id,kind,amount,status,created_at").order("created_at", { ascending: false }).limit(30),
      admin.from("anuncios").select("id,titulo,preco,status,usuario_id,criado_em").order("criado_em", { ascending: false }).limit(30),
      admin.from("ad_boosts").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("store_plans").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("acquisition_leads").select("id,contact_name,business_name,email,phone,lead_type,category,city,state,source,referral_code,status,created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(100),
      admin.from("acquisition_events").select("event_name,region_state,source,created_at").order("created_at", { ascending: false }).limit(1000),
      admin.from("partner_applications").select("id,user_id,business_name,business_type,contact_name,phone,city,state,status,created_at,reviewed_at,founder_campaign_code,founder_number").eq("founder_campaign_code", "fundadores-500").order("created_at", { ascending: false }).limit(500),
      admin.from("partner_accounts").select("user_id", { count: "exact", head: true }).eq("status", "ativo"),
    ]);
    const queryError = [users, ads, pending, paid, orders, latestAds, boosts, stores, acquisitionLeads, acquisitionEvents, partnerApps, partnerAccounts].find(x => x.error);
    if (queryError?.error) throw new Error("Não foi possível carregar todos os dados administrativos: " + queryError.error.message);
    const [founderTotal, founderPending, founderApproved, founderRejected] = await Promise.all([
      admin.from("partner_applications").select("id", { count: "exact", head: true }).eq("founder_campaign_code", "fundadores-500"),
      admin.from("partner_applications").select("id", { count: "exact", head: true }).eq("founder_campaign_code", "fundadores-500").eq("status", "pendente"),
      admin.from("partner_applications").select("id", { count: "exact", head: true }).eq("founder_campaign_code", "fundadores-500").eq("status", "aprovado"),
      admin.from("partner_applications").select("id", { count: "exact", head: true }).eq("founder_campaign_code", "fundadores-500").eq("status", "rejeitado"),
    ]);
    const founderError = [founderTotal, founderPending, founderApproved, founderRejected].find(x => x.error);
    if (founderError?.error) throw new Error("Não foi possível calcular o progresso dos parceiros fundadores: " + founderError.error.message);
    const founderCount = founderTotal.count || 0;
    const revenue = (paid.data || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    const byState = (acquisitionLeads.data || []).reduce((acc: Record<string, number>, row: any) => { const uf = String(row.state || "").trim().toUpperCase(); if (uf) acc[uf] = (acc[uf] || 0) + 1; return acc; }, {});
    return reply({
      totals: {
        users: users.count || 0, ads: ads.count || 0, pendingAds: pending.count || 0,
        paidRevenue: revenue, activeBoosts: boosts.count || 0, activeStores: stores.count || 0,
        activePartners: partnerAccounts.count || 0, pendingPartners: founderPending.count || 0,
      },
      orders: orders.data || [], listings: latestAds.data || [], partnerApplications: partnerApps.data || [],
      founderCampaign: { total: founderCount, pending: founderPending.count || 0, approved: founderApproved.count || 0, rejected: founderRejected.count || 0, remainingTarget: Math.max(0, 500 - founderCount), progressPercent: Math.min(100, Math.round(founderCount / 500 * 100)) },
      acquisition: { total: acquisitionLeads.count || 0, byState, newLeads: (acquisitionLeads.data || []).filter(x => x.status === "novo").length, leads: acquisitionLeads.data || [], events: acquisitionEvents.data || [] },
    });
  } catch (error) {
    console.error("Admin dashboard error", error);
    return reply({ error: error instanceof Error ? error.message : "Erro ao carregar painel." }, 500);
  }
});
