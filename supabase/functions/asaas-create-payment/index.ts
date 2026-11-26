import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const datePlusDays = (days: number) => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};

const BOOSTS: Record<string, { amount: number; days: number }> = {
  boost_1d10: { amount: 10, days: 1 },
  boost_1d15: { amount: 15, days: 1 },
  boost_2d10: { amount: 20, days: 2 },
  boost_7d50: { amount: 50, days: 7 },
  boost_15d100: { amount: 100, days: 15 },
  boost_30d200: { amount: 200, days: 30 },
  founder_7d: { amount: 0, days: 7 },
};
const STORES: Record<string, number> = { loja_fundador: 39, loja_basica: 39.90, loja_pro: 79.90, loja_premium: 129.90, loja_rede: 199.90 };

// Mais investimento médio por dia dá maior prioridade na distribuição; não garante compradores.
const reachMultiplierForDailyBudget = (daily: number, days: number) => {
  const spendTier = daily >= 50 ? 10 : daily >= 35 ? 7 : daily >= 20 ? 5 : daily >= 15 ? 3 : 2;
  const durationTier = days >= 30 ? 5 : days >= 15 ? 3 : days >= 7 ? 2 : days >= 3 ? 1 : 0;
  return spendTier + durationTier;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = (() => {
      const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.default) return parsed.default as string;
      }
      const fallback = Deno.env.get("SUPABASE_ANON_KEY");
      if (fallback) return fallback;
      throw new Error("Chave Supabase SUPABASE_PUBLISHABLE_KEYS não disponível no ambiente.");
    })();
    const serviceKey = (() => {
      const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.default) return parsed.default as string;
      }
      const fallback = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (fallback) return fallback;
      throw new Error("Chave Supabase SUPABASE_SECRET_KEYS não disponível no ambiente.");
    })();
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    const apiUrl = (Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3").replace(/\/$/, "");
    if (!apiKey) return json({ error: "Integração Asaas ainda não configurada no servidor." }, 503);
    const headers = { "Content-Type": "application/json", access_token: apiKey };

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Faça login para continuar." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida. Entre novamente." }, 401);
    const user = userData.user;
    const admin = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const kind = String(body.kind || "");
    const billingType = String(body.billingType || "");
    const listingId = body.listingId ? String(body.listingId) : null;
    const planCode = body.planCode ? String(body.planCode) : null;
    const storeName = String(body.storeName || "").trim();

    if (!["boost", "store"].includes(kind)) return json({ error: "Publicação de anúncios é gratuita. Escolha um turbinamento ou plano de loja." }, 400);
    const recurring = kind === "store";
    if (recurring && billingType !== "CREDIT_CARD") {
      return json({ error: "Para plano mensal e loja, escolha cartão de crédito no checkout seguro do Asaas. O Giro Fácil não solicita CPF." }, 400);
    }
    if (!recurring && billingType !== "PIX") {
      return json({ error: "Para esta cobrança, a opção disponível sem cadastro de CPF no Giro Fácil é PIX." }, 400);
    }

    let amount = 0;
    let durationDays = 0;
    let dailyBudget = 0;
    if (kind === "boost") {
      if (!listingId) return json({ error: "Selecione o anúncio que deseja turbinar." }, 400);
      if (planCode === "boost_custom") {
        const customValue = Number(body.customAmount);
        durationDays = Math.floor(Number(body.customDays) || 0);
        const customMode = String(body.customMode || "total");
        if (!Number.isFinite(customValue) || customValue < 10 || customValue > 5000 || durationDays < 1 || durationDays > 30 || !["total", "daily"].includes(customMode)) {
          return json({ error: "Orçamento personalizado: mínimo de R$ 10, duração de 1 a 30 dias e máximo de R$ 5.000 no total." }, 400);
        }
        amount = customMode === "daily" ? customValue * durationDays : customValue;
        if (amount > 5000) return json({ error: "O orçamento total não pode ultrapassar R$ 5.000." }, 400);
        dailyBudget = amount / durationDays;
      } else {
        const selected = planCode ? BOOSTS[planCode] : null;
        if (!selected) return json({ error: "Opção de turbinamento inválida." }, 400);
        amount = selected.amount; durationDays = selected.days;
      }
    }
    if (kind === "store") {
      if (!planCode || !(planCode in STORES) || storeName.length < 2) return json({ error: "Escolha um plano de loja e informe o nome da loja." }, 400);
      amount = STORES[planCode];
      if (planCode === "loja_fundador") {
        const { data: founderApplication, error: founderApplicationError } = await admin.from("partner_applications")
          .select("id,founder_number").eq("user_id", user.id).eq("founder_campaign_code", "fundadores-500")
          .eq("status", "aprovado").not("founder_number", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (founderApplicationError) throw founderApplicationError;
        const { data: partnerAccount, error: partnerAccountError } = await admin.from("partner_accounts")
          .select("status,business_name").eq("user_id", user.id).maybeSingle();
        if (partnerAccountError) throw partnerAccountError;
        if (!founderApplication || partnerAccount?.status !== "ativo") return json({ error: "O plano de R$ 39/mês é exclusivo para Parceiros Fundadores aprovados." }, 403);
        const { data: existingFounderPlan, error: existingFounderPlanError } = await admin.from("store_plans")
          .select("id,status").eq("user_id", user.id).eq("plan_code", "loja_fundador")
          .in("status", ["active", "awaiting_payment"]).limit(1).maybeSingle();
        if (existingFounderPlanError) throw existingFounderPlanError;
        if (existingFounderPlan) return json({ error: "Você já possui uma assinatura ou checkout do plano fundador." }, 409);
      }
    }
    let founderPlanForBoost: { id: string; founder_turbo_claimed_at: string | null } | null = null;
    const freeFounderBoost = kind === "boost" && planCode === "founder_7d";
    if (freeFounderBoost) {
      durationDays = 7; amount = 0;
      const { data: founderPlan, error: founderPlanError } = await admin.from("store_plans")
        .select("id,founder_turbo_claimed_at").eq("user_id", user.id).eq("plan_code", "loja_fundador")
        .eq("status", "active").limit(1).maybeSingle();
      if (founderPlanError) throw founderPlanError;
      if (!founderPlan) return json({ error: "O turbo gratuito é liberado após a primeira mensalidade do plano Parceiro Fundador." }, 403);
      if (founderPlan.founder_turbo_claimed_at) return json({ error: "Seu benefício de turbo de 7 dias já foi utilizado." }, 409);
      founderPlanForBoost = founderPlan;
    }
    const { data: currentProfile, error: currentProfileError } = await admin.from("perfis").select("papel").eq("id", user.id).maybeSingle();
    if (currentProfileError) throw new Error("Não foi possível verificar o perfil administrativo.");
    const isAdmin = currentProfile?.papel === "admin";
    const freeAdminBoost = kind === "boost" && isAdmin;
    if (!Number.isFinite(amount) || (amount <= 0 && !freeAdminBoost && !freeFounderBoost)) return json({ error: "Preço inválido." }, 400);
    if (freeAdminBoost) amount = 0;

    if (kind === "boost") {
      if (!listingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) return json({ error: "Selecione um anúncio válido." }, 400);
      const { data: listing, error } = await admin.from("anuncios").select("id,usuario_id,status").eq("id", listingId).eq("usuario_id", user.id).maybeSingle();
      if (error || !listing) return json({ error: "Anúncio não encontrado para esta conta." }, 404);
      if (freeFounderBoost && listing.status !== "ativo") return json({ error: "Escolha um anúncio ativo para usar o turbo promocional." }, 409);
    }

    if (freeAdminBoost) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const { data: freeOrder, error: freeOrderError } = await admin.from("payment_orders").insert({
        user_id: user.id, listing_id: listingId, kind: "boost", billing_type: billingType,
        amount: 0, status: "PAID", asaas_customer_id: null,
      }).select("id").single();
      if (freeOrderError || !freeOrder) throw new Error("Não foi possível registrar o turbinamento gratuito do administrador.");
      const baseAmount = planCode === "boost_custom" ? (String(body.customMode || "total") === "daily" ? Number(body.customAmount) : Number(body.customAmount) / durationDays) : ((BOOSTS[planCode!]?.amount || 10) / Math.max(1, durationDays));
      const { error: freeBoostError } = await admin.from("ad_boosts").insert({
        order_id: freeOrder.id, user_id: user.id, listing_id: listingId, plan_code: planCode,
        duration_days: durationDays, amount: 0, reach_multiplier: reachMultiplierForDailyBudget(baseAmount, durationDays),
        status: "active", starts_at: now.toISOString(), ends_at: endsAt.toISOString(),
      });
      if (freeBoostError) throw new Error("O pedido foi registrado, mas não foi possível ativar o turbinamento gratuito.");
      return json({ orderId: freeOrder.id, kind, billingType, amount: 0, status: "ACTIVE", freeForAdmin: true, startsAt: now.toISOString(), endsAt: endsAt.toISOString(), durationDays });
    }

    if (freeFounderBoost && founderPlanForBoost) {
      const claimedAt = new Date().toISOString();
      const { data: claimedPlan, error: claimError } = await admin.from("store_plans")
        .update({ founder_turbo_claimed_at: claimedAt }).eq("id", founderPlanForBoost.id)
        .is("founder_turbo_claimed_at", null).select("id").maybeSingle();
      if (claimError) throw claimError;
      if (!claimedPlan) return json({ error: "O benefício já foi utilizado em outro anúncio." }, 409);
      const { data: freeOrder, error: freeOrderError } = await admin.from("payment_orders").insert({
        user_id: user.id, listing_id: listingId, kind: "boost", billing_type: "PIX",
        amount: 0, status: "PAID", asaas_customer_id: null, plan_code: "founder_7d", duration_days: 7,
      }).select("id").single();
      if (freeOrderError || !freeOrder) {
        await admin.from("store_plans").update({ founder_turbo_claimed_at: null }).eq("id", founderPlanForBoost.id).eq("founder_turbo_claimed_at", claimedAt);
        throw new Error("Não foi possível registrar o benefício gratuito.");
      }
      const starts = new Date(); const ends = new Date(starts.getTime() + 7 * 86400000);
      const { error: freeBoostError } = await admin.from("ad_boosts").insert({
        order_id: freeOrder.id, user_id: user.id, listing_id: listingId, plan_code: "founder_7d",
        duration_days: 7, amount: 0, reach_multiplier: 3, status: "active",
        starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      });
      if (freeBoostError) {
        await admin.from("store_plans").update({ founder_turbo_claimed_at: null }).eq("id", founderPlanForBoost.id).eq("founder_turbo_claimed_at", claimedAt);
        await admin.from("payment_orders").delete().eq("id", freeOrder.id);
        throw new Error("Não foi possível ativar o turbo promocional.");
      }
      return json({ orderId: freeOrder.id, kind: "boost", amount: 0, status: "ACTIVE", freeForFounder: true, startsAt: starts.toISOString(), endsAt: ends.toISOString(), durationDays: 7 });
    }

    const { data: order, error: orderError } = await admin.from("payment_orders").insert({
      user_id: user.id, listing_id: listingId, kind, billing_type: billingType,
      amount, status: "CREATING", asaas_customer_id: null, plan_code: planCode,
      duration_days: durationDays || null,
    }).select("id").single();
    if (orderError || !order) throw new Error("Não foi possível registrar o pedido de pagamento.");

    const itemName = kind === "boost" ? "Turbinamento Giro Fácil BR"
      : planCode === "loja_fundador" ? "Plano Parceiro Fundador Giro Fácil BR"
      : `Plano de loja Giro Fácil BR - ${storeName}`;
    const itemDescription = kind === "boost" ? `Destaque ${planCode} por ${durationDays} dia(s), orçamento total R$ ${amount.toFixed(2)}`
      : planCode === "loja_fundador" ? "Assinatura mensal de Parceiro Fundador por R$ 39,00"
      : `Assinatura mensal da loja ${storeName} (${planCode})`;

    const checkoutPayload: Record<string, unknown> = {
      billingTypes: [billingType],
      chargeTypes: [recurring ? "RECURRENT" : "DETACHED"],
      minutesToExpire: 60,
      externalReference: order.id,
      callback: {
        successUrl: "https://girofacilbr.com.br/?pagamento=retorno",
        cancelUrl: "https://girofacilbr.com.br/?pagamento=cancelado",
        expiredUrl: "https://girofacilbr.com.br/?pagamento=expirado",
      },
      items: [{ name: itemName, description: itemDescription, quantity: 1, value: amount }],
    };
    if (recurring) {
      checkoutPayload.subscription = { cycle: "MONTHLY", nextDueDate: `${datePlusDays(3)} 12:00:00` };
    }

    const checkoutResponse = await fetch(`${apiUrl}/checkouts`, {
      method: "POST", headers, body: JSON.stringify(checkoutPayload),
    });
    const checkout = await checkoutResponse.json();
    if (!checkoutResponse.ok || !checkout.id) {
      await admin.from("payment_orders").update({ status: "FAILED" }).eq("id", order.id);
      const reason = checkout.errors?.[0]?.description || checkout.message || "O Asaas não conseguiu abrir o checkout.";
      throw new Error(reason);
    }

    // Atualiza de forma aditiva o webhook já cadastrado para receber Checkout e assinatura.
    let checkoutWebhookReady = false;
    try {
      const webhookUrl = `${supabaseUrl}/functions/v1/asaas-webhook`;
      const webhooksResponse = await fetch(`${apiUrl}/webhooks`, { headers });
      if (webhooksResponse.ok) {
        const webhooksBody = await webhooksResponse.json();
        const currentWebhook = (webhooksBody.data || []).find((item: any) => item.url === webhookUrl);
        if (currentWebhook?.id) {
          const events = [...new Set([
            ...(currentWebhook.events || []),
            "CHECKOUT_CREATED", "CHECKOUT_PAID", "CHECKOUT_CANCELED", "CHECKOUT_EXPIRED",
            "SUBSCRIPTION_CREATED", "SUBSCRIPTION_UPDATED", "SUBSCRIPTION_INACTIVATED", "SUBSCRIPTION_DELETED",
          ])];
          const updateWebhookResponse = await fetch(`${apiUrl}/webhooks/${currentWebhook.id}`, {
            method: "PUT", headers, body: JSON.stringify({ events }),
          });
          checkoutWebhookReady = updateWebhookResponse.ok;
          if (!updateWebhookResponse.ok) console.error("Could not add Checkout events to existing Asaas webhook", await updateWebhookResponse.text());
        }
      }
    } catch (webhookError) {
      console.error("Asaas Checkout webhook configuration check failed", webhookError);
    }
    if (!checkoutWebhookReady) {
      await admin.from("payment_orders").update({ status: "FAILED" }).eq("id", order.id);
      return json({ error: "O checkout foi preparado, mas o webhook do Asaas ainda não confirmou os eventos de pagamento. Nenhuma cobrança foi liberada. Verifique a configuração do webhook no Asaas e tente novamente." }, 503);
    }
    const checkoutBase = apiUrl.includes("sandbox") ? "https://sandbox.asaas.com" : "https://asaas.com";
    const checkoutUrl = checkout.link || `${checkoutBase}/checkoutSession/show?id=${encodeURIComponent(checkout.id)}`;
    const { error: checkoutOrderError } = await admin.from("payment_orders").update({
      asaas_checkout_id: checkout.id, payment_url: checkoutUrl, status: "AWAITING_PAYMENT",
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (checkoutOrderError) throw new Error("Checkout criado, mas não foi possível salvar o link do pedido.");

    if (kind === "boost") {
      const { error } = await admin.from("ad_boosts").insert({
        order_id: order.id, user_id: user.id, listing_id: listingId, plan_code: planCode,
        duration_days: durationDays, amount, reach_multiplier: reachMultiplierForDailyBudget(dailyBudget || (amount / Math.max(1, durationDays)), durationDays), status: "awaiting_payment",
      });
      if (error) throw new Error("Checkout criado, mas não foi possível registrar o turbinamento.");
    }
    if (kind === "store") {
      const { error: storeError } = await admin.from("store_plans").insert({
        order_id: order.id, user_id: user.id, store_name: storeName, plan_code: planCode,
        amount, status: "awaiting_payment",
      });
      if (storeError) throw new Error("Checkout criado, mas não foi possível registrar o plano da loja.");
    }

    return json({
      orderId: order.id, checkoutId: checkout.id, checkoutUrl, paymentUrl: checkoutUrl,
      kind, billingType, amount, status: "AWAITING_PAYMENT",
      recurring, checkoutWebhookReady, dailyBudget: kind === "boost" ? (dailyBudget || amount / Math.max(1, durationDays)) : null, reachMultiplier: kind === "boost" ? reachMultiplierForDailyBudget(dailyBudget || amount / Math.max(1, durationDays), durationDays) : null, message: recurring
        ? "Checkout seguro aberto. A assinatura mensal será criada pelo Asaas após a conclusão do pagamento."
        : "Checkout PIX criado. O pagamento será confirmado pelo webhook do Asaas.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado ao criar pagamento.";
    console.error("Asaas payment creation error", message);
    if (/não pertence a este ambiente|does not belong to this environment/i.test(message)) {
      return json({
        code: "ASAAS_ENVIRONMENT_MISMATCH",
        error: "A chave do Asaas não corresponde ao ambiente configurado. A equipe precisa alinhar a chave e a URL (sandbox ou produção). Nenhuma cobrança deve ser repetida até essa conferência.",
      }, 503);
    }
    return json({ error: message }, 500);
  }
});
