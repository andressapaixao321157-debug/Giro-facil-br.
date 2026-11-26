import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const apiKey = Deno.env.get("ASAAS_API_KEY");
    const apiUrl = (Deno.env.get("ASAAS_API_URL") || "https://api.asaas.com/v3").replace(/\/$/, "");
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
    if (!url) throw new Error("SUPABASE_URL não configurada.");
    const authorization = req.headers.get("Authorization");
    if (!authorization) return reply({ error: "Faça login para acessar o financeiro." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: auth, error: authError } = await userClient.auth.getUser();
    if (authError || !auth.user) return reply({ error: "Sessão inválida. Entre novamente." }, 401);
    const admin = createClient(url, service);
    const { data: profile, error: profileError } = await admin.from("perfis").select("papel").eq("id", auth.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.papel !== "admin") return reply({ error: "A Central Financeira é exclusiva do proprietário." }, 403);
    if (!apiKey) return reply({ error: "A integração Asaas não está configurada no servidor." }, 503);

    const headers = { access_token: apiKey, accept: "application/json", "User-Agent": "GiroFacilBR/1.0" };
    const [balanceResponse, statementResponse, ordersResult] = await Promise.all([
      fetch(apiUrl + "/finance/balance", { method: "GET", headers, signal: AbortSignal.timeout(15000) }),
      fetch(apiUrl + "/financialTransactions?limit=40&offset=0", { method: "GET", headers, signal: AbortSignal.timeout(15000) }),
      admin.from("payment_orders")
        .select("id,user_id,listing_id,kind,amount,status,billing_type,asaas_payment_id,created_at,updated_at")
        .order("created_at", { ascending: false }).limit(250),
    ]);
    const balanceData = await balanceResponse.json().catch(() => ({}));
    if (!balanceResponse.ok) {
      console.error("Asaas balance request failed", balanceResponse.status);
      return reply({ error: balanceData?.errors?.[0]?.description || "Não foi possível consultar o saldo no Asaas.", providerStatus: balanceResponse.status }, 502);
    }
    const statementData = statementResponse.ok ? await statementResponse.json().catch(() => ({})) : null;
    if (ordersResult.error) throw ordersResult.error;

    const orders = ordersResult.data || [];
    const paidStatuses = new Set(["PAID", "RECEIVED", "CONFIRMED"]);
    const refundedStatuses = new Set(["REFUNDED", "PARTIALLY_REFUNDED"]);
    const categories = ["boost", "store", "single", "monthly"];
    const summary = Object.fromEntries(categories.map((kind) => {
      const rows = orders.filter((row: any) => row.kind === kind);
      const received = rows.filter((row: any) => paidStatuses.has(String(row.status).toUpperCase()));
      const refunded = rows.filter((row: any) => refundedStatuses.has(String(row.status).toUpperCase()));
      return [kind, {
        orders: rows.length,
        paidOrders: received.length,
        pendingOrders: rows.filter((row: any) => !paidStatuses.has(String(row.status).toUpperCase()) && !refundedStatuses.has(String(row.status).toUpperCase())).length,
        refundedOrders: refunded.length,
        grossReceived: Number(received.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0).toFixed(2)),
        refundedAmount: Number(refunded.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0).toFixed(2)),
      }];
    }));
    const recentOrders = orders.slice(0, 40).map((row: any) => ({
      id: row.id, kind: row.kind, amount: Number(row.amount), status: row.status,
      billingType: row.billing_type, createdAt: row.created_at, paymentId: row.asaas_payment_id,
      listingId: row.listing_id,
    }));
    const transactions = Array.isArray(statementData?.data) ? statementData.data.slice(0, 40).map((row: any) => ({
      id: row.id, date: row.date, type: row.type, description: row.description,
      value: row.value, balance: row.balance, paymentId: row.paymentId,
    })) : [];
    return reply({
      success: true,
      environment: apiUrl.includes("sandbox") ? "sandbox" : "production",
      checkedAt: new Date().toISOString(),
      balance: balanceData,
      statementAvailable: statementResponse.ok,
      statementError: statementResponse.ok ? null : "O extrato não pôde ser consultado agora.",
      transactions,
      summary,
      recentOrders,
      currency: "BRL",
    });
  } catch (error) {
    console.error("Owner finance error", error);
    return reply({ error: error instanceof Error ? error.message : "Erro ao consultar o financeiro." }, 500);
  }
});
