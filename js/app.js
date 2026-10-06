'use strict';

/* =========================================================
   Úložisko dát (localStorage v zariadení)
   ========================================================= */
// Ak sa pri štarte použije staršia stránka z pamäte (service worker), nový kód si chýbajúce prvky doplní sám
(function ensureDom() {
  const add = (html) => document.body.insertAdjacentHTML('beforeend', html);
  if (!document.getElementById('modal')) add('<dialog id="modal"><form id="modal-form" method="dialog"></form></dialog>');
  if (!document.getElementById('import-file')) add('<input type="file" id="import-file" accept="application/json,.json" hidden>');
  if (!document.getElementById('photo-file')) add('<input type="file" id="photo-file" accept="image/*" hidden>');
  if (!document.getElementById('gallery-file')) add('<input type="file" id="gallery-file" accept="image/*" multiple hidden>');
  if (!document.getElementById('toast')) add('<div id="toast" role="status" aria-live="polite"></div>');
  if (!document.getElementById('confirm')) add('<dialog id="confirm" class="confirm" aria-labelledby="confirm-text"><form method="dialog"><p id="confirm-text"></p><div class="confirm-btns"></div></form></dialog>');
  if (!document.getElementById('main')) add('<main id="main" tabindex="-1"></main>');
})();

const STORAGE_KEY = 'trainer-app-v1';
// AI asistent bol z aplikácie odstránený – zmazať jeho API kľúč a konverzáciu z tohto zariadenia
try { localStorage.removeItem('trainer-ai-key'); localStorage.removeItem('trainer-ai-chat'); } catch (e) { /* úložisko nedostupné */ }
// Permanentky sú zatiaľ vypnuté – každý tréning sa platí zvlášť (dáta balíkov ostávajú uložené)
const PACKAGES = false;

const DEFAULT_EXERCISES = [
  ['Drep', 'Nohy'], ['Leg press', 'Nohy'], ['Výpady', 'Nohy'], ['Rumunský mŕtvy ťah', 'Nohy'],
  ['Hip thrust', 'Zadok'], ['Mŕtvy ťah', 'Chrbát'], ['Príťahy na hrazde', 'Chrbát'],
  ['Veslovanie s činkou', 'Chrbát'], ['Stiahnutie kladky', 'Chrbát'], ['Bench press', 'Hrudník'],
  ['Kliky', 'Hrudník'], ['Tlaky nad hlavu', 'Ramená'], ['Upažovanie', 'Ramená'],
  ['Bicepsový zdvih', 'Ruky'], ['Tricepsové stlačenie', 'Ruky'], ['Plank', 'Core'],
  ['Dead bug', 'Core'], ['Kettlebell swing', 'Celé telo'], ['Burpees', 'Celé telo'], ['Veslovací trenažér', 'Kardio']
];

const STATUS = { planned: 'Naplánovaný', done: 'Odtrénovaný', cancelled: 'Zrušený' };

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function normalize(d) {
  const arr = (x) => (Array.isArray(x) ? x.filter((v) => v && typeof v === 'object') : []);
  const str = (v, fallback = '') => (v == null ? fallback : String(v));
  // opraviť bežné poškodenia (chýbajúce meno, dátum, zoznam cvikov…), aby žiadna obrazovka nespadla
  const clients = arr(d.clients).map((c) => Object.assign(c, { name: str(c.name).trim() || 'Bez mena' }));
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  const sessions = arr(d.sessions).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date)).map((x) => {
    Object.assign(x, { status: STATUS[x.status] ? x.status : 'planned', time: str(x.time) });
    // zapísané výkony: [{ exerciseId, sets: [{ w: kg, r: opakovania }] }]
    if (x.log !== undefined) {
      x.log = arr(x.log).map((e) => ({ exerciseId: str(e.exerciseId), sets: arr(e.sets).map((st) => ({ w: num(st.w), r: num(st.r) })).filter((st) => st.w != null || st.r != null) })).filter((e) => e.exerciseId && e.sets.length);
      if (!x.log.length) delete x.log;
    }
    return x;
  });
  const plans = arr(d.plans).map((p) => Object.assign(p, { name: str(p.name).trim() || 'Plán', items: arr(p.items) }));
  const exercises = arr(d.exercises).map((e) => Object.assign(e, { name: str(e.name).trim() || 'Cvik' }));
  const measurements = arr(d.measurements).filter((m) => /^\d{4}-\d{2}-\d{2}$/.test(m.date));
  const packages = arr(d.packages).filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date));
  return { clients, sessions, packages, measurements, exercises, plans, settings: d.settings && typeof d.settings === 'object' ? d.settings : {} };
}

function freshDb() {
  return normalize({ exercises: DEFAULT_EXERCISES.map(([name, category]) => ({ id: uid(), name, category })) });
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* poškodené alebo nedostupné úložisko */ }
  return freshDb();
}

let _idx = null;
let db = load();

// Uloženie: obrazovka sa prekreslí hneď, zápis do úložiska prebehne tesne po vykreslení.
// Pri zatvorení/skrytí aplikácie sa čakajúci zápis vždy dokončí.
let savePending = false;
let saveRaf = 0;
let saveTimeout = 0;
function save() {
  _idx = null;
  if (savePending) return;
  savePending = true;
  saveRaf = requestAnimationFrame(() => { saveTimeout = setTimeout(flushSave, 0); });
}

function flushSave() {
  if (!savePending) return;
  savePending = false;
  cancelAnimationFrame(saveRaf);
  clearTimeout(saveTimeout);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (e) {
    toast('Dáta sa nepodarilo uložiť – skontroluj úložisko prehliadača.');
  }
  scheduleSync();
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

/* =========================================================
   Pomocné funkcie
   ========================================================= */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => isoDate(new Date());
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); };
const startOfWeek = (s) => { const d = parseDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoDate(d); };
const DAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];
const DAYS_LONG = ['Pondelok', 'Utorok', 'Streda', 'Štvrtok', 'Piatok', 'Sobota', 'Nedeľa'];
const weekday = (s) => (parseDate(s).getDay() + 6) % 7;
const fmtShort = (s) => { const d = parseDate(s); return `${d.getDate()}. ${d.getMonth() + 1}.`; };
const fmtDate = (s) => (s ? `${DAYS[weekday(s)]} ${fmtShort(s)} ${parseDate(s).getFullYear()}` : '');
// „Dnes“, „Zajtra“, „Včera“, inak „St 7. 10.“ (rok len ak nie je aktuálny)
const fmtDay = (s) => {
  const t = isoDate(new Date());
  if (s === t) return 'Dnes';
  const diff = daysBetween(t, s);
  if (diff === 1) return 'Zajtra';
  if (diff === -1) return 'Včera';
  return `${DAYS[weekday(s)]} ${fmtShort(s)}${parseDate(s).getFullYear() !== new Date().getFullYear() ? ' ' + parseDate(s).getFullYear() : ''}`;
};
const fmtMoney = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('sk-SK', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 2 }));
const MONTHS = ['január', 'február', 'marec', 'apríl', 'máj', 'jún', 'júl', 'august', 'september', 'október', 'november', 'december'];
const monthKey = (y, m) => { const d = new Date(y, m - 1, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); const n = MONTHS[m - 1]; return `${n[0].toUpperCase()}${n.slice(1)} ${y}`; };
const fmtNum = (n, digits = 1) => (n == null || n === '' ? '–' : Number(n).toLocaleString('sk-SK', { maximumFractionDigits: digits }));
const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);


// Slovenské tvary podľa počtu: 1 tréning, 2–4 tréningy, 0 / 5+ tréningov
const pl = (n, one, few, many) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);
const cnt = (n, one, few, many) => `${n} ${pl(n, one, few, many)}`;
const nTr = (n) => cnt(n, 'tréning', 'tréningy', 'tréningov');
const nEx = (n) => cnt(n, 'cvik', 'cviky', 'cvikov');

/* Indexy pre rýchle vyhľadávanie – vytvoria sa raz a zahodia pri každom uložení dát */
function idx() {
  if (_idx) return _idx;
  const byId = (arr) => new Map(arr.map((x) => [x.id, x]));
  const push = (map, key, val) => { const a = map.get(key); if (a) a.push(val); else map.set(key, [val]); };
  const sessionsByClient = new Map();
  const sessionsByDate = new Map();
  const done = new Map();
  const bought = new Map();
  for (const s of db.sessions) {
    push(sessionsByClient, s.clientId, s);
    push(sessionsByDate, s.date, s);
    // individuálne zaplatený tréning nečerpá permanentku
    if (s.status === 'done' && !s.paid) done.set(s.clientId, (done.get(s.clientId) || 0) + 1);
  }
  for (const p of db.packages) bought.set(p.clientId, (bought.get(p.clientId) || 0) + (Number(p.count) || 0));
  // Na zaplatenie: odtrénované, nezaplatené tréningy nad rámec permanentky (najnovšie)
  const due = new Set();
  for (const [cid, list] of sessionsByClient) {
    const open = list.filter((s) => s.status === 'done' && !s.paid).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
    open.slice(PACKAGES ? bought.get(cid) || 0 : 0).forEach((s) => due.add(s.id));
  }
  _idx = {
    clients: byId(db.clients), plans: byId(db.plans), sessions: byId(db.sessions), exercises: byId(db.exercises),
    sessionsByClient, sessionsByDate, done, bought, due
  };
  return _idx;
}
const clientSessions = (id) => idx().sessionsByClient.get(id) || [];

const getClient = (id) => idx().clients.get(id);
const getPlan = (id) => idx().plans.get(id);
const getSession = (id) => idx().sessions.get(id);
const getExercise = (id) => idx().exercises.get(id);
const clientName = (id) => getClient(id)?.name || 'Bez klienta';
const bySessionTime = (a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
const byName = (a, b) => a.name.localeCompare(b.name, 'sk');

const sessionPrice = () => Number(db.settings.sessionPrice ?? 20);
const priceOf = (s) => (s.price != null && s.price !== '' ? Number(s.price) : sessionPrice());
const isDue = (s) => idx().due.has(s.id);
const clientDue = (id) => clientSessions(id).filter(isDue).sort(bySessionTime);
const sumPrice = (list) => list.reduce((a, s) => a + priceOf(s), 0);
const PAY = { cash: 'Hotovosť', bank: 'Na účet' };
const payMethod = (s) => (s.payMethod === 'bank' ? 'bank' : 'cash');
// platba sa počíta do príjmu len pri tréningu, ktorý nebol zrušený
const isPaid = (s) => !!s.paid && s.status !== 'cancelled';
const payButtons = (id) => `<button class="btn small pay-cash" data-action="pay-client" data-method="cash" data-id="${id}">Hotovosť</button><button class="btn small primary" data-action="pay-client" data-method="bank" data-id="${id}">Na účet</button>`;

function credits(clientId) {
  const bought = idx().bought.get(clientId) || 0;
  const used = idx().done.get(clientId) || 0;
  return { bought, used, left: bought - used };
}

// Krátka správa dole; s funkciou undo pribudne tlačidlo „Späť“ (a správa ostane dlhšie)
// Potvrdenie / oznámenie v dizajne aplikácie (namiesto systémového confirm/alert)
function askConfirm(msg, { ok = 'OK', cancel = 'Zrušiť', danger = false } = {}) {
  const dlg = document.getElementById('confirm');
  dlg.querySelector('#confirm-text').textContent = msg;
  dlg.querySelector('.confirm-btns').innerHTML = `${cancel ? `<button type="button" class="btn" data-v="0">${esc(cancel)}</button>` : ''}<button type="button" class="btn ${danger ? 'danger danger-fill' : 'primary'}" data-v="1" autofocus>${esc(ok)}</button>`;
  return new Promise((resolve) => {
    const done = (v) => { dlg.onclose = null; dlg.close(); resolve(v); };
    dlg.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => done(b.dataset.v === '1'); });
    dlg.onclose = () => resolve(false);
    dlg.showModal();
  });
}
const notify = (msg) => askConfirm(msg, { ok: 'Rozumiem', cancel: '' });

function toast(msg, undo) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-undo';
    b.textContent = 'Späť';
    b.onclick = () => { el.classList.remove('show'); clearTimeout(toast.t); undo(); };
    el.append(b);
  }
  el.classList.toggle('has-undo', !!undo);
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2600);
}

function go(hash) {
  if (location.hash === hash) render(); else location.hash = hash;
}

/* =========================================================
   Komponenty
   ========================================================= */
function sessionRow(s, { showClient = true, showDate = true } = {}) {
  const plan = s.planId ? getPlan(s.planId) : null;
  const c = getClient(s.clientId);
  const title = showClient ? esc(clientName(s.clientId)) : fmtDay(s.date);
  const meta = [
    showClient && showDate ? fmtDay(s.date) : '',
    `${s.duration || 60} min`,
    plan ? esc(plan.name) : ''
  ].filter(Boolean).join(' · ');
  const canRemind = s.status === 'planned' && (c?.phone || c?.email) && s.date >= today();
  return `<li class="session ${s.status}">
    <button class="session-main" data-action="edit-session" data-id="${s.id}">
      <span class="time">${esc(s.time || '–')}</span>
      <span class="info"><strong>${title}</strong><small>${meta}</small></span>
      ${s.status === 'done' && isDue(s) ? `<span class="badge warn">Nezaplatený · ${fmtMoney(priceOf(s))}</span>`
        : s.status === 'done' && s.paid ? `<span class="badge done">${PAY[payMethod(s)]} · ${fmtMoney(priceOf(s))}</span>`
        : `<span class="badge ${s.status}">${STATUS[s.status]}</span>`}
    </button>
    ${s.status === 'planned' ? `<div class="quick">
      ${canRemind ? `<button class="icon-btn${s.reminded ? ' sent' : ''}" title="${s.reminded ? 'Pripomienka odoslaná – poslať znova' : 'Poslať pripomienku'}" aria-label="${s.reminded ? 'Pripomienka odoslaná' : 'Poslať pripomienku'}" data-action="remind" data-id="${s.id}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3 9.2 10.1M22 3H2l7.2 7.1 2.5 10.2z"/></svg></button>` : ''}
      <button class="icon-btn cancel" title="Zrušiť tréning" aria-label="Zrušiť" data-action="session-cancel" data-id="${s.id}">✕</button>
      <button class="btn small primary done-btn" title="Označiť ako odtrénovaný" aria-label="Odtrénovaný" data-action="session-done" data-id="${s.id}">✓ Hotovo</button>
    </div>` : s.status === 'done' ? `<div class="quick">${logButton(s)}</div>` : ''}
  </li>`;
}

// činka pri odtrénovanom tréningu – zápis váh a opakovaní
const DUMBBELL = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/></svg>';
const logButton = (s) => `<button class="btn small log${s.log ? ' logged' : ''}" title="${s.log ? 'Výkony zapísané – upraviť' : 'Zapísať výkony'}" aria-label="${s.log ? 'Upraviť výkony' : 'Zapísať výkony'}" data-action="log-session" data-id="${s.id}">${DUMBBELL}${s.log ? 'Výkony ✓' : 'Výkony'}</button>`;

const sessionList = (list, opts, emptyText = 'Žiadne tréningy.') =>
  list.length ? `<ul class="list">${list.map((s) => sessionRow(s, opts)).join('')}</ul>` : `<p class="empty">${emptyText}</p>`;

function exerciseLine(item) {
  const ex = getExercise(item.exerciseId);
  const dose = [
    item.sets && item.reps ? `${item.sets} × ${item.reps}` : item.sets ? `${item.sets} sérií` : item.reps || '',
    item.weight ? item.weight : '',
    item.rest ? `pauza ${item.rest}` : ''
  ].filter(Boolean).join(' · ');
  return { name: ex ? ex.name : 'Vymazaný cvik', dose, note: item.note || '' };
}

/* ---------- Výkony: váhy a opakovania z tréningov ---------- */
const exName = (id) => getExercise(id)?.name || 'Vymazaný cvik';
// váha 0 (alebo prázdna) = vlastná váha → len opakovania
const fmtSet = (st) => (st.w && st.r != null ? `${fmtNum(st.w, 2)} kg × ${fmtNum(st.r, 0)}`
  : st.w ? `${fmtNum(st.w, 2)} kg` : st.r != null ? `${fmtNum(st.r, 0)} opak.` : '');
// lepšia séria = vyššia váha, pri rovnakej váhe viac opakovaní
const betterSet = (a, b) => (a.w ?? 0) - (b.w ?? 0) || (a.r ?? 0) - (b.r ?? 0);
const topSet = (sets) => sets.reduce((a, b) => (betterSet(b, a) > 0 ? b : a));
const sessionKey = (x) => x.date + (x.time || '');
const loggedSessions = (cid) => clientSessions(cid).filter((x) => x.log && x.status !== 'cancelled').sort(bySessionTime);

// posledný zápis cviku pred daným tréningom
function lastLog(s, exerciseId) {
  const list = loggedSessions(s.clientId).filter((x) => x !== s && sessionKey(x) < sessionKey(s));
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i].log.find((l) => l.exerciseId === exerciseId);
    if (e) return { session: list[i], sets: e.sets };
  }
  return null;
}

// najlepšia séria cviku zo všetkých tréningov klienta okrem daného (voliteľne len pred ním)
function bestBefore(s, exerciseId, onlyEarlier = true) {
  let best = null;
  for (const x of loggedSessions(s.clientId)) {
    if (x === s || (onlyEarlier && sessionKey(x) >= sessionKey(s))) continue;
    const e = x.log.find((l) => l.exerciseId === exerciseId);
    if (e) { const t = topSet(e.sets); if (!best || betterSet(t, best.set) > 0) best = { set: t, date: x.date }; }
  }
  return best;
}

// rekordy a priebeh každého cviku klienta
function clientRecords(cid) {
  const map = new Map();
  for (const x of loggedSessions(cid)) {
    for (const e of x.log) {
      const top = topSet(e.sets);
      let r = map.get(e.exerciseId);
      if (!r) map.set(e.exerciseId, (r = { exerciseId: e.exerciseId, best: top, date: x.date, tops: [] }));
      else if (betterSet(top, r.best) > 0) { r.best = top; r.date = x.date; }
      r.tops.push({ date: x.date, set: top });
    }
  }
  return [...map.values()].map((r) => {
    const byWeight = r.tops.some((t) => t.set.w != null);
    const points = r.tops.map((t) => ({ date: t.date, value: byWeight ? t.set.w : t.set.r })).filter((p) => p.value != null);
    return { ...r, name: exName(r.exerciseId), unit: byWeight ? 'kg' : 'opak.', points };
  }).sort((a, b) => b.tops.length - a.tops.length || a.name.localeCompare(b.name, 'sk'));
}

/* ---------- Graf progresu ---------- */
const METRICS = [['weight', 'Váha', 'kg'], ['bodyFat', 'Tuk', '%'], ['waist', 'Pás', 'cm'], ['hips', 'Boky', 'cm']];
const chartSel = {};   // vybraná metrika / cvik pre každého klienta
let chartN = 0;

