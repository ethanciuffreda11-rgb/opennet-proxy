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
const loader = document.getElementById("loader");
const chromeForm = document.getElementById("chrome-form");
const classicBtn = document.getElementById("btn-fullscreen-pref");
const cloakBtn = document.getElementById("btn-cloak");
const cloakDialog = document.getElementById("cloak-dialog");
const cloakForm = document.getElementById("cloak-form");
const cloakPreset = document.getElementById("cloak-preset");

const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

const CLOAKS = {
  classroom: {
    title: "Home",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%231ea35a' width='32' height='32' rx='6'/%3E%3C/svg%3E",
  },
  drive: {
    title: "My Drive - Google Drive",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%234285f4' width='32' height='32' rx='6'/%3E%3C/svg%3E",
  },
  docs: {
    title: "Document",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%234285f4' width='32' height='32' rx='6'/%3E%3C/svg%3E",
  },
  canvas: {
    title: "Dashboard",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%23e11d48' width='32' height='32' rx='6'/%3E%3C/svg%3E",
  },
  none: {
    title: "OpenNet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%233ec7ff' width='32' height='32' rx='6'/%3E%3C/svg%3E",
  },
};

function getClassic() {
  return localStorage.getItem("opennet-classic") === "1";
}

function setClassic(on) {
  localStorage.setItem("opennet-classic", on ? "1" : "0");
  classicBtn.classList.toggle("active", on);
  classicBtn.textContent = on ? "Classic ✓" : "Classic";
}

function applyCloak(key) {
  const cloak = CLOAKS[key] || CLOAKS.none;
  document.title = cloak.title;
  const link = document.getElementById("favicon");
  if (link) link.href = cloak.icon;
  localStorage.setItem("opennet-cloak", key);
}

function showLoader(on) {
  loader.hidden = !on;
}

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

function encodeProxy(url) {
  return __uv$config.prefix + __uv$config.encodeUrl(url);
}

async function prepare() {
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
}

async function openUrl(raw, { classic } = {}) {
  await prepare();
  const url = search(raw, searchEngine.value);
  const proxied = encodeProxy(url);
  const useClassic = classic ?? getClassic();

  if (useClassic) {
    location.href = proxied;
    return;
  }

  home.hidden = true;
  browser.hidden = false;
  omnibox.value = url;
  showLoader(true);
  frame.src = proxied;
}

frame.addEventListener("load", () => {
  showLoader(false);
  try {
    const href = frame.contentWindow.location.href;
    if (href && href.includes(__uv$config.prefix)) {
      const encoded = href.split(__uv$config.prefix)[1] || "";
      const decoded = __uv$config.decodeUrl(decodeURIComponent(encoded.split(/[?#]/)[0]));
      if (decoded) omnibox.value = decoded;
    }
  } catch {
    /* cross-origin / opaque during load */
  }
});

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

chromeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = omnibox.value.trim();
  if (!value) return;
  try {
    await openUrl(value, { classic: false });
  } catch (err) {
    console.error(err);
  }
});

document.querySelectorAll(".app").forEach((btn) => {
  btn.addEventListener("click", async () => {
    try {
      await openUrl(btn.dataset.url);
    } catch (err) {
      console.error(err);
    }
  });
});

document.getElementById("btn-home").addEventListener("click", () => {
  frame.src = "about:blank";
  showLoader(false);
  browser.hidden = true;
  home.hidden = false;
  address.focus();
});

document.getElementById("btn-back").addEventListener("click", () => {
  try {
    frame.contentWindow.history.back();
  } catch {
    /* ignore */
  }
});

document.getElementById("btn-forward").addEventListener("click", () => {
  try {
    frame.contentWindow.history.forward();
  } catch {
    /* ignore */
  }
});

document.getElementById("btn-reload").addEventListener("click", () => {
  showLoader(true);
  try {
    frame.contentWindow.location.reload();
  } catch {
    const src = frame.src;
    frame.src = "about:blank";
    frame.src = src;
  }
});

document.getElementById("btn-popout").addEventListener("click", () => {
  const value = omnibox.value.trim();
  if (!value) return;
  const url = search(value, searchEngine.value);
  window.open(encodeProxy(url), "_blank");
});

classicBtn.addEventListener("click", () => {
  setClassic(!getClassic());
});

cloakBtn.addEventListener("click", () => {
  cloakPreset.value = localStorage.getItem("opennet-cloak") || "classroom";
  cloakDialog.showModal();
});

cloakForm.addEventListener("close", () => {
  if (cloakDialog.returnValue === "ok") {
    applyCloak(cloakPreset.value);
  }
});

setClassic(getClassic());
applyCloak(localStorage.getItem("opennet-cloak") || "classroom");

// Warm the service worker so the first site opens faster
registerSW().catch(() => {});

const params = new URLSearchParams(location.search);
const q = params.get("q") || params.get("url");
if (q) {
  address.value = q;
  openUrl(q).catch(() => {});
}
