import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function getEnvKey(primary: string, fallback: string): string {
  const raw = Deno.env.get(primary);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.default) return String(parsed.default);
    } catch {
      // Some Supabase environments expose a plain key instead of a JSON map.
      return raw;
    }
  }
  const value = Deno.env.get(fallback);
  if (!value) throw new Error(`Configuração ausente: ${primary}.`);
  return value;
}

function localAnswer(message: string): string {
  const q = message.toLocaleLowerCase("pt-BR");
  if (/\b(oi|olá|ola|bom dia|boa tarde|boa noite|ajuda)\b/.test(q))
    return "Olá! Sou o assistente virtual do Giro Fácil BR. Posso orientar sobre cadastro, anúncios, fotos, mensagens, planos e pagamentos. O que você precisa resolver?";
  if (/cadastro|conta|senha|entrar|login|recuperar/.test(q))
    return "Para acessar o Giro Fácil BR, toque em Entrar / Minha conta e informe seu e-mail e senha. Se ainda não tem conta, escolha a opção de cadastro. Nunca envie sua senha ou código de verificação pelo chat.";
  if (/an[uú]ncio|publicar|vender|ve[ií]culo|im[oó]vel|foto/.test(q))
    return "Para anunciar, entre na sua conta e toque em Anunciar. Preencha os dados, envie fotos JPG, PNG, WEBP ou GIF de até 5 MB cada e envie o anúncio. Ele fica pendente até a análise administrativa. Depois você pode escolher a modalidade de pagamento disponível.";
  if (/mensagem|comprador|vendedor|conversa|chat/.test(q))
    return "Para falar com comprador ou vendedor, abra Mensagens e selecione uma conversa. Para falar comigo, use o botão laranja 'Conversar com o assistente virtual'. O envio de mensagens de anúncio depende de uma conversa existente.";
  if (/pix|boleto|pagamento|plano|asaas|turbinar|loja/.test(q))
    return "Abra Minha conta e escolha Planos e pagamentos. Você pode selecionar anúncio avulso, plano mensal, destaque ou plano de loja, quando disponível, e escolher PIX ou boleto. A cobrança só deve ser considerada paga após a confirmação do provedor.";
  if (/admin|administrador|painel|aprovar|moderar/.test(q))
    return "O Painel administrativo é separado de Planos e pagamentos e aparece somente para contas autorizadas como administradoras. Nele é possível acompanhar indicadores, pagamentos e moderar anúncios pendentes. Se o botão não aparecer, confirme se sua conta está com o papel de administrador no cadastro interno.";
  if (/whatsapp|telefone|contato/.test(q))
    return "O atendimento principal da plataforma acontece pelo chat interno do Giro Fácil BR. Para dúvidas sobre um anúncio, use a conversa vinculada ao próprio anúncio.";
  if (/seguran|golpe|fraude|cart[aã]o|senha|c[oó]digo/.test(q))
    return "Por segurança, não compartilhe senhas, códigos de acesso, número completo de cartão ou dados bancários no chat. Confira o anúncio e combine pagamentos somente pelos meios oficiais informados na plataforma.";
  return "Posso ajudar com cadastro e acesso, publicação de anúncios e fotos, mensagens entre compradores e vendedores, planos e pagamentos ou uso do painel administrativo. Diga qual dessas etapas está apresentando problema e descreva a mensagem que aparece.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) return json({ error: "Serviço de autenticação não configurado." }, 503);
    const anonKey = getEnvKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const authorization = req.headers.get("Authorization");
    if (!authorization) return json({ error: "Faça login para conversar com o assistente." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessão inválida. Entre novamente." }, 401);

    const body = await req.json().catch(() => null);
    if (!body || typeof body.message !== "string") return json({ error: "Envie uma mensagem válida." }, 400);
    const message = body.message.trim();
    if (!message) return json({ error: "Digite sua dúvida antes de enviar." }, 400);
    if (message.length > 4000) return json({ error: "A mensagem deve ter até 4.000 caracteres." }, 400);

    const history = Array.isArray(body.history)
      ? body.history.slice(-8).filter((item: any) =>
          item && ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string" && item.content.length <= 4000
        ).map((item: any) => ({ role: item.role, content: item.content }))
      : [];

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return json({
        answer: localAnswer(message),
        mode: "ajuda-basica",
        notice: "Respostas de orientação da plataforma. A IA avançada pode ser ativada pela configuração segura OPENAI_API_KEY no Supabase.",
      });
    }

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content: "Você é o assistente oficial do Giro Fácil BR, marketplace brasileiro de veículos, imóveis e produtos. Responda em português brasileiro, com clareza, cordialidade e foco em resolver dúvidas sobre cadastro, anúncios, fotos, mensagens, planos, pagamentos e uso do painel. Nunca peça senhas, códigos de autenticação ou dados completos de cartão. Não afirme que realizou pagamentos, aprovações, alterações ou ações administrativas. Não invente status de conta, anúncio ou cobrança; oriente o usuário a conferir no painel. Para assuntos fora da plataforma, diga brevemente que seu foco é ajudar com o Giro Fácil BR.",
          },
          ...history,
          { role: "user", content: message },
        ],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("OpenAI assistant error", response.status, result?.error?.type || "unknown");
      return json({ error: "O assistente está temporariamente indisponível. Tente novamente em instantes." }, 502);
    }
    const answer = result?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) return json({ error: "O assistente não retornou uma resposta válida." }, 502);
    return json({ answer: answer.trim(), mode: "ia" });
  } catch (error) {
    console.error("Giro assistant error", error);
    return json({ error: error instanceof Error ? error.message : "Não foi possível atender agora." }, 500);
  }
});
