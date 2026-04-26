import { allowCors, sendJson } from "../_utils/http.js";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.errors?.[0]?.message || "Falha ao consultar Roblox.");
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

async function findRobloxUser(username) {
  const payload = await fetchJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    })
  });

  return payload?.data?.[0] || null;
}

async function fetchAvatarUrl(userId) {
  const url = new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot");
  url.searchParams.set("userIds", String(userId));
  url.searchParams.set("size", "420x420");
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");

  const payload = await fetchJson(url);
  const thumbnail = payload?.data?.[0];

  if (!thumbnail || thumbnail.state !== "Completed") return null;
  return thumbnail.imageUrl || null;
}

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (request.method !== "GET") {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const url = new URL(request.url, `https://${request.headers.host}`);
    const username = String(url.searchParams.get("username") || "").trim();

    if (!USERNAME_PATTERN.test(username)) {
      return sendJson(response, 400, {
        ok: false,
        error: "Informe um username Roblox valido."
      });
    }

    const user = await findRobloxUser(username);
    if (!user) {
      return sendJson(response, 404, {
        ok: false,
        error: "Usuario Roblox nao encontrado."
      });
    }

    const avatarUrl = await fetchAvatarUrl(user.id);

    return sendJson(response, 200, {
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
        avatarUrl
      }
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
