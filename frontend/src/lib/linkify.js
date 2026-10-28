const TOKEN = /((?:https?:\/\/)[^\s<>"'`]+|www\.[^\s<>"'`]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}(?::\d{2,5})?(?:\/[^\s<>"'`]*)?)/gi;
const PREV_BLOCK = /[@\w.-]/;
const TRAIL = /[.,!?;:)\]]+$/;

export function normalizeUrl(raw) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (u.startsWith("/") && !u.startsWith("//")) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^https?:\/\//i.test(u)) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const p = new URL(u);
    if (!["http:", "https:"].includes(p.protocol) || !p.hostname.includes(".")) return null;
    return p.href;
  } catch {
    return null;
  }
}

export function isExternal(href) {
  if (!href || href.startsWith("/")) return false;
  try {
    return new URL(href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

export function tokenize(text) {
  const out = [];
  const s = String(text || "");
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    let raw = m[0];
    if (m.index > 0 && PREV_BLOCK.test(s[m.index - 1])) continue;
    const trail = raw.match(TRAIL)?.[0] || "";
    raw = raw.slice(0, raw.length - trail.length);
    const href = normalizeUrl(raw);
    if (!href) continue;
    if (m.index > last) out.push({ type: "text", value: s.slice(last, m.index) });
    out.push({ type: "link", value: raw, href });
    last = m.index + raw.length;
  }
  if (last < s.length) out.push({ type: "text", value: s.slice(last) });
  return out;
}
