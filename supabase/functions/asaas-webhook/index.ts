import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expectedToken = (Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? "").trim();
  const receivedToken = (req.headers.get("asaas-access-token") ?? "").trim();
  if (!expectedToken || !receivedToken || receivedToken !== expectedToken) {
    console.warn("Asaas webhook authentication mismatch", {
      expectedConfigured: expectedToken.length > 0,
      receivedHeaderPresent: receivedToken.length > 0,
      expectedLength: expectedToken.length,
      receivedLength: receivedToken.length,
    });
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    if (!payload?.id || !payload?.event) return new Response("Invalid event", { status: 400 });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      (() => {
      const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.default) return parsed.default as string;
      }
      const fallback = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (fallback) return fallback;
      throw new Error("Chave Supabase SUPABASE_SECRET_KEYS não disponível no ambiente.");
    })(),
    );

    const { error: eventError } = await admin.from("asaas_webhook_events")
      .insert({ event_id: payload.id, event_type: payload.event, payload })
      .select("event_id").single();
    if (eventError) {
      if (eventError.code !== "23505") {
        console.error("Webhook persistence error", eventError);
        return new Response("Could not persist event", { status: 500 });
      }
      // Evento duplicado pode ser uma repetição após falha transitória; continue
      // o processamento idempotente em vez de descartá-lo.
    }

    const payment = payload.payment;
    if (payment?.id) {
      const externalReference = payment.externalReference;
      let query = admin.from("payment_orders").select("*");
      if (externalReference) query = query.eq("id", externalReference);
      else if (payment.subscription) query = query.eq("asaas_subscription_id", payment.subscription);
      else query = query.eq("asaas_payment_id", payment.id);
      let { data: order, error: orderLookupError } = await query.maybeSingle();
      if (orderLookupError) throw orderLookupError;
      if (!order && externalReference && payment.subscription) {
        const fallback = await admin.from("payment_orders").select("*")
          .eq("asaas_subscription_id", payment.subscription).maybeSingle();
        order = fallback.data;
        if (fallback.error) throw fallback.error;
      }
      if (!order && externalReference) {
        const fallback = await admin.from("payment_orders").select("*")
          .eq("asaas_payment_id", payment.id).maybeSingle();
        order = fallback.data;
        if (fallback.error) throw fallback.error;
      }

      if (order) {
        const paid = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(payload.event);
        const refunded = ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"].includes(payload.event);
        const nextStatus = paid ? "PAID" : refunded ? "REFUNDED" :
          payload.event === "PAYMENT_OVERDUE" ? "OVERDUE" : order.status;
        const { error: paymentUpdateError } = await admin.from("payment_orders").update({
          status: nextStatus, asaas_payment_id: payment.id,
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);
        if (paymentUpdateError) throw paymentUpdateError;

        if (order.kind === "single" && order.listing_id && paid) {
          await admin.from("anuncios").update({ pagamento_status: "pago" })
            .eq("id", order.listing_id).eq("usuario_id", order.user_id);
        }
        if (order.kind === "monthly") {
          if (paid) {
            await admin.from("perfis").update({
              plano_status: "ativo", plano_asaas_subscription_id: payment.subscription || order.asaas_subscription_id,
            }).eq("id", order.user_id);
            await admin.from("anuncios").update({ pagamento_status: "plano" }).eq("usuario_id", order.user_id).eq("status", "pendente");
          } else if (refunded || payload.event === "PAYMENT_OVERDUE") {
            await admin.from("perfis").update({ plano_status: "pendente" }).eq("id", order.user_id);
            await admin.from("anuncios").update({ pagamento_status: "nao_pago" }).eq("usuario_id", order.user_id).eq("status", "pendente");
          }
        }

        if (order.kind === "boost") {
          if (paid) {
            const { data: boost, error: boostLookupError } = await admin.from("ad_boosts")
              .select("id,duration_days,status").eq("order_id", order.id).maybeSingle();
            if (boostLookupError) throw boostLookupError;
            // Repetir o webhook não reinicia o prazo de um destaque já ativo.
            if (boost && boost.status === "awaiting_payment") {
              const starts = new Date();
              const ends = new Date(starts.getTime() + Number(boost.duration_days) * 86400000);
              const { error: boostUpdateError } = await admin.from("ad_boosts").update({
                status: "active", starts_at: starts.toISOString(), ends_at: ends.toISOString(),
              }).eq("id", boost.id);
              if (boostUpdateError) throw boostUpdateError;
            }
          } else if (refunded) {
            await admin.from("ad_boosts").update({ status: "refunded" }).eq("order_id", order.id);
          }
        }

        if (order.kind === "store") {
          if (paid) {
            const { data: storePlan, error: storeLookupError } = await admin.from("store_plans")
              .select("id,status").eq("order_id", order.id).maybeSingle();
            if (storeLookupError) throw storeLookupError;
            // Ativa uma única vez: reentregas do webhook não renovam indevidamente o mês.
            if (storePlan && storePlan.status === "awaiting_payment") {
              const starts = new Date();
              const ends = new Date(starts); ends.setUTCMonth(ends.getUTCMonth() + 1);
              const { error: storeUpdateError } = await admin.from("store_plans").update({
                status: "active", starts_at: starts.toISOString(), ends_at: ends.toISOString(),
              }).eq("id", storePlan.id).eq("status", "awaiting_payment");
              if (storeUpdateError) throw storeUpdateError;
            }
          } else if (refunded) {
            const { error: storeRefundError } = await admin.from("store_plans")
              .update({ status: "refunded" }).eq("order_id", order.id);
            if (storeRefundError) throw storeRefundError;
          }
        }
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Asaas webhook error", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
