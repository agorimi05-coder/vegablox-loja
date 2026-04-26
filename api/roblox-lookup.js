import { allowCors, readJson, sendJson } from "./_utils/http.js";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

async function fetchRobloxJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload?.errors?.[0]?.message || "Falha ao consultar Roblox.");
    error.statusCode = response.status;
    throw error;
  }

  return payload;
}

async function findUserByUsername(username) {
  const payload = await fetchRobloxJson("https://users.roblox.com/v1/usernames/users", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: true
    })
  });

  return payload?.data?.[0] || null;
}

async function getAvatarUrl(userId) {
  const url = new URL("https://thumbnails.roblox.com/v1/users/avatar-headshot");
  url.searchParams.set("userIds", String(userId));
  url.searchParams.set("size", "150x150");
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");

  const payload = await fetchRobloxJson(url);
  const thumbnail = payload?.data?.[0];

  if (thumbnail?.imageUrl) return thumbnail.imageUrl;
  return `https://www.roblox.com/headshot-thumbnail/image?userId=${userId}&width=150&height=150&format=png`;
}

async function getUsername(request) {
  if (request.method === "GET") {
    const url = new URL(request.url, `https://${request.headers.host}`);
    return String(url.searchParams.get("username") || url.searchParams.get("nick") || "").trim();
  }

  if (request.method === "POST") {
    const body = await readJson(request);
    return String(body.username || body.nick || "").trim();
  }

  return "";
}

export default async function handler(request, response) {
  if (allowCors(request, response)) return;

  if (!["GET", "POST"].includes(request.method)) {
    return sendJson(response, 405, { ok: false, error: "Metodo nao permitido." });
  }

  try {
    const username = await getUsername(request);

    if (!USERNAME_PATTERN.test(username)) {
      return sendJson(response, 400, {
        ok: false,
        error: "Informe um nick Roblox valido."
      });
    }

    const user = await findUserByUsername(username);
    if (!user) {
      return sendJson(response, 404, {
        ok: false,
        error: "Usuario Roblox nao encontrado."
      });
    }

    const avatarUrl = await getAvatarUrl(user.id);
    const result = {
      id: user.id,
      username: user.name,
      name: user.name,
      displayName: user.displayName || user.name,
      avatarUrl
    };

    return sendJson(response, 200, {
      ok: true,
      ...result,
      user: result
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "Erro interno."
    });
  }
}
