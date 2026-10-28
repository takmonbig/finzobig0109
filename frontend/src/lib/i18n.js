export const LANGS = [["en", "English", "English"], ["bn", "বাংলা", "Bengali"], ["hi", "हिन्दी", "Hindi"]];

export const getLang = () => localStorage.getItem("lang");

const setCookie = (v) => {
  const age = v ? 31536000 : 0;
  document.cookie = `googtrans=${v};path=/;max-age=${age}`;
  document.cookie = `googtrans=${v};path=/;domain=${window.location.hostname};max-age=${age}`;
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
