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
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = (() => {
      const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.default) return parsed.default as string;
      }
      const fallback = Deno.env.get("SUPABASE_ANON_KEY");
      if (fallback) return fallback;
      throw new Error("Chave Supabase SUPABASE_PUBLISHABLE_KEYS não disponível no ambiente.");
    })();
    const service = (() => {
      const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.default) return parsed.default as string;
      }
      const fallback = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (fallback) return fallback;
      throw new Error("Chave Supabase SUPABASE_SECRET_KEYS não disponível no ambiente.");
    })();
    const authorization = req.headers.get("Authorization");
    if (!authorization) return reply({ error: "Faça login." }, 401);
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return reply({ error: "Sessão inválida." }, 401);
    const admin = createClient(url, service);
    const { data: profile, error: profileError } = await admin.from("perfis")
      .select("papel").eq("id", authData.user.id).maybeSingle();
    if (profileError || profile?.papel !== "admin") return reply({ error: "Acesso restrito ao administrador." }, 403);

    const [users, ads, pending, paid, orders, latestAds, boosts, stores] = await Promise.all([
      admin.from("perfis").select("id", { count: "exact", head: true }),
      admin.from("anuncios").select("id", { count: "exact", head: true }),
      admin.from("anuncios").select("id", { count: "exact", head: true }).eq("status", "pendente"),
      admin.from("payment_orders").select("amount").eq("status", "PAID"),
      admin.from("payment_orders").select("id,user_id,kind,amount,status,created_at,plan_code").order("created_at", { ascending: false }).limit(30),
      admin.from("anuncios").select("id,titulo,preco,status,usuario_id,criado_em").order("criado_em", { ascending: false }).limit(30),
      admin.from("ad_boosts").select("id", { count: "exact", head: true }).eq("status", "active"),
      admin.from("store_plans").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]);
    const queryError = [users, ads, pending, paid, orders, latestAds, boosts, stores].find(x => x.error);
    if (queryError?.error) throw new Error("Não foi possível carregar os dados administrativos.");
    const revenue = (paid.data || []).reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0);
    return reply({
      totals: {
        users: users.count || 0, ads: ads.count || 0, pendingAds: pending.count || 0,
        paidRevenue: revenue, activeBoosts: boosts.count || 0, activeStores: stores.count || 0,
      },
      orders: orders.data || [], listings: latestAds.data || [],
    });
  } catch (error) {
    console.error("Admin dashboard error", error);
    return reply({ error: error instanceof Error ? error.message : "Erro ao carregar painel." }, 500);
  }
});
