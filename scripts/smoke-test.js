const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
const checks = [];
function check(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}
function countId(id) {
  const doubleQuoted = 'id="' + id + '"';
  const singleQuoted = "id='" + id + "'";
  return html.split(doubleQuoted).length - 1 + html.split(singleQuoted).length - 1;
}
check("Botão de mensagens inferior possui ID único", countId("navMessages") === 1);
check("Botão de mensagens do cabeçalho possui ID único", countId("headerMessages") === 1);
check("Os dois botões de mensagens abrem o chat", html.includes('$("navMessages").onclick=()=>openChat()') && html.includes('$("headerMessages").onclick=()=>openChat()'));
check("Assistente virtual tem botão próprio", countId("assistantOpen") === 1 && html.includes('$("assistantOpen").onclick='));
check("Painel administrativo é separado", countId("adminPanel") === 1 && countId("adminOpen") === 1);
check("Planos e pagamentos têm acesso separado", countId("paymentPanel") === 1 && countId("plansOpen") === 1);
check("Chat bloqueia envio sem conversa selecionada", html.includes('$("chatMessageInput").disabled=true;$("chatSend").disabled=true;'));
check("Chat permite envio após selecionar conversa", html.includes('$("chatMessageInput").disabled=false;$("chatSend").disabled=false;'));
check("Assistente chama a função de backend esperada", html.includes('db.functions.invoke("giro-assistant"'));
check("Painel administrativo chama a função de backend esperada", html.includes('db.functions.invoke("admin-dashboard"'));
check("Tratamento de envio do assistente restaura botão", html.includes('sendButton.disabled=false;') && html.includes('sendButton.textContent="Enviar";'));
check("Estilo das fotos evita sobreposição", html.includes("object-fit:cover") && html.includes("isolation:isolate"));
// Detecta qualquer ID duplicado, não apenas os botões já conhecidos.
const ids = [...html.matchAll(/\\bid\\s*=\\s*["']([^"']+)["']/g)].map(match => match[1]);
const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
check("Todos os IDs HTML são únicos", duplicates.length === 0);
check("Publicação usa o bucket correto de fotos", html.includes('db.storage.from("anuncios-fotos").upload'));
check("Anúncios são enviados inicialmente como pendentes", html.includes('status:"pendente"'));
check("Pagamento usa PIX ou boleto via Asaas", html.includes('db.functions.invoke("asaas-create-payment"'));
check("Fotos têm limite de 5 MB e tipos permitidos", html.includes("file.size>5*1024*1024") && html.includes('"image/webp"'));
check("Mensagens são enviadas pelo usuário autenticado", html.includes("remetente_id:currentUser.id"));
const failed = checks.filter(x => !x.ok);
for (const item of checks) console.log((item.ok ? "PASS " : "FAIL ") + item.name);
console.log("\\n" + checks.length + " verificações; " + failed.length + " falhas.");
if (failed.length) process.exit(1);
