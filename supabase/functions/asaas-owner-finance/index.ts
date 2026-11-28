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
    const asaasEnvironment = (Deno.env.get("ASAAS_ENVIRONMENT") || "").trim().toLowerCase();
    if (asaasEnvironment !== "sandbox" && asaasEnvironment !== "production") {
      return reply({ error: "Ambiente Asaas não definido. Configure ASAAS_ENVIRONMENT como sandbox ou production." }, 503);
    }
    const apiKey = Deno.env.get(asaasEnvironment === "sandbox" ? "ASAAS_API_KEY_SANDBOX" : "ASAAS_API_KEY_PRODUCTION");
    const apiUrl = asaasEnvironment === "sandbox"
      ? "https://api-sandbox.asaas.com/v3"
      : "https://api.asaas.com/v3";
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

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "dashboard");
    const headers = { access_token: apiKey, accept: "application/json", "Content-Type": "application/json", "User-Agent": "GiroFacilBR/1.0" };

    if (action === "list_transfers") {
      const [providerResponse, localResult] = await Promise.all([
        fetch(apiUrl + "/transfers?limit=50&offset=0", { method: "GET", headers, signal: AbortSignal.timeout(15000) }),
        admin.from("asaas_owner_transfers").select("id,asaas_transfer_id,value,pix_key_masked,pix_key_type,description,status,fail_reason,created_at,updated_at").order("created_at", { ascending: false }).limit(50),
      ]);
      const providerData = await providerResponse.json().catch(() => ({}));
      if (!providerResponse.ok) return reply({ error: providerData?.errors?.[0]?.description || "Não foi possível consultar as transferências." }, 502);
      if (localResult.error) throw localResult.error;
      return reply({ success: true, environment: asaasEnvironment, transfers: providerData.data || [], giroTransfers: localResult.data || [] });
    }

    if (action === "create_transfer") {
      const value = Number(body?.value);
      const pixAddressKey = String(body?.pixAddressKey || "").trim();
      const pixAddressKeyType = String(body?.pixAddressKeyType || "").toUpperCase();
      const description = String(body?.description || "Transferência realizada pelo Giro Fácil BR").trim().slice(0, 100);
      const idempotencyKey = String(body?.idempotencyKey || "").trim();
      const confirmation = String(body?.confirmation || "");
      if (confirmation !== "TRANSFERIR") return reply({ error: "Confirmação de segurança inválida. Digite TRANSFERIR para confirmar." }, 400);
      if (!Number.isFinite(value) || value < 1 || Math.round(value * 100) !== value * 100) return reply({ error: "Informe um valor válido, mínimo de R$ 1,00." }, 400);
      if (!/^[A-Z0-9._-]{8,80}$/i.test(idempotencyKey)) return reply({ error: "Identificador de segurança inválido. Reabra a tela e tente novamente." }, 400);
      if (!["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"].includes(pixAddressKeyType)) return reply({ error: "Tipo de chave Pix inválido." }, 400);
      const digits = pixAddressKey.replace(/\D/g, "");
      if (!pixAddressKey || (pixAddressKeyType === "CPF" && digits.length !== 11) ||
          (pixAddressKeyType === "CNPJ" && digits.length !== 14) ||
          (pixAddressKeyType === "PHONE" && digits.length !== 11) ||
          (pixAddressKeyType === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pixAddressKey)) ||
          (pixAddressKeyType === "EVP" && !/^[0-9a-f-]{36}$/i.test(pixAddressKey))) {
        return reply({ error: "Confira a chave Pix e o tipo selecionado." }, 400);
      }
      const masked = pixAddressKeyType === "EMAIL"
        ? pixAddressKey.replace(/^(.).+(@.*)$/, "$1•••$2")
        : pixAddressKeyType === "EVP" ? "Chave aleatória •••" : "••••" + digits.slice(-4);
      const { data: existing } = await admin.from("asaas_owner_transfers").select("*").eq("idempotency_key", idempotencyKey).maybeSingle();
      if (existing) return reply({ success: existing.status !== "FAILED", duplicate: true, transfer: existing, message: "Esta solicitação já foi registrada. Consulte o histórico antes de tentar novamente." }, 200);
      const { data: inserted, error: insertError } = await admin.from("asaas_owner_transfers").insert({
        idempotency_key: idempotencyKey, value, pix_key_masked: masked, pix_key_type: pixAddressKeyType,
        description, status: "PROCESSING", requested_by: auth.user.id
      }).select("*").single();
      if (insertError) {
        if (insertError.code === "23505") return reply({ error: "Esta solicitação já foi enviada. Atualize o histórico antes de repetir." }, 409);
        throw insertError;
      }
      let transferRequestStarted = false;
      let transferResponseStatus: number | null = null;
      let providerAccepted = false;
      let providerTransferId: string | null = null;
      try {
        const balanceResponse = await fetch(apiUrl + "/finance/balance", { method: "GET", headers, signal: AbortSignal.timeout(15000) });
        const balanceData = await balanceResponse.json().catch(() => ({}));
        if (!balanceResponse.ok) throw new Error(balanceData?.errors?.[0]?.description || "Não foi possível validar o saldo disponível.");
        const available = Number(balanceData?.balance ?? balanceData?.available ?? balanceData?.availableBalance);
        if (!Number.isFinite(available) || value > available) throw new Error("Saldo disponível insuficiente ou indisponível. Consulte o saldo no Asaas.");
        transferRequestStarted = true;
        const transferResponse = await fetch(apiUrl + "/transfers", {
          method: "POST", headers,
          body: JSON.stringify({ value, pixAddressKey, pixAddressKeyType, description, externalReference: inserted.id }),
          signal: AbortSignal.timeout(20000)
        });
        transferResponseStatus = transferResponse.status;
        const transferData = await transferResponse.json().catch(() => ({}));
        if (!transferResponse.ok) {
          const reason = transferData?.errors?.[0]?.description || "O Asaas recusou a transferência.";
          const uncertain = transferResponse.status >= 500 || [408, 409, 429].includes(transferResponse.status);
          await admin.from("asaas_owner_transfers").update({
            status: uncertain ? "UNKNOWN" : "FAILED",
            fail_reason: (uncertain
              ? `Resposta não conclusiva do Asaas (HTTP ${transferResponse.status}). Consulte o histórico antes de tentar novamente. `
              : `Asaas recusou a solicitação (HTTP ${transferResponse.status}). `) + reason.slice(0, 180),
            updated_at: new Date().toISOString()
          }).eq("id", inserted.id);
          return reply({
            error: uncertain ? "O Asaas não confirmou o resultado. Não repita o Pix agora; consulte o histórico de transferências." : reason,
            requestId: inserted.id,
            providerStatus: transferResponse.status,
            uncertain
          }, uncertain ? 202 : 400);
        }
        providerAccepted = true;
        providerTransferId = typeof transferData?.id === "string" ? transferData.id : null;
        if (!providerTransferId) throw new Error("O Asaas respondeu sem identificador da transferência; consulte o histórico antes de repetir.");
        const transferStatus = String(transferData?.status || "PENDING").toUpperCase();
        const { data: saved, error: saveError } = await admin.from("asaas_owner_transfers").update({
          asaas_transfer_id: providerTransferId, status: transferStatus, updated_at: new Date().toISOString()
        }).eq("id", inserted.id).select("*").single();
        if (saveError) throw saveError;
        return reply({ success: true, transfer: saved, provider: { id: providerTransferId, status: transferStatus, value: transferData.value, dateCreated: transferData.dateCreated }, message: "Solicitação enviada ao Asaas. Acompanhe o status no histórico; o envio ainda pode estar em processamento." });
      } catch (transferError) {
        const reason = transferError instanceof Error ? transferError.message : "Falha ao solicitar transferência.";
        const uncertain = transferRequestStarted && (transferResponseStatus === null || providerAccepted);
        await admin.from("asaas_owner_transfers").update({
          asaas_transfer_id: providerTransferId,
          status: uncertain ? "UNKNOWN" : "FAILED",
          fail_reason: (uncertain ? "Resultado ainda não confirmado. Consulte o histórico Asaas antes de tentar novamente. " : "") + reason.slice(0, 180),
          updated_at: new Date().toISOString()
        }).eq("id", inserted.id);
        return reply({ error: uncertain ? "Não foi possível confirmar a resposta do Asaas. Por segurança, não repita o Pix agora. Consulte o histórico de transferências no Asaas antes de tentar novamente." : reason, requestId: inserted.id, providerStatus: transferResponseStatus, uncertain }, uncertain ? 202 : 400);
      }
    }

    if (action !== "dashboard") return reply({ error: "Ação financeira não reconhecida." }, 400);

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
      environment: asaasEnvironment,
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