// body grafu: [{ date, value }] – aspoň 2. Čiara a plocha sú SVG (natiahnuté), body a popisy HTML (nedeformujú sa)
function chartHtml(points, unit) {
  const xs = points.map((p) => parseDate(p.date).getTime());
  const x0 = xs[0];
  const span = xs[xs.length - 1] - x0 || 1;
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  if (hi === lo) { hi += 1; lo -= 1; }
  const padV = (hi - lo) * 0.18;
  lo -= padV; hi += padV;
  const X = (i) => (points.length === 1 ? 50 : 3 + ((xs[i] - x0) / span) * 94);
  const Y = (v) => 8 + ((hi - v) / (hi - lo)) * 84;
  const pts = points.map((p, i) => [X(i), Y(p.value)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(2)} 100 L${pts[0][0].toFixed(2)} 100 Z`;
  const id = `cg${++chartN}`;
  const last = points.length - 1;
  const label = (i, cls) => `<span class="chart-val ${cls}" style="left:${pts[i][0]}%;top:${pts[i][1]}%">${fmtNum(points[i].value)}</span>`;
  return `<div class="chart" role="img" aria-label="Graf: ${points.map((p) => `${fmtShort(p.date)} ${fmtNum(p.value)} ${unit}`).join(', ')}">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="${id}a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46b3a7" stop-opacity=".32"/><stop offset="1" stop-color="#46b3a7" stop-opacity="0"/></linearGradient>
        <linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="100" y2="0"><stop offset="0" stop-color="#8fdcd2"/><stop offset="1" stop-color="#7fb3d5"/></linearGradient>
      </defs>
      <path d="${area}" fill="url(#${id}a)"/>
      <path d="${line}" fill="none" stroke="url(#${id}l)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    ${pts.map(([x, y], i) => `<span class="chart-dot${i === last ? ' last' : ''}" style="left:${x}%;top:${y}%" title="${fmtShort(points[i].date)}: ${fmtNum(points[i].value)} ${unit}"></span>`).join('')}
    ${label(0, 'first')}${last ? label(last, 'last') : ''}
  </div>
  <div class="chart-axis"><span>${fmtShort(points[0].date)} ${parseDate(points[0].date).getFullYear()}</span><span>${fmtShort(points[last].date)} ${parseDate(points[last].date).getFullYear()}</span></div>`;
}

// zhrnutie nad grafom: aktuálna hodnota + zmena od začiatku
function chartSummary(points, unit, label) {
  const first = points[0];
  const last = points[points.length - 1];
  const d = Math.round((last.value - first.value) * 100) / 100;
  const days = daysBetween(first.date, last.date);
  return `<div class="chart-sum">
    <div><span>${esc(label)} teraz</span><b>${fmtNum(last.value)} <small>${unit}</small></b></div>
    <div><span>Zmena${days ? ` za ${days < 60 ? cnt(days, 'deň', 'dni', 'dní') : cnt(Math.round(days / 7), 'týždeň', 'týždne', 'týždňov')}` : ''}</span><b class="chg">${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtNum(Math.abs(d))} <small>${unit}</small></b></div>
  </div>`;
}

/* =========================================================
   Obrazovky
   ========================================================= */
function viewDashboard() {
  if (!db.clients.length) {
    return `<section class="empty-hero">
      <h1>Vitaj v aplikácii Tréner</h1>
      <p>Spravuj klientov, rozvrh tréningov, platby, tréningové plány aj merania progresu. Všetko na jednom mieste, aj offline.</p>
      <div class="row">
        <button class="btn primary" data-action="new-client">Pridať prvého klienta</button>
        <button class="btn" data-action="demo">Vyskúšať s ukážkovými dátami</button>
      </div>
    </section>`;
  }
  const t = today();
  const ws = startOfWeek(t);
  const we = addDays(ws, 6);
  const active = db.clients.filter((c) => !c.archived);
  const todays = (idx().sessionsByDate.get(t) || []).filter((s) => s.status !== 'cancelled').sort(bySessionTime);
  const week = db.sessions.filter((s) => s.date >= ws && s.date <= we && s.status !== 'cancelled');
  const upcoming = db.sessions.filter((s) => s.status === 'planned' && s.date > t).sort(bySessionTime).slice(0, 6);
  const overdue = db.sessions.filter((s) => s.status === 'planned' && s.date < t).sort(bySessionTime);
  const low = PACKAGES ? active.map((c) => ({ c, cr: credits(c.id) })).filter(({ cr }) => cr.bought > 0 && cr.left <= 1) : [];

  const lastBackup = db.settings.lastBackup;
  const needBackup = !lastBackup || daysBetween(lastBackup, t) > 14;

  const hour = new Date().getHours();
  const greet = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý deň' : 'Dobrý večer';

  const now = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
  const next = todays.find((s) => s.status === 'planned' && (s.time || '99') >= now) || upcoming[0];
  const doneWeek = week.filter((s) => s.status === 'done').length;

  return `
  <section class="hero">
    <div class="hero-top">
      <span class="eyebrow">${DAYS_LONG[weekday(t)]} · ${fmtShort(t)} ${parseDate(t).getFullYear()}</span>
      <button class="btn primary" data-action="new-session" data-date="${t}">+ Tréning</button>
    </div>
    <h1 class="hero-title">${greet}</h1>
    <div class="hero-big"><b>${todays.length}</b><span>${pl(todays.length, 'tréning', 'tréningy', 'tréningov')}<br>dnes</span></div>
    ${next ? `<button class="hero-next" data-action="edit-session" data-id="${next.id}">
      <span class="eyebrow">Najbližší</span>
      <strong>${next.date === t ? '' : fmtDate(next.date) + ' · '}${esc(next.time || '')} ${esc(clientName(next.clientId))}</strong>
    </button>` : ''}
  </section>

  <section class="card today-card">
    <div class="card-head"><h2>Dnes</h2><a class="btn small" href="#/calendar">Kalendár ›</a></div>
    ${sessionList(todays, { showDate: false }, 'Dnes nemáš naplánovaný žiadny tréning. 🙌')}
  </section>

  ${(() => { const due = db.sessions.filter(isDue); return due.length ? `<a class="notice notice-money" href="#/finance"><span>💰 Nezaplatené: <b>${nTr(due.length)} · ${fmtMoney(sumPrice(due))}</b></span><span class="chev" aria-hidden="true">›</span></a>` : ''; })()}

  ${overdue.length ? `<section class="card">
    <div class="card-head"><h2>Na vyhodnotenie</h2><span class="badge warn">${overdue.length}</span></div>
    <p class="muted" style="margin-top:-6px">Tieto tréningy už prebehli. Označ, či sa odtrénovali alebo boli zrušené.</p>
    ${sessionList(overdue)}
  </section>` : ''}

  ${remindersCard()}

  <section class="card">
    <div class="card-head"><h2>Ďalšie tréningy</h2></div>
    ${sessionList(upcoming, {}, 'Žiadne ďalšie naplánované tréningy.')}
  </section>

  <div class="stats">
    <div class="stat"><b>${week.length}</b><span>tento týždeň</span></div>
    <div class="stat"><b>${doneWeek}</b><span>odtrénované</span></div>
    <div class="stat"><b>${active.length}</b><span>${pl(active.length, 'klient', 'klienti', 'klientov')}</span></div>
  </div>

  ${needBackup ? `<div class="notice"><span>${lastBackup ? `Posledná záloha: ${fmtDate(lastBackup)}.` : 'Dáta sú uložené len v tomto zariadení.'} Odporúčame si ich zálohovať.</span><button class="btn small" data-action="export">Zálohovať</button></div>` : ''}

  ${low.length ? `<section class="card" style="margin-top:16px">
    <div class="card-head"><h2>Dochádza permanentka</h2></div>
    <ul class="list">${low.map(({ c, cr }) => `<li><a class="list-item" href="#/client/${c.id}">
      ${avatar(c)}
      <span class="info"><strong>${esc(c.name)}</strong><small>Zostáva ${cr.left} z ${cr.bought} tréningov</small></span>
      <span class="badge ${cr.left <= 0 ? 'cancelled' : 'warn'}">${cr.left <= 0 ? 'Minuté' : 'Posledný'}</span>
    </a></li>`).join('')}</ul>
  </section>` : ''}`;
}

// Pripomienky na zajtra – jedným ťuknutím WhatsApp/SMS každému klientovi, odoslané sa odškrtnú
function remindersCard() {
  const tm = addDays(today(), 1);
  const list = (idx().sessionsByDate.get(tm) || []).filter((s) => s.status === 'planned').sort(bySessionTime)
    .map((s) => ({ s, c: getClient(s.clientId) })).filter(({ c }) => c && (c.phone || c.email));
  if (!list.length) return '';
  const sent = list.filter(({ s }) => s.reminded).length;
  const all = sent === list.length;
  return `<section class="card reminders${all ? ' all-sent' : ''}" id="reminders">
    <div class="card-head"><h2>${all ? '✓ Pripomienky na zajtra odoslané' : 'Pripomienky na zajtra'}</h2><span class="badge ${all ? 'done' : 'planned'}">${sent}/${list.length}</span></div>
    ${all ? '' : `<p class="muted" style="margin-top:-6px">Ťukni na WhatsApp alebo SMS – správa je pripravená, stačí odoslať.</p>`}
    <ul class="list">${list.map(({ s, c }) => {
      const text = encodeURIComponent(reminderText(c, s));
      const phone = (c.phone || '').replace(/\s/g, '');
      return `<li class="remind-row${s.reminded ? ' sent' : ''}">
        ${avatar(c)}
        <span class="info"><strong>${esc(c.name)}</strong><small>${esc(s.time || 'bez času')}${s.reminded ? ' · odoslané ✓' : ''}</small></span>
        <span class="row">${phone
          ? `<a class="btn small wa-btn${s.reminded ? '' : ' primary'}" href="https://wa.me/${intlPhone(c.phone)}?text=${text}" target="_blank" rel="noopener" data-remind="${s.id}">WhatsApp</a><a class="btn small" href="sms:${esc(phone)}?&body=${text}" data-remind="${s.id}">SMS</a>`
          : `<a class="btn small${s.reminded ? '' : ' primary'}" href="mailto:${esc(c.email)}?body=${text}" data-remind="${s.id}">E-mail</a>`}</span>
      </li>`;
    }).join('')}</ul>
  </section>`;
}

function viewClients() {
  const showArchived = !!db.settings.showArchived;
  const list = db.clients.filter((c) => showArchived || !c.archived).sort(byName);
  const t = today();
  return `
  <div class="page-head">
    <div class="title-count">
      <h1>Klienti</h1>
      <span class="count-pill" aria-label="${cnt(db.clients.filter((c) => !c.archived).length, 'klient', 'klienti', 'klientov')}">${db.clients.filter((c) => !c.archived).length}</span>
    </div>
    <button class="btn primary" data-action="new-client">+ Nový klient</button>
  </div>
  <section class="card">
    <input type="search" class="search" id="client-search" placeholder="Hľadať klienta…" aria-label="Hľadať klienta">
    ${list.length ? `<ul class="list" id="client-list">${list.map((c) => {
      const cr = credits(c.id);
      const next = clientSessions(c.id).filter((s) => s.status === 'planned' && s.date >= t).sort(bySessionTime)[0];
      const meta = [c.test ? 'Test' : '', next ? `Ďalší tréning ${fmtDate(next.date)} ${next.time || ''}` : 'Bez naplánovaného tréningu', c.goal].filter(Boolean).map(esc).join(' · ');
      return `<li data-name="${esc(fold(c.name))} ${esc((c.phone || '').replace(/\s/g, ''))} ${esc(fold(c.email))}">
        <a class="list-item" href="#/client/${c.id}">
          ${avatar(c)}
          <span class="info"><strong>${esc(c.name)}</strong><small>${meta}</small></span>
          ${c.archived ? '<span class="badge">Archív</span>' : PACKAGES && cr.bought ? `<span class="badge ${cr.left <= 0 ? 'cancelled' : cr.left <= 1 ? 'warn' : 'planned'}">${cr.left} tr.</span>`
            : (() => { const due = clientDue(c.id); return due.length ? `<span class="badge warn">${fmtMoney(sumPrice(due))}</span>` : ''; })()}
        </a></li>`;
    }).join('')}</ul><p class="empty" id="client-empty" hidden>Nikto nezodpovedá hľadaniu.</p>` : '<p class="empty">Zatiaľ nemáš žiadnych klientov.</p>'}
    <label class="check" style="margin-top:12px"><input type="checkbox" data-toggle="showArchived" ${showArchived ? 'checked' : ''}> Zobraziť archivovaných</label>
  </section>`;
}

const HISTORY_LIMIT = 15;
let showAllHistory = null;

function viewClient(id) {
  const c = getClient(id);
  if (!c) return `<p class="empty">Klient neexistuje.</p><a class="btn" href="#/clients">Späť na klientov</a>`;
  const t = today();
  const sessions = clientSessions(id);
  const upcoming = sessions.filter((s) => s.date >= t && s.status === 'planned').sort(bySessionTime);
  const history = sessions.filter((s) => !(s.date >= t && s.status === 'planned')).sort(bySessionTime).reverse();
  const cr = credits(id);
  const packages = db.packages.filter((p) => p.clientId === id).sort((a, b) => b.date.localeCompare(a.date));
  const plans = db.plans.filter((p) => p.clientId === id).sort(byName);

  return `
  <a href="#/clients" class="back-link">‹ Klienti</a>
  <div class="page-head">
    <div class="profile">
      <button class="avatar lg avatar-edit" data-action="photo" data-id="${c.id}" aria-label="${c.photo ? 'Zmeniť fotku' : 'Pridať fotku'}">${photoOf(c) ? `<img src="${photoOf(c)}" alt="">` : esc(initials(c.name))}<span class="cam" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span></button>
      <div>
        <h1>${esc(c.name)} ${c.archived ? '<span class="badge">Archív</span>' : ''}${c.test ? ' <span class="badge">Test</span>' : ''}</h1>
        <div class="contact">
          ${c.phone ? `<a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a>` : ''}
          ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
          ${!c.phone && !c.email ? '<span class="muted">Bez kontaktu</span>' : ''}
        </div>
      </div>
    </div>
    <div class="row client-actions">
      ${c.phone || c.email ? `<button class="btn" data-action="contact" data-id="${c.id}">💬 Napísať</button>` : ''}
      <button class="btn" data-action="edit-client" data-id="${c.id}">✏️ Upraviť</button>
      <button class="btn primary" data-action="new-session" data-client="${c.id}">+ Tréning</button>
    </div>
  </div>

  <nav class="jump" aria-label="Sekcie klienta">
    ${[['sec-sessions', 'Tréningy'], ['records-card', 'Výkony'], ['measure-card', 'Merania'], ['sec-plans', 'Plány'], ['sec-photos', 'Fotky'], ['sec-history', 'História']]
      .map(([t, l]) => `<button class="chip" data-action="jump" data-target="${t}">${l}</button>`).join('')}
  </nav>

  <div class="grid two">
    <section class="card">
      <div class="card-head"><h2>Profil</h2></div>
      <dl class="kv">
        <dt>Cieľ</dt><dd>${esc(c.goal) || '<span class="muted">–</span>'}</dd>
        <dt>Poznámky</dt><dd>${esc(c.notes) || '<span class="muted">–</span>'}</dd>
        <dt>Klientom od</dt><dd>${c.createdAt ? fmtDate(c.createdAt) : '–'}</dd>
        <dt>Odtrénované</dt><dd>${nTr(sessions.filter((s) => s.status === 'done').length)}</dd>
      </dl>
    </section>

    ${PACKAGES ? `<section class="card">
      <div class="card-head"><h2>Permanentka</h2><button class="btn small" data-action="new-package" data-client="${c.id}">+ Balík</button></div>
      ${cr.bought ? `<div class="credits"><b>${cr.left}</b><span class="muted">zostávajúcich z ${cr.bought} zakúpených</span></div>
        <ul class="list">${packages.map((p) => `<li><button class="list-item" data-action="edit-package" data-id="${p.id}">
          <span class="info"><strong>${nTr(Number(p.count) || 0)}${p.price ? ` · ${fmtMoney(p.price)}` : ''}</strong><small>${fmtDate(p.date)}${p.note ? ' · ' + esc(p.note) : ''}</small></span>
        </button></li>`).join('')}</ul>` : '<p class="empty">Bez permanentky.</p>'}
    </section>` : ''}

    <section class="card">
      <div class="card-head"><h2>Platby</h2></div>
      ${(() => {
        const paidList = sessions.filter(isPaid);
        const cash = sumPrice(paidList.filter((x) => payMethod(x) === 'cash'));
        const bank = sumPrice(paidList.filter((x) => payMethod(x) === 'bank'));
        const due = clientDue(id);
        return `<div class="pay-summary">
          <div><span>Zaplatené spolu</span><b>${fmtMoney(cash + bank)}</b></div>
          <div><span>Hotovosť</span><b>${fmtMoney(cash)}</b></div>
          <div><span>Na účet</span><b>${fmtMoney(bank)}</b></div>
        </div>
        ${due.length ? `<div class="due-row">
          <span>Nezaplatené: <b>${nTr(due.length)} · ${fmtMoney(sumPrice(due))}</b></span>
          <span class="row">${payButtons(id)}</span>
        </div>` : '<p class="muted" style="margin:12px 0 0">Všetko zaplatené. 👌</p>'}`;
      })()}
    </section>
  </div>

  <section class="card" style="margin-top:16px" id="sec-sessions">
    <div class="card-head"><h2>Naplánované tréningy</h2></div>
    ${sessionList(upcoming, { showClient: false }, 'Žiadne naplánované tréningy.')}
  </section>

  ${recordsCard(c)}

  ${measureCard(c)}

  ${shareCard(c)}

  <section class="card" id="sec-plans">
    <div class="card-head"><h2>Tréningové plány</h2><button class="btn small" data-action="new-plan" data-client="${c.id}">+ Plán</button></div>
    ${plans.length ? `<ul class="list">${plans.map((p) => `<li><a class="list-item" href="#/plan/${p.id}">
      <span class="info"><strong>${esc(p.name)}</strong><small>${nEx(p.items.length)}${p.notes ? ' · ' + esc(p.notes) : ''}</small></span><span aria-hidden="true">›</span>
    </a></li>`).join('')}</ul>` : '<p class="empty">Klient zatiaľ nemá žiadny plán. Vytvor nový alebo skopíruj šablónu v sekcii Plány.</p>'}
  </section>

  <section class="card" id="sec-photos">
    <div class="card-head"><h2>Fotky</h2><span class="spacer"></span><span class="badge" id="photo-count" hidden></span><button class="btn small" data-action="add-photos" data-client="${c.id}">+ Fotky</button></div>
    <div class="photo-grid" id="photo-grid" data-client="${c.id}"></div>
  </section>

  <section class="card" id="sec-history">
    <div class="card-head"><h2>História tréningov</h2>${history.length ? `<span class="badge">${history.length}</span>` : ''}</div>
    ${sessionList(showAllHistory === id ? history : history.slice(0, HISTORY_LIMIT), { showClient: false }, 'Zatiaľ žiadna história.')}
    ${history.length > HISTORY_LIMIT && showAllHistory !== id ? `<button class="btn small" style="margin-top:10px" data-action="show-history" data-id="${id}">Zobraziť celú históriu (${history.length})</button>` : ''}
  </section>`;
}

const SHARE_ICON = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
const shareBtn = (cid, kind) => `<button class="icon-btn small" title="Zdieľať ako obrázok" aria-label="Zdieľať ako obrázok" data-action="share-progress" data-id="${cid}" data-kind="${kind}">${SHARE_ICON}</button>`;

// Karta „Merania a progres“ – graf vybranej metriky + tabuľka
function measureCard(c) {
  const ms = db.measurements.filter((m) => m.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  const delta = (cur, prev) => {
    if (cur == null || prev == null) return '';
    const d = Math.round((cur - prev) * 10) / 10;
    if (!d) return '';
    return `<small class="delta ${d < 0 ? 'delta-down' : 'delta-up'}">${d > 0 ? '+' : ''}${fmtNum(d)}</small>`;
  };
  const avail = METRICS.map(([key, label, unit]) => ({ key, label, unit, points: ms.filter((m) => m[key] != null && m[key] !== '').map((m) => ({ date: m.date, value: Number(m[key]) })) }))
    .filter((m) => m.points.length >= 2);
  const sel = avail.find((m) => m.key === chartSel[c.id + ':m']) || avail[0];
  return `<section class="card" id="measure-card" data-client="${c.id}">
    <div class="card-head"><h2>Merania a progres</h2><span class="head-actions">${sel ? shareBtn(c.id, 'm') : ''}<button class="btn small" data-action="new-measurement" data-client="${c.id}">+ Meranie</button></span></div>
    ${sel ? `${avail.length > 1 ? `<div class="chips chart-chips">${avail.map((m) => `<button class="chip ${m === sel ? 'active' : ''}" data-action="chart" data-client="${c.id}" data-kind="m" data-val="${m.key}">${m.label}</button>`).join('')}</div>` : ''}
      ${chartSummary(sel.points, sel.unit, sel.label)}
      ${chartHtml(sel.points, sel.unit)}` : ms.length === 1 ? '<p class="hint" style="margin-top:0">Graf sa ukáže po druhom meraní.</p>' : ''}
    ${ms.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Dátum</th><th class="num">Váha<small>kg</small></th><th class="num">Tuk<small>%</small></th><th class="num">Pás<small>cm</small></th><th class="num">Boky<small>cm</small></th><th>Poznámka</th></tr></thead>
      <tbody>${ms.map((m, i) => {
        const p = ms[i - 1] || {};
        return `<tr data-action="edit-measurement" data-id="${m.id}" style="cursor:pointer">
          <td class="date">${fmtShort(m.date)} ${parseDate(m.date).getFullYear()}</td>
          <td class="num">${fmtNum(m.weight)}${delta(m.weight, p.weight)}</td>
          <td class="num">${fmtNum(m.bodyFat)}${delta(m.bodyFat, p.bodyFat)}</td>
          <td class="num">${fmtNum(m.waist)}${delta(m.waist, p.waist)}</td>
          <td class="num">${fmtNum(m.hips)}${delta(m.hips, p.hips)}</td>
          <td>${esc(m.note)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : '<p class="empty">Zatiaľ žiadne merania.</p>'}
  </section>`;
}

// Karta „Výkony a rekordy“ – najlepšia séria každého cviku a graf jeho progresu
function recordsCard(c) {
  const recs = clientRecords(c.id);
  const charted = recs.filter((r) => r.points.length >= 2);
  const sel = charted.find((r) => r.exerciseId === chartSel[c.id + ':x']) || charted[0];
  return `<section class="card" id="records-card" data-client="${c.id}">
    <div class="card-head"><h2>Výkony a rekordy</h2>${sel ? shareBtn(c.id, 'x') : ''}</div>
    ${!recs.length ? `<p class="empty">Po tréningu ťukni na <b>činku</b> pri odtrénovanom tréningu a zapíš váhy a opakovania. Appka ti ukáže progres, porovnanie s minulým tréningom aj osobné rekordy.</p>` : `
      ${sel ? `${charted.length > 1 ? `<div class="chips chart-chips">${charted.map((r) => `<button class="chip ${r === sel ? 'active' : ''}" data-action="chart" data-client="${c.id}" data-kind="x" data-val="${esc(r.exerciseId)}">${esc(r.name)}</button>`).join('')}</div>` : ''}
        ${chartSummary(sel.points, sel.unit, sel.name)}
        ${chartHtml(sel.points, sel.unit)}` : ''}
      <ul class="list records">${recs.map((r) => `<li><button class="list-item${r === sel ? ' sel' : ''}" ${r.points.length >= 2 ? `data-action="chart" data-client="${c.id}" data-kind="x" data-val="${esc(r.exerciseId)}"` : 'disabled'}>
        <span class="pr-icon" aria-hidden="true">🏆</span>
        <span class="info"><strong>${esc(r.name)}</strong><small>${fmtShort(r.date)} ${parseDate(r.date).getFullYear()}</small></span>
        <b class="pr-val">${fmtSet(r.best)}</b>
      </button></li>`).join('')}</ul>`}
  </section>`;
}

function viewCalendar(weekParam) {
  const t = today();
  const ws = startOfWeek(weekParam || t);
  const we = addDays(ws, 6);
  const label = `${fmtShort(ws)} – ${fmtShort(we)} ${parseDate(we).getFullYear()}`;
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const inWeek = days.flatMap((d) => idx().sessionsByDate.get(d) || []).sort(bySessionTime);
  const count = inWeek.filter((s) => s.status !== 'cancelled').length;

  return `
  <div class="page-head">
    <div><h1>Kalendár</h1><p class="muted" style="margin:0">${nTr(count)} v týždni</p></div>
    <div class="week-nav">
      <a class="icon-btn" href="#/calendar/${addDays(ws, -7)}" aria-label="Predchádzajúci týždeň">‹</a>
      <span class="label">${label}</span>
      <a class="icon-btn" href="#/calendar/${addDays(ws, 7)}" aria-label="Nasledujúci týždeň">›</a>
      ${ws !== startOfWeek(t) ? '<a class="btn small" href="#/calendar">Dnes</a>' : ''}
    </div>
  </div>
  <div class="days">
    ${days.map((d, i) => {
      const list = inWeek.filter((s) => s.date === d);
      return `<section class="day ${d === t ? 'today' : ''}">
        <div class="day-head"><b>${DAYS_LONG[i]} <span class="muted">${fmtShort(d)}</span></b>
          <button class="icon-btn" data-action="new-session" data-date="${d}" aria-label="Pridať tréning na ${DAYS_LONG[i]}">+</button></div>
        ${list.length ? `<ul class="list">${list.map((s) => sessionRow(s, { showDate: false })).join('')}</ul>` : '<p class="empty" style="font-size:.85rem">Voľno</p>'}
      </section>`;
    }).join('')}
  </div>`;
}

function plansTabs(active) {
  return `<nav class="tabs"><a href="#/plans" class="${active === 'plans' ? 'active' : ''}">Plány</a><a href="#/exercises" class="${active === 'exercises' ? 'active' : ''}">Cviky</a></nav>`;
}

function viewPlans() {
  const templates = db.plans.filter((p) => !p.clientId).sort(byName);
  const assigned = db.plans.filter((p) => p.clientId).sort((a, b) => clientName(a.clientId).localeCompare(clientName(b.clientId), 'sk') || byName(a, b));
  const item = (p, showClient) => `<li><a class="list-item" href="#/plan/${p.id}">
    <span class="info"><strong>${esc(p.name)}</strong><small>${showClient ? esc(clientName(p.clientId)) + ' · ' : ''}${nEx(p.items.length)}</small></span><span aria-hidden="true">›</span></a></li>`;
  return `
  <div class="page-head"><h1>Tréningové plány</h1><button class="btn primary" data-action="new-plan">+ Nový plán</button></div>
  ${plansTabs('plans')}
  <section class="card">
    <div class="card-head"><h2>Šablóny</h2><button class="btn small primary" data-action="new-plan" data-template="1">+ Šablóna</button></div>
    <p class="muted" style="margin-top:-6px">Univerzálne plány, ktoré môžeš skopírovať ľubovoľnému klientovi.</p>
    ${templates.length ? `<ul class="list">${templates.map((p) => item(p, false)).join('')}</ul>` : '<p class="empty">Žiadne šablóny.</p>'}
  </section>
  <section class="card">
    <div class="card-head"><h2>Plány klientov</h2></div>
    ${assigned.length ? `<ul class="list">${assigned.map((p) => item(p, true)).join('')}</ul>` : '<p class="empty">Žiadne priradené plány.</p>'}
  </section>`;
}

function viewPlan(id) {
  const p = getPlan(id);
  if (!p) return `<p class="empty">Plán neexistuje.</p><a class="btn" href="#/plans">Späť na plány</a>`;
  return `
  <div class="page-head">
    <div>
      <a href="${p.clientId ? `#/client/${p.clientId}` : '#/plans'}" class="no-print">‹ ${p.clientId ? esc(clientName(p.clientId)) : 'Plány'}</a>
      <h1>${esc(p.name)}</h1>
      <p class="muted" style="margin:0">${p.clientId ? `Klient: ${esc(clientName(p.clientId))}` : 'Šablóna'}${p.notes ? ' · ' + esc(p.notes) : ''}</p>
    </div>
    <div class="row no-print">
      <button class="btn" data-action="edit-plan" data-id="${p.id}">Upraviť</button>
      ${p.clientId ? `<button class="btn" data-action="dup-plan" data-id="${p.id}">Kopírovať</button>` : `<button class="btn primary" data-action="dup-plan" data-id="${p.id}" data-assign="1">Priradiť klientovi</button>`}
      <button class="btn" data-action="share-plan" data-id="${p.id}">Zdieľať</button>
      <button class="btn" data-action="print">Tlačiť</button>
    </div>
  </div>
  <section class="card">
    <div class="card-head"><h2>Cviky</h2><button class="btn small primary no-print" data-action="new-item" data-plan="${p.id}">+ Cvik</button></div>
    ${p.items.length ? `<ol class="list plan-items">${p.items.map((it, i) => {
      const l = exerciseLine(it);
      return `<li data-item="${it.id}">
        <span class="n">${i + 1}</span>
        <span class="info"><strong>${esc(l.name)}</strong><br><small>${esc(l.dose) || '–'}${l.note ? ' · ' + esc(l.note) : ''}</small></span>
        <span class="acts no-print">
          <button class="icon-btn" aria-label="Posunúť vyššie" data-action="move-item" data-plan="${p.id}" data-id="${it.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" aria-label="Posunúť nižšie" data-action="move-item" data-plan="${p.id}" data-id="${it.id}" data-dir="1" ${i === p.items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" aria-label="Upraviť" data-action="edit-item" data-plan="${p.id}" data-id="${it.id}">✎</button>
        </span>
      </li>`;
    }).join('')}</ol>` : '<p class="empty">Plán je prázdny. Pridaj prvý cvik.</p>'}
  </section>`;
}

function viewExercises() {
  const groups = {};
  [...db.exercises].sort(byName).forEach((e) => { (groups[e.category || 'Ostatné'] ||= []).push(e); });
  const cats = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'sk'));
  return `
  <div class="page-head"><h1>Knižnica cvikov</h1><button class="btn primary" data-action="new-exercise">+ Nový cvik</button></div>
  ${plansTabs('exercises')}
  <section class="card">
    ${cats.length ? cats.map((cat) => `<h3 class="section-title ex-cat">${esc(cat)}</h3>
      <ul class="list">${groups[cat].map((e) => `<li><button class="list-item" data-action="edit-exercise" data-id="${e.id}">
        <span class="ex-pic">${EXERCISE_ICONS(e)}</span><span class="info"><strong>${esc(e.name)}</strong>${e.note ? `<small>${esc(e.note)}</small>` : ''}</span><span aria-hidden="true">✎</span>
      </button></li>`).join('')}</ul>`).join('') : '<p class="empty">Knižnica je prázdna.</p>'}
  </section>`;
}

function viewFinance(monthParam) {
  const t = today();
  const month = monthParam && Number(monthParam.slice(5)) >= 1 && Number(monthParam.slice(5)) <= 12 ? monthParam : t.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const inMonth = (d) => !!d && d.startsWith(month);
  const paidSessions = db.sessions.filter((s) => isPaid(s) && inMonth(s.paidDate));
  const cash = sumPrice(paidSessions.filter((s) => payMethod(s) === 'cash'));
  const bank = sumPrice(paidSessions.filter((s) => payMethod(s) === 'bank'));
  const doneInMonth = db.sessions.filter((s) => s.status === 'done' && inMonth(s.date));
  const allDue = db.sessions.filter(isDue);

  // nezaplatené podľa klienta
  const dueByClient = new Map();
  allDue.forEach((s) => { const a = dueByClient.get(s.clientId) || []; a.push(s); dueByClient.set(s.clientId, a); });
  const dueRows = [...dueByClient.entries()].sort((a, b) => sumPrice(b[1]) - sumPrice(a[1]));

  // platby v mesiaci
  const payments = paidSessions
    .map((s) => ({ date: s.paidDate, clientId: s.clientId, label: `Tréning ${fmtShort(s.date)}`, method: payMethod(s), amount: priceOf(s) }))
    .sort((a, b) => b.date.localeCompare(a.date) || clientName(a.clientId).localeCompare(clientName(b.clientId), 'sk'));

  // podľa klientov
  const byClient = new Map();
  payments.forEach((p) => {
    const r = byClient.get(p.clientId) || { cash: 0, bank: 0 };
    r[p.method] += p.amount;
    byClient.set(p.clientId, r);
  });
  const doneByClient = new Map();
  doneInMonth.forEach((s) => doneByClient.set(s.clientId, (doneByClient.get(s.clientId) || 0) + 1));
  const total = (cid) => { const r = byClient.get(cid); return r ? r.cash + r.bank : 0; };
  const clientIds = [...new Set([...byClient.keys(), ...doneByClient.keys()])].sort((a, b) => total(b) - total(a) || clientName(a).localeCompare(clientName(b), 'sk'));

  // posledných 6 mesiacov
  const last6 = Array.from({ length: 6 }, (_, i) => monthKey(y, m - i)).map((k) => {
    const paid = db.sessions.filter((s) => isPaid(s) && s.paidDate?.startsWith(k));
    return { k, cash: sumPrice(paid.filter((s) => payMethod(s) === 'cash')), bank: sumPrice(paid.filter((s) => payMethod(s) === 'bank')) };
  });
  const sum6 = (key) => last6.reduce((a, r) => a + r[key], 0);

  return `
  <div class="page-head">
    <div><h1>Financie</h1><p class="muted" style="margin:0">Cena tréningu ${fmtMoney(sessionPrice())} · <a href="#/settings">zmeniť</a></p></div>
    <div class="week-nav">
      <a class="icon-btn" href="#/finance/${monthKey(y, m - 1)}" aria-label="Predchádzajúci mesiac">‹</a>
      <span class="label">${monthLabel(month)}</span>
      <a class="icon-btn" href="#/finance/${monthKey(y, m + 1)}" aria-label="Nasledujúci mesiac">›</a>
      ${month !== t.slice(0, 7) ? '<a class="btn small" href="#/finance">Teraz</a>' : ''}
    </div>
  </div>

  <section class="hero hero-finance">
    <span class="eyebrow">Príjem · ${monthLabel(month)}</span>
    <div class="fin-big">${fmtMoney(cash + bank)}</div>
    <div class="fin-split">
      <span>Hotovosť <b>${fmtMoney(cash)}</b></span>
      <span>Na účet <b>${fmtMoney(bank)}</b></span>
    </div>
  </section>

  <div class="stats">
    <div class="stat"><b>${doneInMonth.length}</b><span>odtrénované</span></div>
    <div class="stat"><b>${paidSessions.length}</b><span>zaplatené</span></div>
    <div class="stat ${allDue.length ? 'stat-warn' : ''}"><b>${fmtMoney(sumPrice(allDue))}</b><span>nezaplatené celkovo</span></div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Nezaplatené</h2>${allDue.length ? `<span class="badge warn">${nTr(allDue.length)}</span>` : ''}</div>
    ${dueRows.length ? `<ul class="list">${dueRows.map(([cid, list]) => `<li class="due-client">
      <a class="list-item" href="#/client/${cid}">
        ${avatar(getClient(cid) || { name: clientName(cid) })}
        <span class="info"><strong>${esc(clientName(cid))}</strong><small>${nTr(list.length)} · ${list.map((s) => fmtShort(s.date)).join(', ')}</small></span>
        <b class="amount">${fmtMoney(sumPrice(list))}</b>
      </a>
      <div class="quick">
        ${getClient(cid)?.phone || getClient(cid)?.email ? `<button class="icon-btn" title="Pripomenúť platbu" aria-label="Pripomenúť platbu" data-action="remind-pay" data-id="${cid}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 3 9.2 10.1M22 3H2l7.2 7.1 2.5 10.2z"/></svg></button>` : ''}
        ${payButtons(cid)}
      </div>
    </li>`).join('')}</ul>` : '<p class="empty">Všetko je zaplatené. 👌</p>'}
  </section>

  <section class="card">
    <div class="card-head"><h2>Platby v mesiaci</h2></div>
    ${payments.length ? `<ul class="list">${payments.map((p) => `<li><a class="list-item" href="#/client/${p.clientId}">
      <span class="info"><strong>${esc(clientName(p.clientId))}</strong><small>${fmtDate(p.date)} · ${esc(p.label)}</small></span>
      <span class="badge pay-${p.method}">${PAY[p.method]}</span>
      <b class="amount pos">+${fmtMoney(p.amount)}</b>
    </a></li>`).join('')}</ul>` : '<p class="empty">V tomto mesiaci zatiaľ žiadne platby.</p>'}
  </section>

  ${clientIds.length ? `<section class="card">
    <div class="card-head"><h2>Podľa klientov</h2></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Klient</th><th class="num">Tréningy</th><th class="num">Hotovosť</th><th class="num">Účet</th></tr></thead>
      <tbody>${clientIds.map((cid) => { const r = byClient.get(cid) || { cash: 0, bank: 0 }; return `<tr><td>${esc(clientName(cid))}</td><td class="num">${doneByClient.get(cid) || 0}</td><td class="num">${fmtMoney(r.cash)}</td><td class="num">${fmtMoney(r.bank)}</td></tr>`; }).join('')}</tbody>
    </table></div>
  </section>` : ''}

  <section class="card">
    <div class="card-head"><h2>Posledných 6 mesiacov</h2></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Mesiac</th><th class="num">Hotovosť</th><th class="num">Účet</th><th class="num">Spolu</th></tr></thead>
      <tbody>${last6.map((r) => `<tr class="${r.k === month ? 'current' : ''}" data-href="#/finance/${r.k}"><td>${monthLabel(r.k)}</td><td class="num">${fmtMoney(r.cash)}</td><td class="num">${fmtMoney(r.bank)}</td><td class="num">${fmtMoney(r.cash + r.bank)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Spolu</td><td class="num">${fmtMoney(sum6('cash'))}</td><td class="num">${fmtMoney(sum6('bank'))}</td><td class="num">${fmtMoney(sum6('cash') + sum6('bank'))}</td></tr></tfoot>
    </table></div>
  </section>`;
}

function viewSettings() {
  const lb = db.settings.lastBackup;
  return `
  <div class="page-head"><h1>Nastavenia</h1></div>
  <section class="card">
    <div class="card-head"><h2>Predvolené hodnoty tréningu</h2><button class="btn small" data-action="edit-defaults">Upraviť</button></div>
    <dl class="kv">
      <dt>Cena tréningu</dt><dd>${fmtMoney(sessionPrice())}</dd>
      <dt>Dĺžka tréningu</dt><dd>${db.settings.defaultDuration || 60} min</dd>
      <dt>Text pripomienky</dt><dd>${esc(reminderTemplate())}</dd>
      <dt>Meno pre klientov</dt><dd>${esc(db.settings.trainerName) || '<span class="muted">–</span>'}</dd>
    </dl>
  </section>
  <section class="card">
    <div class="card-head"><h2>Klientska zóna</h2><span class="badge" id="cloud-state">…</span></div>
    <p class="muted" style="margin:0">Klientom, ktorým vytvoríš prístup (v detaile klienta), sa ich tréningy, plán a merania posielajú do klientskej zóny: <b>${esc(CLIENT_ZONE_URL)}</b>. Zdieľajú sa len dáta daného klienta, nie financie ani poznámky.</p>
    <p class="muted" style="margin:10px 0 0">${(() => { const n = db.clients.filter((c) => c.share).length; return n ? `${cnt(n, 'klient má', 'klienti majú', 'klientov má')} prístup.` : 'Zatiaľ nemá prístup žiadny klient.'; })()}</p>
  </section>
  <section class="card">
    <div class="card-head"><h2>Záloha dát</h2></div>
    <p class="muted" style="margin-top:-6px">Dáta sú uložené iba v tomto zariadení a prehliadači. Pravidelne si ich zálohuj – súbor zálohy môžeš preniesť aj do iného zariadenia.
    ${lb ? `<br>Posledná záloha: <b>${fmtDate(lb)}</b>` : ''}</p>
    <div class="row">
      <button class="btn primary" data-action="export">Stiahnuť zálohu</button>
      <button class="btn" data-action="import">Obnoviť zo zálohy</button>
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Inštalácia na telefón</h2></div>
    <p class="muted" style="margin:0">Android (Chrome): menu ⋮ → <b>Inštalovať aplikáciu</b>.<br>iPhone (Safari): tlačidlo Zdieľať → <b>Pridať na plochu</b>.<br>Aplikácia potom funguje aj bez internetu.</p>
  </section>
  <section class="card">
    <div class="card-head"><h2>Testovacie dáta</h2></div>
    <p class="muted" style="margin-top:-6px">Pridá 20 vymyslených klientov s tréningami, platbami a meraniami k tvojim dátam (nič nezmaže). Sú označení „Test“ a dajú sa naraz odstrániť.</p>
    <div class="row">
      <button class="btn primary" data-action="add-test">Pridať 20 testovacích klientov</button>
      ${(() => { const n = db.clients.filter((c) => c.test).length; return n ? `<button class="btn danger" data-action="remove-test">Odstrániť testovacích (${n})</button>` : ''; })()}
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Ostatné</h2></div>
    <div class="row">
      <button class="btn" data-action="demo">Načítať ukážkové dáta</button>
      <button class="btn danger" data-action="wipe">Vymazať všetky dáta</button>
    </div>
    <p class="muted" style="margin-bottom:0">${cnt(db.clients.length, 'klient', 'klienti', 'klientov')} · ${nTr(db.sessions.length)} · ${cnt(db.plans.length, 'plán', 'plány', 'plánov')} · ${nEx(db.exercises.length)}</p>
    <p class="muted" style="margin-bottom:0">Verzia aplikácie: <b id="app-version">–</b></p>
  </section>`;
}

/* =========================================================
   Router
   ========================================================= */
const main = document.getElementById('main');
const routes = [
  [/^#?\/?$/, viewDashboard],
  [/^#\/clients$/, viewClients],
  [/^#\/client\/([\w-]+)$/, viewClient],
  [/^#\/calendar(?:\/(\d{4}-\d{2}-\d{2}))?$/, viewCalendar],
  [/^#\/plans$/, viewPlans],
  [/^#\/plan\/([\w-]+)$/, viewPlan],
  [/^#\/exercises$/, viewExercises],
  [/^#\/settings$/, viewSettings],
  [/^#\/finance(?:\/(\d{4}-\d{2}))?$/, viewFinance]
];

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
let flashId = null;
let renderedDay = '';

function render(animate = false) {
  const hash = location.hash || '#/';
  for (const [re, view] of routes) {
    const m = hash.match(re);
    if (m) {
      try {
        main.innerHTML = view(...m.slice(1));
      } catch (err) {
        console.error(err);
        main.innerHTML = `<section class="card" style="margin-top:12px">
          <h2>Niečo sa pokazilo</h2>
          <p class="muted">Túto obrazovku sa nepodarilo zobraziť. Tvoje dáta sú v poriadku – pre istotu si stiahni zálohu a daj vedieť, čo sa stalo.</p>
          <div class="row"><button class="btn primary" data-action="export">Stiahnuť zálohu</button><a class="btn" href="#/">Na Prehľad</a></div>
        </section>`;
      }
      renderedDay = today();
      const section = hash.startsWith('#/client') ? 'clients'
        : hash.startsWith('#/calendar') ? 'calendar'
        : hash.startsWith('#/plan') || hash.startsWith('#/exercises') ? 'plans'
        : hash.startsWith('#/settings') ? 'settings'
        : hash.startsWith('#/finance') ? 'finance' : 'home';
      document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === section));
      if (flashId) {
        main.querySelectorAll(`[data-id="${flashId}"]`).forEach((el) => el.closest('.session')?.classList.add('flash'));
        flashId = null;
      }
      if (animate && !reduceMotion.matches) animateEnter();
      const grid = main.querySelector('#photo-grid');
      if (grid) fillPhotoGrid(grid.dataset.client);
      updateCloudBadge();
      const ver = main.querySelector('#app-version');
      if (ver && 'caches' in window) caches.keys().then((k) => { const v = k.find((x) => x.startsWith('trener-v')); if (v) ver.textContent = v.replace('trener-v', ''); }).catch(() => {});
      return;
    }
  }
  location.hash = '#/';
}

/* =========================================================
   Animácie
   ========================================================= */
// Postupné nabehnutie obsahu po prechode na inú obrazovku
function animateEnter() {
  main.classList.remove('animate');
  void main.offsetWidth;
  main.classList.add('animate');
  const els = main.querySelectorAll(':scope > *, .stats > .stat, .card .list > li, .days > .day, .plan-items > li');
  let i = 0;
  els.forEach((el) => { el.style.animationDelay = `${Math.min(i++, 14) * 45}ms`; });
  clearTimeout(animateEnter.t);
  animateEnter.t = setTimeout(() => main.classList.remove('animate'), 1400);
  main.querySelectorAll('.hero-big b, .stat b, .credits b').forEach(countUp);
}

// Číslo „nabehne“ od nuly po svoju hodnotu
function countUp(el) {
  if (!/^\d+$/.test(el.textContent.trim())) return;   // „880 €“ a pod. nechať tak
  const target = parseInt(el.textContent, 10);
  if (!Number.isFinite(target) || target === 0) return;
  const start = performance.now();
  const dur = 900;
  const step = (now) => {
    const t = Math.min((now - start) / dur, 1);
    el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
}

// Ružová „oslava“ pri odtrénovanom tréningu
function burst(x, y) {
  if (reduceMotion.matches || !document.body.animate) return;
  const colors = ['#8fdcd2', '#46b3a7', '#ffffff', '#b9ebe4'];
  for (let i = 0; i < 18; i++) {
    const dot = document.createElement('span');
    dot.className = 'particle';
    const size = 5 + Math.random() * 6;
    Object.assign(dot.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px`, background: colors[i % colors.length] });
    document.body.appendChild(dot);
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const dist = 40 + Math.random() * 60;
    dot.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0)`, opacity: 0 }
    ], { duration: 650 + Math.random() * 300, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => dot.remove();
  }
}

// Prepínanie obrazoviek ako v natívnej aplikácii: záložky v menu okamžite (bez blikania),
// otvorenie detailu (klient, plán) jemne vkĺzne sprava – animuje sa len posun, nie jas
let prevHash = location.hash || '#/';
window.addEventListener('hashchange', () => {
  if (modal.open) modal.close();
  document.querySelector('.viewer')?.dispatchEvent(new Event('viewer-close'));
  const hash = location.hash || '#/';
  const isDetail = (h) => /^#\/(client|plan)\//.test(h);
  const push = isDetail(hash) && !isDetail(prevHash);
  prevHash = hash;
  render();
  window.scrollTo(0, 0);
  if (push && !reduceMotion.matches) {
    main.classList.remove('push');
    void main.offsetWidth;
    main.classList.add('push');
    // vkĺznutie len raz pri otvorení detailu – inak by každá zmena na stránke (šípky, formulár) obsah trhla
    clearTimeout(main.pushT);
    main.pushT = setTimeout(() => main.classList.remove('push'), 320);
  } else {
    main.classList.remove('push');
  }
});

/* =========================================================
   Formuláre v modálnom okne
   ========================================================= */
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modal-form');

function fieldHtml(fd, values) {
  const v = values[fd.name] ?? fd.default ?? '';
  const id = 'f_' + fd.name;
  const attrs = [
    fd.required ? 'required' : '',
    fd.step ? `step="${fd.step}"` : '',
    fd.min != null ? `min="${fd.min}"` : '',
    fd.placeholder ? `placeholder="${esc(fd.placeholder)}"` : '',
    fd.datalist ? `list="${id}_list"` : ''
  ].join(' ');
  let input;
  if (fd.type === 'checkbox') {
    return `<label class="check field"><input type="checkbox" name="${fd.name}" ${v ? 'checked' : ''}> ${esc(fd.label)}</label>`;
  } else if (fd.type === 'textarea') {
    input = `<textarea id="${id}" name="${fd.name}" rows="3" ${attrs}>${esc(v)}</textarea>`;
  } else if (fd.type === 'select') {
    input = `<select id="${id}" name="${fd.name}" ${attrs}>${fd.options.map(([ov, ol]) =>
      `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  } else if (fd.type === 'number') {
    // iPhone so slovenčinou píše desatinnú čiarku – type="number" by ju zahodil, preto text + číselná klávesnica
    const decimal = fd.step != null && String(fd.step).includes('.');
    const shown = v === '' || v == null ? '' : String(v).replace('.', ',');
    input = `<input id="${id}" name="${fd.name}" type="text" inputmode="${decimal ? 'decimal' : 'numeric'}" autocomplete="off" value="${esc(shown)}" ${fd.required ? 'required' : ''} ${fd.placeholder ? `placeholder="${esc(fd.placeholder)}"` : ''}>`;
  } else if (fd.type === 'time') {
    // iPhone ukáže prázdny čas ako úplne prázdne pole – sivé „--:--“ naznačí, že sa doň ťuká
    input = `<span class="time-wrap${v ? ' filled' : ''}"><input id="${id}" name="${fd.name}" type="time" value="${esc(v)}" ${attrs}><span class="time-ph" aria-hidden="true">--:--</span></span>`;
  } else {
    input = `<input id="${id}" name="${fd.name}" type="${fd.type || 'text'}" value="${esc(v)}" ${attrs}>`;
  }
  const datalist = fd.datalist ? `<datalist id="${id}_list">${fd.datalist.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
  // rýchla voľba hodnoty ťuknutím (napr. Dnes / Zajtra, obvyklé časy)
  const chips = fd.chips?.length ? `<div class="mini-chips">${fd.chips.map(([l, val]) => `<button type="button" class="chip mini${String(val) === String(v) ? ' active' : ''}" data-set="${id}" data-val="${esc(val)}">${esc(l)}</button>`).join('')}</div>` : '';
  return `<div class="field ${fd.half ? 'half' : ''}"><label for="${id}">${esc(fd.label)}</label>${input}${chips}${datalist}${fd.hint ? `<span class="hint">${esc(fd.hint)}</span>` : ''}</div>`;
}

function openForm({ title, fields, values = {}, submitLabel = 'Uložiť', onSubmit, onDelete, deleteLabel = 'Vymazať', deleteConfirm = 'Naozaj vymazať?' }) {
  modalForm.innerHTML = `
    <header class="modal-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">${fields.map((f) => fieldHtml(f, values)).join('')}</div>
    <footer class="modal-foot">
      ${onDelete ? `<button type="button" class="btn danger" data-delete>${esc(deleteLabel)}</button>` : ''}
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Zrušiť</button>
      <button type="submit" class="btn primary">${esc(submitLabel)}</button>
    </footer>`;
  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    for (const fd of fields) {
      const el = modalForm.elements[fd.name];
      if (!el) continue;
      if (fd.type === 'checkbox') data[fd.name] = el.checked;
      else if (fd.type === 'number') {
        const raw = el.value.trim().replace(/\s/g, '').replace(',', '.');
        const num = raw === '' ? null : Number(raw);
        const bad = raw !== '' && !Number.isFinite(num) ? 'Zadaj číslo, napr. 72,5'
          : num != null && fd.min != null && num < fd.min ? `Najmenej ${fd.min}` : '';
        el.setCustomValidity(bad);
        if (bad) { el.reportValidity(); el.addEventListener('input', () => el.setCustomValidity(''), { once: true }); return; }
        data[fd.name] = num;
      }
      else {
        if (fd.required && !el.value.trim()) {
          el.setCustomValidity('Vyplň toto pole');
          el.reportValidity();
          el.addEventListener('input', () => el.setCustomValidity(''), { once: true });
          return;
        }
        data[fd.name] = el.value.trim();
      }
    }
    if ((await onSubmit(data)) === false) return;
    modal.close();
    save();
    render();
  };
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.querySelectorAll('[data-set]').forEach((b) => {
    b.onclick = () => {
      const el = modalForm.querySelector('#' + b.dataset.set);
      el.value = b.dataset.val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });
  // zvýrazniť čip, ktorý zodpovedá aktuálnej hodnote poľa
  modalForm.querySelectorAll('.mini-chips').forEach((box) => {
    const el = modalForm.querySelector('#' + box.firstElementChild.dataset.set);
    const sync = () => box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.val === el.value));
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
  modalForm.querySelectorAll('.time-wrap input').forEach((t) => {
    t.oninput = t.onchange = t.onblur = () => t.parentNode.classList.toggle('filled', !!t.value);
  });
  const del = modalForm.querySelector('[data-delete]');
  if (del) {
    del.onclick = async () => {
      if (!(await askConfirm(deleteConfirm, { ok: deleteLabel, danger: true }))) return;
      if ((await onDelete()) === false) return;
      modal.close();
      save();
      render();
    };
  }
  modal.showModal();
  const first = modalForm.querySelector('.modal-body input:not([type=checkbox]), .modal-body select, .modal-body textarea');
  if (first && matchMedia('(pointer: fine)').matches) first.focus();
}

// Klik mimo okna zatvorí modál
modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

function upsert(collection, existing, data) {
  if (existing) { Object.assign(existing, data); return existing; }
  const item = { id: uid(), ...data };
  db[collection].push(item);
  return item;
}

function openClientForm(c) {
  openForm({
    title: c ? 'Upraviť klienta' : 'Nový klient',
    values: c || {},
    fields: [
      { name: 'name', label: 'Meno a priezvisko', required: true },
      { name: 'phone', label: 'Telefón', type: 'tel', half: true },
      { name: 'email', label: 'E-mail', type: 'email', half: true },
      { name: 'goal', label: 'Cieľ', placeholder: 'napr. schudnúť 5 kg, zlepšiť kondíciu…' },
      { name: 'notes', label: 'Poznámky', type: 'textarea', placeholder: 'zdravotné obmedzenia, zranenia, preferencie…' },
      ...(c ? [{ name: 'archived', label: 'Archivovať klienta (skryje ho zo zoznamu)', type: 'checkbox' }] : [])
    ],
    onSubmit: (d) => {
      const saved = upsert('clients', c, c ? d : { ...d, archived: false, createdAt: today() });
      if (!c) { save(); go(`#/client/${saved.id}`); }
      toast(c ? 'Klient uložený' : 'Klient pridaný');
    },
    onDelete: c && (() => {
      db.clients = db.clients.filter((x) => x.id !== c.id);
      photoDB.delClients(new Set([c.id])).catch(() => {});
      db.sessions = db.sessions.filter((x) => x.clientId !== c.id);
      db.packages = db.packages.filter((x) => x.clientId !== c.id);
      db.measurements = db.measurements.filter((x) => x.clientId !== c.id);
      db.plans = db.plans.filter((x) => x.clientId !== c.id);
      save();
      go('#/clients');
      toast('Klient vymazaný');
    }),
    deleteConfirm: 'Vymazať klienta vrátane všetkých jeho tréningov, plánov a meraní? Tip: klienta môžeš radšej archivovať.'
  });
}

// 3 najčastejšie časy tréningov (pre rýchlu voľbu vo formulári)
function usualTimes() {
  const count = new Map();
  for (const x of db.sessions) if (/^\d{2}:\d{2}$/.test(x.time || '')) count.set(x.time, (count.get(x.time) || 0) + 1);
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => t);
  return (top.length ? top : ['07:00', '17:00', '18:00']).sort();
}

function openSessionForm(s, defaults = {}) {
  const keep = s?.clientId || defaults.clientId;
  const active = db.clients.filter((c) => !c.archived || c.id === keep).sort(byName);
  if (!active.length) {
    toast('Najprv pridaj klienta');
    openClientForm();
    return;
  }
  const values = s ? { ...s, price: priceOf(s), payMethod: s.paid ? payMethod(s) : '' } : { date: today(), time: '', duration: db.settings.defaultDuration || 60, status: 'planned', price: sessionPrice(), ...defaults };
  const plans = [...db.plans].sort((a, b) => (a.clientId ? 1 : 0) - (b.clientId ? 1 : 0) || byName(a, b));
  openForm({
    title: s ? 'Upraviť tréning' : 'Nový tréning',
    values,
    fields: [
      { name: 'clientId', label: 'Klient', type: 'select', required: true, options: [['', '— vyber klienta —'], ...active.map((c) => [c.id, c.name])] },
      { name: 'date', label: 'Dátum', type: 'date', required: true, half: true, chips: [['Dnes', today()], ['Zajtra', addDays(today(), 1)]] },
      { name: 'time', label: 'Čas', type: 'time', half: true, chips: usualTimes().map((x) => [x, x]) },
      { name: 'duration', label: 'Dĺžka (min)', type: 'number', min: 5, step: 5, half: true },
      { name: 'status', label: 'Stav', type: 'select', half: true, options: Object.entries(STATUS) },
      { name: 'price', label: 'Cena (€)', type: 'number', min: 0, step: 0.5, half: true },
      ...(s ? [{ name: 'payMethod', label: 'Platba', type: 'select', half: true, options: [['', 'Nezaplatený'], ['cash', 'Hotovosť'], ['bank', 'Na účet']] }] : []),
      { name: 'planId', label: 'Tréningový plán', type: 'select', options: [['', '— bez plánu —'], ...plans.map((p) => [p.id, p.clientId ? `${p.name} (${clientName(p.clientId)})` : `${p.name} (šablóna)`])] },
      { name: 'notes', label: 'Poznámky z tréningu', type: 'textarea', placeholder: 'čo sa odcvičilo, ako sa klient cítil…' },
      ...(s ? [] : [{ name: 'repeat', label: 'Opakovať každý týždeň', type: 'number', min: 1, default: 1, hint: 'Počet týždňov (1 = len tento jeden tréning)' }])
    ],
    onSubmit: async (d) => {
      const repeat = Math.min(Math.max(Number(d.repeat) || 1, 1), 52);
      if (d.time && d.status !== 'cancelled') {
        const dates = Array.from({ length: s ? 1 : repeat }, (_, i) => addDays(d.date, 7 * i));
        const clash = db.sessions.find((x) => x !== s && x.status !== 'cancelled' && x.time === d.time && dates.includes(x.date));
        if (clash && !(await askConfirm(`V tom čase (${fmtDate(clash.date)} ${clash.time}) už máš tréning s klientom ${clientName(clash.clientId)}.`, { ok: 'Uložiť aj tak' }))) return false;
      }
      if (!s && d.status === 'planned' && d.date < today() && !(await askConfirm(`Dátum ${fmtDate(d.date)} už prešiel.`, { ok: 'Naplánovať aj tak' }))) return false;
      delete d.repeat;
      if (s) {
        if (d.date !== s.date || d.time !== (s.time || '')) delete s.reminded;
        d.paid = !!d.payMethod;
        if (d.paid && !s.paid) d.paidDate = today();
        if (!d.paid) { delete s.paidDate; delete d.payMethod; delete s.payMethod; }
        Object.assign(s, d);
        toast('Tréning uložený');
      } else {
        for (let i = 0; i < repeat; i++) db.sessions.push({ id: uid(), ...d, date: addDays(d.date, 7 * i) });
        toast(repeat > 1 ? `Naplánované: ${nTr(repeat)}` : 'Tréning naplánovaný');
      }
    },
    onDelete: s && (() => { db.sessions = db.sessions.filter((x) => x.id !== s.id); toast('Tréning vymazaný'); })
  });
}

function openPackageForm(p, clientId) {
  openForm({
    title: p ? 'Upraviť balík' : 'Nový balík tréningov',
    values: p || { date: today(), count: 10, price: 10 * sessionPrice() },
    fields: [
      { name: 'count', label: 'Počet tréningov', type: 'number', min: 1, required: true, half: true },
      { name: 'price', label: 'Cena (€)', type: 'number', min: 0, step: 0.01, half: true, hint: `Bežne počet × ${fmtMoney(sessionPrice())}` },
      { name: 'date', label: 'Dátum zakúpenia', type: 'date', required: true },
      { name: 'note', label: 'Poznámka', placeholder: 'napr. zaplatené prevodom' }
    ],
    onSubmit: (d) => { upsert('packages', p, p ? d : { ...d, clientId }); toast('Balík uložený'); },
    onDelete: p && (() => { db.packages = db.packages.filter((x) => x.id !== p.id); })
  });
}

function openMeasurementForm(m, clientId) {
  openForm({
    title: m ? 'Upraviť meranie' : 'Nové meranie',
    values: m || { date: today() },
    fields: [
      { name: 'date', label: 'Dátum', type: 'date', required: true },
      { name: 'weight', label: 'Váha (kg)', type: 'number', step: 0.1, min: 0, half: true },
      { name: 'bodyFat', label: 'Telesný tuk (%)', type: 'number', step: 0.1, min: 0, half: true },
      { name: 'waist', label: 'Obvod pásu (cm)', type: 'number', step: 0.5, min: 0, half: true },
      { name: 'hips', label: 'Obvod bokov (cm)', type: 'number', step: 0.5, min: 0, half: true },
      { name: 'note', label: 'Poznámka' }
    ],
    onSubmit: (d) => { upsert('measurements', m, m ? d : { ...d, clientId }); toast('Meranie uložené'); },
    onDelete: m && (() => { db.measurements = db.measurements.filter((x) => x.id !== m.id); })
  });
}

function clientOptions(emptyLabel) {
  return [['', emptyLabel], ...db.clients.filter((c) => !c.archived).sort(byName).map((c) => [c.id, c.name])];
}

function openPlanForm(p, clientId = '', { template = false } = {}) {
  const templates = db.plans.filter((x) => !x.clientId).sort(byName);
  const isTemplate = template || (p && !p.clientId);
  openForm({
    title: p ? (isTemplate ? 'Upraviť šablónu' : 'Upraviť plán') : (template ? 'Nová šablóna' : 'Nový tréningový plán'),
    values: p || { clientId },
    fields: [
      { name: 'name', label: template ? 'Názov šablóny' : 'Názov plánu', required: true, placeholder: 'napr. Celé telo A, Nohy + core…' },
      ...(template ? [] : [{ name: 'clientId', label: 'Klient', type: 'select', options: clientOptions('— šablóna (bez klienta) —') }]),
      ...(!p && !template && templates.length ? [{ name: 'fromTemplate', label: 'Začať zo šablóny', type: 'select', options: [['', '— prázdny plán —'], ...templates.map((t) => [t.id, `${t.name} (${nEx(t.items.length)})`])], hint: 'Cviky zo šablóny sa skopírujú a môžeš ich potom upraviť' }] : []),
      { name: 'notes', label: 'Popis / poznámky', type: 'textarea' }
    ],
    onSubmit: (d) => {
      if (template) d.clientId = '';
      const src = d.fromTemplate ? getPlan(d.fromTemplate) : null;
      delete d.fromTemplate;
      const items = src ? structuredClone(src.items).map((i) => ({ ...i, id: uid() })) : [];
      if (src && !d.notes) d.notes = src.notes || '';
      const saved = upsert('plans', p, p ? d : { ...d, items });
      if (!p) { save(); go(`#/plan/${saved.id}`); }
      toast('Plán uložený');
    },
    onDelete: p && (() => {
      db.plans = db.plans.filter((x) => x.id !== p.id);
      db.sessions.forEach((s) => { if (s.planId === p.id) s.planId = ''; });
      save();
      go(p.clientId ? `#/client/${p.clientId}` : '#/plans');
      toast('Plán vymazaný');
    })
  });
}

function openItemForm(plan, it) {
  if (!db.exercises.length) { toast('Najprv pridaj cviky do knižnice'); go('#/exercises'); return; }
  const exOptions = [...db.exercises].sort(byName).map((e) => [e.id, e.category ? `${e.name} (${e.category})` : e.name]);
  openForm({
    title: it ? 'Upraviť cvik v pláne' : 'Pridať cvik do plánu',
    values: it || { sets: 3, reps: '10' },
    fields: [
      { name: 'exerciseId', label: 'Cvik', type: 'select', required: true, options: exOptions },
      { name: 'sets', label: 'Série', type: 'number', min: 1, half: true },
      { name: 'reps', label: 'Opakovania / čas', placeholder: '8–12, 30 s…', half: true },
      { name: 'weight', label: 'Záťaž', placeholder: '40 kg, vlastná váha…', half: true },
      { name: 'rest', label: 'Pauza', placeholder: '90 s', half: true },
      { name: 'note', label: 'Poznámka k technike' }
    ],
    onSubmit: (d) => {
      if (it) Object.assign(it, d); else plan.items.push({ id: uid(), ...d });
    },
    onDelete: it && (() => { plan.items = plan.items.filter((x) => x.id !== it.id); }),
    deleteLabel: 'Odobrať z plánu',
    deleteConfirm: 'Odobrať cvik z plánu?'
  });
}

function openExerciseForm(e) {
  const cats = [...new Set(db.exercises.map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'sk'));
  openForm({
    title: e ? 'Upraviť cvik' : 'Nový cvik',
    values: e || {},
    fields: [
      { name: 'name', label: 'Názov', required: true },
      { name: 'category', label: 'Partia / kategória', datalist: cats },
      { name: 'note', label: 'Popis / technika', type: 'textarea' }
    ],
    onSubmit: (d) => { upsert('exercises', e, d); toast('Cvik uložený'); },
    onDelete: e && (async () => {
      const used = db.plans.filter((p) => p.items.some((i) => i.exerciseId === e.id));
      if (used.length) {
        await notify(`Cvik sa používa v plánoch: ${used.map((p) => p.name).join(', ')}. Najprv ho z nich odober.`);
        return false;
      }
      db.exercises = db.exercises.filter((x) => x.id !== e.id);
    })
  });
}

// Zaplatenie: označí tréningy ako zaplatené (vybraným spôsobom) + oslava
function payDue(list, method, el) {
  if (!list.length) return;
  const total = sumPrice(list);
  list.forEach((s) => { s.paid = true; s.paidDate = today(); s.payMethod = method; });
  if (el) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2); }
  save();
  render();
  toast(`Zaplatené ${method === 'bank' ? 'na účet' : 'v hotovosti'}: ${fmtMoney(total)}`);
}

// Panel „Koľko zaplatil?“ – suma po krokoch ceny tréningu (−/+ a rýchle voľby), platia sa najstaršie tréningy
function openPaySheet(clientId, method) {
  const c = getClient(clientId);
  const due = clientDue(clientId); // od najstaršieho
  const sums = due.map((_, i) => sumPrice(due.slice(0, i + 1)));
  let n = due.length;
  let m = method;

  modalForm.innerHTML = `
    <header class="modal-head"><h2>Koľko zaplatil? · ${esc(firstName(c))}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">
      <div class="pay-stepper">
        <button type="button" class="step-btn" data-step="-1" aria-label="Menej">−</button>
        <div class="pay-amount" aria-live="polite"><b id="pay-amt"></b><small id="pay-cnt"></small></div>
        <button type="button" class="step-btn" data-step="1" aria-label="Viac">+</button>
      </div>
      <div class="chips pay-chips">${sums.map((v, i) => `<button type="button" class="chip" data-n="${i + 1}">${fmtMoney(v)}</button>`).join('')}</div>
      <div class="seg" role="radiogroup" aria-label="Spôsob platby">
        <button type="button" class="seg-btn" data-m="cash" role="radio">Hotovosť</button>
        <button type="button" class="seg-btn" data-m="bank" role="radio">Na účet</button>
      </div>
      <p class="hint" id="pay-which" style="margin:0"></p>
    </div>
    <footer class="modal-foot">
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Zrušiť</button>
      <button type="submit" class="btn primary" id="pay-ok"></button>
    </footer>`;

  const $ = (sel) => modalForm.querySelector(sel);
  const update = () => {
    const sum = sums[n - 1];
    $('#pay-amt').textContent = fmtMoney(sum);
    $('#pay-cnt').textContent = `${nTr(n)} z ${due.length} · dlh ${fmtMoney(sums[sums.length - 1])}`;
    $('#pay-which').textContent = `Zaplatia sa: ${due.slice(0, n).map((s) => fmtShort(s.date)).join(', ')}${n < due.length ? ` · ostane ${fmtMoney(sums[sums.length - 1] - sum)}` : ''}`;
    $('#pay-ok').textContent = `Zaplatiť ${fmtMoney(sum)}`;
    $('[data-step="-1"]').disabled = n <= 1;
    $('[data-step="1"]').disabled = n >= due.length;
    modalForm.querySelectorAll('.pay-chips .chip').forEach((x) => x.classList.toggle('active', Number(x.dataset.n) === n));
    modalForm.querySelectorAll('.seg-btn').forEach((x) => { x.classList.toggle('active', x.dataset.m === m); x.setAttribute('aria-checked', x.dataset.m === m); });
  };
  modalForm.querySelectorAll('[data-step]').forEach((b) => { b.onclick = () => { n = Math.min(due.length, Math.max(1, n + Number(b.dataset.step))); update(); }; });
  modalForm.querySelectorAll('.pay-chips .chip').forEach((b) => { b.onclick = () => { n = Number(b.dataset.n); update(); }; });
  modalForm.querySelectorAll('.seg-btn').forEach((b) => { b.onclick = () => { m = b.dataset.m; update(); }; });
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.onsubmit = (e) => {
    e.preventDefault();
    const okBtn = $('#pay-ok');
    const r = okBtn.getBoundingClientRect();
    modal.close();
    payDue(due.slice(0, n), m, null);
    burst(r.left + r.width / 2, r.top + r.height / 2);
  };
  update();
  modal.showModal();
}

// Zápis výkonov z tréningu: pre každý cvik série „kg × opakovania“, porovnanie s minulým tréningom a rekordom
function openLogSheet(s) {
  const c = getClient(s.clientId);
  const plan = s.planId ? getPlan(s.planId) : null;
  const blank = (n) => Array.from({ length: Math.min(Math.max(Number(n) || 3, 1), 10) }, () => ({ w: '', r: '' }));
  const asText = (sets) => sets.map((st) => ({ w: st.w == null ? '' : String(st.w).replace('.', ','), r: st.r == null ? '' : String(st.r) }));
  let rows = s.log ? s.log.map((e) => ({ exerciseId: e.exerciseId, sets: asText(e.sets) }))
    : plan ? plan.items.filter((it) => it.exerciseId).map((it) => ({ exerciseId: it.exerciseId, sets: blank(it.sets) })) : [];
  const exOptions = [...db.exercises].sort(byName);

  modalForm.innerHTML = `
    <header class="modal-head"><h2>Výkony · ${esc(firstName(c || { name: '' }))} · ${fmtShort(s.date)}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body log-body">
      <div id="log-list" class="log-list"></div>
      <select id="log-add" aria-label="Pridať cvik"><option value="">+ Pridať cvik…</option>${exOptions.map((e) => `<option value="${esc(e.id)}">${esc(e.name)}${e.category ? ` (${esc(e.category)})` : ''}</option>`).join('')}</select>
    </div>
    <footer class="modal-foot">
      <span class="spacer"></span>
      <button type="button" class="btn" data-close>Zrušiť</button>
      <button type="submit" class="btn primary">Uložiť</button>
    </footer>`;

  const listEl = modalForm.querySelector('#log-list');
  const draw = () => {
    listEl.innerHTML = rows.length ? rows.map((e, i) => {
      const prev = lastLog(s, e.exerciseId);
      const best = bestBefore(s, e.exerciseId);
      return `<div class="log-ex" data-i="${i}">
        <div class="log-ex-head">
          <strong>${esc(exName(e.exerciseId))}</strong>
          ${prev ? `<button type="button" class="link-btn" data-copy="${i}">Ako minule</button>` : ''}
          <button type="button" class="icon-btn small" data-rm-ex="${i}" aria-label="Odobrať cvik">✕</button>
        </div>
        ${prev || best ? `<p class="log-prev">${prev ? `Minule (${fmtShort(prev.session.date)}): ${prev.sets.map(fmtSet).join(' · ')}` : ''}${best ? `${prev ? '<br>' : ''}🏆 Rekord: ${fmtSet(best.set)}` : ''}</p>` : '<p class="log-prev">Prvý zápis tohto cviku</p>'}
        ${e.sets.map((st, j) => `<div class="log-set">
          <span class="set-n">${j + 1}</span>
          <input type="text" inputmode="decimal" autocomplete="off" data-i="${i}" data-j="${j}" data-f="w" value="${esc(st.w)}" placeholder="kg" aria-label="Séria ${j + 1} – váha (kg)">
          <span class="x">×</span>
          <input type="text" inputmode="numeric" autocomplete="off" data-i="${i}" data-j="${j}" data-f="r" value="${esc(st.r)}" placeholder="opak." aria-label="Séria ${j + 1} – opakovania">
          <button type="button" class="icon-btn small" data-rm-set="${i}:${j}" aria-label="Odobrať sériu" ${e.sets.length < 2 ? 'disabled' : ''}>−</button>
        </div>`).join('')}
        <button type="button" class="btn small add-set" data-add-set="${i}">+ Séria</button>
      </div>`;
    }).join('') : `<p class="empty">${plan ? 'Plán nemá žiadne cviky.' : 'Tréning nemá priradený plán.'} Pridaj cvik zo zoznamu nižšie.</p>`;
  };
  listEl.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.dataset.f) { rows[t.dataset.i].sets[t.dataset.j][t.dataset.f] = t.value; t.setCustomValidity(''); }
  });
  listEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.copy != null) {
      const prev = lastLog(s, rows[d.copy].exerciseId);
      if (prev) rows[d.copy].sets = asText(prev.sets);
    } else if (d.rmEx != null) rows.splice(Number(d.rmEx), 1);
    else if (d.rmSet) { const [i, j] = d.rmSet.split(':').map(Number); if (rows[i].sets.length > 1) rows[i].sets.splice(j, 1); }
    else if (d.addSet != null) { const sets = rows[d.addSet].sets; sets.push({ ...(sets[sets.length - 1] || { w: '', r: '' }) }); }
    else return;
    draw();
  });
  modalForm.querySelector('#log-add').onchange = (ev) => {
    const id = ev.target.value;
    ev.target.value = '';
    if (!id) return;
    const prev = lastLog(s, id);
    rows.push({ exerciseId: id, sets: prev ? asText(prev.sets).map(() => ({ w: '', r: '' })) : blank(3) });
    draw();
    listEl.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.onsubmit = (ev) => {
    ev.preventDefault();
    const parse = (v) => { const t = String(v).trim().replace(/\s/g, '').replace(',', '.'); return t === '' ? null : Number(t); };
    for (const el of listEl.querySelectorAll('input[data-f]')) {
      const n = parse(el.value);
      if (n !== null && !(Number.isFinite(n) && n >= 0)) {
        el.setCustomValidity('Zadaj číslo, napr. 62,5');
        el.reportValidity();
        return;
      }
    }
    const log = rows.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map((st) => ({ w: parse(st.w), r: parse(st.r) })).filter((st) => st.w != null || st.r != null) }))
      .filter((e) => e.sets.length);
    // nové osobné rekordy (oproti všetkým predchádzajúcim tréningom)
    // (pri úprave už zapísaného tréningu len to, čo sa naozaj zlepšilo oproti predošlému zápisu)
    const before = new Map((s.log || []).map((e) => [e.exerciseId, topSet(e.sets)]));
    const records = log.map((e) => ({ e, top: topSet(e.sets), best: bestBefore(s, e.exerciseId), was: before.get(e.exerciseId) }))
      .filter(({ top, best, was }) => best && betterSet(top, best.set) > 0 && (!was || betterSet(top, was) > 0));
    if (log.length) s.log = log; else delete s.log;
    const markDone = log.length && s.status === 'planned' && s.date <= today();
    if (markDone) s.status = 'done';
    const btn = modalForm.querySelector('[type=submit]').getBoundingClientRect();
    modal.close();
    flashId = s.id;
    save();
    render();
    if (records.length) {
      burst(btn.left + btn.width / 2, btn.top + btn.height / 2);
      navigator.vibrate?.([15, 60, 15]);
      toast(`🔥 Nový rekord: ${exName(records[0].e.exerciseId)} ${fmtSet(records[0].top)}${records.length > 1 ? ` (+${records.length - 1})` : ''}`);
    } else {
      toast(log.length ? `Výkony uložené${markDone ? ' · tréning odtrénovaný' : ''}` : 'Výkony vymazané');
    }
  };
  draw();
  modal.showModal();
}

// Profilová fotka klienta – fotka, inak iniciály
const photoOf = (c) => (typeof c.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(c.photo) ? c.photo : '');
const avatar = (c, cls = '') => `<span class="avatar ${cls}">${photoOf(c) ? `<img src="${photoOf(c)}" alt="" decoding="sync">` : esc(initials(c.name))}</span>`;

let photoClientId = null;
function openPhotoSheet(c) {
  modalForm.innerHTML = `
    <header class="modal-head"><h2>Fotka · ${esc(firstName(c))}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">
      <div class="photo-preview">${avatar(c, 'xl')}</div>
      <button type="button" class="btn primary photo-pick">${c.photo ? 'Zmeniť fotku' : 'Vybrať fotku'}</button>
      ${c.photo ? '<button type="button" class="btn danger photo-del">Odstrániť fotku</button>' : ''}
      <p class="hint" style="margin:0">Fotka z WhatsAppu: otvor chat s klientom → ťukni na jeho meno hore → ťukni na profilovú fotku → <b>Zdieľať</b> → <b>Uložiť obrázok</b>. Potom ju tu vyber z galérie.</p>
    </div>`;
  modalForm.onsubmit = (e) => e.preventDefault();
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.querySelector('.photo-pick').onclick = () => { photoClientId = c.id; document.getElementById('photo-file').click(); };
  const del = modalForm.querySelector('.photo-del');
  if (del) del.onclick = () => { delete c.photo; modal.close(); save(); render(); toast('Fotka odstránená'); };
  modal.showModal();
}

// Zmenší fotku na štvorec 192 px (JPEG) – zaberie len pár kB v úložisku
async function photoToDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = 192;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

document.getElementById('photo-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const c = getClient(photoClientId);
  if (!file || !c) return;
  try {
    c.photo = await photoToDataUrl(file);
    modal.close();
    save();
    render();
    toast('Fotka uložená');
  } catch (err) {
    toast('Túto fotku sa nepodarilo načítať');
  }
});

/* =========================================================
   Galéria fotiek klienta (IndexedDB – na rozdiel od localStorage zvládne stovky fotiek)
   ========================================================= */
const photoDB = (() => {
  let conn;
  const open = () => (conn ||= new Promise((resolve, reject) => {
    const r = indexedDB.open('trener-photos', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }).createIndex('clientId', 'clientId');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((resolve, reject) => {
      const t = d.transaction('photos', mode);
      const req = fn(t.objectStore('photos'));
      t.oncomplete = () => resolve(req && 'result' in req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  };
  return {
    byClient: (cid) => tx('readonly', (st) => st.index('clientId').getAll(cid)),
    all: () => tx('readonly', (st) => st.getAll()),
    get: (id) => tx('readonly', (st) => st.get(id)),
    put: (rec) => tx('readwrite', (st) => st.put(rec)),
    del: (id) => tx('readwrite', (st) => st.delete(id)),
    clear: () => tx('readwrite', (st) => st.clear()),
    delClients: async (ids) => {
      const all = await tx('readonly', (st) => st.getAll());
      const ids2 = all.filter((p) => ids.has(p.clientId)).map((p) => p.id);
      if (ids2.length) await tx('readwrite', (st) => { ids2.forEach((id) => st.delete(id)); return null; });
    }
  };
})();

const nPh = (n) => cnt(n, 'fotka', 'fotky', 'fotiek');
const byPhotoDate = (a, b) => b.date.localeCompare(a.date) || b.created - a.created;
const thumbUrls = new Map();
const thumbUrl = (p) => { if (!thumbUrls.has(p.id)) thumbUrls.set(p.id, URL.createObjectURL(p.thumb)); return thumbUrls.get(p.id); };
const dropThumb = (id) => { const u = thumbUrls.get(id); if (u) { URL.revokeObjectURL(u); thumbUrls.delete(id); } };

// Načíta fotku raz a vyrobí z nej plnú verziu aj náhľad (šetrí pamäť pri veľkých fotkách z iPhonu)
async function processPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const full = await resizeImage(img, 1600, false);
    const thumb = await resizeImage(img, 360, true);
    return { full, thumb };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Zmenší obrázok: max. strana `max` px, alebo štvorcový výrez `max`×`max` (náhľad)
async function resizeImage(img, max, square) {
  {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (square) {
      const side = Math.min(iw, ih);
      canvas.width = canvas.height = Math.min(max, side);
      ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
    } else {
      const k = Math.min(1, max / Math.max(iw, ih));
      canvas.width = Math.round(iw * k);
      canvas.height = Math.round(ih * k);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', square ? 0.8 : 0.86));
    canvas.width = canvas.height = 0;   // uvoľniť pamäť plátna hneď
    return blob;
  }
}

async function fillPhotoGrid(cid) {
  const grid = main.querySelector(`#photo-grid[data-client="${cid}"]`);
  if (!grid) return;
  let photos = [];
  try { photos = (await photoDB.byClient(cid)).sort(byPhotoDate); } catch (e) { grid.innerHTML = '<p class="empty">Fotky sa nepodarilo načítať.</p>'; return; }
  if (!grid.isConnected) return;
  const badge = main.querySelector('#photo-count');
  if (badge) { badge.hidden = !photos.length; badge.textContent = photos.length; }
  grid.innerHTML = photos.length
    ? photos.map((p) => `<button class="ph" data-action="view-photo" data-id="${p.id}" data-client="${cid}" aria-label="Fotka ${fmtDate(p.date)}"><img src="${thumbUrl(p)}" alt=""><span>${fmtShort(p.date)}</span></button>`).join('')
    : '<p class="empty">Zatiaľ žiadne fotky – napríklad fotky progresu pred a po.</p>';
}

let galleryClientId = null;
document.getElementById('gallery-file').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  const cid = galleryClientId;
  if (!files.length || !getClient(cid)) return;
  toast(`Spracúvam ${nPh(files.length)}…`);
  let ok = 0;
  for (const file of files) {
    try {
      const { full, thumb } = await processPhoto(file);
      await photoDB.put({ id: uid(), clientId: cid, date: today(), created: Date.now(), full, thumb });
      ok++;
    } catch (err) { /* nepodporovaný formát – preskočiť */ }
  }
  fillPhotoGrid(cid);
  toast(ok === files.length ? `Pridané: ${nPh(ok)}` : `Pridané: ${nPh(ok)}, ${files.length - ok} sa nepodarilo načítať`);
});

// Prehliadač fotiek na celú obrazovku – fotka ide za prstom (ako galéria v iPhone),
// po pustení plynule dokĺzne; potiahnutie nadol zavrie; susedné fotky sú pripravené vopred
let viewerOpening = false;
async function openViewer(cid, startId) {
  if (viewerOpening || document.querySelector('.viewer')) return;
  viewerOpening = true;
  let photos;
  try { photos = (await photoDB.byClient(cid)).sort(byPhotoDate); } finally { viewerOpening = false; }
  if (!photos.length) return;
  let i = Math.max(0, photos.findIndex((p) => p.id === startId));
  const c = getClient(cid);
  const el = document.createElement('div');
  el.className = 'viewer';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="viewer-top">
      <div class="viewer-info"><b>${esc(c?.name || '')}</b><label><input type="date" class="viewer-date" aria-label="Dátum fotky"> · <span class="viewer-count"></span></label></div>
      <button type="button" class="icon-btn viewer-close" aria-label="Zavrieť">✕</button>
    </div>
    <div class="viewer-stage"><div class="viewer-track">
      <div class="viewer-slide"><img alt=""></div><div class="viewer-slide"><img alt=""></div><div class="viewer-slide"><img alt=""></div>
    </div></div>
    <div class="viewer-bar">
      <button type="button" class="icon-btn viewer-prev" aria-label="Predchádzajúca">‹</button>
      <button type="button" class="btn small viewer-share">Zdieľať</button>
      <button type="button" class="btn small danger viewer-del">Vymazať</button>
      <button type="button" class="icon-btn viewer-next" aria-label="Ďalšia">›</button>
    </div>`;
  document.body.appendChild(el);
  const stage = el.querySelector('.viewer-stage');
  const track = el.querySelector('.viewer-track');
  const imgs = [...el.querySelectorAll('.viewer-slide img')];

  // URL plných fotiek len pre aktuálnu a susedné (šetrí pamäť)
  const urls = new Map();
  const urlOf = (p) => { if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.full)); return urls.get(p.id); };
  const prune = () => {
    const keep = new Set([photos[i - 1], photos[i], photos[i + 1]].filter(Boolean).map((p) => p.id));
    urls.forEach((u, id) => { if (!keep.has(id)) { URL.revokeObjectURL(u); urls.delete(id); } });
  };

  const W = () => stage.clientWidth;
  const setX = (x, animate) => {
    track.style.transition = animate ? 'transform .32s cubic-bezier(.2, .8, .2, 1)' : 'none';
    track.style.transform = `translate3d(${x - W()}px, 0, 0)`;
  };
  const show = () => {
    [-1, 0, 1].forEach((k, idx) => {
      const p = photos[i + k];
      imgs[idx].style.visibility = p ? 'visible' : 'hidden';
      if (p) { const u = urlOf(p); if (imgs[idx].getAttribute('src') !== u) imgs[idx].src = u; }
    });
    prune();
    const p = photos[i];
    el.querySelector('.viewer-date').value = p.date;
    el.querySelector('.viewer-count').textContent = `${i + 1} / ${photos.length}`;
    el.querySelector('.viewer-prev').disabled = i === 0;
    el.querySelector('.viewer-next').disabled = i === photos.length - 1;
    setX(0, false);
  };
  let busy = false;
  const go = (d) => {
    const j = i + d;
    if (busy || j < 0 || j >= photos.length) { setX(0, true); return; }
    busy = true;
    setX(-d * W(), true);
    setTimeout(() => { i = j; show(); busy = false; }, reduceMotion.matches ? 0 : 320);
  };

  const close = () => {
    urls.forEach((u) => URL.revokeObjectURL(u));
    el.remove();
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
    fillPhotoGrid(cid);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
  const onResize = () => setX(0, false);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);
  el.querySelector('.viewer-close').onclick = close;
  el.addEventListener('viewer-close', close);
  el.querySelector('.viewer-prev').onclick = () => go(-1);
  el.querySelector('.viewer-next').onclick = () => go(1);
  el.querySelector('.viewer-date').onchange = async (e) => {
    if (!e.target.value) return;
    photos[i].date = e.target.value;
    await photoDB.put(photos[i]);
    toast('Dátum fotky uložený');
  };
  el.querySelector('.viewer-share').onclick = async () => {
    const p = photos[i];
    const file = new File([p.full], `${(c?.name || 'fotka').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}-${p.date}.jpg`, { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
      else { const a = document.createElement('a'); a.href = urlOf(p); a.download = file.name; a.click(); }
    } catch (err) { if (err.name !== 'AbortError') toast('Zdieľanie sa nepodarilo'); }
  };
  el.querySelector('.viewer-del').onclick = async () => {
    if (!(await askConfirm('Vymazať túto fotku?', { ok: 'Vymazať', danger: true }))) return;
    const p = photos[i];
    await photoDB.del(p.id);
    dropThumb(p.id);
    photos.splice(i, 1);
    toast('Fotka vymazaná');
    if (!photos.length) { close(); return; }
    i = Math.min(i, photos.length - 1);
    show();
  };

  // Dotyk: os sa určí podľa prvého pohybu – vodorovne listovanie, zvislo nadol zatvorenie
  let t0 = null;
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || busy) { t0 = null; return; }
    t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null, dx: 0, dy: 0, samples: [{ dx: 0, dy: 0, t: performance.now() }] };
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!t0 || e.touches.length !== 1) return;
    t0.dx = e.touches[0].clientX - t0.x;
    t0.dy = e.touches[0].clientY - t0.y;
    t0.samples.push({ dx: t0.dx, dy: t0.dy, t: performance.now() });
    if (t0.samples.length > 12) t0.samples.shift();
    if (!t0.axis && Math.hypot(t0.dx, t0.dy) > 8) t0.axis = Math.abs(t0.dx) > Math.abs(t0.dy) ? 'x' : 'y';
    if (t0.axis === 'x') {
      const edge = (t0.dx > 0 && i === 0) || (t0.dx < 0 && i === photos.length - 1);
      setX(edge ? t0.dx / 3 : t0.dx, false);              // na kraji odpor ako v iOS
    } else if (t0.axis === 'y' && t0.dy > 0) {
      track.style.transition = 'none';
      track.style.transform = `translate3d(${-W()}px, ${t0.dy}px, 0) scale(${1 - Math.min(t0.dy / 1500, 0.15)})`;
      el.style.backgroundColor = `rgba(0, 0, 0, ${Math.max(0.35, 1 - t0.dy / 400)})`;
    }
  }, { passive: true });
  stage.addEventListener('touchend', () => {
    if (!t0) return;
    const { dx, dy, axis, samples } = t0;
    // rýchlosť len z posledných ~100 ms (ako iOS) – zastavenie pred pustením = pomalé
    const now = performance.now();
    const ref = samples.find((sm) => now - sm.t <= 100) || samples[samples.length - 1];
    const dist = axis === 'x' ? dx - ref.dx : dy - ref.dy;
    const v = Math.abs(dist) / Math.max(16, now - ref.t); // px/ms
    t0 = null;
    if (axis === 'x') {
      if (Math.abs(dx) > W() * 0.4 || (v > 0.45 && Math.abs(dx) > 20)) go(dx < 0 ? 1 : -1);
      else setX(0, true);
    } else if (axis === 'y') {
      if (dy > 140 || (v > 0.6 && dy > 40)) { el.classList.add('closing'); setTimeout(close, 180); }
      else { el.style.backgroundColor = ''; track.style.transition = 'transform .3s cubic-bezier(.2, .8, .2, 1)'; track.style.transform = `translate3d(${-W()}px, 0, 0)`; }
    }
  }, { passive: true });
  show();
}

// Záloha: fotky ako data URL (base64), aby záloha obsahovala všetko
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
const isImageDataUrl = (v) => typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
async function exportPhotos() {
  try {
    const all = await photoDB.all();
    return Promise.all(all.map(async (p) => ({ id: p.id, clientId: p.clientId, date: p.date, created: p.created, full: await blobToDataUrl(p.full), thumb: await blobToDataUrl(p.thumb) })));
  } catch (e) { return []; }
}
async function importPhotos(list) {
  await photoDB.clear();
  thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  thumbUrls.clear();
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || typeof p.id !== 'string' || !isImageDataUrl(p.full) || !isImageDataUrl(p.thumb)) continue;
    const [full, thumb] = await Promise.all([fetch(p.full).then((r) => r.blob()), fetch(p.thumb).then((r) => r.blob())]);
    await photoDB.put({ id: p.id, clientId: String(p.clientId), date: /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : today(), created: Number(p.created) || Date.now(), full, thumb });
  }
}

function reminderTemplate() {
  return db.settings.reminderText || 'Ahoj {meno}, pripomínam tréning {datum} o {cas}. Teším sa!';
}

const firstName = (c) => c.name.split(' ')[0];

function friendlyDate(date) {
  if (date === today()) return 'dnes';
  if (date === addDays(today(), 1)) return 'zajtra';
  return `${DAYS_LONG[weekday(date)].toLowerCase()} ${fmtShort(date)}`;
}

function reminderText(c, s) {
  // tréning bez času: vynechať „o {cas}“, aby nevzniklo „zajtra o .“
  const tpl = s.time ? reminderTemplate() : reminderTemplate().replace(/\s*\bo\s*\{cas\}/gi, '').replace(/\s*\{cas\}/gi, '');
  return tpl
    .replaceAll('{meno}', firstName(c))
    .replaceAll('{datum}', friendlyDate(s.date))
    .replaceAll('{cas}', s.time || '');
}

// Telefón v medzinárodnom tvare bez „+“ (pre WhatsApp); slovenské čísla 09xx → 4219xx
function intlPhone(phone) {
  const p = String(phone || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+')) return p.slice(1).replace(/\D/g, '');
  if (p.startsWith('00')) return p.slice(2);
  if (p.startsWith('0')) return '421' + p.slice(1);
  if (/^9\d{8}$/.test(p)) return '421' + p;   // slovenské číslo bez úvodnej nuly
  return p;
}

// Panel „Kontaktovať klienta“ – WhatsApp, SMS, hovor, e-mail s pripravenou správou
function openContact(c, session, preferred) {
  const t = today();
  const next = session || clientSessions(c.id).filter((x) => x.status === 'planned' && x.date >= t).sort(bySessionTime)[0];
  const cr = credits(c.id);
  const templates = [
    next && ['Pripomienka', reminderText(c, next)],
    next && ['Zrušenie', `Ahoj ${firstName(c)}, žiaľ musím zrušiť tréning ${friendlyDate(next.date)}${next.time ? ' o ' + next.time : ''}. Dohodneme náhradný termín?`],
    PACKAGES && cr.bought && ['Permanentka', cr.left > 0
      ? `Ahoj ${firstName(c)}, na permanentke ti ${cr.left === 1 ? 'zostáva posledný tréning' : `${cr.left <= 4 ? 'zostávajú' : 'zostáva'} ${cr.left} ${cr.left <= 4 ? 'tréningy' : 'tréningov'}`}. Chceš si objednať ďalší balík?`
      : `Ahoj ${firstName(c)}, tvoja permanentka je vyčerpaná. Chceš si objednať ďalší balík?`],
    (() => { const due = clientDue(c.id); return due.length && ['Platba', `Ahoj ${firstName(c)}, posielam prehľad: ${due.length === 1 ? 'nezaplatený je 1 tréning' : `nezaplatené sú ${nTr(due.length)}`} (${due.map((x) => fmtShort(x.date)).join(', ')}), spolu ${fmtMoney(sumPrice(due))}. Ďakujem!`]; })(),
    ['Vlastná', `Ahoj ${firstName(c)}, `]
  ].filter(Boolean);
  const start = Math.max(0, templates.findIndex(([label]) => label === preferred));
  const phone = (c.phone || '').replace(/\s/g, '');
  const wa = intlPhone(c.phone);

  modalForm.innerHTML = `
    <header class="modal-head"><h2>Kontaktovať · ${esc(firstName(c))}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">
      <div class="chips" role="tablist">${templates.map(([label], i) => `<button type="button" class="chip ${i === start ? 'active' : ''}" data-tpl="${i}">${esc(label)}</button>`).join('')}</div>
      <div class="field"><label for="contact-text">Správa</label><textarea id="contact-text" rows="4">${esc(templates[start][1])}</textarea></div>
      <div class="contact-actions">
        ${phone ? `<a class="contact-btn whatsapp" data-channel="wa" target="_blank" rel="noopener">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.4.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>
          WhatsApp</a>
        <a class="contact-btn sms" data-channel="sms">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          SMS</a>
        <a class="contact-btn call" href="tel:${esc(phone)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          Zavolať</a>` : ''}
        ${c.email ? `<a class="contact-btn mail" data-channel="mail">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3z M3 6l9 7 9-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          E-mail</a>` : ''}
      </div>
      ${phone ? `<p class="hint" style="margin:0">${esc(c.phone)}${c.email ? ' · ' + esc(c.email) : ''}</p>` : `<p class="hint" style="margin:0">${esc(c.email)} · pre WhatsApp a SMS doplň klientovi telefón</p>`}
    </div>`;

  const ta = modalForm.querySelector('#contact-text');
  const update = () => {
    const text = encodeURIComponent(ta.value);
    const set = (ch, href) => { const a = modalForm.querySelector(`[data-channel="${ch}"]`); if (a) a.href = href; };
    set('wa', `https://wa.me/${wa}?text=${text}`);
    set('sms', `sms:${phone}?&body=${text}`);
    set('mail', `mailto:${c.email}?body=${text}`);
  };
  ta.addEventListener('input', update);
  modalForm.querySelectorAll('[data-channel]').forEach((a) => a.addEventListener('click', () => {
    const active = modalForm.querySelector('.chip.active');
    if (next && next.status === 'planned' && active && templates[Number(active.dataset.tpl)][0] === 'Pripomienka' && !next.reminded) {
      next.reminded = today();
      save();
      setTimeout(() => { if (!modal.open) render(); }, 400);
    }
  }));
  modalForm.querySelectorAll('[data-tpl]').forEach((chip) => {
    chip.onclick = () => {
      modalForm.querySelectorAll('.chip').forEach((x) => x.classList.toggle('active', x === chip));
      ta.value = templates[Number(chip.dataset.tpl)][1];
      update();
    };
  });
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.onsubmit = (e) => e.preventDefault();
  update();
  modal.showModal();
}

/* =========================================================
   Klientska zóna – zdieľanie dát klienta cez cloud (js/cloud.js)
   ========================================================= */
const CLIENT_ZONE_URL = 'https://koval9720.github.io/Novy-web/app/';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeCode = () => { const a = new Uint8Array(8); crypto.getRandomValues(a); return [...a].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(''); };
const fmtCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;
const shareLink = (code) => `${CLIENT_ZONE_URL}#/k/${code}`;

function shareCard(c) {
  const sh = c.share;
  return `<section class="card" id="sec-share">
    <div class="card-head"><h2>Klientska zóna</h2>${sh ? `<span class="badge ${sh.error ? 'warn' : sh.syncedAt ? 'done' : ''}">${sh.error ? 'Chyba' : sh.syncedAt ? 'Zdieľané' : 'Čaká'}</span>` : ''}</div>
    ${sh ? `<p class="muted" style="margin-top:-6px">Klient vidí svoje tréningy, plán a merania. Prístupový kód:</p>
      <div class="share-code">${fmtCode(sh.code)}</div>
      <div class="row">
        <button class="btn primary" data-action="share-send" data-id="${c.id}">Poslať klientovi</button>
        <button class="btn" data-action="share-copy" data-id="${c.id}">Kopírovať odkaz</button>
        <button class="btn danger" data-action="share-remove" data-id="${c.id}">Zrušiť prístup</button>
      </div>
      <p class="hint" style="margin:10px 0 0">${sh.error ? `Nepodarilo sa odoslať do cloudu (${esc(sh.error)}). Skúsi sa to znova pri ďalšej zmene.` : sh.syncedAt ? `Naposledy odoslané: ${new Date(sh.syncedAt).toLocaleString('sk-SK')}` : 'Dáta sa odošlú, hneď ako bude pripojenie.'}</p>`
    : `<p class="muted" style="margin-top:-6px">Vytvor klientovi prístup – dostane kód, s ktorým si v klientskej zóne pozrie svoje tréningy, plán a progres.</p>
      <button class="btn primary" data-action="share-create" data-id="${c.id}">Vytvoriť prístup</button>`}
  </section>`;
}

function createShare(cid) {
  const c = getClient(cid);
  if (!c || c.share) return;
  c.share = { code: makeCode(), createdAt: today(), hash: '' };
  db.settings.shareDirty = true;
  save();
  render();
  toast(`Prístup vytvorený · kód ${fmtCode(c.share.code)}`);
}

async function removeShare(cid) {
  const c = getClient(cid);
  if (!c?.share) return;
  if (!(await askConfirm('Zrušiť klientovi prístup do klientskej zóny? Kód prestane fungovať.', { ok: 'Zrušiť prístup', danger: true }))) return;
  const code = c.share.code;
  delete c.share;
  save();
  render();
  toast('Prístup zrušený');
  try { await window.cloud?.unshare(code); } catch (e) { /* dokument už nemusí existovať */ }
}

function shareMessage(c) {
  const name = db.settings.trainerName ? ` od ${db.settings.trainerName}` : '';
  return `Ahoj ${firstName(c)}, tu je tvoja klientska zóna${name}: ${shareLink(c.share.code)}\nPrístupový kód: ${fmtCode(c.share.code)}`;
}

async function copyShare(cid) {
  const c = getClient(cid);
  if (!c?.share) return;
  try { await navigator.clipboard.writeText(shareLink(c.share.code)); toast('Odkaz skopírovaný'); }
  catch (e) { await notify(`Odkaz pre klienta:\n${shareLink(c.share.code)}`); }
}

function sendShare(cid) {
  const c = getClient(cid);
  if (!c?.share) return;
  const text = shareMessage(c);
  if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
  const phone = intlPhone(c.phone);
  if (phone) { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank'); return; }
  copyShare(cid);
}

// Čo klient vidí: jeho tréningy (bez cien a poznámok trénera), plány a cviky, ktoré používa, merania
function shareSnapshot(c) {
  const sessions = clientSessions(c.id).map((s) => ({
    id: s.id, date: s.date, time: s.time || '', status: s.status, duration: s.duration || 60, planId: s.planId || '',
    ...(s.log ? { log: s.log } : {})
  }));
  const planIds = new Set(db.plans.filter((p) => p.clientId === c.id).map((p) => p.id));
  sessions.forEach((s) => { if (s.planId) planIds.add(s.planId); });
  const plans = db.plans.filter((p) => planIds.has(p.id)).map((p) => ({ id: p.id, name: p.name, notes: p.notes || '', items: p.items }));
  const exIds = new Set();
  plans.forEach((p) => p.items.forEach((i) => exIds.add(i.exerciseId)));
  sessions.forEach((s) => (s.log || []).forEach((e) => exIds.add(e.exerciseId)));
  const exercises = db.exercises.filter((e) => exIds.has(e.id)).map((e) => ({ id: e.id, name: e.name, category: e.category || '' }));
  const measurements = db.measurements.filter((m) => m.clientId === c.id).map((m) => ({ id: m.id, date: m.date, weight: m.weight ?? null, bodyFat: m.bodyFat ?? null, waist: m.waist ?? null, hips: m.hips ?? null }));
  return {
    clientId: c.id,
    client: { name: c.name, goal: c.goal || '', since: c.createdAt || '', ...(photoOf(c) ? { photo: photoOf(c) } : {}) },
    trainer: { name: db.settings.trainerName || '', phone: db.settings.trainerPhone || '' },
    sessions, plans, exercises, measurements
  };
}

// Po každom uložení: zdieľaným klientom poslať nový stav, ak sa niečo zmenilo (porovnanie podľa odtlačku)
let syncTimer = 0;
let syncing = false;
function scheduleSync() {
  if (!db.clients.some((c) => c.share)) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(runSync, 1500);
}
async function runSync() {
  if (syncing || !navigator.onLine || !window.cloud) return;
  syncing = true;
  let changed = false;
  try {
    for (const c of db.clients.filter((x) => x.share)) {
      const snap = shareSnapshot(c);
      const str = JSON.stringify(snap);
      const hash = `${str.length}:${simpleHash(str)}`;
      if (!db.settings.shareDirty && c.share.hash === hash && !c.share.error) continue;
      try {
        await window.cloud.share(c.share.code, snap);
        c.share.hash = hash; c.share.syncedAt = Date.now(); delete c.share.error;
      } catch (e) {
        c.share.error = e.code || 'offline';
      }
      changed = true;
    }
    db.settings.shareDirty = false;
  } finally { syncing = false; }
  if (changed) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* ignorovať */ }
    const card = document.getElementById('sec-share');
    const cid = location.hash.match(/^#\/client\/([\w-]+)$/)?.[1];
    if (card && cid && getClient(cid)) card.outerHTML = shareCard(getClient(cid));
    updateCloudBadge();
  }
}
function simpleHash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function updateCloudBadge() {
  const el = document.getElementById('cloud-state');
  if (!el) return;
  const st = window.cloud?.state();
  const txt = !window.cloud ? 'Nedostupné' : !navigator.onLine ? 'Offline' : st?.error ? 'Chyba prihlásenia' : st?.uid ? 'Pripojené' : 'Pripájam…';
  el.textContent = txt;
  el.className = `badge ${txt === 'Pripojené' ? 'done' : txt === 'Pripájam…' ? '' : 'warn'}`;
}
window.addEventListener('cloud-ready', () => { window.cloud.onChange(updateCloudBadge); scheduleSync(); });
window.addEventListener('online', () => { db.settings.shareDirty = true; scheduleSync(); });

/* =========================================================
   Akcie
   ========================================================= */
function setStatus(id, status) {
  const s = getSession(id);
  if (!s) return;
  const prev = s.status;
  s.status = status;
  flashId = id;
  save();
  render();
  const undo = () => { s.status = prev; flashId = id; save(); render(); toast('Vrátené späť'); };
  if (status === 'done') {
    const cr = credits(s.clientId);
    toast(isDue(s) ? `Odtrénované · na zaplatenie ${fmtMoney(priceOf(s))}` : PACKAGES && cr.bought ? `Odtrénované · zostáva ${cr.left} z permanentky` : 'Tréning odtrénovaný', undo);
  } else {
    toast(s.paid ? `Tréning zrušený · platba ${fmtMoney(priceOf(s))} sa už nepočíta do príjmu` : 'Tréning zrušený', undo);
  }
}

function planText(p) {
  const lines = [p.name];
  if (p.clientId) lines.push(`Klient: ${clientName(p.clientId)}`);
  if (p.notes) lines.push(p.notes);
  lines.push('');
  p.items.forEach((it, i) => {
    const l = exerciseLine(it);
    lines.push(`${i + 1}. ${l.name}${l.dose ? ' – ' + l.dose : ''}${l.note ? ` (${l.note})` : ''}`);
  });
  return lines.join('\n');
}

// Plán ako obrázok (PNG) v dizajne aplikácie – na zdieľanie klientovi
function planImageFile(p) {
  const W = 1080;
  const PAD = 72;
  const INNER = W - 2 * PAD;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const C = { bg: '#09090b', card: '#16161a', text: '#f6f6f8', muted: '#8c8c97', soft: '#c9c9d1', pink: '#8fdcd2', ink: '#062522' };
  const items = p.items.map(exerciseLine);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const font = (weight, size) => { ctx.font = `${weight} ${size}px ${FONT}`; };
  const wrap = (text, maxW) => {
    const lines = [];
    let line = '';
    for (const word of String(text).split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  };
  const rrect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Prvý prechod zmeria výšku, druhý kreslí
  const layout = (draw) => {
    let y = PAD;
    const text = (str, x, weight, size, color, lh = 1.2) => {
      font(weight, size);
      if (draw) { ctx.fillStyle = color; ctx.fillText(str, x, y + size * 0.85); }
      y += size * lh;
    };
    const block = (str, x, maxW, weight, size, color, lh = 1.2) => {
      font(weight, size);
      wrap(str, maxW).forEach((l) => text(l, x, weight, size, color, lh));
    };

    text('TRÉNINGOVÝ PLÁN', PAD, 800, 28, C.pink, 1.6);
    block(p.name.toUpperCase(), PAD, INNER, 900, 76, C.text, 1.05);
    y += 14;
    if (p.clientId) text(clientName(p.clientId), PAD, 600, 34, C.soft, 1.4);
    if (p.notes) block(p.notes, PAD, INNER, 400, 30, C.muted, 1.35);
    y += 36;

    items.forEach((it, i) => {
      const top = y;
      const x = PAD + 36 + 64 + 28;
      const maxW = W - PAD - 36 - x;
      // zmerať výšku karty
      let h = 36;
      font(800, 40); h += wrap(it.name, maxW).length * 48;
      if (it.dose) { font(600, 32); h += wrap(it.dose, maxW).length * 42 + 4; }
      if (it.note) { font(400, 28); h += wrap(it.note, maxW).length * 38 + 4; }
      h = Math.max(h + 32, 136);
      if (draw) {
        ctx.fillStyle = C.card;
        rrect(PAD, top, INNER, h, 32);
        ctx.fill();
        ctx.fillStyle = C.pink;
        ctx.beginPath();
        ctx.arc(PAD + 36 + 32, top + 36 + 32, 32, 0, Math.PI * 2);
        ctx.fill();
        font(900, 30);
        ctx.fillStyle = C.ink;
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), PAD + 36 + 32, top + 36 + 32 + 11);
        ctx.textAlign = 'left';
      }
      y = top + 36;
      block(it.name, x, maxW, 800, 40, C.text, 1.2);
      if (it.dose) { y += 4; block(it.dose, x, maxW, 600, 32, C.pink, 1.3); }
      if (it.note) { y += 4; block(it.note, x, maxW, 400, 28, C.muted, 1.35); }
      y = top + h + 20;
    });
    if (!items.length) text('Plán zatiaľ neobsahuje žiadne cviky.', PAD, 400, 32, C.muted, 1.4);

    y += 28;
    text(`TRÉNER · ${fmtShort(today())} ${parseDate(today()).getFullYear()}`, PAD, 800, 24, C.muted, 1);
    return y + PAD - 24;
  };

  canvas.width = W;
  canvas.height = Math.ceil(layout(false));
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, canvas.height);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 700);
  glow.addColorStop(0, 'rgba(70, 179, 167, 0.22)');
  glow.addColorStop(1, 'rgba(70, 179, 167, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, canvas.height);
  ctx.textBaseline = 'alphabetic';
  layout(true);

  return canvasFile(canvas, p.name);
}

// Zdieľanie obrázka: iPhone/Android ponuka zdieľania, inak stiahnutie
function shareImage(file, title, fallbackText, downloadedMsg) {
  if (navigator.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title }).catch((e) => { if (e.name !== 'AbortError') toast('Zdieľanie sa nepodarilo'); });
    return;
  }
  if (navigator.share && fallbackText) {
    navigator.share({ text: fallbackText }).catch((e) => { if (e.name !== 'AbortError') toast('Zdieľanie sa nepodarilo'); });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(downloadedMsg);
}

