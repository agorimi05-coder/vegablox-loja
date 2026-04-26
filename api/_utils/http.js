export function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export function allowCors(request, response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Secret");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return true;
  }

  return false;
}

export async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody);
  } catch {
    const error = new Error("JSON invalido.");
    error.statusCode = 400;
    throw error;
  }
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`Variavel de ambiente ausente: ${name}`);
    error.statusCode = 500;
    throw error;
  }

  return value;
}

export function publicBaseUrl(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  const host = request.headers.host;
  const proto = request.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}
