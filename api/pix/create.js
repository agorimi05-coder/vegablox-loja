import { allowCors, publicBaseUrl, readJson, sendJson } from "../_utils/http.js";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function toCents(value) {
  return Math.round(Number(value) * 100);
}

function fromCents(value, fallbackAmount) {
  if (typeof value !== "number") return fallbackAmount;
  return value / 100;
}

function cleanText(value, fallback = "") {
  return String(value || fallback).trim();
}

function getApiBase() {
  return (
    process.env.BUCKPAY_API_BASE_URL ||
    "https://api.realtechdev.com.br"
  ).replace(/\/$/, "");
}

function getBuckpayToken() {
  return (
    process.env.BUCKPAY_TOKEN ||
    process.env.BUCKPAY_SECRET_KEY ||
    process.env.BUCKPAY_API_KEY ||
    ""
  );
}

function getDefaultDocument() {
  return onlyDigits(
    process.env.BUCKPAY_DEFAULT_CPF ||
    process.env.BUCKPAY_DEFAULT_DOCUMENT ||
    process.env.BLACKCATPAY_DEFAULT_CPF ||
    process.env.PIX_DEFAULT_DOCUMENT
  );
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeBuckpayResponse(payload, fallbackAmount, externalId) {
  const data = payload?.data || payload || {};
  const pix = data.pix || {};
  const code =
    pix.code ||
    data.pix_code ||
    data.pixCode ||
    "";
  const rawQrCodeImage = pix.qrcode_base64 || pix.qrCodeBase64 || data.qrcode_base64 || "";
  const base64 =
    typeof rawQrCodeImage === "string" && rawQrCodeImage.startsWith("data:image")
      ? rawQrCodeImage
      : rawQrCodeImage
        ? `data:image/png;base64,${rawQrCodeImage}`
        : "";
  const transactionId =
    data.id ||
    payload?.id ||
    "";

  return {
    ok: true,
    localIdentifier: externalId,
    transactionId,
    externalId,
    status: data.status || payload?.status || "pending",
    amount: fromCents(data.total_amount, fallbackAmount),
    pix: {
      code,
      base64,
      image: base64,
      expiresAt: pix.expires_at || data.expires_at || null
    },
    transaction: payload
  };
}

function normalizeBuyerName(value) {
  const cleaned = cleanText(value, "Cliente Vegablox")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z '\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned.slice(0, 100) : "Cliente Vegablox";
}

function normalizePhone(value) {
  const phone = onlyDigits(value || process.env.BUCKPAY_DEFAULT_PHONE || process.env.BLACKCATPAY_DEFAULT_PHONE || "5511999999999");
  if (phone.length >= 12 && phone.length <= 13) return phone;
  if (phone.length === 11) return `55${phone}`;
  return "5511999999999";
}

function buildTracking(payload) {
  const source = payload.utms || payload.tracking || {};

  return {
    ref: source.ref || source.fbclid || null,
    src: source.src || null,
    sck: source.sck || null,
    utm_source: source.utm_source || source.source || null,
    utm_medium: source.utm_medium || source.medium || null,
    utm_campaign: source.utm_campaign || source.campaign || null,
    utm_id: source.utm_id || source.id || null,
    utm_term: source.utm_term || source.term || null,
    utm_content: source.utm_content || source.content || null
  };
}

function validatePayload(payload) {
  const robloxUsername = cleanText(payload.robloxUsername || payload.nick || payload.username);
  const amount = Number(payload.valor || payload.amount);
  const productName = cleanText(payload.descricao || payload.description || payload.productName, "Pedido Vegablox").slice(0, 80);
  const customerName = normalizeBuyerName(payload.nome || payload.name || process.env.BUCKPAY_DEFAULT_NAME || process.env.BLACKCATPAY_DEFAULT_NAME);
  const customerEmail = cleanText(payload.email || process.env.BUCKPAY_DEFAULT_EMAIL || process.env.BLACKCATPAY_DEFAULT_EMAIL, `${robloxUsername || "cliente"}@vegablox.online`).toLowerCase();
  const customerPhone = normalizePhone(payload.phone || payload.telefone);
  const document = onlyDigits(payload.cpf || payload.document || getDefaultDocument());

  if (!robloxUsername) throw Object.assign(new Error("Informe o nick do Roblox."), { statusCode: 400 });
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("Valor invalido."), { statusCode: 400 });
  if (!document) {
    throw Object.assign(new Error("Configure BUCKPAY_DEFAULT_CPF na Vercel."), { statusCode: 400 });
  }

  return {
    amount,
    productName,
    customerName,
    customerEmail,
    customerPhone,
    document,
    tracking: buildTracking(payload),
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
    const token = getBuckpayToken();
    const userAgent = process.env.BUCKPAY_USER_AGENT || process.env.BUCKPAY_USERAGENT || "";
    const webhookSecret = process.env.WEBHOOK_SECRET || "";

    if (!token || !userAgent) {
      return sendJson(response, 500, {
        ok: false,
        error: "Configure BUCKPAY_TOKEN e BUCKPAY_USER_AGENT na Vercel. Esses dados sao credenciais da sua conta BuckPay."
      });
    }

    const urlnoty = new URL("/api/pix/webhook", publicBaseUrl(request));
    if (webhookSecret) urlnoty.searchParams.set("secret", webhookSecret);

    const body = {
      external_id: `vegablox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      payment_method: "pix",
      amount: toCents(payload.amount),
      buyer: {
        name: payload.customerName,
        email: payload.customerEmail,
        document: payload.document,
        phone: payload.customerPhone
      },
      product: {
        id: payload.productId || "robux",
        name: payload.productName
      },
      offer: {
        id: payload.productId || "robux_offer",
        name: payload.productName,
        quantity: 1
      },
      tracking: payload.tracking,
      postbackUrl: urlnoty.toString()
    };

    const gatewayResponse = await fetch(`${getApiBase()}/v1/transactions`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": userAgent
      },
      body: JSON.stringify(body)
    });

    const rawText = await gatewayResponse.text();
    const gatewayPayload = safeJsonParse(rawText) || {};

    if (!gatewayResponse.ok) {
      const gatewayError = gatewayPayload?.error || gatewayPayload;
      return sendJson(response, gatewayResponse.status, {
        ok: false,
        error: gatewayError?.message || gatewayError?.detail || "Falha ao criar Pix na BuckPay.",
        gateway: Object.keys(gatewayPayload).length ? gatewayPayload : rawText
      });
    }

    return sendJson(response, 200, {
      ...normalizeBuckpayResponse(gatewayPayload, payload.amount, body.external_id),
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
