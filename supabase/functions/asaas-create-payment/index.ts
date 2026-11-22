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

// O valor maior compra prioridade de exposição, não uma quantidade garantida de compradores.
const reachMultiplierForAmount = (amount: number) =>
  amount >= 150 ? 10 : amount >= 90 ? 7 : amount >= 60 ? 5 : amount >= 35 ? 3 : 2;

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
    const recurring = kind === "monthly" || kind === "store";
    if (recurring && billingType !== "CREDIT_CARD") {
      return json({ error: "Para plano mensal e loja, escolha cartão de crédito no checkout seguro do Asaas. O Giro Fácil não solicita CPF." }, 400);
    }
    if (!recurring && billingType !== "PIX") {
      return json({ error: "Para esta cobrança, a opção disponível sem cadastro de CPF no Giro Fácil é PIX." }, 400);
    }

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
    const { data: currentProfile, error: currentProfileError } = await admin.from("perfis").select("papel").eq("id", user.id).maybeSingle();
    if (currentProfileError) throw new Error("Não foi possível verificar o perfil administrativo.");
    const isAdmin = currentProfile?.papel === "admin";
    const freeAdminBoost = kind === "boost" && isAdmin;
    if (!Number.isFinite(amount) || (amount <= 0 && !freeAdminBoost)) return json({ error: "Preço inválido." }, 400);
    if (freeAdminBoost) amount = 0;

    if (kind === "single" || kind === "boost") {
      if (!listingId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)) return json({ error: "Selecione um anúncio válido." }, 400);
      const { data: listing, error } = await admin.from("anuncios").select("id,usuario_id,status").eq("id", listingId).eq("usuario_id", user.id).maybeSingle();
      if (error || !listing) return json({ error: "Anúncio não encontrado para esta conta." }, 404);
      if (kind === "single" && listing.status !== "pendente") return json({ error: "Este anúncio não está aguardando pagamento." }, 409);
    }

    if (freeAdminBoost) {
      const now = new Date();
      const endsAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const { data: freeOrder, error: freeOrderError } = await admin.from("payment_orders").insert({
        user_id: user.id, listing_id: listingId, kind: "boost", billing_type: billingType,
        amount: 0, status: "PAID", asaas_customer_id: null,
      }).select("id").single();
      if (freeOrderError || !freeOrder) throw new Error("Não foi possível registrar o turbinamento gratuito do administrador.");
      const baseAmount = planCode === "boost_custom" ? Number(body.customAmount) : (BOOSTS[planCode!]?.amount || 19.90);
      const { error: freeBoostError } = await admin.from("ad_boosts").insert({
        order_id: freeOrder.id, user_id: user.id, listing_id: listingId, plan_code: planCode,
        duration_days: durationDays, amount: 0, reach_multiplier: reachMultiplierForAmount(baseAmount),
        status: "active", starts_at: now.toISOString(), ends_at: endsAt.toISOString(),
      });
      if (freeBoostError) throw new Error("O pedido foi registrado, mas não foi possível ativar o turbinamento gratuito.");
      return json({ orderId: freeOrder.id, kind, billingType, amount: 0, status: "ACTIVE", freeForAdmin: true, startsAt: now.toISOString(), endsAt: endsAt.toISOString() });
    }

    const { data: order, error: orderError } = await admin.from("payment_orders").insert({
      user_id: user.id, listing_id: listingId, kind: orderKind, billing_type: billingType,
      amount, status: "CREATING", asaas_customer_id: null,
    }).select("id").single();
    if (orderError || !order) throw new Error("Não foi possível registrar o pedido de pagamento.");

    const itemName = kind === "single" ? "Anúncio avulso Giro Fácil BR"
      : kind === "monthly" ? "Plano mensal Giro Fácil BR"
      : kind === "boost" ? "Turbinamento Giro Fácil BR"
      : `Plano de loja Giro Fácil BR - ${storeName}`;
    const itemDescription = kind === "single" ? `Publicação do anúncio ${listingId}`
      : kind === "monthly" ? "Acesso ao plano mensal do marketplace"
      : kind === "boost" ? `Destaque ${planCode} por ${durationDays} dia(s)`
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
        duration_days: durationDays, amount, reach_multiplier: reachMultiplierForAmount(amount), status: "awaiting_payment",
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
      recurring, checkoutWebhookReady, message: recurring
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
