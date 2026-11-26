const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const assistantPath = "supabase/functions/giro-assistant/index.ts";
const adminPath = "supabase/functions/admin-dashboard/index.ts";
const paymentPath = "supabase/functions/asaas-create-payment/index.ts";
const assistantWorkflowPath = ".github/workflows/deploy-giro-assistant.yml";
const configPath = "supabase/config.toml";
const assistant = fs.existsSync(assistantPath) ? fs.readFileSync(assistantPath, "utf8") : "";
const adminDashboard = fs.existsSync("supabase/functions/admin-dashboard/index.ts") ? fs.readFileSync("supabase/functions/admin-dashboard/index.ts", "utf8") : "";
const admin = fs.existsSync(adminPath) ? fs.readFileSync(adminPath, "utf8") : "";
const payment = fs.existsSync(paymentPath) ? fs.readFileSync(paymentPath, "utf8") : "";
const webhookPath = "supabase/functions/asaas-webhook/index.ts";
const webhook = fs.existsSync(webhookPath) ? fs.readFileSync(webhookPath, "utf8") : "";
const founderMigrationPath = "supabase/migrations/20261123193000_giro_founder_500_campaign.sql";
const founderMigration = fs.existsSync(founderMigrationPath) ? fs.readFileSync(founderMigrationPath, "utf8") : "";
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
check("Abrir e fechar mensagens alterna páginas sem sobrepor a home e atualiza o menu",
  html.includes('function showMessagesPage(view="chat")') &&
  html.includes('function hideMessagesPage()') &&
  html.includes('$("chatClose").onclick=hideMessagesPage') &&
  html.includes('setActiveBottomNav("navMessages")') &&
  html.includes('setActiveBottomNav("navHome")') &&
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

check("Chat público recebe respostas incrementais por streaming",
  html.includes("stream:true") && html.includes("response.output_text.delta") &&
  assistant.includes("stream: wantsStream") && assistant.includes('"text/event-stream; charset=utf-8"'));
check("Assistente recupera histórico persistente por usuário com RLS",
  html.includes('from("assistant_threads")') && html.includes('from("assistant_messages")') &&
  html.includes('thread_id:threadId,user_id:currentUser.id,role:"user"') &&
  assistant.includes('eq("user_id", authData.user.id)'));
check("Contexto administrativo exige admin e entrega indicadores reais somente por endpoint protegido",
  adminDashboard.includes('body?.action === "assistant_context"') &&
  adminDashboard.includes('if (!isAdmin) return reply({ error: "Acesso restrito ao administrador." }, 403)') &&
  assistant.includes('action: "assistant_context"'));
check("Contexto de anúncios é limitado à conta autenticada",
  assistant.includes('.from("anuncios")') && assistant.includes('.eq("usuario_id", authData.user.id)'));
check("Contexto de conversas usa apenas conversas e mensagens acessíveis ao usuário",
  assistant.includes('.from("conversas")') && assistant.includes('comprador_id.eq.') &&
  assistant.includes('.from("mensagens")') && assistant.includes('.in("conversa_id", chatIds)'));
check("Comandos seguros por texto reutilizam o executor local do CHEFE sem depender de créditos da IA",
  html.includes("const safeOwnerCommand=") &&
  html.includes("executeOwnerVoiceCommand(message)") &&
  html.includes('document.body.dataset.isAdmin==="true"'));
check("Falha de créditos do Realtime ativa fallback de voz local",
  html.includes("credit_balance_exhausted") &&
  html.includes("item.error?.code") &&
  html.includes("startOwnerFallbackVoice();"));

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
  html.includes('db.functions.invoke("giro-assistant",{body:{agent,message,history:adminAgentHistory}}') &&
  html.includes('$("assistantSend").onclick=sendAssistantMessage'));
check("Painel do proprietário exibe a Central 24h com resumo e tarefas dos sete agentes",
  html.includes('id="ownerAgentControl"') &&
  html.includes('id="ownerAgentMetrics"') &&
  html.includes('id="ownerAgentLatest"') &&
  html.includes('id="ownerAgentTasks"') &&
  html.includes('id="ownerAgentRefresh"') &&
  html.includes('db.from("owner_agent_reports")') &&
  html.includes('db.from("owner_agent_tasks")'));
