import { allowCors, publicBaseUrl, readJson, requiredEnv, sendJson } from "../_utils/http.js";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount.toFixed(2);
}

function validatePayload(payload) {
  const robloxUsername = String(payload.robloxUsername || payload.nick || payload.username || "").trim();
  const nome = String(payload.nome || payload.name || robloxUsername || process.env.BLACKCATPAY_DEFAULT_NAME || "Cliente Vegablox").trim();
  const cpf = onlyDigits(payload.cpf || payload.document || process.env.BLACKCATPAY_DEFAULT_CPF);
  const valor = normalizeAmount(payload.valor || payload.amount);
  const descricao = String(payload.descricao || payload.description || payload.productName || "Pedido Vegablox").trim().slice(0, 50);

  if (nome.length < 3) throw Object.assign(new Error("Nome do pagador invalido."), { statusCode: 400 });
  if (cpf.length !== 11) {
    throw Object.assign(new Error("CPF invalido. Configure BLACKCATPAY_DEFAULT_CPF ou envie cpf no checkout."), { statusCode: 400 });
  }
  if (!valor) throw Object.assign(new Error("Valor invalido."), { statusCode: 400 });

  return {
    nome,
    cpf,
    valor,
    descricao,
    robloxUsername,
    productId: String(payload.productId || "").trim()
  };
}

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (request.method !== "POST") {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const payload = validatePayload(await readJson(request));
    const clientId = requiredEnv("BLACKCATPAY_CLIENT_ID");
    const clientSecret = requiredEnv("BLACKCATPAY_CLIENT_SECRET");
    const apiUrl = process.env.BLACKCATPAY_API_URL || "https://dash.blackonpay.com/v3/pix/qrcode";
    const webhookSecret = process.env.WEBHOOK_SECRET || "";

    const urlnoty = new URL("/api/pix/webhook", publicBaseUrl(request));
    if (webhookSecret) urlnoty.searchParams.set("secret", webhookSecret);

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      nome: payload.nome,
      cpf: payload.cpf,
      valor: payload.valor,
      descricao: payload.descricao,
      urlnoty: urlnoty.toString()
    });

    const gatewayResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body
    });

    const gatewayPayload = await gatewayResponse.json().catch(() => ({}));

    if (!gatewayResponse.ok) {
      return sendJson(response, gatewayResponse.status, {
        ok: false,
        error: gatewayPayload.message || "Falha ao criar Pix.",
        gateway: gatewayPayload
      });
    }

    return sendJson(response, 200, {
      ok: true,
      transaction: gatewayPayload,
      meta: {
        robloxUsername: payload.robloxUsername,
        productId: payload.productId
      }
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
