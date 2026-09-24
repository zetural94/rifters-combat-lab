/* Session decryptor. Holds playable files in memory only — not Cache Storage. */
const files = new Map();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "seal" || !Array.isArray(data.files)) return;
  files.clear();
  for (const pair of data.files) {
    if (!pair || pair.length < 2) continue;
    const rel = String(pair[0]).replace(/^\/+/, "");
    if (!rel || rel.includes("..")) continue;
    files.set(rel, pair[1]);
  }
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({ ok: true, n: files.size });
  }
});

function relPath(url) {
  const scope = new URL(self.registration.scope);
  const u = new URL(url);
  if (u.origin !== scope.origin) return null;
  if (!u.pathname.startsWith(scope.pathname)) return null;
  let rel = u.pathname.slice(scope.pathname.length).replace(/^\/+/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch (_) {
    return null;
  }
  if (rel.includes("..")) return null;
  return rel;
}

function mime(rel) {
  if (rel.endsWith(".html")) return "text/html; charset=utf-8";
  if (rel.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (rel.endsWith(".json")) return "application/json; charset=utf-8";
  if (rel.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" && req.method !== "HEAD") return;
  const rel = relPath(req.url);
  if (!rel) return;
  const body = files.get(rel);
  if (!body) return;
  event.respondWith(
    new Response(req.method === "HEAD" ? null : body, {
      status: 200,
      headers: {
        "Content-Type": mime(rel),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    })
  );
});
