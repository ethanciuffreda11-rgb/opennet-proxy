"use strict";

const form = document.getElementById("uv-form");
const address = document.getElementById("uv-address");
const searchEngine = document.getElementById("uv-search-engine");
const error = document.getElementById("uv-error");
const errorCode = document.getElementById("uv-error-code");
const home = document.getElementById("home");
const browser = document.getElementById("browser");
const frame = document.getElementById("uv-frame");
const omnibox = document.getElementById("omnibox");
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

async function ensureTransport() {
  const wispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" +
    location.host +
    "/wisp/";
  if ((await connection.getTransport()) !== "/epoxy/index.mjs") {
    await connection.setTransport("/epoxy/index.mjs", [{ wisp: wispUrl }]);
  }
}

async function openUrl(raw) {
  error.textContent = "";
  errorCode.textContent = "";

  try {
    await registerSW();
  } catch (err) {
    error.textContent = "Failed to register service worker.";
    errorCode.textContent = String(err);
    throw err;
  }

  await ensureTransport();

  const url = search(raw, searchEngine.value);
  const proxied = __uv$config.prefix + __uv$config.encodeUrl(url);

  home.hidden = true;
  browser.hidden = false;
  omnibox.value = url;
  frame.src = proxied;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = address.value.trim();
  if (!value) return;
  try {
    await openUrl(value);
  } catch (err) {
    console.error(err);
  }
});

document.getElementById("btn-home").addEventListener("click", () => {
  frame.src = "about:blank";
  browser.hidden = true;
  home.hidden = false;
  address.focus();
});

document.getElementById("btn-reload").addEventListener("click", () => {
  try {
    frame.contentWindow.location.reload();
  } catch {
    const src = frame.src;
    frame.src = "about:blank";
    frame.src = src;
  }
});

// Deep-link: /?q=youtube.com
const params = new URLSearchParams(location.search);
const q = params.get("q") || params.get("url");
if (q) {
  address.value = q;
  openUrl(q).catch(() => {});
}
