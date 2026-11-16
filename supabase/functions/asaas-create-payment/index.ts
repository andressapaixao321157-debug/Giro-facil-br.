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
  boost_3d: { amount: 19.90, days: 3 },
  boost_7d: { amount: 34.90, days: 7 },
  boost_15d: { amount: 59.90, days: 15 },
  boost_30d: { amount: 89.90, days: 30 },
  boost_60d: { amount: 149.90, days: 60 },
};
const STORES: Record<string, number> = { loja_basica: 99, loja_pro: 199, loja_premium: 399 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    const apiUrl = (Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3").replace(/\/$/, "");
    const singlePrice = Number(Deno.env.get("ASAAS_SINGLE_AD_PRICE") || 10);
    const monthlyPrice = Number(Deno.env.get("ASAAS_MONTHLY_PLAN_PRICE") || 59);
    if (!apiKey) return json({ error: "Integração Asaas ainda não configurada no servidor." }, 503);

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

    if (!["single", "monthly", "boost", "store"].includes(kind)) return json({ error: "Tipo de cobrança inválido." }, 400);
    if (!["PIX", "BOLETO"].includes(billingType)) return json({ error: "Escolha PIX ou boleto." }, 400);

    let amount = kind === "single" ? singlePrice : kind === "monthly" ? monthlyPrice : 0;
    let durationDays = 0;
    if (kind === "boost") {
      if (!listingId) return json({ error: "Selecione o anúncio que deseja turbinar." }, 400);
      if (planCode === "boost_custom") {
        amount = Number(body.customAmount);
        durationDays = Math.max(1, Math.min(30, Math.floor(Number(body.customDays) || 0)));
        if (!Number.isFinite(amount) || amount < 20 || amount > 5000 || !durationDays) {
          return json({ error: "Orçamento personalizado: informe de R$ 20 a R$ 5.000 e duração de 1 a 30 dias." }, 400);
        }
      } else {
        const selected = planCode ? BOOSTS[planCode] : null;
        if (!selected) return json({ error: "Opção de turbinamento inválida." }, 400);
        amount = selected.amount; durationDays = selected.days;
      }
    }
    if (kind === "store") {
      if (!planCode || !(planCode in STORES) || storeName.length < 2) return json({ error: "Escolha um plano de loja e informe o nome da loja." }, 400);
      amount = STORES[planCode];
    }
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "Preço inválido." }, 400);

    if (kind === "single" || kind === "boost") {
      if (!listingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) return json({ error: "Selecione um anúncio válido." }, 400);
      const { data: listing, error } = await admin.from("anuncios").select("id,usuario_id,status").eq("id", listingId).eq("usuario_id", user.id).maybeSingle();
      if (error || !listing) return json({ error: "Anúncio não encontrado para esta conta." }, 404);
      if (kind === "single" && listing.status !== "pendente") return json({ error: "Este anúncio não está aguardando pagamento." }, 409);
    }

    const { data: profile } = await admin.from("perfis").select("nome,asaas_customer_id").eq("id", user.id).maybeSingle();
    let customerId = profile?.asaas_customer_id as string | null;
    const headers = { access_token: apiKey, "Content-Type": "application/json", Accept: "application/json", "User-Agent": "GiroFacilBR/1.0" };
    if (!customerId) {
      const customerResponse = await fetch(`${apiUrl}/customers`, {
        method: "POST", headers,
        body: JSON.stringify({ name: profile?.nome || user.user_metadata?.nome || user.email?.split("@")[0] || "Cliente Giro Fácil", email: user.email, externalReference: user.id }),
      });
      const customer = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customer.errors?.[0]?.description || "Não foi possível cadastrar o pagador no Asaas.");
      customerId = customer.id;
      const { error } = await admin.from("perfis").upsert({ id: user.id, nome: profile?.nome || user.user_metadata?.nome || "Usuário", asaas_customer_id: customerId });
      if (error) throw new Error("Não foi possível salvar o cadastro de pagamento.");
    }

    const orderKind = kind === "boost" ? "boost" : kind === "store" ? "store" : kind;
    const { data: order, error: orderError } = await admin.from("payment_orders").insert({
      user_id: user.id, listing_id: listingId, kind: orderKind, billing_type: billingType,
      amount, status: "CREATING", asaas_customer_id: customerId, plan_code: planCode, duration_days: durationDays || null,
    }).select("id").single();
    if (orderError) throw new Error("Não foi possível registrar o pedido de pagamento.");

    const response = await fetch(`${apiUrl}/payments`, {
      method: "POST", headers,
      body: JSON.stringify({
        customer: customerId, billingType, value: amount, dueDate: datePlusDays(3),
        description: kind === "single" ? `Giro Fácil - anúncio #${listingId}` :
          kind === "boost" ? `Giro Fácil - turbinamento ${planCode}` :
          kind === "store" ? `Giro Fácil - plano de loja ${planCode} - ${storeName}` : "Giro Fácil - plano mensal",
        externalReference: order.id,
      }),
    });
    const payment = await response.json();
    if (!response.ok) {
      await admin.from("payment_orders").update({ status: "FAILED" }).eq("id", order.id);
      throw new Error(payment.errors?.[0]?.description || "O Asaas não conseguiu criar a cobrança.");
    }
    let pix: any = null;
    if (billingType === "PIX") {
      const pixResponse = await fetch(`${apiUrl}/payments/${payment.id}/pixQrCode`, { headers });
      if (pixResponse.ok) pix = await pixResponse.json();
    }
    const { error: updateError } = await admin.from("payment_orders").update({
      asaas_payment_id: payment.id, status: payment.status || "PENDING",
      payment_url: payment.invoiceUrl || null, boleto_url: payment.bankSlipUrl || null,
      pix_copy_paste: pix?.payload || null, pix_encoded_image: pix?.encodedImage || null,
    }).eq("id", order.id);
    if (updateError) throw new Error("Cobrança criada, mas não foi possível salvar os dados do pedido.");

    if (kind === "boost") {
      const { error } = await admin.from("ad_boosts").insert({
        order_id: order.id, user_id: user.id, listing_id: listingId, plan_code: planCode,
        duration_days: durationDays, amount, status: "awaiting_payment",
      });
      if (error) throw new Error("Cobrança criada, mas não foi possível registrar o turbinamento.");
    }
    if (kind === "store") {
      const { error } = await admin.from("store_plans").insert({
        order_id: order.id, user_id: user.id, store_name: storeName, plan_code: planCode,
        amount, status: "awaiting_payment",
      });
      if (error) throw new Error("Cobrança criada, mas não foi possível registrar o plano da loja.");
    }

    return json({
      orderId: order.id, kind, billingType, amount, status: payment.status,
      paymentUrl: payment.invoiceUrl || null, boletoUrl: payment.bankSlipUrl || null,
      pixCopyPaste: pix?.payload || null, pixEncodedImage: pix?.encodedImage || null,
    });
  } catch (error) {
    console.error("Asaas payment creation error", error);
    return json({ error: error instanceof Error ? error.message : "Erro inesperado ao criar pagamento." }, 500);
  }
});