check("Console interno disponibiliza os sete agentes independentes da equipe",
  html.includes('<option value="coordinator">IA Central — Coordenadora dos sete agentes</option>') && html.includes('<option value="admin">') && html.includes('<option value="moderation">') &&
  html.includes('<option value="commercial">') && html.includes('<option value="engineering">') &&
  html.includes('<option value="partner">Parceiro — Estratégia e crescimento</option>') &&
  html.includes('<option value="acquisition_buyers">Captador 1 — Compradores e vendedores pessoa física</option>') &&
  html.includes('<option value="acquisition_business">Captador 2 — Lojistas, concessionárias e anunciantes</option>'));
check("Nomes da equipe correspondem aos sete papéis independentes",
  html.includes("IA Central — Coordenadora dos sete agentes") && html.includes("Chefe — Administração") && html.includes("Vigia — Segurança e fiscalização") &&
  html.includes("Vendedor — Clientes e vendas") && html.includes("Técnico — Engenharia e testes") &&
  html.includes("Parceiro — Estratégia e crescimento") &&
  html.includes("Captador 1 — Compradores e vendedores pessoa física") &&
  html.includes("Captador 2 — Lojistas, concessionárias e anunciantes"));

// Roteamento dos cinco agentes com autorização administrativa para os agentes internos.
check("Assistente possui atendimento público e seis perfis internos de agente",
  assistant.includes("const agentProfiles") &&
  ["customer:", "coordinator:", "admin:", "moderation:", "commercial:", "engineering:", "partner:", "acquisition_buyers:", "acquisition_business:"].every(role => assistant.includes(role)));
check("Agentes internos exigem papel admin validado no servidor",
  assistant.includes('if (agent !== "customer")') &&
  assistant.includes('profile?.papel !== "admin"') &&
  assistant.includes('return respond({ error: "Este agente está disponível somente para administradores autorizados." }, 403)'));
check("Agente padrão mantém compatibilidade com o chat atual",
  assistant.includes('body?.agent === "string" ? body.agent.trim() : "customer"') &&
  html.includes('db.functions.invoke("giro-assistant"'));
check("Agentes internos são consultivos e não executam ações administrativas",
  assistant.includes("Você é o agente de análise de segurança e moderação") &&
  assistant.includes("nunca aprove, rejeite, oculte, exclua ou publique anúncios") &&
  assistant.includes("Você não tem acesso para editar repositórios"));
check("Fallback local mantém resposta específica para cada agente",
  assistant.includes("function localAgentAnswer") &&
  assistant.includes('if (agent === "coordinator")') &&
  assistant.includes('if (agent === "acquisition_buyers")') && assistant.includes("Entendi seu pedido"));

check("Captador 1 tem missão exclusiva de pessoas físicas e respeita LGPD",
  assistant.includes("Você é o CAPTADOR 1 do Giro Fácil BR") &&
  assistant.includes("compradores e vendedores pessoa física") &&
  assistant.includes("Não faça spam, não envie mensagens em massa") &&
  assistant.includes("Respeite a LGPD e os termos das plataformas."));
check("Captador 2 tem missão exclusiva B2B e respeita LGPD",
  assistant.includes("Você é o CAPTADOR 2 do Giro Fácil BR") &&
  assistant.includes("lojistas, concessionárias, revendedores") &&
  assistant.includes("evite duplicar oportunidades do Captador 1") &&
  assistant.includes("Não faça spam, não envie mensagens em massa"));
check("Os dois Captadores não gastam dinheiro nem enviam mensagens sem autorização",
  assistant.includes("não compre anúncios") &&
  assistant.includes("nem gaste dinheiro sem autorização expressa do proprietário") &&
  assistant.includes('if (agent === "acquisition_business")') &&
  assistant.includes("Não envio mensagens") && assistant.includes("não gasto dinheiro sem autorização"));

check("Política global proíbe que qualquer agente bloqueie ou restrinja contas", assistant.includes("Nenhum agente pode bloquear, desbloquear, suspender, banir ou restringir contas de usuários."));
check("CHEFE administrativo não tem autonomia para bloquear contas", assistant.includes("Nenhum robô, inclusive o CHEFE, pode autorizar bloqueio de conta."));
check("VIGIA apenas sinaliza suspeitas e nunca bloqueia ou restringe pessoas", assistant.includes("Não bloqueie, desbloqueie, suspenda, bana ou restrinja contas, perfis ou acesso de pessoas") && assistant.includes("autorização expressa do proprietário"));
check("Endpoint administrativo rejeita ações automáticas de bloqueio de contas", admin.includes("forbiddenAccountControlActions") && ["block_user", "unblock_user", "suspend_user", "ban_user", "restrict_user"].every(action => admin.includes('"'+action+'"')) && admin.includes("Bloqueio e desbloqueio de contas não podem ser executados por robôs"));

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


