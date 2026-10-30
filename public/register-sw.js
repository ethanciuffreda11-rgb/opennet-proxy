"use strict";

const stockSW = "/uv/sw.js";
const swAllowedHostnames = ["localhost", "127.0.0.1"];

async function registerSW() {
  if (!navigator.serviceWorker) {
    if (
      location.protocol !== "https:" &&
      !swAllowedHostnames.includes(location.hostname)
    ) {
      throw new Error("Service workers need HTTPS (Render provides this).");
    }
    throw new Error("This browser doesn't support service workers.");
  }

  // Default scope is /uv/ which covers /uv/service/
  await navigator.serviceWorker.register(stockSW);
}
