import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicPath = join(__dirname, "public");

// Render terminates TLS in front of the app
wisp.options.parse_real_ip = false;

const app = express();

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

// App UI first so public/uv/uv.config.js overrides the stock config
app.use(express.static(publicPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
      res.setHeader("Service-Worker-Allowed", "/");
    }
  },
}));
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

app.use((req, res) => {
  res.status(404).sendFile(join(publicPath, "404.html"));
});

const server = createServer();

server.on("request", (req, res) => {
  // Needed for Epoxy / SharedArrayBuffer
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  app(req, res);
});

server.on("upgrade", (req, socket, head) => {
  if (req.url && (req.url === "/wisp/" || req.url.startsWith("/wisp/"))) {
    wisp.routeRequest(req, socket, head);
    return;
  }
  socket.destroy();
});

const port = Number(process.env.PORT) || 3000;

server.listen(port, () => {
  console.log(`OpenNet Ultraviolet proxy on port ${port}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