const canvasFile = (canvas, name) => {
  const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'trener';
  return new File([bytes], `${slug}.png`, { type: 'image/png' });
};

// Progres klienta ako obrázok 1080 × 1350 (formát na Instagram / WhatsApp)
function progressImageFile(c, { label, unit, points, extra }) {
  const W = 1080, H = 1350, PAD = 80;
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const font = (w, sz) => { ctx.font = `${w} ${sz}px ${FONT}`; };
  ctx.fillStyle = '#09090b'; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W, 0, 0, W, 0, 900);
  glow.addColorStop(0, 'rgba(70, 179, 167, .26)'); glow.addColorStop(1, 'rgba(70, 179, 167, 0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  const glow2 = ctx.createRadialGradient(0, H, 0, 0, H, 800);
  glow2.addColorStop(0, 'rgba(160, 110, 255, .2)'); glow2.addColorStop(1, 'rgba(160, 110, 255, 0)');
  ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);

  const first = points[0], last = points[points.length - 1];
  const d = Math.round((last.value - first.value) * 100) / 100;
  const days = daysBetween(first.date, last.date);
  ctx.textBaseline = 'alphabetic';
  font(800, 30); ctx.fillStyle = '#8fdcd2'; ctx.fillText('MÔJ PROGRES', PAD, 140);
  font(900, 84); ctx.fillStyle = '#f6f6f8'; ctx.fillText(c.name.length > 18 ? firstName(c) : c.name, PAD, 240);
  font(600, 40); ctx.fillStyle = '#c9c9d1'; ctx.fillText(`${label}${extra ? ' · ' + extra : ''}`, PAD, 305);

  // veľké číslo zmeny
  const grad = ctx.createLinearGradient(PAD, 0, PAD + 700, 0);
  grad.addColorStop(0, '#8fdcd2'); grad.addColorStop(1, '#7fb3d5');
  font(900, 190); ctx.fillStyle = grad;
  const big = `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmtNum(Math.abs(d))}`;
  ctx.fillText(big, PAD - 6, 520);
  const bw = ctx.measureText(big).width;
  font(800, 56); ctx.fillStyle = '#f6f6f8'; ctx.fillText(unit, PAD + bw + 18, 520);
  font(500, 36); ctx.fillStyle = '#8c8c97';
  ctx.fillText(days ? `za ${days < 60 ? cnt(days, 'deň', 'dni', 'dní') : cnt(Math.round(days / 7), 'týždeň', 'týždne', 'týždňov')}` : '', PAD, 580);

  // graf
  const gx = PAD, gy = 680, gw = W - 2 * PAD, gh = 460;
  const xs = points.map((p) => parseDate(p.date).getTime());
  const span = xs[xs.length - 1] - xs[0] || 1;
  let lo = Math.min(...points.map((p) => p.value)), hi = Math.max(...points.map((p) => p.value));
  if (hi === lo) { hi += 1; lo -= 1; }
  const pv = (hi - lo) * 0.2; lo -= pv; hi += pv;
  const X = (i) => gx + 30 + ((xs[i] - xs[0]) / span) * (gw - 60);
  const Y = (v) => gy + ((hi - v) / (hi - lo)) * gh;
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2;
  for (let k = 0; k <= 3; k++) { const y = gy + (gh * k) / 3; ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke(); }
  const path = () => { ctx.beginPath(); points.forEach((p, i) => (i ? ctx.lineTo(X(i), Y(p.value)) : ctx.moveTo(X(i), Y(p.value)))); };
  path(); ctx.lineTo(X(points.length - 1), gy + gh); ctx.lineTo(X(0), gy + gh); ctx.closePath();
  const area = ctx.createLinearGradient(0, gy, 0, gy + gh);
  area.addColorStop(0, 'rgba(70, 179, 167,.35)'); area.addColorStop(1, 'rgba(70, 179, 167,0)');
  ctx.fillStyle = area; ctx.fill();
  path(); ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
  points.forEach((p, i) => {
    const endP = i === 0 || i === points.length - 1;
    ctx.beginPath(); ctx.arc(X(i), Y(p.value), endP ? 16 : 10, 0, Math.PI * 2);
    ctx.fillStyle = endP ? '#ffffff' : '#8fdcd2'; ctx.fill();
  });
  font(800, 38); ctx.fillStyle = '#f6f6f8';
  const lbl = (i, align) => { ctx.textAlign = align; ctx.fillText(fmtNum(points[i].value), X(i), Y(points[i].value) - 34); };
  lbl(0, 'left'); lbl(points.length - 1, 'right');
  font(600, 30); ctx.fillStyle = '#8c8c97';
  ctx.textAlign = 'left'; ctx.fillText(`${fmtShort(first.date)} ${parseDate(first.date).getFullYear()}`, gx, gy + gh + 60);
  ctx.textAlign = 'right'; ctx.fillText(`${fmtShort(last.date)} ${parseDate(last.date).getFullYear()}`, gx + gw, gy + gh + 60);
  ctx.textAlign = 'left';
  font(800, 26); ctx.fillStyle = '#5f5f69'; ctx.fillText('TRÉNER', PAD, H - 60);
  return canvasFile(canvas, `${c.name}-${label}-progres`);
}

