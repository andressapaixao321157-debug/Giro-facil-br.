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
  "agentConsole", "adminAgentSelect", "adminAgentInput", "adminAgentSend", "adminAgentOutput",
  "ownerDashboard", "ownerDashboardTitle",
].forEach(id => check("Elemento obrigatório único: " + id, hasId(id)));

check("Supabase SDK é carregado localmente com fallback CDN",
  /src="\.\/vendor\/supabase\.js(?:\?[^"]*)?"/.test(html) &&
  html.includes("if(!window.supabase){document.write") &&
  html.includes("cdn.jsdelivr.net/npm/@supabase/supabase-js@2"));
check("Build copia SDK UMD local para os assets do app",
  fs.readFileSync("package.json", "utf8").includes("dist/umd/supabase.js") &&
  fs.readFileSync(".github/workflows/android-apk.yml", "utf8").includes("npm run build"));
check("Falha de SDK é diagnosticada sem acusar configuração ausente",
  html.includes("Supabase JS SDK indisponível") &&
  html.includes("Configuração do Supabase ausente ou inválida"));
check("Central de mensagens é uma página independente da vitrine inicial",
  hasId("marketMain") && hasId("messagesMain") &&
  html.indexOf('<main id="messagesMain"') > html.indexOf('</main>', html.indexOf('<main id="marketMain"')) &&
  html.indexOf('id="chatPanel"') > html.indexOf('<main id="messagesMain"') &&
  html.indexOf('id="chatPanel"') < html.indexOf('</main>', html.indexOf('<main id="messagesMain"')));
check("Abrir e fechar mensagens alterna páginas sem sobrepor a home",
  html.includes('function showMessagesPage(view="chat")') &&
  html.includes('function hideMessagesPage()') &&
  html.includes('$("chatClose").onclick=hideMessagesPage') &&
  html.includes('$("navHome").onclick=()=>{hideMessagesPage();'));
check("Assistente virtual é uma tela própria dentro da central de mensagens",
  html.includes('showMessagesPage("assistant")') &&
  html.includes('$("assistantClose").onclick=()=>showMessagesPage("chat")') &&
  html.includes('id="assistantPanel"'));
check("Central de mensagens tem layout responsivo independente",
  html.includes(".messages-page{") &&
  html.includes("@media(max-width:620px)") &&
  html.includes(".messages-page .chat-shell"));
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
check("Painel do proprietário tem área dedicada e atalhos para as seções operacionais",
  hasId("ownerDashboard") && hasId("ownerDashboardTitle") &&
  html.includes('href="#adminTotals"') && html.includes('href="#adminOrders"') &&
  html.includes("Proteção da conta") && html.includes('profile?.papel==="admin"'));
check("Painel administrativo separado e protegido por papel admin",
  hasId("adminPanel") && hasId("adminOpen") &&
  html.includes('profile?.papel==="admin"') &&
  admin.includes('profile?.papel === "admin"') && admin.includes('if (!isAdmin) return reply({ error: "Acesso restrito ao administrador." }, 403)'));
check("Painel administrativo consulta backend e modera anúncios",
  html.includes('db.functions.invoke("admin-dashboard"') &&
  admin.includes('body?.action === "moderate_listing"') &&
  admin.includes('nextStatus === "ativo"') &&
  admin.includes('candidate.pagamento_status === "pago"') &&
  admin.includes('owner?.plano_status === "ativo"'));
check("Planos e pagamentos têm botão e painel separados",
  html.includes('$("plansOpen").onclick=') &&
  html.includes('$("paymentPanel").classList.remove("hidden")'));
check("Backend concede turbinamento gratuito somente a administradores", payment.includes('const freeAdminBoost = kind === "boost" && isAdmin') && payment.includes('freeForAdmin: true') && payment.includes('status: "active"'));
check("Interface informa e confirma turbinamento gratuito do administrador", html.includes('id="adminBoostNotice"') && html.includes('data.freeForAdmin?') && html.includes('document.body.dataset.isAdmin==="true"'));
check("Pagamento usa checkout hospedado Asaas sem CPF no cadastro Giro Fácil",
  html.includes('db.functions.invoke("asaas-create-payment"') &&
  html.includes('O Giro Fácil não pede CPF') &&
  payment.includes('/checkouts') &&
  payment.includes('asaas_checkout_id') &&
  payment.includes('billingType !== "CREDIT_CARD"') &&
  payment.includes('billingType !== "PIX"'));
check("Checkout e recorrência são sincronizados por webhook Asaas",
  fs.readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8").includes('payload.event === "CHECKOUT_PAID"') &&
  fs.readFileSync("supabase/functions/asaas-webhook/index.ts", "utf8").includes('payload.event === "SUBSCRIPTION_CREATED"'));
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

check("Central de agentes aparece dentro do painel administrativo",
  hasId("agentConsole") && hasId("adminAgentSelect") && hasId("adminAgentInput") && hasId("adminAgentSend") && hasId("adminAgentOutput"));
check("Console envia agente selecionado ao backend existente sem alterar chat público",
  html.includes('db.functions.invoke("giro-assistant",{body:{agent,message,history:[]}}') &&
  html.includes('$("assistantSend").onclick=sendAssistantMessage'));
check("Console interno limita opções aos quatro agentes administrativos",
  html.includes('<option value="admin">') && html.includes('<option value="moderation">') &&
  html.includes('<option value="commercial">') && html.includes('<option value="engineering">'));
