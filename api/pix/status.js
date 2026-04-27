import { allowCors, sendJson } from "../_utils/http.js";

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

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (request.method !== "GET") {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const externalId = String(url.searchParams.get("transactionId") || url.searchParams.get("external_id") || "").trim();
    if (!externalId) {
      return sendJson(response, 400, { ok: false, error: "Informe external_id." });
    }

    const token = getBuckpayToken();
    const userAgent = process.env.BUCKPAY_USER_AGENT || process.env.BUCKPAY_USERAGENT || "";
    if (!token || !userAgent) {
      return sendJson(response, 500, {
        ok: false,
        error: "Configure BUCKPAY_TOKEN e BUCKPAY_USER_AGENT na Vercel."
      });
    }

    const gatewayResponse = await fetch(`${getApiBase()}/v1/transactions/external_id/${encodeURIComponent(externalId)}`, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`,
        "User-Agent": userAgent
      }
    });
    const gatewayPayload = await gatewayResponse.json().catch(() => ({}));
    const data = gatewayPayload?.data || gatewayPayload || {};

    return sendJson(response, gatewayResponse.ok ? 200 : gatewayResponse.status, {
      ok: gatewayResponse.ok,
      status: data.status || "unknown",
      transactionId: data.id || null,
      externalId,
      gateway: gatewayPayload
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