async function exportData() {
  const t = today();
  const markBackup = () => { db.settings.lastBackup = t; save(); };
  const photos = await exportPhotos();
  const blob = new Blob([JSON.stringify({ app: 'trener', version: 2, exportedAt: new Date().toISOString(), data: db, photos })], { type: 'application/json' });
  const file = new File([blob], `trener-zaloha-${t}.json`, { type: 'application/json' });
  // iPhone (aplikácia z plochy): zdieľanie → „Uložiť do Súborov“ funguje spoľahlivejšie ako stiahnutie
  if (/iP(hone|ad|od)/.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      markBackup();
      render();
      toast('Záloha pripravená');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      // inak skúsiť klasické stiahnutie nižšie
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trener-zaloha-${t}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  markBackup();
  render();
  toast(photos.length ? `Záloha stiahnutá (vrátane ${cnt(photos.length, 'fotky', 'fotiek', 'fotiek')})` : 'Záloha stiahnutá');
}

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed.data || parsed;
    if (!Array.isArray(data.clients) || !Array.isArray(data.sessions)) throw new Error('format');
    // ID sa vkladajú do stránky a adries – povoliť len bezpečné znaky
    const okId = (x) => x && typeof x.id === 'string' && /^[\w-]{1,64}$/.test(x.id);
    const lists = ['clients', 'sessions', 'packages', 'measurements', 'exercises', 'plans'].map((k) => data[k] || []);
    if (!lists.every((l) => Array.isArray(l) && l.every(okId)) || !(data.plans || []).every((p) => Array.isArray(p.items) && p.items.every(okId))) throw new Error('ids');
    if (!(await askConfirm(`Obnoviť zálohu? Aktuálne dáta budú nahradené (${cnt(data.clients.length, 'klient', 'klienti', 'klientov')}, ${nTr(data.sessions.length)}).`, { ok: 'Obnoviť' }))) return;
    db = normalize(data);
    save();
    if (Array.isArray(parsed.photos)) await importPhotos(parsed.photos);
    go('#/');
    toast('Dáta obnovené zo zálohy');
  } catch (err) {
    notify('Súbor sa nepodarilo načítať. Uisti sa, že ide o zálohu z aplikácie Tréner.');
  }
});

