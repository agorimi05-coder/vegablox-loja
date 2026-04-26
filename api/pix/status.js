import { allowCors, requiredEnv, sendJson } from "../_utils/http.js";

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (request.method !== "GET") {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const statusUrl = process.env.BLACKCATPAY_STATUS_URL;
    if (!statusUrl) {
      return sendJson(response, 501, {
        ok: false,
        error: "BLACKCATPAY_STATUS_URL nao configurada. Use o webhook como fonte principal de confirmacao."
      });
    }

    const url = new URL(request.url, `https://${request.headers.host}`);
    const transactionId = String(url.searchParams.get("transactionId") || "").trim();
    if (!transactionId) {
      return sendJson(response, 400, { ok: false, error: "Informe transactionId." });
    }

    const body = new URLSearchParams({
      client_id: requiredEnv("BLACKCATPAY_CLIENT_ID"),
      client_secret: requiredEnv("BLACKCATPAY_CLIENT_SECRET"),
      transactionId
    });

    const gatewayResponse = await fetch(statusUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json"
      },
      body
    });
    const gatewayPayload = await gatewayResponse.json().catch(() => ({}));

    return sendJson(response, gatewayResponse.ok ? 200 : gatewayResponse.status, {
      ok: gatewayResponse.ok,
      gateway: gatewayPayload
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
