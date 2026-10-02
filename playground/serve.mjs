// Dev-only: bundles playground/app.tsx and serves it with a /token endpoint.
// Needs a local LiveKit: docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp livekit/livekit-server --dev --bind 0.0.0.0 --node-ip 127.0.0.1
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { createLivekitToken } from "../dist/video/livekit.js";

const PORT = Number(process.env.PORT ?? 5180);
const LIVEKIT_URL = process.env.LIVEKIT_URL ?? "ws://localhost:7880";
const creds = { apiKey: process.env.LIVEKIT_API_KEY ?? "devkey", apiSecret: process.env.LIVEKIT_API_SECRET ?? "secret" };
const dir = fileURLToPath(new URL(".", import.meta.url));

const ctx = await esbuild.context({
  entryPoints: { app: `${dir}app.tsx`, settings: `${dir}settings.tsx` },
  bundle: true,
  format: "esm",
  jsx: "automatic",
  outdir: `${dir}.out`,
  define: { "process.env.NODE_ENV": '"development"' },
  sourcemap: true,
});
await ctx.rebuild();
await ctx.watch();

// Settings backend (real handlers, in-memory database), rebuilt on start.
await esbuild.build({
  entryPoints: [`${dir}api.ts`],
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: `${dir}.out/api.mjs`,
});
const { http: api } = await import(`${dir}.out/api.mjs`);

async function toRequest(req, url) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  return new Request(url, { method: req.method, headers: req.headers, body: req.method === "GET" || req.method === "HEAD" ? undefined : body });
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>agendaapp playground</title><link rel="stylesheet" href="/styles.css">
<style>body{margin:0;font-family:system-ui,sans-serif;background:#fafafa;color:#202124}</style></head>
<body><div id="root"></div><script type="module" src="/__ENTRY__.js"></script></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const ctxScope = { scope: "playground" };
  const routes = {
    "/api/settings": (r) => (r.method === "PUT" ? api.settingsSaveEventType(r, ctxScope) : api.settingsGet(r, ctxScope)),
    "/api/host": (r) => api.settingsUpdateHost(r, ctxScope),
    "/api/calendars": (r) => api.calendarsManage(r, ctxScope),
    "/api/oauth/start": (r) => api.calendarOAuthStart(r, ctxScope),
  };
  if (routes[url.pathname]) return send(res, await routes[url.pathname](await toRequest(req, url)));
  if (url.pathname === "/token") {
    const name = url.searchParams.get("name") ?? "Guest";
    const role = url.searchParams.get("role") ?? "guest";
    const room = url.searchParams.get("room") ?? "agenda-playground";
    const token = createLivekitToken(creds, {
      identity: `${role}:${name}:${Math.random().toString(36).slice(2, 7)}`,
      name,
      grant: { room, roomJoin: true, roomAdmin: role === "host" },
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ serverUrl: LIVEKIT_URL, token, displayName: name }));
  }
  const files = {
    "/app.js": [`${dir}.out/app.js`, "text/javascript"],
    "/settings.js": [`${dir}.out/settings.js`, "text/javascript"],
    "/styles.css": [`${dir}../src/video/styles.css`, "text/css"],
    "/settings.css": [`${dir}../src/settings/styles.css`, "text/css"],
  };
  if (files[url.pathname]) {
    const [path, type] = files[url.pathname];
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    return res.end(readFileSync(path));
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  const page = url.pathname === "/settings" ? html.replace("/styles.css", "/settings.css").replace("__ENTRY__", "settings") : html.replace("__ENTRY__", "app");
  res.end(page);
}).listen(PORT, () => console.log(`playground on http://localhost:${PORT}`));