// 20 testovacích klientov s realistickou históriou (pridajú sa k existujúcim dátam)
function addTestClients() {
  const first = ['Adam', 'Barbora', 'Dávid', 'Eva', 'Filip', 'Gabriela', 'Hana', 'Igor', 'Katarína', 'Lukáš', 'Michaela', 'Norbert', 'Oliver', 'Petra', 'Róbert', 'Simona', 'Tomáš', 'Veronika', 'Zuzana', 'Marek'];
  const last = ['Bartoš', 'Čierna', 'Dudáš', 'Fedorová', 'Gajdoš', 'Hudecová', 'Jurčová', 'Kollár', 'Lacková', 'Mikuš', 'Nemcová', 'Oravec', 'Polák', 'Repková', 'Sloboda', 'Šimková', 'Tóth', 'Urbanová', 'Vargová', 'Zelenák'];
  const goals = ['Schudnúť 5 kg', 'Silnejší chrbát', 'Lepšia kondícia', 'Príprava na polmaratón', 'Spevniť zadok a nohy', 'Zbaviť sa bolestí chrbta', 'Nabrať svaly', 'Mobilita a flexibilita', 'Po pôrode – návrat do formy', 'Udržiavanie formy'];
  const notes = ['', '', '', 'Citlivé koleno', 'Bolesti krížov', 'Astma – pozor na intenzitu', 'Po operácii ramena (2024)', 'Ranné tréningy', ''];
  const times = ['06:30', '07:00', '08:00', '09:00', '10:00', '12:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
  let seed = Date.now() % 100000;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const t = today();
  const taken = new Set(db.sessions.filter((x) => x.status !== 'cancelled').map((x) => x.date + x.time));
  const plans = db.plans.filter((p) => !p.clientId);
  for (let i = 0; i < 20; i++) {
    const name = `${first[i]} ${last[i]}`;
    const female = /[aá]$/.test(first[i]) && first[i] !== 'Lukáš';
    const c = {
      id: uid(), name, test: true, archived: false,
      phone: `09${pick(['05', '07', '10', '11', '15', '17', '44', '48'])} ${String(100 + Math.floor(rnd() * 900))} ${String(100 + Math.floor(rnd() * 900))}`,
      email: rnd() < 0.6 ? `${first[i].toLowerCase()}.${last[i].toLowerCase()}@example.com`.normalize('NFD').replace(/[̀-ͯ]/g, '') : '',
      goal: pick(goals), notes: pick(notes), createdAt: addDays(t, -(30 + Math.floor(rnd() * 90)))
    };
    db.clients.push(c);
    const perWeek = 1 + Math.floor(rnd() * 3);              // 1–3 tréningy týždenne
    const days = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, perWeek);
    const time = pick(times);
    const payer = rnd() < 0.5 ? 'cash' : 'bank';
    const plan = plans.length && rnd() < 0.5 ? pick(plans).id : '';
    const start = startOfWeek(addDays(t, -7 * (4 + Math.floor(rnd() * 5))));  // 4–8 týždňov dozadu
    for (let date = start; date <= addDays(t, 14); date = addDays(date, 7)) {
      for (const dd of days) {
        const d = addDays(date, dd);
        if (d < c.createdAt) continue;
        let tm = time;
        for (let k = 0; taken.has(d + tm) && k < times.length; k++) tm = times[(times.indexOf(tm) + 1) % times.length];
        if (taken.has(d + tm)) continue;
        taken.add(d + tm);
        const past = d < t;
        const status = !past ? 'planned' : rnd() < 0.08 ? 'cancelled' : 'done';
        const sess = { id: uid(), clientId: c.id, date: d, time: tm, duration: rnd() < 0.8 ? 60 : 45, status, planId: plan, notes: '', price: sessionPrice() };
        // staršie tréningy väčšinou zaplatené, posledné dni často ešte nie
        if (status === 'done' && (d < addDays(t, -10) ? rnd() < 0.92 : rnd() < 0.35)) {
          const pd = addDays(d, Math.floor(rnd() * 3));
          sess.paid = true; sess.paidDate = pd > t ? t : pd; sess.payMethod = rnd() < 0.8 ? payer : payer === 'cash' ? 'bank' : 'cash';
        }
        db.sessions.push(sess);
      }
    }
    // merania
    const nm = Math.floor(rnd() * 4);
    let w = (female ? 58 : 75) + Math.round(rnd() * 25);
    for (let k = 0; k < nm; k++) {
      db.measurements.push({ id: uid(), clientId: c.id, date: addDays(c.createdAt, k * 21), weight: w, bodyFat: Math.round((female ? 26 : 18) + rnd() * 8 - k), waist: Math.round((female ? 72 : 85) + rnd() * 15 - k), hips: null, note: k === 0 ? 'vstupné meranie' : '' });
      w = Math.round((w - 0.5 - rnd() * 1.5) * 10) / 10;
    }
  }
  save();
  render();
  toast('Pridaných 20 testovacích klientov');
}

