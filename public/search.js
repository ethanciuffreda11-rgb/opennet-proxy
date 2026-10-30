"use strict";

function search(input, template) {
  try {
    return new URL(input).toString();
  } catch {
    /* not a full URL */
  }

  try {
    const url = new URL(`https://${input}`);
    if (url.hostname.includes(".")) return url.toString();
  } catch {
    /* not a domain */
  }

  return template.replace("%s", encodeURIComponent(input));
}
