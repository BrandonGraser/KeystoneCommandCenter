export default function middleware(request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return;

  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Basic (.+)$/i);

  if (match) {
    try {
      const decoded = atob(match[1]);
      const sep = decoded.indexOf(":");
      if (sep >= 0) {
        const username = decoded.slice(0, sep);
        const pass = decoded.slice(sep + 1);
        if (username === (process.env.APP_USERNAME || "keystone") && pass === password) {
          return;
        }
      }
    } catch {}
  }

  return new Response("Sign in to Keystone Tasks.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Keystone Tasks", charset="UTF-8"',
      "Content-Type": "text/plain; charset=utf-8"
    }
  });
}

export const config = {
  matcher: ["/((?!_vercel|favicon\\.ico).*)"]
};
