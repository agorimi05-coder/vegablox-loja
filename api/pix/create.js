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
    process.env.BLACKCATPAY_API_BASE_URL ||
    process.env.BLACKCAT_API_BASE_URL ||
    process.env.PIX_API_URL ||
    "https://api.blackcatpay.com.br/api"
  ).replace(/\/$/, "");
}

function getApiKey() {
  return (
    process.env.BLACKCATPAY_API_KEY ||
    process.env.BLACKCAT_API_KEY ||
    process.env.PIX_API_KEY ||
    ""
  );
}

function getDefaultDocument() {
  return onlyDigits(
    process.env.BLACKCATPAY_DEFAULT_CPF ||
    process.env.BLACKCAT_DEFAULT_DOCUMENT ||
    process.env.PIX_DEFAULT_DOCUMENT
  );
}

function inferDocumentType(document) {
  return document.length > 11 ? "cnpj" : "cpf";
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeBlackcatResponse(payload, fallbackAmount) {
  const data = payload?.data || payload || {};
  const paymentData = data?.paymentData || {};
  const rawQrCodeImage =
    paymentData.qrCodeBase64 ||
    paymentData.qrCodeBase64Image ||
    paymentData.qr_code_base64 ||
    paymentData.qrCodeImage ||
    paymentData.qr_code_image ||
    "";
  const code =
    paymentData.copyPaste ||
    paymentData.qrCode ||
    paymentData.qr_code ||
    data.copyPaste ||
    data.qrCode ||
    "";
  const base64 =
    typeof rawQrCodeImage === "string" && rawQrCodeImage.startsWith("data:image")
      ? rawQrCodeImage
      : rawQrCodeImage
        ? `data:image/png;base64,${rawQrCodeImage}`
        : "";
  const transactionId =
    data.transactionId ||
    data.id ||
    payload?.transactionId ||
    "";

  return {
    ok: true,
    localIdentifier: transactionId,
    transactionId,
    status: data.status || payload?.status || "PENDING",
    amount: fromCents(data.amount, fallbackAmount),
    pix: {
      code,
      base64,
      image: base64,
      expiresAt: paymentData.expiresAt || data.expiresAt || null
    },
    transaction: payload
  };
}

function validatePayload(payload) {
  const robloxUsername = cleanText(payload.robloxUsername || payload.nick || payload.username);
  const amount = Number(payload.valor || payload.amount);
  const productName = cleanText(payload.descricao || payload.description || payload.productName, "Pedido Vegablox").slice(0, 80);
  const customerName = cleanText(payload.nome || payload.name || process.env.BLACKCATPAY_DEFAULT_NAME, robloxUsername || "Cliente Vegablox");
  const customerEmail = cleanText(payload.email || process.env.BLACKCATPAY_DEFAULT_EMAIL, `${robloxUsername || "cliente"}@vegablox.online`).toLowerCase();
  const customerPhone = onlyDigits(payload.phone || payload.telefone || process.env.BLACKCATPAY_DEFAULT_PHONE || "11999999999");
  const document = onlyDigits(payload.cpf || payload.document || getDefaultDocument());

  if (!robloxUsername) throw Object.assign(new Error("Informe o nick do Roblox."), { statusCode: 400 });
  if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error("Valor invalido."), { statusCode: 400 });
  if (!document) {
    throw Object.assign(new Error("Configure BLACKCATPAY_DEFAULT_CPF ou BLACKCAT_DEFAULT_DOCUMENT na Vercel."), { statusCode: 400 });
  }

  return {
    amount,
    productName,
    customerName,
    customerEmail,
    customerPhone,
    document,
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
    const apiKey = getApiKey();
    const webhookSecret = process.env.WEBHOOK_SECRET || "";

    if (!apiKey) {
      return sendJson(response, 500, {
        ok: false,
        error: "Configure BLACKCATPAY_API_KEY, BLACKCAT_API_KEY ou PIX_API_KEY na Vercel. Esta chave e da sua conta BlackCatPay, nao do cliente."
      });
    }

    const urlnoty = new URL("/api/pix/webhook", publicBaseUrl(request));
    if (webhookSecret) urlnoty.searchParams.set("secret", webhookSecret);

    const body = {
      amount: toCents(payload.amount),
      currency: "BRL",
      paymentMethod: "pix",
      items: [
        {
          title: payload.productName,
          quantity: 1,
          unitPrice: toCents(payload.amount),
          tangible: false
        }
      ],
      customer: {
        name: payload.customerName,
        email: payload.customerEmail,
        phone: payload.customerPhone,
        document: {
          number: payload.document,
          type: inferDocumentType(payload.document)
        },
        address: {
          zipCode: "00000-000",
          street: "Rua nao informada",
          number: "S/N",
          neighborhood: "Centro",
          complement: "Sem complemento",
          city: "Cidade nao informada",
          state: process.env.BLACKCATPAY_DEFAULT_STATE || "SP",
          country: "BR"
        }
      },
      pix: {
        expiresInDays: 1
      },
      postbackUrl: urlnoty.toString(),
      externalRef: `vegablox-${Date.now()}`,
      metadata: JSON.stringify({
        robloxUsername: payload.robloxUsername,
        productId: payload.productId
      })
    };

    const gatewayResponse = await fetch(`${getApiBase()}/sales/create-sale`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: JSON.stringify(body)
    });

    const rawText = await gatewayResponse.text();
    const gatewayPayload = safeJsonParse(rawText) || {};

    if (!gatewayResponse.ok) {
      return sendJson(response, gatewayResponse.status, {
        ok: false,
        error: gatewayPayload.message || "Falha ao criar Pix.",
        gateway: Object.keys(gatewayPayload).length ? gatewayPayload : rawText
      });
    }

    return sendJson(response, 200, {
      ...normalizeBlackcatResponse(gatewayPayload, payload.amount),
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
