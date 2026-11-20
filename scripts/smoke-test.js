const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const assistantPath = "supabase/functions/giro-assistant/index.ts";
const adminPath = "supabase/functions/admin-dashboard/index.ts";
const paymentPath = "supabase/functions/asaas-create-payment/index.ts";
const assistantWorkflowPath = ".github/workflows/deploy-giro-assistant.yml";
const configPath = "supabase/config.toml";
const assistant = fs.existsSync(assistantPath) ? fs.readFileSync(assistantPath, "utf8") : "";
const admin = fs.existsSync(adminPath) ? fs.readFileSync(adminPath, "utf8") : "";
const payment = fs.existsSync(paymentPath) ? fs.readFileSync(paymentPath, "utf8") : "";
const assistantWorkflow = fs.existsSync(assistantWorkflowPath) ? fs.readFileSync(assistantWorkflowPath, "utf8") : "";
const config = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
const checks = [];

function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}
function countId(id) {
  return html.split('id="' + id + '"').length - 1 + html.split("id='" + id + "'").length - 1;
}
function hasId(id) {
  return countId(id) === 1;
}

// Estrutura da interface e navegação.
[
  "navHome", "navSearch", "navAnnounce", "navFavorites", "navMessages",
  "navAccount", "headerMessages", "chatPanel", "assistantPanel",
  "assistantOpen", "assistantClose", "assistantInput", "assistantSend",
  "paymentPanel", "plansOpen", "adminPanel", "adminOpen", "adminRefresh",
  "chatConversationList", "chatMessages", "chatMessageInput", "chatSend",
].forEach(id => check("Elemento obrigatório único: " + id, hasId(id)));

check("Supabase SDK é carregado de arquivo local empacotado no APK",
  html.includes('src="./vendor/supabase.js"') &&
  !html.includes("cdn.jsdelivr.net/npm/@supabase/supabase-js@2"));
check("Build copia SDK UMD local para os assets do app",
  fs.readFileSync("package.json", "utf8").includes("dist/umd/supabase.js") &&
  fs.readFileSync(".github/workflows/android-apk.yml", "utf8").includes("npm run build"));
check("Falha de SDK é diagnosticada sem acusar configuração ausente",
  html.includes("Supabase JS SDK indisponível") &&
  html.includes("Configuração do Supabase ausente ou inválida"));
check("Navegação inferior e cabeçalho abrem mensagens",
  html.includes('$("navMessages").onclick=()=>openChat()') &&
  html.includes('$("headerMessages").onclick=()=>openChat()'));
check("Botão do assistente abre painel próprio",
  html.includes('$("assistantOpen").onclick=') &&
  html.includes('$("assistantPanel").classList.remove("hidden")'));
check("Envio do assistente por botão e Enter",
  html.includes('$("assistantSend").onclick=sendAssistantMessage') &&
  html.includes('$("assistantInput").addEventListener("keydown"'));
check("Assistente desabilita botão durante envio e restaura ao finalizar",
  html.includes('sendButton.disabled=true;') &&
  html.includes('sendButton.disabled=false;') &&
  html.includes('sendButton.textContent="Enviar";'));
check("Erro do assistente preserva a mensagem para nova tentativa",
  html.includes('input.value=message;') &&
  html.includes("Falha no envio. Confira sua conexão"));
check("Painel administrativo separado e protegido por papel admin",
  hasId("adminPanel") && hasId("adminOpen") &&
  html.includes('profile?.papel==="admin"') &&
  admin.includes('role !== "admin"'));
check("Painel administrativo consulta backend e modera anúncios",
  html.includes('db.functions.invoke("admin-dashboard"') &&
  admin.includes('body?.action === "moderate_listing"') &&
  admin.includes('nextStatus === "ativo"') &&
  admin.includes('candidate.pagamento_status === "pago"') &&
  admin.includes('owner?.plano_status === "ativo"'));
check("Planos e pagamentos têm botão e painel separados",
  html.includes('$("plansOpen").onclick=') &&
  html.includes('$("paymentPanel").classList.remove("hidden")'));
check("Pagamento usa função Asaas e limita tipos de cobrança",
  html.includes('db.functions.invoke("asaas-create-payment"') &&
  payment.includes('["single", "monthly", "boost", "store"]') &&
  payment.includes('["PIX", "BOLETO"]'));
check("Chat de anúncios envia mensagem como usuário autenticado",
  html.includes('db.from("mensagens").insert({conversa_id:activeConversationId,remetente_id:currentUser.id,conteudo:content})'));
check("Chat desabilita envio quando não existe conversa",
  html.includes('$("chatMessageInput").disabled=true;$("chatSend").disabled=true;'));
check("Chat reabilita envio ao selecionar conversa",
  html.includes('$("chatMessageInput").disabled=false;$("chatSend").disabled=false;'));


