import { allowCors, readJson, sendJson } from "../_utils/http.js";

function isAuthorized(request) {
  const configuredSecret = process.env.WEBHOOK_SECRET;
  if (!configuredSecret) return true;

  const url = new URL(request.url, `https://${request.headers.host}`);
  const providedSecret = request.headers["x-webhook-secret"] || url.searchParams.get("secret");
  return providedSecret === configuredSecret;
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

    return sendJson(response, 200, {
      ok: true,
      received: {
        event: event.event || null,
        transactionId: data.id || event.transactionId || null,
        externalId: data.external_id || event.external_id || null,
        status: data.status || event.status || event.statusCode?.description || null,
        amount: data.total_amount || event.amount || null
      }
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
