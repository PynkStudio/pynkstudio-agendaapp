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
  entryPoints: [`${dir}app.tsx`],
  bundle: true,
  format: "esm",
  jsx: "automatic",
  outfile: `${dir}.out/app.js`,
  define: { "process.env.NODE_ENV": '"development"' },
  sourcemap: true,
});
await ctx.rebuild();
await ctx.watch();

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>agendaapp playground</title><link rel="stylesheet" href="/styles.css">
<style>body{margin:0;font-family:system-ui,sans-serif;background:#fafafa;color:#202124}</style></head>
<body><div id="root"></div><script type="module" src="/app.js"></script></body></html>`;

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
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
  const files = { "/app.js": [`${dir}.out/app.js`, "text/javascript"], "/styles.css": [`${dir}../src/video/styles.css`, "text/css"] };
  if (files[url.pathname]) {
    const [path, type] = files[url.pathname];
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    return res.end(readFileSync(path));
  }
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
}).listen(PORT, () => console.log(`playground on http://localhost:${PORT}`));
