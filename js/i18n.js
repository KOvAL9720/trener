'use strict';

/* =========================================================
   Lift Tara – jazyk rozhrania (slovenčina / angličtina)
   Appka je napísaná po slovensky. V angličtine sa texty na obrazovke
   prekladajú podľa slovníka (i18n-en.js): celé textové uzly a atribúty
   presnou zhodou, vety s menami a číslami podľa vzorov s {0}, {1}…
   Jazyk: ?lang=en / ?lang=sk v adrese, potom sa pamätá v zariadení.
   ========================================================= */
(function () {
  const KEY = 'lt-lang';
  let lang = 'sk';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'sk') localStorage.setItem(KEY, q);
    lang = localStorage.getItem(KEY) === 'en' ? 'en' : 'sk';
  } catch (e) { /* bez úložiska ostáva slovenčina */ }
  window.LANG = lang;
  window.setLang = (l) => {
    try { localStorage.setItem(KEY, l); } catch (e) { /* ok */ }
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    location.replace(u.href);
  };
  // polia názvov dní a mesiacov v appke sa v angličtine preložia celé
  window.trArr = (a) => (lang === 'en' ? a.map((x) => window.tr(x)) : a);
  if (lang !== 'en') { window.tr = (s) => s; return; }

  document.documentElement.lang = 'en';
  const DICT = window.I18N_EN || { exact: {}, rules: [] };
  const exact = new Map(Object.entries(DICT.exact));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // vzory: najdlhší pevný text ako rýchly predfilter, dlhšie (konkrétnejšie) vzory majú prednosť
  const rules = DICT.rules.map(([sk, en]) => {
    const parts = sk.split(/\{\d+\}/);
    const order = [...sk.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
    const re = new RegExp('^' + parts.map(esc).join('([\\s\\S]+?)') + '$');
    const key = parts.reduce((a, b) => (b.trim().length > a.length ? b.trim() : a), '');
    return { re, en, order, key, len: parts.join('').length };
  }).filter((r) => r.key).sort((a, b) => b.len - a.len);

  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const cache = new Map();
  function core(s, depth) {
    if (exact.has(s)) return exact.get(s);
    if (depth > 3 || !/[A-Za-zÀ-ž]/.test(s)) return s;
    for (const r of rules) {
      if (!s.includes(r.key)) continue;
      const m = s.match(r.re);
      if (!m) continue;
      const vals = [];
      r.order.forEach((n, i) => { vals[n] = core(norm(m[i + 1]), depth + 1); });
      return r.en.replace(/\{(\d+)\}/g, (_, n) => (vals[n] ?? ''));
    }
    // zložené texty „a · b · c“ – preloží sa každá časť zvlášť
    if (s.includes(' · ')) {
      const parts = s.split(' · ');
      const outp = parts.map((x) => core(x.trim(), depth + 1));
      if (outp.some((x, i) => x !== parts[i].trim())) return outp.join(' · ');
    }
    // viac viet za sebou (napr. tipy k cviku) – preloží sa každá veta
    if (/[.!?] \S/.test(s)) {
      const parts = s.split(/(?<=[.!?]) (?=\S)/);
      if (parts.length > 1) {
        const outp = parts.map((x) => core(x, depth + 1));
        if (outp.some((x, i) => x !== parts[i])) return outp.join(' ');
      }
    }
    return s;
  }
  function tr(raw) {
    if (raw == null) return raw;
    const str = String(raw);
    const s = norm(str);
    if (!s) return str;
    let out = cache.get(s);
    if (out === undefined) { out = core(s, 0); if (cache.size > 5000) cache.clear(); cache.set(s, out); }
    if (out === s) return str;
    const lead = str.match(/^\s*/)[0], trail = str.match(/\s*$/)[0];
    return lead + out + trail;
  }
  window.tr = tr;

  // ----- preklad obrazovky -----
  const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
  const skipEl = (el) => !el || SKIP.has(el.tagName) || el.isContentEditable || el.closest?.('[data-no-tr]');
  function doText(node) {
    const p = node.parentElement;
    if (skipEl(p)) return;
    const v = node.nodeValue;
    const t = tr(v);
    if (t !== v) node.nodeValue = t;
  }
  function doEl(el) {
    if (!el || el.isContentEditable || el.closest?.('[data-no-tr]')) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v) { const t = tr(v); if (t !== v) el.setAttribute(a, t); }
    }
    if ((el.tagName === 'INPUT') && (el.type === 'button' || el.type === 'submit') && el.value) { const t = tr(el.value); if (t !== el.value) el.value = t; }
    // predvyplnené polia (napr. ukážkové poznámky, názvy predvolených cvikov) – len presná zhoda zo slovníka
    else if ((el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text')) && el.value && !el.dataset.trDone && document.activeElement !== el) {
      el.dataset.trDone = '1';
      const v = el.value.trim();
      if (exact.has(v)) el.value = exact.get(v);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { doText(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1) { if (skipEl(root)) return; doEl(root); }
    const it = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = it.nextNode())) (n.nodeType === 3 ? doText(n) : doEl(n));
  }
  function start() {
    walk(document.body);
    if (document.title) document.title = tr(document.title);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'childList') m.addedNodes.forEach(walk);
        else if (m.type === 'characterData') doText(m.target);
        else if (m.type === 'attributes') doEl(m.target);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    const t = document.querySelector('title');
    if (t) new MutationObserver(() => { const v = tr(document.title); if (v !== document.title) document.title = v; }).observe(t, { childList: true, characterData: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

  // chybové hlásenia formulárov
  for (const C of [window.HTMLInputElement, window.HTMLTextAreaElement, window.HTMLSelectElement]) {
    const orig = C?.prototype.setCustomValidity;
    if (orig) C.prototype.setCustomValidity = function (m) { return orig.call(this, tr(m)); };
  }
  // systémové okná (confirm/alert/prompt) dostanú text už preložený
  for (const f of ['alert', 'confirm', 'prompt']) {
    const orig = window[f].bind(window);
    window[f] = (msg, ...rest) => orig(tr(msg), ...rest);
  }
})();