check("Assistente usa a Responses API atual e modelo GPT-6.2 Sol por padrão",
  assistant.includes('https://api.openai.com/v1/responses') &&
  assistant.includes('"gpt-6.2-sol"') &&
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
const listingStatusMigrationPath = "supabase/migrations/20261120140058_listing_analytics_and_advertiser_dashboard.sql";
const listingStatusMigration = fs.existsSync(listingStatusMigrationPath) ? fs.readFileSync(listingStatusMigrationPath, "utf8") : "";
check("Anunciante só pode mudar anúncio ativo para vendido",
  listingStatusMigration.includes("IF auth.uid() = OLD.usuario_id AND NEW.status IS DISTINCT FROM OLD.status THEN") &&
  listingStatusMigration.includes("IF OLD.status <> 'ativo' OR NEW.status <> 'vendido' THEN"));
check("Proteção de status roda antes de qualquer atualização do anúncio",
  listingStatusMigration.includes("CREATE TRIGGER giro_guard_owner_listing_status") &&
  listingStatusMigration.includes("BEFORE UPDATE OF status ON public.anuncios"));

// Recibos de leitura do chat: leitura apenas ao abrir a conversa, segurança e atualização.
check("Recibo Entregue só aparece antes da confirmação Visualizada", html.includes('m.lida_em?"✓✓ Visualizada":m.entregue_em?"✓✓ Entregue":"✓ Enviada"'));
check("Chat consulta a confirmação de entrega e a confirmação de leitura separadamente",
  html.includes('lida_em,entregue_em') && html.includes('m.lida_em?"✓✓ Visualizada":m.entregue_em?"✓✓ Entregue":"✓ Enviada"'));
check("Destinatário confirma entrega ao receber mensagens com a caixa aberta",
  html.includes('filter(m=>m.remetente_id!==currentUser.id&&!m.entregue_em)') &&
  html.includes('update({entregue_em:deliveredAt}).in("id",undeliveredIncoming)'));
check("Migration permite confirmar entrega somente para o destinatário",
  fs.existsSync("supabase/migrations/20261122160827_message_delivery_receipts.sql") &&
  fs.readFileSync("supabase/migrations/20261122160827_message_delivery_receipts.sql","utf8").includes("grant update (entregue_em)") &&
  fs.readFileSync("supabase/migrations/20261122160827_message_delivery_receipts.sql","utf8").includes("remetente_id <> (select auth.uid())"));

check("Chat consulta o campo lida_em para renderizar recibos", html.includes('select("id,remetente_id,conteudo,criada_em,lida_em,entregue_em")'));
check("Destinatário marca somente mensagens recebidas como lidas", html.includes('m.remetente_id!==currentUser.id&&!m.lida_em') && html.includes('update({lida_em:readAt}).in("id",unreadIncoming)'));
check("Remetente vê confirmação dupla quando a mensagem é visualizada", html.includes('m.lida_em?"✓✓ Visualizada":m.entregue_em?"✓✓ Entregue":"✓ Enviada"'));
check("Atualização automática de recibos usa eventos Realtime de UPDATE", html.includes('event:"UPDATE",schema:"public",table:"mensagens"') && html.includes("scheduleChatInboxRefresh"));
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
  html.includes('m.lida_em?"✓✓ Visualizada":m.entregue_em?"✓✓ Entregue":"✓ Enviada"') &&
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
check("Inbox carrega foto do anúncio, título e dados da conversa",
  html.includes('anuncios(titulo,fotos)') &&
  html.includes('className="conversation-avatar"') &&
  html.includes('img.alt="Foto do anúncio"'));
check("Lista de conversas exibe prévia da última mensagem e horário",
  html.includes('className="conversation-preview"') &&
  html.includes('formatConversationTime(latest?.criada_em||conv.ultima_mensagem_em)') &&
  html.includes('latest.remetente_id===currentUser.id?"Você: ":""'));
check("Inbox identifica a outra parte como comprador ou vendedor",
  html.includes('const counterpartRole=isBuyer?"Vendedor":"Comprador"') &&
  html.includes('Você está atendendo o comprador'));
check("Mensagens não lidas aparecem na conversa e no menu inferior",
  html.includes('className="conversation-unread"') &&
  hasId("navMessagesBadge") &&
  html.includes('function updateConversationUnreadTotal()'));
check("Abrir conversa marca como lida; lista fechada ou página oculta não marca",
  html.includes('const inboxVisible=!$("messagesMain").classList.contains("hidden")&&!$("chatPanel").classList.contains("hidden")') &&
  html.includes('const threadVisible=inboxVisible&&(!mobile||$("messagesMain").classList.contains("conversation-open"))') &&
  html.includes("const unreadIncoming=threadVisible?"));
check("Chat recebe mensagens novas e recibos de leitura pelo Supabase Realtime",
  html.includes('db.channel("giro-inbox-"+userId)') &&
  html.includes('table:"mensagens"') &&
  html.includes('event:"INSERT"') &&
  html.includes('event:"UPDATE"') &&
  html.includes('function scheduleChatInboxRefresh()'));
check("Novas conversas atualizam a caixa de entrada em tempo real",
  html.includes('table:"conversas"') &&
  html.includes('function syncChatInboxRealtime()'));
check("Chat não depende mais de polling a cada cinco segundos",
  !html.includes("giroChatReadReceiptPolling") &&
  !html.includes("setInterval(()=>{") &&
  html.includes("sem polling"));
check("Confirmação de leitura só ocorre quando a conversa está visível",
  html.includes('const inboxVisible=!$("messagesMain").classList.contains("hidden")&&!$("chatPanel").classList.contains("hidden")') &&
  html.includes('const threadVisible=inboxVisible&&(!mobile||$("messagesMain").classList.contains("conversation-open"))'));
check("Presença online é encerrada ao sair da conversa e ao fazer logout",
  html.includes("async function stopChatPresence()") &&
  html.includes('stopChatPresence();') &&
  html.includes('if(!db||!currentUser){await stopChatInboxRealtime();await stopChatPresence();return;}'));
check("Migração habilita somente conversas e mensagens na publicação Realtime",
  fs.existsSync("supabase/migrations/20261122155404_enable_chat_realtime_publication.sql") &&
  fs.readFileSync("supabase/migrations/20261122155404_enable_chat_realtime_publication.sql","utf8").includes("alter publication supabase_realtime add table public.mensagens") &&
  fs.readFileSync("supabase/migrations/20261122155404_enable_chat_realtime_publication.sql","utf8").includes("alter publication supabase_realtime add table public.conversas"));
check("Asaas cria checkout com autenticação e tipo de pedido válidos",
  fs.readFileSync("supabase/functions/asaas-create-payment/index.ts", "utf8").includes('const headers = { "Content-Type": "application/json", access_token: apiKey };') &&
  fs.readFileSync("supabase/functions/asaas-create-payment/index.ts", "utf8").includes("kind, billing_type: billingType") &&
  !fs.readFileSync("supabase/functions/asaas-create-payment/index.ts", "utf8").includes("kind: orderKind"));
check("Banco aceita cartão para planos recorrentes no Asaas",
  fs.existsSync("supabase/migrations/20261123010000_allow_credit_card_payment_orders.sql") &&
  fs.readFileSync("supabase/migrations/20261123010000_allow_credit_card_payment_orders.sql", "utf8").includes("'CREDIT_CARD'"));

check("Campanha 500 Parceiros Fundadores aparece na página inicial com preço e benefícios", html.includes("500 Parceiros Fundadores Giro Fácil BR") && html.includes("R$ 39 por mês") && html.includes("7 dias de turbo promocional"));
check("Inscrição de parceiro reserva vaga na campanha por código próprio", html.includes('founder_campaign_code:"fundadores-500"') && founderMigration.includes("giro_private.giro_founder_500_seq") && founderMigration.includes("no maxvalue"));
check("Banco impede inscrição duplicada por usuário e numeração repetida, sem limitar estoque promocional", founderMigration.includes("partner_founder_user_once") && founderMigration.includes("partner_founder_number_unique") && founderMigration.includes("no maxvalue"));
check("Plano fundador custa R$ 39 e exige parceiro aprovado no servidor", payment.includes("loja_fundador: 39") && payment.includes('eq("founder_campaign_code", "fundadores-500")') && payment.includes('partnerAccount?.status !== "ativo"'));
check("Turbo fundador gratuito dura 7 dias e só pode ser resgatado uma vez", payment.includes('founder_7d: { amount: 0, days: 7 }') && payment.includes("founder_turbo_claimed_at") && payment.includes("freeForFounder"));
check("Kit digital só aparece após ativação do plano fundador", html.includes('id="founderKitLink"') && html.includes('founderPlan?.status!=="active"'));
check("Webhook libera plano fundador após checkout pago e encerra assinatura cancelada", webhook.includes('checkoutOrder.kind === "store"') && webhook.includes('storeDeactivateError'));
check("Regras comerciais deixam claro que não há sorteio ou prêmio aleatório", fs.readFileSync("docs/campanha-500-parceiros-fundadores.md", "utf8").includes("Nenhum sorteio, rifa, venda de números ou prêmio aleatório"));

// CHEFE: comandos de voz do proprietário — testes de regressão.

check("APK usa transcrição parcial nativa para reduzir atraso e acompanha estado do microfone",
  html.includes('window.Capacitor?.Plugins?.SpeechRecognition') &&
  html.includes('native.start({language:"pt-BR",maxResults:1,partialResults:true,popup:false})') &&
  html.includes('native.addListener("partialResults"') &&
  html.includes('native.addListener("listeningState"') &&
  html.includes('native.requestPermissions()') &&
  html.includes('await native.stop()'));

check("Assistente de voz do proprietário possui controles de iniciar e encerrar",hasId("ownerVoiceStart")&&hasId("ownerVoiceStop")&&hasId("ownerVoiceStatus")&&hasId("ownerVoiceTranscript"));
check("Modo gratuito usa reconhecimento e síntese de voz pt-BR do navegador",html.includes("window.SpeechRecognition||window.webkitSpeechRecognition")&&html.includes("new SpeechSynthesisUtterance(message)")&&html.includes('utterance.lang="pt-BR"'));
check("Falha do reconhecimento nativo troca automaticamente para voz básica do navegador sem encerrar sessão",html.includes("ownerForceBrowserSpeech=true")&&html.includes("ownerFallbackStartListening();")&&html.includes("ownerNativeSpeechReady=null")&&!/ownerVoiceSetStatus\("Falha no reconhecimento nativo:[\\s\\S]{0,180}?ownerFallbackActive=false/.test(html));
check("Falha de reconhecimento no navegador mantém a sessão de voz ativa",html.includes("A sessão continua ativa")&&!html.includes('ownerFallbackActive=false;$( "ownerVoiceStart").disabled=false;$( "ownerVoiceStop").disabled=true;'));
check("Modo gratuito interrompe reconhecimento e fala ao encerrar",html.includes("ownerFallbackRecognition.abort()")&&html.includes("window.speechSynthesis.cancel()"));
check("Normalização de nomes falados remove acentos corretamente",html.includes('const normVoiceName=')&&html.includes('replace(/[\\u0300-\\u036f]/g,"")'));
check("Comando para abrir mensagens de compradores reconhece palavras com limites corretos",html.includes('has(/\\b(mensagem|mensagens|conversa|conversas|chat)\\b/)&&has(/\\b(comprador|cliente|compradores|clientes)\\b/)'));
check("Comandos de voz executáveis exigem sessão e papel de administrador",html.includes("async function executeOwnerVoiceCommand")&&html.includes('document.body.dataset.isAdmin!=="true"'));
check("Executor de voz contextual opera controles visíveis, campos e navegação",html.includes("Executor semântico genérico")&&html.includes("document.querySelectorAll")&&html.includes("field.dispatchEvent")&&html.includes("history.back()"));
check("Comandos reconhecem português sem acentos e identificam os comandos financeiros",html.includes('normalize("NFD")')&&html.includes("financeiro|pagamentos|pedidos|recebimentos"));
check("Ações sensíveis exigem confirmação na interface e não são acionadas genericamente",html.includes("const risky=")&&html.includes("confirme diretamente no botão da tela")&&html.includes("return {handled:false}"));
check("CHEFE pergunta qual comprador antes de abrir uma conversa por voz",
  html.includes("ownerVoicePendingChatLookup") &&
  html.includes("De qual comprador você quer abrir a mensagem?") &&
  html.includes('has(/\\b(mensagem|mensagens|conversa|conversas|chat)\\b/)'));
check("Inbox identifica o comprador pelo nome do perfil e associa a conversa ao ID correto",
  html.includes('from("perfis").select("id,nome").in("id",peerIds)') &&
  html.includes('b.dataset.conversationId=conv.id') &&
  html.includes('b.dataset.peerName=peerName') &&
  html.includes('b.dataset.peerRole=counterpartRole'));
check("CHEFE abre a conversa correspondente após o proprietário informar o nome",
  html.includes('await openChat(target.id)') &&
  html.includes('Abri a conversa com "+target.name'));
check("Voz dita mensagem diretamente no campo da conversa e exige comando explícito para enviar",
  html.includes("ditar|escrever|redigir") &&
  html.includes("chatInput.value=dictated") &&
  html.includes("ownerVoiceMessageDraftReady=true") &&
  html.includes("enviar mensagem|pode enviar mensagem|confirmo envio") &&
  html.includes("await sendChatMessage()"));
check("Voz permite cancelar o rascunho sem enviar e impede envio sem texto preparado",
  html.includes("cancelar rascunho|apagar rascunho|limpar mensagem") &&
  html.includes("Ainda não há uma mensagem ditada pronta para enviar") &&
  html.includes("Rascunho apagado. Nenhuma mensagem foi enviada."));


check("Resposta de contingência mantém contexto recente e não repete saudação fixa",html.includes("ownerFallbackHistory.slice(-4)")&&html.includes('message:transcript,history'));
check("Comandos locais são priorizados antes de qualquer chamada de IA online",
  html.includes("const command=await executeOwnerVoiceCommand(transcript)") &&
  html.indexOf("const command=await executeOwnerVoiceCommand(transcript)") < html.indexOf('db.functions.invoke("giro-assistant",{body:{agent:"admin",message:transcript,history}})'));
check("Voz mantém comandos locais quando a internet cai e detecta reconexão",
  html.includes('window.addEventListener("offline"') &&
  html.includes('window.addEventListener("online"') &&
  html.includes("navigator.onLine===false") &&
  html.includes("Os comandos locais continuam disponíveis"));
check("Consulta online de voz tem timeout e histórico reduzido para conexões lentas",
  html.includes("setTimeout(()=>reject(new Error(") &&
  html.includes(")),9000)") &&
  html.includes("ownerFallbackHistory.slice(-4)"));
check("Ativação de voz não solicita microfone automaticamente fora de um toque do usuário",
  html.includes("Toque no ícone do CHEFE para ativar o microfone") &&
  !html.includes("startOwnerVoiceConversation();\n          }\n        },900)"));
check("Inicialização de voz solicita microfone e token em paralelo",
  html.includes("const [voiceStream,tokenResult]=await Promise.all") &&
  html.includes("navigator.mediaDevices.getUserMedia") &&
  html.includes('db.functions.invoke("owner-voice-session",{body:{}})'));
check("Modo de voz nativo começa a ouvir sem esperar saudação falada",
  html.includes('ownerVoiceSetStatus("Ativando o microfone agora. Pode falar...")') &&
  html.includes("ownerFallbackStartListening();"));
check("Abertura por voz mostra os detalhes completos do anúncio próprio, inclusive pendente",
  html.includes("async function openOwnerListingDetail") &&
  html.includes('.eq("id",listingId).eq("usuario_id",currentUser.id).maybeSingle()') &&
  html.includes("Detalhes do seu anúncio"));
check("Comando ambíguo de anúncio pergunta título e aceita primeira, segunda ou terceira opção",
  html.includes("ownerVoicePendingListingLookup") &&
  html.includes("primeiro, segundo ou terceiro") &&
  html.includes("Vou abrir o escolhido"));


// Regressão: navegação por voz do CHEFE deve acionar as telas reais do app.
check("Comando por voz abre Meus classificados pela ação existente do botão",html.includes('$("myListingsOpen")?.click()')&&html.includes("meus? anuncios|meus? classificados|meu estoque|meus produtos|meus anuncios publicados|meus itens"));
check("Comandos por voz reconhecem as seis áreas da navegação inferior",
  ["navHome","navSearch","navAnnounce","navFavorites","navMessages","navAccount"].every(id=>html.includes('clickNav("'+id+'"')));
check("Navegação por voz também é executada na transcrição do modo Realtime",
  html.includes('executeOwnerVoiceCommand(item.transcript).then') &&
  html.includes('type:"response.create"') &&
  html.includes('input_audio_buffer.speech_started'));
check("Área administrativa continua protegida por verificação de papel",
  html.includes('if(document.body.dataset.isAdmin!=="true")return {handled:false};'));
check("Ações financeiras e destrutivas não são executadas sem confirmação explícita",
  html.includes("const risky=") && html.includes("confirme diretamente no botão da tela"));
 
check("Botão flutuante inicia a sessão de voz diretamente sem depender da palavra-chave do navegador",
  html.includes('launcher.onclick=()=>') &&
  html.includes('startOwnerVoiceConversation();') &&
  html.includes('Microfone automático do CHEFE') &&
  !html.includes('launcher.onclick=()=>{\\n        armOwnerWakeWord();'));
check("Permissão do microfone e credencial de voz são solicitadas em paralelo após toque",
  html.includes("const [voiceStream,tokenResult]=await Promise.all") &&
  html.includes('navigator.mediaDevices.getUserMedia({audio:') &&
  html.includes('db.functions.invoke("owner-voice-session",{body:{}})'));
check("Falha de conexão Realtime ativa automaticamente o modo gratuito de voz do Android",html.includes('const microphoneUnavailable=["NotAllowedError","PermissionDeniedError","NotFoundError"].includes(error?.name)')&&html.includes("Ativando o modo gratuito de voz do Android para continuar os comandos.")&&html.includes("startOwnerFallbackVoice();"));
check("Erro de permissão do microfone apresenta orientação clara no Android",
  html.includes('Acesso ao microfone bloqueado. Nas configurações do Android'));

check("Assistente inicia microfone somente após toque do proprietário",
  html.includes('launcher.onclick=()=>{') &&
  html.includes("startOwnerVoiceConversation();") &&
  !html.includes("ownerAutoVoiceStarted=true;"));
check("Captação de áudio ativa cancelamento de eco, redução de ruído e ganho automático",
  html.includes("echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1"));
check("Detecção de fala usa limiar mais sensível e pausa curta",
  fs.readFileSync("supabase/functions/owner-voice-session/index.ts","utf8").includes('threshold: 0.42, prefix_padding_ms: 300, silence_duration_ms: 400') && fs.readFileSync("supabase/functions/owner-voice-session/index.ts","utf8").includes('voice: "cedar", speed: 1.4'));


check("Central Financeira Asaas tem endpoint dedicado e autenticação administrativa",
  fs.existsSync("supabase/functions/asaas-owner-finance/index.ts") &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes('profile?.papel !== "admin"') &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes("/finance/balance") &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes("/financialTransactions"));
check("Painel financeiro mostra saldo Asaas e separa receitas por tipo",
  html.includes("ownerAsaasFinance") &&
  html.includes("ownerFinanceBalanceValue") &&
  html.includes("ownerFinanceRevenue") &&
  html.includes("asaas-owner-finance"));
check("Painel de configurações apresenta controles operacionais e segurança",
  html.includes("Configurações do aplicativo") &&
  html.includes("Atendimento") &&
  html.includes("Cadastros") &&
  html.includes("Segurança"));


check("Central Financeira oferece páginas independentes para saldo, entradas, turbo, planos, anúncios, Pix, extrato e histórico",
  ["balance","receipts","boost","plans","single","transfers","statement","history"].every(key=>html.includes("data-finance-page=\\""+key+"\\"")));
check("Transferência Pix exige revisão e confirmação digitada pelo proprietário",
  html.includes("ownerTransferReview") && html.includes("ownerTransferConfirm") &&
  html.includes("confirmInput.value.trim()!=='TRANSFERIR'") &&
  html.includes("confirmation:'TRANSFERIR'"));
check("Endpoint de transferência valida papel admin, saldo, chave Pix e evita repetição",
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes('action === "create_transfer"') &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes('confirmation !== "TRANSFERIR"') &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes('idempotency_key') &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes('value > available'));
check("Transferência com resposta incerta não é marcada como falha nem encoraja reenvio automático",
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes('status: uncertain ? "UNKNOWN" : "FAILED"') &&
  fs.readFileSync("supabase/functions/asaas-owner-finance/index.ts","utf8").includes("não repita o Pix agora"));

const failed = checks.filter(item => !item.ok);
for (const item of checks) console.log((item.ok ? "PASS " : "FAIL ") + item.name);
console.log("\n" + checks.length + " verificações; " + failed.length + " falhas.");
if (failed.length) {
  console.error("\nVerificações que precisam de correção:");
  failed.forEach(item => console.error(" - " + item.name));
  process.exit(1);
}