check("Webhook Asaas valida token secreto antes de processar eventos",
  fs.readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8").includes('receivedToken !== expectedToken'));
check("Webhook Asaas é idempotente para eventos duplicados",
  fs.readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8").includes('eventError.code !== "23505"'));
check("Webhook ativa plano somente após confirmação de pagamento",
  fs.readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8").includes('["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]'));
check("Webhook não renova destaque ao receber evento repetido",
  fs.readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8").includes('boost.status === "awaiting_payment"'));

// Imagens, publicação e proteção básica.
check("Fotos usam contenção visual para evitar sobreposição",
  html.includes("object-fit:cover") && html.includes("isolation:isolate") &&
  html.includes("position:static!important"));
check("Upload de fotos usa bucket esperado e limite de 5 MB",
  html.includes('db.storage.from("anuncios-fotos").upload') &&
  html.includes("file.size>5*1024*1024"));
check("Tipos de imagem aceitos estão definidos",
  html.includes('"image/jpeg","image/png","image/webp","image/gif"'));
check("Upload de fotos repete até três vezes em caso de falha de rede",
  html.includes("attempt<=3") &&
  html.includes("upsert:true") &&
  html.includes("Conexão instável. Tentativa") &&
  html.includes("após 3 tentativas"));
check("Falha de publicação limpa arquivos enviados sem anúncio",
  html.includes('storage.from("anuncios-fotos").remove(uploadedPaths)'));
check("Publicação informa cada etapa e não falha silenciosamente sem sessão",
  html.includes("Sua sessão expirou. Entre novamente") &&
  html.includes("Enviando foto") &&
  html.includes("Salvando o anúncio no servidor") &&
  html.includes("O servidor não confirmou o cadastro do anúncio"));
check("Anúncios novos entram como pendentes",
  html.includes('status:"pendente"'));
check("Todos os IDs HTML são únicos",
  (() => {
    const ids = [...html.matchAll(/(?:^|\\s)id\\s*=\\s*["']([^"']+)["']/gm)].map(m => m[1]);
    return new Set(ids).size === ids.length;
  })());
check("A interface alerta para não enviar dados secretos",
  html.includes("Não envie senhas, códigos de acesso ou dados completos de cartão"));

// Backend do assistente: autenticação, validação, contexto e resposta.
check("Função giro-assistant existe no repositório", assistant.length > 0);
check("Assistente usa resposta básica se a API de IA retornar 429 ou 5xx",
  assistant.includes("response.status === 429 || response.status >= 500") &&
  assistant.includes('mode: "ajuda-basica"') &&
  !assistant.includes("response.status === 429 ? 429 : 502"));
check("Assistente exige sessão autenticada do Supabase",
  assistant.includes('req.headers.get("Authorization")') &&
  assistant.includes('authHeader?.startsWith("Bearer ")') &&
  assistant.includes("supabase.auth.getUser(token)"));
check("Assistente valida mensagem vazia e limite de 4.000 caracteres",
  assistant.includes("if (!message)") && assistant.includes("message.length > 4000"));
check("Histórico do assistente é filtrado e limitado",
  assistant.includes("body.history.slice(-8)") &&
  assistant.includes('["user", "assistant"].includes(item.role)'));
check("Assistente possui respostas básicas sem depender de chave externa",
  assistant.includes("function localAnswer") &&
  assistant.includes('mode: "ajuda-basica"'));
check("Assistente usa chave de IA somente no servidor",
  assistant.includes('Deno.env.get("OPENAI_API_KEY")') &&
  assistant.includes('https://api.openai.com/v1/responses') &&
  !html.includes("OPENAI_API_KEY"));
check("Assistente retorna erros sem expor credenciais",
  assistant.includes("Sessão inválida") &&
  assistant.includes("Não foi possível gerar uma resposta agora"));


check("Assistente usa a Responses API atual e modelo GPT-6.2 Astra por padrão",
  assistant.includes('https://api.openai.com/v1/responses') &&
  assistant.includes('"gpt-6.2-astra"') &&
  assistant.includes("max_output_tokens"));
check("Assistente desativa armazenamento de conversas na chamada de IA",
  assistant.includes("store: false"));
check("Assistente limita origens CORS e mantém suporte ao app Android",
  assistant.includes("capacitor://localhost") &&
  assistant.includes("https://girofacilbr.com.br") &&
  assistant.includes("Vary"));
check("Assistente valida JWT com token explícito",
  assistant.includes('auth.getUser(token)') &&
  assistant.includes('authHeader?.startsWith("Bearer ")'));
check("Assistente tem respostas de contingência quando não há chave IA",
  assistant.includes("function localAnswer") &&
  assistant.includes('mode: "ajuda-basica"'));

// Deploy e autenticação das funções.
check("Workflow de deploy do assistente existe",
  assistantWorkflow.includes("supabase functions deploy giro-assistant"));
check("Workflow exige segredos de acesso Supabase",
  assistantWorkflow.includes("SUPABASE_ACCESS_TOKEN") &&
  assistantWorkflow.includes("SUPABASE_PROJECT_REF"));
check("Configuração exige JWT para assistente e painel",
  config.includes("[functions.giro-assistant]") &&
  config.includes("[functions.admin-dashboard]") &&
  (config.match(/verify_jwt = true/g) || []).length >= 2);


// Captação nacional e CRM de interessados.
check("Formulário nacional de captação e consentimento LGPD", hasId("acquisitionPanel") && hasId("acqConsent") && hasId("acqSubmit"));
check("Painel administrativo mostra métricas e lista de interessados", hasId("adminAcquisitionMetrics") && hasId("adminAcquisitionLeads") && html.includes("data-acq-status"));
check("Captação grava eventos e parâmetros de campanha/indicação", html.includes('db.from("acquisition_events").insert') && html.includes("utm_campaign") && html.includes('acqParams.get("ref")'));
check("Admin API devolve total exato e distribuição por estado", admin.includes('count: "exact"') && admin.includes("byState") && admin.includes("update_acquisition_lead"));
check("Migration de captação nacional está versionada", fs.existsSync("supabase/migrations/20261120050755_acquisition_national_crm.sql"));

const failed = checks.filter(item => !item.ok);
for (const item of checks) console.log((item.ok ? "PASS " : "FAIL ") + item.name);
console.log("\n" + checks.length + " verificações; " + failed.length + " falhas.");
if (failed.length) {
  console.error("\nVerificações que precisam de correção:");
  failed.forEach(item => console.error(" - " + item.name));
  process.exit(1);
}