async function removeTestClients() {
  const ids = new Set(db.clients.filter((c) => c.test).map((c) => c.id));
  if (!ids.size || !(await askConfirm(`Odstrániť ${cnt(ids.size, 'testovacieho klienta', 'testovacích klientov', 'testovacích klientov')} vrátane ich tréningov a meraní? Tvoji klienti ostanú.`, { ok: 'Odstrániť', danger: true }))) return;
  db.clients = db.clients.filter((c) => !ids.has(c.id));
  photoDB.delClients(ids).catch(() => {});
  db.sessions = db.sessions.filter((x) => !ids.has(x.clientId));
  db.measurements = db.measurements.filter((x) => !ids.has(x.clientId));
  db.plans = db.plans.filter((x) => !ids.has(x.clientId));
  db.packages = db.packages.filter((x) => !ids.has(x.clientId));
  save();
  render();
  toast('Testovací klienti odstránení');
}

async function loadDemo() {
  if (db.clients.length && !(await askConfirm('Ukážkové dáta nahradia všetky aktuálne dáta.', { ok: 'Pokračovať' }))) return;
  const d = freshDb();
  const ex = (name) => d.exercises.find((e) => e.name === name).id;
  const t = today();
  const ws = startOfWeek(t);
  const clients = [
    { id: uid(), name: 'Jana Nováková', phone: '+421 905 123 456', email: 'jana.novakova@example.com', goal: 'Schudnúť 6 kg do leta', notes: 'Citlivé ľavé koleno – opatrne s výpadmi.', createdAt: addDays(t, -70), archived: false },
    { id: uid(), name: 'Peter Horváth', phone: '+421 911 987 654', email: '', goal: 'Silový tréning, drep 120 kg', notes: '', createdAt: addDays(t, -40), archived: false },
    { id: uid(), name: 'Lucia Kováčová', phone: '', email: 'lucia@example.com', goal: 'Zlepšiť kondíciu a držanie tela', notes: 'Sedavé zamestnanie, bolesti krčnej chrbtice.', createdAt: addDays(t, -20), archived: false }
  ];
  clients.push({ id: uid(), name: 'Martin Kráľ', phone: '0903 456 789', email: '', goal: 'Bolesti chrbta, mobilita', notes: 'Platí za jednotlivé tréningy.', createdAt: addDays(t, -45), archived: false });
  const [jana, peter, lucia, martin] = clients;
  d.clients = clients;
  const template = {
    id: uid(), clientId: '', name: 'Celé telo – začiatočník', notes: '2–3× týždenne',
    items: [
      { id: uid(), exerciseId: ex('Drep'), sets: 3, reps: '10–12', weight: 'vlastná váha', rest: '60 s', note: '' },
      { id: uid(), exerciseId: ex('Kliky'), sets: 3, reps: '8–10', weight: '', rest: '60 s', note: 'z kolien podľa potreby' },
      { id: uid(), exerciseId: ex('Veslovanie s činkou'), sets: 3, reps: '10', weight: '8 kg', rest: '60 s', note: '' },
      { id: uid(), exerciseId: ex('Hip thrust'), sets: 3, reps: '12', weight: '20 kg', rest: '60 s', note: '' },
      { id: uid(), exerciseId: ex('Plank'), sets: 3, reps: '30 s', weight: '', rest: '45 s', note: '' }
    ]
  };
  const peterPlan = {
    id: uid(), clientId: peter.id, name: 'Sila – deň A', notes: 'Progresia +2,5 kg týždenne',
    items: [
      { id: uid(), exerciseId: ex('Drep'), sets: 5, reps: '5', weight: '100 kg', rest: '3 min', note: '' },
      { id: uid(), exerciseId: ex('Bench press'), sets: 5, reps: '5', weight: '80 kg', rest: '3 min', note: '' },
      { id: uid(), exerciseId: ex('Príťahy na hrazde'), sets: 4, reps: '6–8', weight: '', rest: '2 min', note: '' }
    ]
  };
  const janaPlan = { ...structuredClone(template), id: uid(), clientId: jana.id, name: 'Jana – celé telo' };
  d.plans = [template, peterPlan, janaPlan];
  d.packages = !PACKAGES ? [] : [
    { id: uid(), clientId: jana.id, date: addDays(t, -60), count: 10, price: 200, note: 'hotovosť' },
    { id: uid(), clientId: jana.id, date: addDays(t, -10), count: 10, price: 200, note: 'prevod' },
    { id: uid(), clientId: peter.id, date: addDays(t, -35), count: 10, price: 200, note: '' },
    { id: uid(), clientId: lucia.id, date: addDays(t, -20), count: 5, price: 100, note: '' }
  ];
  const s = (c, offset, time, status, planId = '') => ({ id: uid(), clientId: c.id, date: addDays(ws, offset), time, duration: 60, status, planId, notes: '' });
  d.sessions = [];
  for (let w = -6; w <= 0; w++) {
    d.sessions.push(s(jana, w * 7, '07:00', 'done', janaPlan.id), s(jana, w * 7 + 3, '07:00', w === -3 ? 'cancelled' : 'done', janaPlan.id));
    if (w >= -4) d.sessions.push(s(peter, w * 7 + 1, '18:00', 'done', peterPlan.id));
  }
  d.sessions.push(s(lucia, -14 + 2, '17:00', 'done'), s(lucia, -7 + 2, '17:00', 'done'));
  for (let w = -6; w <= -1; w++) d.sessions.push(s(martin, w * 7 + 2, '19:00', 'done'));
  // Aktuálny týždeň: všetko, čo je dnes a neskôr, je naplánované
  d.sessions = d.sessions.filter((x) => x.date < t);
  // Platby: staršie tréningy zaplatené (Jana a Lucia na účet, Peter a Martin v hotovosti), posledné ešte nie
  const bankPayers = new Set([jana.id, lucia.id]);
  d.sessions.forEach((x) => {
    if (x.status === 'done' && x.date < addDays(t, x.clientId === martin.id ? -14 : -4)) {
      x.paid = true; x.paidDate = x.date; x.payMethod = bankPayers.has(x.clientId) ? 'bank' : 'cash';
    }
  });
  [[martin, 2, '19:00', ''], [martin, 9, '19:00', ''], [jana, 0, '07:00', janaPlan.id], [peter, 1, '18:00', peterPlan.id], [lucia, 2, '17:00', template.id], [jana, 3, '07:00', janaPlan.id], [peter, 4, '18:00', peterPlan.id], [lucia, 9, '17:00', template.id], [jana, 7, '07:00', janaPlan.id], [jana, 10, '07:00', janaPlan.id]]
    .forEach(([c, off, time, plan]) => { if (addDays(ws, off) >= t) d.sessions.push(s(c, off, time, 'planned', plan)); });
  d.sessions.push({ id: uid(), clientId: jana.id, date: t, time: '19:00', duration: 45, status: 'planned', planId: janaPlan.id, notes: '' });
  // Zapísané výkony – Peter postupne pridáva na drepe a benchi, Jana na hip thruste a veslovaní
  const sets = (n, w, r) => Array.from({ length: n }, () => ({ w, r }));
  d.sessions.filter((x) => x.clientId === peter.id && x.status === 'done').sort((a, b) => a.date.localeCompare(b.date)).forEach((x, i) => {
    x.log = [
      { exerciseId: ex('Drep'), sets: sets(5, 90 + i * 2.5, 5) },
      { exerciseId: ex('Bench press'), sets: sets(5, 70 + i * 2.5, 5) },
      { exerciseId: ex('Príťahy na hrazde'), sets: sets(4, null, 6 + Math.floor(i / 2)) }
    ];
  });
  d.sessions.filter((x) => x.clientId === jana.id && x.status === 'done').sort((a, b) => a.date.localeCompare(b.date)).slice(-6).forEach((x, i) => {
    x.log = [
      { exerciseId: ex('Drep'), sets: sets(3, null, 10 + Math.floor(i / 2)) },
      { exerciseId: ex('Veslovanie s činkou'), sets: sets(3, 8 + Math.floor(i / 2) * 2, 10) },
      { exerciseId: ex('Hip thrust'), sets: sets(3, 20 + i * 5, 12) }
    ];
  });
  d.measurements = [
    { id: uid(), clientId: jana.id, date: addDays(t, -70), weight: 74.5, bodyFat: 31, waist: 86, hips: 104, note: 'vstupné meranie' },
    { id: uid(), clientId: jana.id, date: addDays(t, -42), weight: 72.8, bodyFat: 29.6, waist: 83, hips: 102, note: '' },
    { id: uid(), clientId: jana.id, date: addDays(t, -14), weight: 71.2, bodyFat: 28.4, waist: 80.5, hips: 100, note: '' },
    { id: uid(), clientId: peter.id, date: addDays(t, -40), weight: 86, bodyFat: 18, waist: 90, hips: null, note: '' }
  ];
  d.settings = { lastBackup: t, sessionPrice: 20 };
  db = d;
  save();
  go('#/');
  toast('Ukážkové dáta načítané');
}

