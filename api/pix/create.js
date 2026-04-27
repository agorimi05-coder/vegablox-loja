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
    process.env.BLACKCAT_SECRET_KEY ||
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

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function findStringByKeys(source, keys) {
  if (!source || typeof source !== "object") return "";

  const wantedKeys = new Set(keys.map((key) => key.toLowerCase()));
  const stack = [source];
  const seen = new Set();

  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);

    for (const [key, value] of Object.entries(item)) {
      if (!wantedKeys.has(key.toLowerCase())) continue;
      if (typeof value === "string" && value.trim()) return value.trim();
    }

    for (const value of Object.values(item)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }

  return "";
}

function looksLikePixCode(value) {
  return /^000201/.test(value) || value.includes("br.gov.bcb.pix");
}

function findPixCode(source) {
  if (!source || typeof source !== "object") return "";

  const stack = [source];
  const seen = new Set();

  while (stack.length) {
    const item = stack.shift();
    if (!item || typeof item !== "object" || seen.has(item)) continue;
    seen.add(item);

    for (const value of Object.values(item)) {
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (looksLikePixCode(trimmed)) return trimmed;
      } else if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return "";
}

function looksLikeImageUrl(value) {
  return /^https?:\/\//i.test(value);
}

function asDataImage(value) {
  if (!value) return "";
  if (value.startsWith("data:image")) return value;
  if (looksLikeImageUrl(value)) return value;
  if (looksLikePixCode(value)) return "";
  if (!/^[A-Za-z0-9+/=]+$/.test(value) || value.length < 200) return "";
  return `data:image/png;base64,${value}`;
}

function normalizePixCode(value) {
  if (!value) return "";
  if (looksLikeImageUrl(value) || value.startsWith("data:image")) return "";
  if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 200 && !looksLikePixCode(value)) return "";
  return value;
}

function normalizeAttribution(payload) {
  const source = payload.utms || payload.utm || payload.tracking || payload.attribution || {};

  return {
    utm_source: source.utm_source || source.source || "",
    utm_medium: source.utm_medium || source.medium || "",
    utm_campaign: source.utm_campaign || source.campaign || "",
    utm_content: source.utm_content || source.content || "",
    utm_term: source.utm_term || source.term || "",
    utm_id: source.utm_id || source.id || "",
    fbclid: source.fbclid || "",
    gclid: source.gclid || "",
    ttclid: source.ttclid || "",
    src: source.src || "",
    sck: source.sck || ""
  };
}

function normalizeBlackcatResponse(payload, fallbackAmount) {
  const data = payload?.data || payload || {};
  const paymentData = data?.paymentData || {};
  const rawQrCodeImage = firstString(
    paymentData.qrCodeBase64 ||
    paymentData.qrCodeBase64Image ||
    paymentData.qr_code_base64 ||
    paymentData.qrCodeImage ||
    paymentData.qr_code_image,
    data.qrCodeBase64,
    data.qr_code_base64,
    data.qrCodeImage,
    data.qr_code_image,
    data.qrCodeUrl,
    data.qr_code_url,
    data.imageUrl,
    data.image,
    findStringByKeys(payload, [
      "qrCodeBase64",
      "qrCodeBase64Image",
      "qr_code_base64",
      "qrCodeImage",
      "qr_code_image",
      "qrCodeUrl",
      "qr_code_url",
      "imageUrl",
      "image"
    ])
  );
  const rawCode = firstString(
    paymentData.copyPaste ||
    paymentData.copyAndPaste ||
    paymentData.qrCode ||
    paymentData.qr_code ||
    paymentData.qrcode ||
    paymentData.qrcodeText ||
    paymentData.qrCodeText ||
    paymentData.copy_and_paste ||
    paymentData.copy_paste ||
    paymentData.copyPasteCode,
    data.copyPaste ||
    data.copyAndPaste ||
    data.qrCode ||
    data.qr_code ||
    data.qrcode ||
    data.qrcodeText ||
    data.qrCodeText ||
    data.copy_and_paste ||
    data.copy_paste ||
    data.copyPasteCode,
    payload.copyPaste,
    payload.copyAndPaste,
    payload.qrCode,
    payload.qr_code,
    payload.qrcode,
    payload.qrcodeText,
    payload.qrCodeText,
    payload.copy_and_paste,
    payload.copy_paste,
    payload.copyPasteCode,
    findStringByKeys(payload, [
      "copyPaste",
      "copyAndPaste",
      "copyPasteCode",
      "copy_and_paste",
      "copy_paste",
      "qrcodeText",
      "qrCodeText",
      "qrcode",
      "qr_code",
      "brCode",
      "emv",
      "pixCode",
      "pix_code"
    ]),
    findPixCode(payload)
  );
  const code = normalizePixCode(rawCode);
  const base64 = asDataImage(rawQrCodeImage);
  const qrImage = base64 || (code ? `https://quickchart.io/qr?size=300&text=${encodeURIComponent(code)}` : "");
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
      base64: base64.startsWith("data:image") ? base64 : "",
      image: qrImage,
      qrCodeBase64: base64.startsWith("data:image") ? base64 : "",
      qrCodeImage: qrImage,
      qrCodeUrl: qrImage,
      copyPaste: code,
      qrcode: code,
      qrcodeText: code,
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
    attribution: normalizeAttribution(payload),
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
        error: "Configure BLACKCATPAY_API_KEY, BLACKCAT_API_KEY, BLACKCAT_SECRET_KEY ou PIX_API_KEY na Vercel. Esta chave e da sua conta BlackCatPay, nao do cliente."
      });
    }

    const urlnoty = new URL("/api/pix/webhook", publicBaseUrl(request));
    if (webhookSecret) urlnoty.searchParams.set("secret", webhookSecret);
    const externalRef = `vegablox-${Date.now()}`;

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
      externalRef,
      utm_source: payload.attribution.utm_source,
      utm_medium: payload.attribution.utm_medium,
      utm_campaign: payload.attribution.utm_campaign,
      utm_content: payload.attribution.utm_content,
      utm_term: payload.attribution.utm_term,
      utm_id: payload.attribution.utm_id,
      fbclid: payload.attribution.fbclid,
      gclid: payload.attribution.gclid,
      ttclid: payload.attribution.ttclid,
      src: payload.attribution.src,
      sck: payload.attribution.sck,
      tracking: payload.attribution,
      attribution: payload.attribution,
      metadata: JSON.stringify({
        externalRef,
        robloxUsername: payload.robloxUsername,
        productId: payload.productId,
        attribution: payload.attribution
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
