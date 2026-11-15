import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");
  const receivedToken = req.headers.get("asaas-access-token");
  if (!expectedToken || !receivedToken || receivedToken !== expectedToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    if (!payload?.id || !payload?.event) return new Response("Invalid event", { status: 400 });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error: eventError } = await admin.from("asaas_webhook_events")
      .insert({ event_id: payload.id, event_type: payload.event, payload })
      .select("event_id").single();
    if (eventError) {
      if (eventError.code === "23505") return new Response("OK", { status: 200 });
      console.error("Webhook persistence error", eventError);
      return new Response("Could not persist event", { status: 500 });
    }

    const payment = payload.payment;
    if (payment?.id) {
      const externalReference = payment.externalReference;
      let query = admin.from("payment_orders").select("*");
      if (externalReference) query = query.eq("id", externalReference);
      else if (payment.subscription) query = query.eq("asaas_subscription_id", payment.subscription);
      else query = query.eq("asaas_payment_id", payment.id);
      const { data: order } = await query.maybeSingle();

      if (order) {
        const paid = ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(payload.event);
        const refunded = ["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED"].includes(payload.event);
        const nextStatus = paid ? "PAID" : refunded ? "REFUNDED" :
          payload.event === "PAYMENT_OVERDUE" ? "OVERDUE" : order.status;
        await admin.from("payment_orders").update({
          status: nextStatus, asaas_payment_id: payment.id,
          updated_at: new Date().toISOString(),
        }).eq("id", order.id);

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
      }
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Asaas webhook error", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
});
