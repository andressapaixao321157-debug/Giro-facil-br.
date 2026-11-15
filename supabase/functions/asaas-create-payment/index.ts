import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function datePlusDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    const apiUrl = (Deno.env.get("ASAAS_API_URL") || "https://api-sandbox.asaas.com/v3").replace(/\/$/, "");
    const singlePrice = Number(Deno.env.get("ASAAS_SINGLE_AD_PRICE") || 0);
    const monthlyPrice = Number(Deno.env.get("ASAAS_MONTHLY_PLAN_PRICE") || 0);

    if (!apiKey) return json({ error: "Integração Asaas ainda não configurada no servidor." }, 503);
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Faça login para continuar." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Sessão inválida. Entre novamente." }, 401);
    const user = userData.user;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const kind = body.kind;
    const billingType = body.billingType;
    const listingId = body.listingId ? Number(body.listingId) : null;

    if (!["single", "monthly"].includes(kind)) return json({ error: "Tipo de cobrança inválido." }, 400);
    if (!["PIX", "BOLETO"].includes(billingType)) return json({ error: "Escolha PIX ou boleto." }, 400);
    const amount = kind === "single" ? singlePrice : monthlyPrice;
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "O preço desta modalidade ainda não foi configurado. Informe os valores para ativar a cobrança." }, 409);
    if (kind === "single" && (!listingId || !Number.isInteger(listingId))) return json({ error: "Selecione um anúncio para pagar." }, 400);

    if (kind === "single") {
      const { data: listing, error } = await admin.from("anuncios").select("id,usuario_id,status").eq("id", listingId).eq("usuario_id", user.id).maybeSingle();
      if (error || !listing) return json({ error: "Anúncio não encontrado para esta conta." }, 404);
      if (listing.status !== "pendente") return json({ error: "Este anúncio não está aguardando pagamento." }, 409);
    }

    const { data: profile } = await admin.from("perfis").select("nome,asaas_customer_id").eq("id", user.id).maybeSingle();
    let customerId = profile?.asaas_customer_id as string | null;
    const headers = { access_token: apiKey, "Content-Type": "application/json", Accept: "application/json" };

    if (!customerId) {
      const customerResponse = await fetch(`${apiUrl}/customers`, {
        method: "POST", headers,
        body: JSON.stringify({
          name: profile?.nome || user.user_metadata?.nome || user.email?.split("@")[0] || "Cliente Giro Fácil",
          email: user.email,
          externalReference: user.id,
        }),
      });
      const customer = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customer.errors?.[0]?.description || "Não foi possível cadastrar o pagador no Asaas.");
      customerId = customer.id;
      await admin.from("perfis").upsert({ id: user.id, nome: profile?.nome || user.user_metadata?.nome || "Usuário", asaas_customer_id: customerId });
    }

    const { data: order, error: orderError } = await admin.from("payment_orders").insert({
      user_id: user.id, listing_id: kind === "single" ? listingId : null,
      kind, billing_type: billingType, amount, status: "CREATING",
      asaas_customer_id: customerId,
    }).select("id").single();
    if (orderError) throw new Error("Não foi possível registrar o pedido de pagamento.");

    const dueDate = datePlusDays(3);
    let result: any;
    if (kind === "single") {
      const response = await fetch(`${apiUrl}/payments`, {
        method: "POST", headers,
        body: JSON.stringify({
          customer: customerId, billingType, value: amount, dueDate,
          description: `Giro Fácil - publicação do anúncio #${listingId}`,
          externalReference: order.id,
        }),
      });
      result = await response.json();
      if (!response.ok) throw new Error(result.errors?.[0]?.description || "O Asaas não conseguiu criar a cobrança.");
      let pix: any = null;
      if (billingType === "PIX") {
        const pixResponse = await fetch(`${apiUrl}/payments/${result.id}/pixQrCode`, { headers });
        if (pixResponse.ok) pix = await pixResponse.json();
      }
      await admin.from("payment_orders").update({
        asaas_payment_id: result.id, status: result.status || "PENDING",
        payment_url: result.invoiceUrl || null, boleto_url: result.bankSlipUrl || null,
        pix_copy_paste: pix?.payload || null, pix_encoded_image: pix?.encodedImage || null,
      }).eq("id", order.id);
      return json({
        orderId: order.id, kind, billingType, amount,
        status: result.status, paymentUrl: result.invoiceUrl || null,
        boletoUrl: result.bankSlipUrl || null,
        pixCopyPaste: pix?.payload || null, pixEncodedImage: pix?.encodedImage || null,
      });
    }

    const response = await fetch(`${apiUrl}/subscriptions`, {
      method: "POST", headers,
      body: JSON.stringify({
        customer: customerId, billingType, value: amount, nextDueDate: dueDate,
        cycle: "MONTHLY", description: "Giro Fácil - plano mensal",
        externalReference: order.id,
      }),
    });
    result = await response.json();
    if (!response.ok) throw new Error(result.errors?.[0]?.description || "O Asaas não conseguiu criar a assinatura.");
    await admin.from("payment_orders").update({
      asaas_subscription_id: result.id, status: "AWAITING_FIRST_PAYMENT",
    }).eq("id", order.id);

    const paymentsResponse = await fetch(`${apiUrl}/subscriptions/${result.id}/payments`, { headers });
    let firstPayment: any = null;
    if (paymentsResponse.ok) {
      const payments = await paymentsResponse.json();
      firstPayment = payments.data?.[0] || null;
    }
    if (firstPayment) {
      let pix: any = null;
      if (billingType === "PIX") {
        const pixResponse = await fetch(`${apiUrl}/payments/${firstPayment.id}/pixQrCode`, { headers });
        if (pixResponse.ok) pix = await pixResponse.json();
      }
      await admin.from("payment_orders").update({
        asaas_payment_id: firstPayment.id, payment_url: firstPayment.invoiceUrl || null,
        boleto_url: firstPayment.bankSlipUrl || null, pix_copy_paste: pix?.payload || null,
        pix_encoded_image: pix?.encodedImage || null,
      }).eq("id", order.id);
      return json({
        orderId: order.id, kind, billingType, amount, subscriptionId: result.id,
        status: firstPayment.status, paymentUrl: firstPayment.invoiceUrl || null,
        boletoUrl: firstPayment.bankSlipUrl || null,
        pixCopyPaste: pix?.payload || null, pixEncodedImage: pix?.encodedImage || null,
      });
    }
    return json({
      orderId: order.id, kind, billingType, amount, subscriptionId: result.id,
      status: "AWAITING_FIRST_PAYMENT",
      message: "Assinatura criada. A primeira cobrança será disponibilizada pelo Asaas; acompanhe o e-mail cadastrado.",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado ao criar pagamento." }, 500);
  }
});
