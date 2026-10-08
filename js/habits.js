'use strict';

/* =========================================================
   Návyky klientov – kroky, voda, spánok
   Klient si ich denne zapisuje v klientskej zóne (shared/{kód}/habits/{dátum}),
   tréner nastaví ciele a v detaile klienta vidí posledných 7 dní.
   ========================================================= */
const HABITS = [['steps', 'Kroky', ''], ['water', 'Voda', 'l'], ['sleep', 'Spánok', 'h']];
const habitsCache = new Map(); // kód → { at, list }
const fmtHabit = (k, v) => (v == null ? '–' : k === 'steps' ? (v >= 1000 ? `${fmtNum(v / 1000, 1)}k` : String(v)) : fmtNum(v, 2));

async function loadHabits(code, force = false) {
  const c = habitsCache.get(code);
  if (!force && c && Date.now() - c.at < 60 * 1000) return c.list;
  if (!window.cloud?.listHabits || !navigator.onLine) return c?.list || null;
  try {
    const list = (await window.cloud.listHabits(code, addDays(today(), -13)))
      .filter((h) => typeof h.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h.date))
      .map((h) => ({ date: h.date, steps: typeof h.steps === 'number' ? h.steps : null, water: typeof h.water === 'number' ? h.water : null, sleep: typeof h.sleep === 'number' ? h.sleep : null }));
    habitsCache.set(code, { at: Date.now(), list });
    return list;
  } catch (e) { return c?.list || null; }
}

function habitsCardHtml(c, list) {
  const g = habitGoals();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  const by = new Map((list || []).map((h) => [h.date, h]));
  let hit = 0, filled = 0;
  const rows = HABITS.map(([k, label, unit]) => `<tr><th>${label}<small>cieľ ${k === 'steps' ? fmtNum(g.steps, 0) : `${fmtNum(g[k], 1)} ${unit}`}</small></th>${days.map((d) => {
    const v = by.get(d)?.[k];
    if (v == null) return '<td class="hb-empty">·</td>';
    filled++;
    const ok = v >= g[k];
    if (ok) hit++;
    return `<td class="${ok ? 'hb-ok' : 'hb-low'}">${fmtHabit(k, v)}</td>`;
  }).join('')}</tr>`).join('');
  return `<section class="card" id="habits-card">
    <div class="card-head"><h2>Návyky · 7 dní</h2>${list ? `<span class="badge ${filled ? (hit / Math.max(1, filled) >= 0.7 ? 'done' : 'warn') : ''}">${filled ? `${hit}/${filled} splnené` : 'nič nezapísané'}</span>` : ''}</div>
    ${list == null ? '<p class="muted" style="margin:0">Načítavam…</p>' : `<div class="table-wrap"><table class="habits-table">
      <thead><tr><th></th>${days.map((d) => `<th class="${d === today() ? 'today' : ''}">${DAYS[weekday(d)]}<small>${parseDate(d).getDate()}.</small></th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table></div>
      <p class="hint" style="margin:8px 0 0">${esc(firstName(c))} si návyky zapisuje v klientskej zóne · ciele nastavíš v Nastavenia → Návyky klientov</p>`}
  </section>`;
}

async function habitsDecorate() {
  const m = (location.hash || '').match(/^#\/client\/([\w-]+)$/);
  const c = m && getClient(m[1]);
  if (!c?.share || !habitGoals().on || window.DEMO) return;
  const anchor = main.querySelector('#sec-sessions');
  if (!anchor || main.querySelector('#habits-card')) return;
  const code = c.share.code;
  anchor.insertAdjacentHTML('beforebegin', habitsCardHtml(c, habitsCache.get(code)?.list ?? null));
  const list = await loadHabits(code);
  const card = main.querySelector('#habits-card');
  if (card && location.hash === `#/client/${c.id}`) card.outerHTML = habitsCardHtml(c, list || []);
}

/* ---------- Nastavenia → Návyky klientov ---------- */
function habitsSettingsView() {
  const g = habitGoals();
  return `<a class="back-link" href="#/settings">‹ Nastavenia</a><div class="page-head"><h1>Návyky klientov</h1></div>
  <section class="card">
    <div class="card-head"><h2>Denné návyky</h2><span class="badge ${g.on ? 'done' : ''}">${g.on ? 'Zapnuté' : 'Vypnuté'}</span></div>
    <p class="muted" style="margin-top:-6px">Klienti si v klientskej zóne každý deň zapíšu kroky, vodu a spánok. Vidia, či splnili cieľ, a ty v detaile klienta uvidíš ich posledných 7 dní.</p>
    <form id="habits-form" class="habits-form">
      <label class="field"><span>Kroky za deň</span><input name="steps" inputmode="numeric" value="${g.steps}"></label>
      <label class="field"><span>Voda za deň (l)</span><input name="water" inputmode="decimal" value="${String(g.water).replace('.', ',')}"></label>
      <label class="field"><span>Spánok (hodiny)</span><input name="sleep" inputmode="decimal" value="${String(g.sleep).replace('.', ',')}"></label>
      <div class="row" style="margin-top:6px"><button type="submit" class="btn primary">Uložiť ciele</button><button type="button" class="btn" data-action="habits-toggle">${g.on ? 'Vypnúť návyky' : 'Zapnúť návyky'}</button></div>
    </form>
  </section>
  <section class="card">
    <div class="card-head"><h2>Pravidlá cloudu</h2></div>
    <p class="muted" style="margin-top:-6px">Návyky potrebujú jednorazové doplnenie pravidiel vo Firebase (súbor firestore.rules). Ak klientovi zápis nejde uložiť, pravidlá ešte nie sú doplnené.</p>
  </section>`;
}
routes.push([/^#\/settings\/habits$/, habitsSettingsView]);
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'habits-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const num = (k, lo, hi) => { const v = Number(String(f.get(k) || '').replace(',', '.').replace(/\s/g, '')); return Number.isFinite(v) && v >= lo && v <= hi ? v : null; };
  const steps = num('steps', 500, 50000), water = num('water', 0.5, 6), sleep = num('sleep', 4, 12);
  if (steps == null || water == null || sleep == null) { toast('Skontroluj ciele: kroky 500–50 000, voda 0,5–6 l, spánok 4–12 h'); return; }
  db.settings.habits = { ...habitGoals(), steps: Math.round(steps), water: Math.round(water * 10) / 10, sleep: Math.round(sleep * 2) / 2 };
  db.settings.shareDirty = true; save(); render(); toast('Ciele uložené');
});
actions['habits-toggle'] = () => {
  db.settings.habits = { ...habitGoals(), on: !habitGoals().on };
  db.settings.shareDirty = true; save(); render();
  toast(habitGoals().on ? 'Návyky zapnuté' : 'Návyky vypnuté');
};

const renderWithoutHabits = render;
render = function (...args) { const r = renderWithoutHabits.apply(this, args); habitsDecorate(); return r; };
