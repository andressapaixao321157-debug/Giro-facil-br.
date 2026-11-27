import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ error: "Faça login no Giro Fácil para testar o envio." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publicKey = Deno.env.get("SUPABASE_ANON_KEY") ??
      (() => {
        const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
        if (!raw) return "";
        try { return JSON.parse(raw).default ?? ""; } catch { return ""; }
      })();
    if (!supabaseUrl || !publicKey) {
      return json({ error: "Configuração de autenticação do Supabase indisponível." }, 503);
    }

    const userClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice(7);
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user?.email) {
      return json({ error: "Sessão inválida ou conta sem e-mail confirmado." }, 401);
    }

    const { data: profile, error: profileError } = await userClient
      .from("perfis").select("papel").eq("id", authData.user.id).maybeSingle();
    if (profileError) {
      console.error("email-test profile check failed", profileError.message);
      return json({ error: "Não foi possível validar a permissão administrativa." }, 503);
    }
    if (profile?.papel !== "admin") {
      return json({ error: "Somente o administrador pode executar o teste de e-mail." }, 403);
    }

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "RESEND_API_KEY não está configurada no Supabase." }, 503);

    const recipient = authData.user.email;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        from: "Giro Fácil BR <teste@girofacilbr.com.br>",
        to: [recipient],
        subject: "Teste de envio — Giro Fácil BR",
        text: "Olá! Este é um e-mail de teste do Giro Fácil BR. A integração de envio está respondendo. Nenhuma cobrança ou ação financeira foi realizada.",
        html: "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px\"><h2>Giro Fácil BR</h2><p>Olá! Este é um e-mail de teste do Giro Fácil BR.</p><p>A integração de envio está respondendo.</p><p><strong>Nenhuma cobrança ou ação financeira foi realizada.</strong></p></div>",
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("Resend test failed", response.status, result?.name ?? "provider_error");
      return json({
        error: response.status === 401
          ? "A chave do Resend foi recusada. Confira RESEND_API_KEY."
          : response.status === 403
          ? "O Resend não autorizou o remetente. Confira o domínio e a permissão da chave."
          : "O Resend não aceitou o e-mail de teste. Confira a configuração e tente novamente.",
        provider_status: response.status,
      }, 502);
    }

    return json({
      success: true,
      message: "E-mail de teste aceito pelo Resend.",
      recipient,
      email_id: result?.id ?? null,
    });
  } catch (error) {
    console.error("email-test failed", error instanceof Error ? error.message : "unknown");
    return json({ error: "Falha interna ao enviar o e-mail de teste." }, 500);
  }
});