const actions = {
  'new-client': () => openClientForm(),
  'edit-client': (d) => openClientForm(getClient(d.id)),
  'new-session': (d) => openSessionForm(null, { date: d.date || today(), clientId: d.client || '' }),
  'edit-session': (d) => openSessionForm(getSession(d.id)),
  'session-done': (d, el) => {
    const r = el.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    navigator.vibrate?.(15);
    setStatus(d.id, 'done');
  },
  'session-cancel': (d) => setStatus(d.id, 'cancelled'),
  'remind': (d) => {
    const s = getSession(d.id);
    const c = getClient(s?.clientId);
    if (c) openContact(c, s);
  },
  'show-history': (d) => { showAllHistory = d.id; render(); },
  'pay-client': (d, el) => {
    const due = clientDue(d.id);
    if (!due.length) return;
    const method = d.method === 'bank' ? 'bank' : 'cash';
    if (due.length === 1) payDue(due, method, el);
    else openPaySheet(d.id, method);
  },
  'remind-pay': (d) => {
    const c = getClient(d.id);
    if (c) openContact(c, null, 'Platba');
  },
  'photo': (d) => { const c = getClient(d.id); if (c) openPhotoSheet(c); },
  'add-photos': (d) => { galleryClientId = d.client; document.getElementById('gallery-file').click(); },
  'view-photo': (d) => { openViewer(d.client, d.id); },
  'contact': (d) => {
    const c = getClient(d.id);
    if (c) openContact(c);
  },
  'new-package': (d) => openPackageForm(null, d.client),
  'edit-package': (d) => openPackageForm(db.packages.find((p) => p.id === d.id)),
  'new-measurement': (d) => openMeasurementForm(null, d.client),
  'edit-measurement': (d) => openMeasurementForm(db.measurements.find((m) => m.id === d.id)),
  'new-plan': (d) => openPlanForm(null, d.client || '', { template: !!d.template }),
  'edit-plan': (d) => openPlanForm(getPlan(d.id)),
  'dup-plan': (d) => {
    const p = getPlan(d.id);
    const assign = !!d.assign;
    if (assign && !db.clients.some((c) => !c.archived)) { toast('Najprv pridaj klienta'); return; }
    openForm({
      title: assign ? 'Priradiť šablónu klientovi' : 'Kopírovať plán',
      submitLabel: assign ? 'Priradiť' : 'Vytvoriť kópiu',
      values: { name: p.clientId ? `${p.name} (kópia)` : p.name, clientId: '' },
      fields: [
        assign
          ? { name: 'clientId', label: 'Klient', type: 'select', required: true, options: clientOptions('— vyber klienta —') }
          : { name: 'clientId', label: 'Pre klienta', type: 'select', options: clientOptions('— uložiť ako šablónu —') },
        { name: 'name', label: 'Názov nového plánu', required: true }
      ],
      onSubmit: (v) => {
        const copy = { ...structuredClone(p), id: uid(), name: v.name, clientId: v.clientId };
        copy.items.forEach((i) => { i.id = uid(); });
        db.plans.push(copy);
        save();
        go(`#/plan/${copy.id}`);
        toast(assign ? `Plán priradený: ${clientName(v.clientId)}` : v.clientId ? 'Plán skopírovaný' : 'Uložené ako šablóna');
      }
    });
  },
  'share-plan': (d) => {
    const p = getPlan(d.id);
    // Obrázok sa generuje synchrónne, aby iOS nestratil „klik“ používateľa pred navigator.share
    try { shareImage(planImageFile(p), p.name, planText(p), 'Obrázok plánu stiahnutý'); } catch (e) { toast('Zdieľanie sa nepodarilo'); }
  },
  'share-progress': (d) => {
    const c = getClient(d.id);
    if (!c) return;
    let data;
    if (d.kind === 'x') {
      const recs = clientRecords(c.id).filter((r) => r.points.length >= 2);
      const r = recs.find((x) => x.exerciseId === chartSel[c.id + ':x']) || recs[0];
      if (r) data = { label: r.name, unit: r.unit, points: r.points, extra: `Rekord: ${fmtSet(r.best)}` };
    } else {
      const ms = db.measurements.filter((m) => m.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date));
      const avail = METRICS.map(([key, label, unit]) => ({ key, label, unit, points: ms.filter((m) => m[key] != null && m[key] !== '').map((m) => ({ date: m.date, value: Number(m[key]) })) })).filter((m) => m.points.length >= 2);
      const m = avail.find((x) => x.key === chartSel[c.id + ':m']) || avail[0];
      if (m) data = { label: m.label, unit: m.unit, points: m.points, extra: cnt(m.points.length, 'meranie', 'merania', 'meraní') };
    }
    if (!data) return;
    try { shareImage(progressImageFile(c, data), `${c.name} – ${data.label}`, '', 'Obrázok progresu stiahnutý'); } catch (e) { toast('Zdieľanie sa nepodarilo'); }
  },
  'chart': (d) => {
    chartSel[d.client + ':' + d.kind] = d.val;
    const c = getClient(d.client);
    const card = document.getElementById(d.kind === 'x' ? 'records-card' : 'measure-card');
    if (c && card) card.outerHTML = d.kind === 'x' ? recordsCard(c) : measureCard(c);
  },
  'jump': (d) => {
    document.getElementById(d.target)?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  },
  'log-session': (d) => { const s = getSession(d.id); if (s) openLogSheet(s); },
  'print': () => window.print(),
  'new-item': (d) => openItemForm(getPlan(d.plan)),
  'edit-item': (d) => { const p = getPlan(d.plan); openItemForm(p, p.items.find((i) => i.id === d.id)); },
  'move-item': (d) => {
    const p = getPlan(d.plan);
    const i = p.items.findIndex((x) => x.id === d.id);
    const j = i + Number(d.dir);
    if (j < 0 || j >= p.items.length) return;
    [p.items[i], p.items[j]] = [p.items[j], p.items[i]];
    // plynulý presun: riadky prekĺznu z pôvodnej polohy na novú (FLIP)
    const rows = () => main.querySelectorAll('.plan-items > li[data-item]');
    const before = new Map([...rows()].map((li) => [li.dataset.item, li.getBoundingClientRect().top]));
    save();
    render();
    if (!reduceMotion.matches) {
      rows().forEach((li) => {
        const dy = (before.get(li.dataset.item) ?? li.getBoundingClientRect().top) - li.getBoundingClientRect().top;
        if (dy) li.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2, .8, .2, 1)' });
      });
    }
  },
  'new-exercise': () => openExerciseForm(),
  'edit-exercise': (d) => openExerciseForm(getExercise(d.id)),
  'edit-defaults': () => openForm({
    title: 'Predvolené hodnoty',
    values: { sessionPrice: sessionPrice(), defaultDuration: db.settings.defaultDuration || 60, reminderText: reminderTemplate(), trainerName: db.settings.trainerName || '', trainerPhone: db.settings.trainerPhone || '' },
    fields: [
      { name: 'sessionPrice', label: 'Cena tréningu (€)', type: 'number', min: 0, step: 0.5, hint: 'Platí pre nové tréningy a tréningy bez vlastnej ceny' },
      { name: 'defaultDuration', label: 'Dĺžka tréningu (min)', type: 'number', min: 5, step: 5 },
      { name: 'reminderText', label: 'Text SMS pripomienky', type: 'textarea', hint: 'Zástupné znaky: {meno}, {datum}, {cas}' },
      { name: 'trainerName', label: 'Tvoje meno (vidia klienti v klientskej zóne)', placeholder: 'napr. Jakub' },
      { name: 'trainerPhone', label: 'Tvoj telefón (tlačidlo „Napísať trénerovi“)', type: 'tel', placeholder: '+421 900 000 000' }
    ],
    onSubmit: (v) => { Object.assign(db.settings, v); db.settings.shareDirty = true; toast('Nastavenia uložené'); }
  }),
  'share-create': (d) => createShare(d.id),
  'share-remove': (d) => removeShare(d.id),
  'share-copy': (d) => copyShare(d.id),
  'share-send': (d) => sendShare(d.id),
  'share-sync': () => { db.settings.shareDirty = true; db.clients.forEach((c) => { if (c.share) c.share.hash = ''; }); save(); toast('Synchronizujem…'); },
  'export': exportData,
  'import': () => document.getElementById('import-file').click(),
  'demo': loadDemo,
  'add-test': addTestClients,
  'remove-test': removeTestClients,
  'wipe': async () => {
    if (!(await askConfirm('Naozaj vymazať VŠETKY dáta? Túto akciu nie je možné vrátiť späť.', { ok: 'Vymazať všetko', danger: true }))) return;
    db = freshDb();
    photoDB.clear().catch(() => {});
    save();
    go('#/');
    toast('Všetky dáta vymazané');
  }
};

