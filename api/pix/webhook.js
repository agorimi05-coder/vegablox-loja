import { allowCors, readJson, sendJson } from "../_utils/http.js";

function isAuthorized(request) {
  const configuredSecret = process.env.WEBHOOK_SECRET;
  if (!configuredSecret) return true;

  const url = new URL(request.url, `https://${request.headers.host}`);
  const providedSecret = request.headers["x-webhook-secret"] || url.searchParams.get("secret");
  return providedSecret === configuredSecret;
}

function getOrderLogWebhookUrl() {
  return process.env.ORDER_LOG_WEBHOOK_URL || process.env.GOOGLE_SHEETS_WEBHOOK_URL || "";
}

async function sendOrderLog(payload) {
  const webhookUrl = getOrderLogWebhookUrl();
  if (!webhookUrl) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ORDER_LOG_WEBHOOK_SECRET
          ? { "X-Webhook-Secret": process.env.ORDER_LOG_WEBHOOK_SECRET }
          : {})
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("ORDER LOG WEBHOOK ERROR", error);
  }
}

function readMetadata(value) {
  if (!value || typeof value !== "string") return {};

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (request.method !== "POST") {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  if (!isAuthorized(request)) {
    return sendJson(response, 401, { ok: false, error: "Webhook nao autorizado." });
  }

  try {
    const payload = await readJson(request);
    const event = payload.requestBody || payload;
    const data = event.data || event;
    const metadata = readMetadata(data.metadata || event.metadata);
    const attribution = metadata.attribution || {};

    await sendOrderLog({
      event: event.event || "pix_webhook",
      receivedAt: new Date().toISOString(),
      transactionId: data.transactionId || data.id || event.transactionId || null,
      externalRef: data.externalRef || data.external_ref || metadata.externalRef || event.externalRef || null,
      status: data.status || event.status || event.statusCode?.description || null,
      amount: typeof data.amount === "number" ? data.amount / 100 : event.amount || null,
      amountCents: data.amount || null,
      productId: metadata.productId || "",
      productName: data.items?.[0]?.title || "",
      robloxUsername: metadata.robloxUsername || "",
      utm_source: attribution.utm_source || "",
      utm_medium: attribution.utm_medium || "",
      utm_campaign: attribution.utm_campaign || "",
      utm_content: attribution.utm_content || "",
      utm_term: attribution.utm_term || "",
      utm_id: attribution.utm_id || "",
      fbclid: attribution.fbclid || "",
      gclid: attribution.gclid || "",
      ttclid: attribution.ttclid || "",
      src: attribution.src || "",
      sck: attribution.sck || ""
    });

    return sendJson(response, 200, {
      ok: true,
      received: {
        transactionId: data.transactionId || data.id || event.transactionId || null,
        externalId: data.externalRef || data.external_ref || event.external_id || null,
        status: data.status || event.status || event.statusCode?.description || null,
        amount: data.amount || event.amount || null
      }
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
