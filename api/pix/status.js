import { allowCors, sendJson } from "../_utils/http.js";

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

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (request.method !== "GET") {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const transactionId = String(url.searchParams.get("transactionId") || "").trim();
    if (!transactionId) {
      return sendJson(response, 400, { ok: false, error: "Informe transactionId." });
    }

    const apiKey = getApiKey();
    if (!apiKey) {
      return sendJson(response, 500, {
        ok: false,
        error: "Configure BLACKCATPAY_API_KEY, BLACKCAT_API_KEY ou PIX_API_KEY na Vercel."
      });
    }

    const gatewayResponse = await fetch(`${getApiBase()}/sales/${encodeURIComponent(transactionId)}/status`, {
      headers: {
        "Accept": "application/json",
        "X-API-Key": apiKey
      }
    });
    const gatewayPayload = await gatewayResponse.json().catch(() => ({}));

    return sendJson(response, gatewayResponse.ok ? 200 : gatewayResponse.status, {
      ok: gatewayResponse.ok,
      status: gatewayPayload?.data?.status || gatewayPayload?.status || "unknown",
      gateway: gatewayPayload
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