document.addEventListener('click', (e) => {
  const rem = e.target.closest('a[data-remind]');
  if (rem) {
    const s = getSession(rem.dataset.remind);
    if (s && !s.reminded) {
      s.reminded = today();
      save();
      // obnoviť kartu až po odchode do WhatsAppu/SMS, nech sa odkaz stihne otvoriť
      setTimeout(() => { const card = document.getElementById('reminders'); if (card) card.outerHTML = remindersCard(); }, 400);
    }
    return;
  }
  const row = e.target.closest('tr[data-href]');
  if (row) { location.hash = row.dataset.href; return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'client-search') {
    const q = fold(e.target.value.trim()).replace(/\s/g, '');
    let visible = 0;
    document.querySelectorAll('#client-list > li').forEach((li) => {
      li.hidden = !!q && !li.dataset.name.replace(/\s/g, '').includes(q);
      if (!li.hidden) visible++;
    });
    const empty = document.getElementById('client-empty');
    if (empty) empty.hidden = visible > 0;
  }
});

// iPhone: zablokovať priblíženie dvoma prstami (Safari inak ignoruje user-scalable=no)
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));

// Kalendár: potiahnutím prstom doľava/doprava ďalší/predchádzajúci týždeň
let swipe = null;
main.addEventListener('touchstart', (e) => {
  if (!e.target.closest('.days') || e.touches.length !== 1) { swipe = null; return; }
  swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
}, { passive: true });
main.addEventListener('touchend', (e) => {
  if (!swipe) return;
  const dx = e.changedTouches[0].clientX - swipe.x;
  const dy = e.changedTouches[0].clientY - swipe.y;
  const fast = Date.now() - swipe.t < 600;
  swipe = null;
  if (!fast || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
  const link = document.querySelector(dx < 0 ? '[aria-label="Nasledujúci týždeň"]' : '[aria-label="Predchádzajúci týždeň"]');
  if (link) location.hash = link.getAttribute('href');
}, { passive: true });

// Ak aplikácia ostala otvorená cez polnoc, po návrate ukáže aktuálny deň
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && today() !== renderedDay && !modal.open) render();
});

// Klávesnica na iPhone: vysúvací panel formulára sa posunie nad ňu
if (window.visualViewport) {
  const kb = () => {
    const h = Math.max(0, window.innerHeight - visualViewport.height - visualViewport.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(h)}px`);
  };
  visualViewport.addEventListener('resize', kb);
  visualViewport.addEventListener('scroll', kb);
}

document.addEventListener('change', (e) => {
  const key = e.target.dataset?.toggle;
  if (key) { db.settings[key] = e.target.checked; save(); render(); }
});

/* =========================================================
   Štart
   ========================================================= */
// Úvodná obrazovka s čiarou → potom zatočenie loga a nabehnutie obsahu
const splash = document.getElementById('splash');
// Fotka pozadia: počkať na jej dekódovanie (max 1,5 s) a potom ju plynule roztmaviť – žiadne „pichnutie“ obrázka do hotovej obrazovky
const bgReady = new Promise((resolve) => {
  const img = new Image();
  img.src = 'icons/bg-gym.jpg';
  const done = () => resolve();
  (img.decode ? img.decode() : Promise.resolve()).then(done, done);
  setTimeout(done, 1500);
}).then(() => document.body.classList.add('bg-ready'));
if (splash) {
  render();
  const wait = reduceMotion.matches ? 0 : Math.max(0, 750 - performance.now());
  // skryť až keď sú načítané štýly aplikácie (najneskôr po 8 s)
  const cssReady = new Promise((resolve) => {
    if (document.documentElement.classList.contains('css-ready')) resolve();
    else { window.addEventListener('cssready', resolve, { once: true }); setTimeout(resolve, 8000); }
  });
  Promise.all([cssReady, bgReady, new Promise((r) => setTimeout(r, wait))]).then(() => {
    splash.classList.add('hide');
    document.body.classList.add('ready');
    if (!reduceMotion.matches) animateEnter();
    setTimeout(() => splash.remove(), 450);
  });
} else {
  render(true);
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      // Po návrate do aplikácie (iPhone ju často len uspí) skontrolovať novú verziu
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    }).catch(() => {});
  });
}
// Požiadať prehliadač, aby dáta nemazal pri nedostatku miesta
navigator.storage?.persist?.().catch(() => {});
