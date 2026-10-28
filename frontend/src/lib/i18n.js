export const LANGS = [["en", "English", "English"], ["bn", "বাংলা", "Bengali"], ["hi", "हिन्दी", "Hindi"]];

export const getLang = () => localStorage.getItem("lang");

const setCookie = (v) => {
  const parts = window.location.hostname.split(".");
  const domains = [""];
  for (let i = 0; i < parts.length - 1; i++) domains.push(parts.slice(i).join("."), `.${parts.slice(i).join(".")}`);
  domains.forEach((d) => {
    const dom = d ? `;domain=${d}` : "";
    document.cookie = `googtrans=;path=/${dom};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
  if (v) domains.forEach((d) => { document.cookie = `googtrans=${v};path=/${d ? `;domain=${d}` : ""};max-age=31536000`; });
};

export function applyLang(code) {
  localStorage.setItem("lang", code);
  setCookie(code === "en" ? "" : `/en/${code}`);
  window.location.reload();
}

export function loadTranslator() {
  if (window.__gtLoaded || window.location.pathname.startsWith("/admin")) return;
  const lang = getLang();
  if (!lang || lang === "en") return;
  window.__gtLoaded = true;
  window.googleTranslateElementInit = () => new window.google.translate.TranslateElement({ pageLanguage: "en", includedLanguages: "en,bn,hi", autoDisplay: false }, "gt-el");
  const s = document.createElement("script");
  s.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  s.async = true;
  document.body.appendChild(s);
}

// Keep React stable when the translator rewrites text nodes.
if (typeof Node === "function" && Node.prototype && !Node.prototype.__gtPatched) {
  Node.prototype.__gtPatched = true;
  const rc = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child;
    return rc.call(this, child);
  };
  const ib = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, ref) {
    if (ref && ref.parentNode !== this) return node;
    return ib.call(this, node, ref);
  };
}
