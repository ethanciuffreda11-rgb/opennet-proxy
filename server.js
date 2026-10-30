const express = require("express");
const path = require("path");
const { fetch, Agent } = require("undici");
const { parse } = require("node-html-parser");

const app = express();
const PORT = process.env.PORT || 3000;

const dispatcher = new Agent({
  connect: { timeout: 20000 },
  bodyTimeout: 60000,
  headersTimeout: 30000,
});

const BLOCKED_RESPONSE_HEADERS = new Set([
  "content-security-policy",
  "content-security-policy-report-only",
  "x-frame-options",
  "x-content-type-options",
  "strict-transport-security",
  "cross-origin-opener-policy",
  "cross-origin-embedder-policy",
  "cross-origin-resource-policy",
  "report-to",
  "nel",
  "clear-site-data",
  "content-encoding",
  "content-length",
  "transfer-encoding",
]);

function encodeTarget(url) {
  return Buffer.from(url, "utf8").toString("base64url");
}

function decodeTarget(encoded) {
  try {
    return Buffer.from(String(encoded), "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

function proxyPath(targetUrl) {
  return `/p/${encodeTarget(targetUrl)}`;
}

function rewriteCss(css, baseUrl) {
  return String(css).replace(
    /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
    (match, quote, raw) => {
      const trimmed = raw.trim();
      if (
        !trimmed ||
        trimmed.startsWith("data:") ||
        trimmed.startsWith("blob:") ||
        trimmed.startsWith("#")
      ) {
        return match;
      }
      const absolute = resolveUrl(baseUrl, trimmed);
      if (!absolute || !isValidHttpUrl(absolute)) return match;
      return `url(${quote}${proxyPath(absolute)}${quote})`;
    }
  );
}

const URL_ATTRS = new Set([
  "href",
  "src",
  "action",
  "poster",
  "data",
  "formaction",
  "xlink:href",
]);

function injectHelper(pageUrl) {
  const safePage = JSON.stringify(pageUrl);
  return `<script data-opennet-helper>
(function(){
  var PAGE=${safePage};
  var PREFIX="/p/";
  function enc(u){
    try{
      var b=btoa(unescape(encodeURIComponent(u)));
      return b.replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"");
    }catch(e){return null;}
  }
  function toProxy(u){
    if(!u || typeof u!=="string") return u;
    if(/^data:|^blob:|^mailto:|^tel:|^javascript:|^#/i.test(u)) return u;
    if(u.indexOf(PREFIX)===0) return u;
    try{
      var a=new URL(u, PAGE).href;
      if(!/^https?:/i.test(a)) return u;
      var e=enc(a);
      return e ? PREFIX+e : u;
    }catch(e){return u;}
  }
  try{
    var oOpen=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){
      if(typeof u==="string") arguments[1]=toProxy(u);
      return oOpen.apply(this,arguments);
    };
  }catch(e){}
  try{
    var oFetch=window.fetch;
    window.fetch=function(input, init){
      if(typeof input==="string") input=toProxy(input);
      else if(input && typeof Request!=="undefined" && input instanceof Request){
        input=new Request(toProxy(input.url), input);
      }
      return oFetch.call(this, input, init);
    };
  }catch(e){}
  document.addEventListener("click", function(e){
    var a=e.target && e.target.closest && e.target.closest("a[href]");
    if(!a) return;
    var h=a.getAttribute("href");
    if(!h || /^#|^mailto:|^tel:|^javascript:/i.test(h)) return;
    a.setAttribute("href", toProxy(h));
  }, true);
  document.addEventListener("submit", function(e){
    var f=e.target;
    if(!f || !f.getAttribute) return;
    var a=f.getAttribute("action");
    if(a) f.setAttribute("action", toProxy(a));
  }, true);
})();
</script>`;
}

function rewriteHtml(html, pageUrl) {
  const root = parse(html, { comment: true });

  for (const el of root.querySelectorAll("*")) {
    for (const attr of Object.keys(el.attributes)) {
      const lower = attr.toLowerCase();
      const value = el.getAttribute(attr);
      if (!value) continue;

      if (lower === "srcset" || lower === "imagesrcset") {
        const rewritten = value
          .split(",")
          .map((part) => {
            const bits = part.trim().split(/\s+/);
            if (!bits[0]) return part;
            const absolute = resolveUrl(pageUrl, bits[0]);
            if (!absolute || !isValidHttpUrl(absolute)) return part;
            bits[0] = proxyPath(absolute);
            return bits.join(" ");
          })
          .join(", ");
        el.setAttribute(attr, rewritten);
        continue;
      }

      if (lower === "style") {
        el.setAttribute(attr, rewriteCss(value, pageUrl));
        continue;
      }

      const looksLikeUrlAttr =
        URL_ATTRS.has(lower) ||
        (lower.startsWith("data-") && /url|src|href|link/i.test(lower));

      if (!looksLikeUrlAttr) continue;

      if (
        value.startsWith("data:") ||
        value.startsWith("blob:") ||
        value.startsWith("mailto:") ||
        value.startsWith("tel:") ||
        value.startsWith("javascript:") ||
        value.startsWith("#")
      ) {
        continue;
      }

      const absolute = resolveUrl(pageUrl, value);
      if (absolute && isValidHttpUrl(absolute)) {
        el.setAttribute(attr, proxyPath(absolute));
      }
    }
  }

  for (const style of root.querySelectorAll("style")) {
    style.innerHTML = rewriteCss(style.innerHTML, pageUrl);
  }

  // Drop CSP meta tags that break rewritten assets on school browsers
  for (const meta of root.querySelectorAll('meta[http-equiv]')) {
    const httpEquiv = (meta.getAttribute("http-equiv") || "").toLowerCase();
    if (httpEquiv === "content-security-policy") meta.remove();
  }

  const head = root.querySelector("head");
  if (head) {
    head.insertAdjacentHTML("afterbegin", injectHelper(pageUrl));
  } else {
    root.insertAdjacentHTML("afterbegin", injectHelper(pageUrl));
  }

  return root.toString();
}

function buildSearchUrl(query) {
  return `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
}

function normalizeUserInput(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return null;

  const looksLikeUrl =
    /^(https?:\/\/)/i.test(trimmed) ||
    /^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed);

  if (looksLikeUrl) {
    const withProto = /^(https?:\/\/)/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    if (isValidHttpUrl(withProto)) return withProto;
  }

  return buildSearchUrl(trimmed);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

app.set("trust proxy", 1);
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  res.type("text").send("ok");
});

app.get("/go", (req, res) => {
  const target = normalizeUserInput(req.query.q || req.query.url || "");
  if (!target) return res.redirect("/");
  res.redirect(proxyPath(target));
});

app.post(
  "/go",
  express.urlencoded({ extended: false }),
  (req, res) => {
    const target = normalizeUserInput(req.body.q || req.body.url || "");
    if (!target) return res.redirect("/");
    res.redirect(proxyPath(target));
  }
);

app.all("/p/:encoded", async (req, res) => {
  const target = decodeTarget(req.params.encoded);
  if (!target || !isValidHttpUrl(target)) {
    return res.status(400).type("html").send("Invalid URL");
  }

  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    return res.status(400).type("html").send("Invalid URL");
  }

  const method = req.method.toUpperCase();
  const headers = {
    "user-agent":
      req.headers["user-agent"] ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    accept: req.headers.accept || "*/*",
    "accept-language": req.headers["accept-language"] || "en-US,en;q=0.9",
    referer: `${targetUrl.origin}/`,
  };

  if (req.headers["content-type"]) {
    headers["content-type"] = req.headers["content-type"];
  }
  if (req.headers["accept-encoding"]) {
    // Let undici/node decompress; avoid forwarding br/zstd quirks
    headers["accept-encoding"] = "gzip, deflate";
  }

  let body;
  if (method !== "GET" && method !== "HEAD") {
    body = await readRequestBody(req);
    if (!body.length) body = undefined;
  }

  try {
    const upstream = await fetch(targetUrl.href, {
      method,
      headers,
      body,
      redirect: "manual",
      dispatcher,
    });

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get("location");
      if (location) {
        const next = resolveUrl(targetUrl.href, location);
        if (next && isValidHttpUrl(next)) {
          const code = upstream.status === 303 ? 303 : 302;
          return res.redirect(code, proxyPath(next));
        }
      }
    }

    const contentType = (upstream.headers.get("content-type") || "").toLowerCase();

    for (const [key, value] of upstream.headers) {
      if (BLOCKED_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
      if (key.toLowerCase() === "set-cookie") continue;
      try {
        res.setHeader(key, value);
      } catch {
        /* ignore */
      }
    }

    res.setHeader("Cache-Control", "no-store");

    if (contentType.includes("text/html")) {
      const text = await upstream.text();
      const rewritten = rewriteHtml(text, targetUrl.href);
      res.status(upstream.status).type("html").send(rewritten);
      return;
    }

    if (contentType.includes("text/css") || targetUrl.pathname.endsWith(".css")) {
      const text = await upstream.text();
      res.status(upstream.status).type("css").send(rewriteCss(text, targetUrl.href));
      return;
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.status(upstream.status).send(buf);
  } catch (err) {
    console.error("Proxy error:", targetUrl.href, err.message);
    res.status(502).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Proxy error</title><link rel="stylesheet" href="/styles.css"></head>
<body class="error-page">
  <main>
    <h1>Couldn’t load that page</h1>
    <p>The site may be down, blocking proxies, or timing out from Render.</p>
    <p class="mono">${escapeHtml(targetUrl.href)}</p>
    <p class="detail">${escapeHtml(err.message)}</p>
    <a class="btn" href="/">Back to search</a>
  </main>
</body></html>`);
  }
});

app.listen(PORT, () => {
  console.log(`OpenNet school proxy on port ${PORT}`);
});