check("Apelidos da equipe aparecem na central sem alterar os identificadores internos",
  html.includes("Chefe — Administração") && html.includes("Léo — Fiscalização de anúncios") &&
  html.includes("Pri — Inteligência comercial") && html.includes("Téo — Engenharia e testes") &&
  html.includes("Sam será o especialista de atendimento"));

// Roteamento dos cinco agentes com autorização administrativa para os agentes internos.
check("Assistente possui cinco perfis de agente definidos",
  assistant.includes("const agentProfiles") &&
  ["customer:", "admin:", "moderation:", "commercial:", "engineering:"].every(role => assistant.includes(role)));
check("Agentes internos exigem papel admin validado no servidor",
  assistant.includes('if (agent !== "customer")') &&
  assistant.includes('profile?.papel !== "admin"') &&
  assistant.includes('return respond({ error: "Este agente está disponível somente para administradores autorizados." }, 403)'));
check("Agente padrão mantém compatibilidade com o chat atual",
  assistant.includes('body?.agent === "string" ? body.agent : "customer"') &&
  html.includes('db.functions.invoke("giro-assistant"'));
check("Agentes internos são consultivos e não executam ações administrativas",
  assistant.includes("Você é o agente de análise de segurança e moderação") &&
  assistant.includes("nunca aprove, rejeite, oculte, exclua ou publique anúncios") &&
  assistant.includes("Você não tem acesso para editar repositórios"));
check("Fallback local mantém resposta específica para cada agente",
  assistant.includes("function localAgentAnswer") &&
  assistant.includes('fallback[agent]'));

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

// Recibos de leitura do chat: leitura apenas ao abrir a conversa, segurança e atualização.
check("Chat consulta o campo lida_em para renderizar recibos", html.includes('select("id,remetente_id,conteudo,criada_em,lida_em")'));
check("Destinatário marca somente mensagens recebidas como lidas", html.includes('m.remetente_id!==currentUser.id&&!m.lida_em') && html.includes('update({lida_em:readAt}).in("id",unreadIncoming)'));
check("Remetente vê confirmação dupla quando a mensagem é visualizada", html.includes('m.lida_em?"✓✓ Visualizada":"Enviada"'));
check("Atualização automática de recibos usa um único polling de 5 segundos", html.includes('window.giroChatReadReceiptPolling=setInterval') && html.includes('},5000);') && !html.includes('setInterval(()=>{if(activeConversationId&&!$("chatPanel").classList.contains("hidden"))loadMessages();},8000)'));
check("Migration restringe leitura ao participante destinatário", fs.existsSync("supabase/migrations/20261121230000_message_read_receipts.sql") && fs.readFileSync("supabase/migrations/20261121230000_message_read_receipts.sql", "utf8").includes("grant update (lida_em)") && fs.readFileSync("supabase/migrations/20261121230000_message_read_receipts.sql", "utf8").includes("remetente_id <> (select auth.uid())"));

check("Central de mensagens usa cabeçalho profissional e assistente compacto",
  html.includes('class="messages-heading"') &&
  html.includes('class="assistant-entry"') &&
  html.includes('GIRO FÁCIL BR · CENTRAL DE ATENDIMENTO'));
check("Lista de conversas oferece busca sem alterar os registros",
  hasId("chatSearch") &&
  html.includes('$("chatSearch").addEventListener("input"') &&
  html.includes('item.textContent.toLocaleLowerCase("pt-BR").includes(query)'));
check("Conversa abre em tela cheia no celular e oferece retorno à lista",
  hasId("chatBackToList") &&
  html.includes('$("messagesMain").classList.toggle("conversation-open",Boolean(selectId))') &&
  html.includes('$("chatBackToList").onclick=') &&
  html.includes('.messages-page.conversation-open .chat-list{display:none}') &&
  html.includes('.messages-page.conversation-open .chat-thread{display:flex'));
check("Selecionar conversa mantém confirmação de leitura e envio existentes",
  html.includes('m.lida_em?"✓✓ Visualizada":"Enviada"') &&
  html.includes('db.from("mensagens").insert({conversa_id:activeConversationId,remetente_id:currentUser.id,conteudo:content})'));
check("Lista de conversas e conversa aberta têm layout responsivo dedicado",
  html.includes(".conversation-search{") &&
  html.includes(".chat-thread-heading{") &&
  html.includes("@media(max-width:700px)"));
check("Botão Fechar da central de mensagens não quebra o texto no Android",
  html.includes('.messages-page .messages-close{') &&
  html.includes('white-space:nowrap!important') &&
  html.includes('min-width:88px!important'));
check("Caixa de entrada não reserva altura vazia no celular",
  html.includes('.messages-page:not(.conversation-open) #chatPanel{min-height:0}') &&
  html.includes('.messages-page:not(.conversation-open) .chat-list{min-height:0;max-height:min(54dvh,520px)}'));
check("Chat continua ocupando a tela quando uma conversa é aberta",
  html.includes('.messages-page.conversation-open .chat-thread{min-height:calc(100dvh - 245px);height:calc(100dvh - 245px)}'));
const failed = checks.filter(item => !item.ok);
for (const item of checks) console.log((item.ok ? "PASS " : "FAIL ") + item.name);
console.log("\n" + checks.length + " verificações; " + failed.length + " falhas.");
if (failed.length) {
  console.error("\nVerificações que precisam de correção:");
  failed.forEach(item => console.error(" - " + item.name));
  process.exit(1);
}
