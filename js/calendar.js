'use strict';

/* =========================================================
   Kalendár ako v Google – týždeň s časovou osou.
   Tréningy sú bloky podľa času a dĺžky; presun ťahaním (na mobile podržať),
   zmena dĺžky za spodný okraj, ťuknutie do prázdna = nový tréning,
   čiara aktuálneho času, pracovné hodiny, žiadosti klientov.
   ========================================================= */
const CAL_MODE_KEY = 'trener-cal-mode';
const HOUR_PX = 56;
const SNAP = 15;
let calMode = 'grid';
try { calMode = localStorage.getItem(CAL_MODE_KEY) || 'grid'; } catch (e) { /* ok */ }
const calScroll = new Map(); // týždeň → { top, left } (pozícia sa drží aj pri prekreslení)
let calDrag = null;
let calSuppressClick = false;

const toMin = (t) => (/^\d{1,2}:\d{2}$/.test(t || '') ? Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]) : null);
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const durOf = (s) => Math.max(15, Number(s.duration) || 60);
const DAY_KEYS = ['1', '2', '3', '4', '5', '6', '0'];
const CAL_DAYS = ['Po', 'Ut', 'St', 'Št', 'Pi', 'So', 'Ne'];

const calModeSwitch = () => `<div class="seg cal-mode" role="group" aria-label="Zobrazenie kalendára">
  <button type="button" class="${calMode === 'grid' ? 'active' : ''}" data-cal-mode="grid">Týždeň</button>
  <button type="button" class="${calMode === 'list' ? 'active' : ''}" data-cal-mode="list">Zoznam</button>
</div>`;

// rozloženie prekrývajúcich sa tréningov do stĺpcov (ako v Google kalendári)
function layoutDay(items) {
  const evs = items.map((x) => ({ ...x })).sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    for (const e of cluster) {
      let i = lanes.findIndex((end) => end <= e.start);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = e.end;
      e.lane = i;
    }
    cluster.forEach((e) => { e.lanes = lanes.length; });
    cluster = [];
  };
  for (const e of evs) {
    if (cluster.length && e.start >= clusterEnd) flush();
    cluster.push(e);
    clusterEnd = Math.max(clusterEnd, e.end);
  }
  flush();
  return evs;
}

function viewCalendarGrid(weekParam) {
  if (calMode === 'list') return calListView(weekParam).replace('<div class="week-nav">', `${calModeSwitch()}<div class="week-nav">`);
  const t = today();
  const ws = startOfWeek(weekParam || t);
  const we = addDays(ws, 6);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const sessions = days.flatMap((d) => idx().sessionsByDate.get(d) || []);
  const reqs = pendingRequests.filter((r) => r.date >= ws && r.date <= we);
  const count = sessions.filter((s) => s.status !== 'cancelled').length;
  // rozsah hodín: aspoň 6–22, rozšíri sa podľa tréningov
  let h0 = 6, h1 = 22;
  for (const s of sessions) { const m = toMin(s.time); if (m != null) { h0 = Math.min(h0, Math.floor(m / 60)); h1 = Math.max(h1, Math.ceil((m + durOf(s)) / 60)); } }
  h1 = Math.min(24, h1);
  const top = (m) => ((m - h0 * 60) / 60) * HOUR_PX;
  const wh = workHours();
  const hasWh = hasWorkHours();
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();

  const cols = days.map((d, i) => {
    const timed = [], untimed = [];
    for (const s of idx().sessionsByDate.get(d) || []) {
      const m = toMin(s.time);
      if (m == null) untimed.push(s); else timed.push({ kind: 's', s, start: m, end: m + durOf(s) });
    }
    for (const r of reqs.filter((x) => x.date === d)) { const m = toMin(r.time); if (m != null) timed.push({ kind: 'r', r, start: m, end: m + (Number(r.duration) || 60) }); }
    const evs = layoutDay(timed).map((e) => {
      const st = { top: top(e.start), h: Math.max(22, ((e.end - e.start) / 60) * HOUR_PX - 2), l: (e.lane / e.lanes) * 100, w: 100 / e.lanes };
      const style = `top:${st.top}px;height:${st.h}px;left:calc(${st.l}% + 2px);width:calc(${st.w}% - 4px)`;
      if (e.kind === 'r') {
        const c = clientByCode(e.r.code);
        return `<button type="button" class="cal-ev req" style="${style}" data-req-code="${esc(e.r.code)}" data-req-id="${esc(e.r.id)}"><b>${esc(e.r.time)}</b><span>${esc(c?.name || e.r.clientName || 'Klient')}</span><small>Žiadosť</small></button>`;
      }
      const s = e.s;
      const plan = s.planId ? getPlan(s.planId) : null;
      const due = s.status === 'done' && isDue(s);
      return `<div class="cal-ev st-${s.status}${due ? ' due' : ''}${s.seriesId ? ' series' : ''}" style="${style}" data-sid="${s.id}" role="button" tabindex="0" aria-label="${esc(clientName(s.clientId))} ${esc(s.time)}">
        <b class="cal-t">${esc(s.time)}–${fromMin(Math.min(24 * 60 - 1, e.end))}</b><span>${esc(clientName(s.clientId))}</span>${plan ? `<small>${esc(plan.name)}</small>` : ''}
        ${s.status !== 'cancelled' ? '<i class="cal-rs" aria-hidden="true"></i>' : ''}
      </div>`;
    }).join('');
    // pozadie mimo pracovných hodín
    let off = '';
    if (hasWh) {
      const ranges = (wh[DAY_KEYS[i]] || []).map(([a, b]) => [toMin(a), toMin(b)]).filter(([a, b]) => a != null && b != null).sort((a, b) => a[0] - b[0]);
      let cur = h0 * 60;
      for (const [a, b] of ranges) { if (a > cur) off += `<i class="cal-off" style="top:${top(cur)}px;height:${top(a) - top(cur)}px"></i>`; cur = Math.max(cur, b); }
      if (cur < h1 * 60) off += `<i class="cal-off" style="top:${top(cur)}px;height:${top(h1 * 60) - top(cur)}px"></i>`;
    }
    const now = d === t && nowM >= h0 * 60 && nowM <= h1 * 60 ? `<i class="cal-now" style="top:${top(nowM)}px"></i>` : '';
    const self = selfOnDate(d);
    const allDay = [...untimed.map((s) => `<button type="button" class="cal-chip st-${s.status}" data-action="edit-session" data-id="${s.id}">${esc(firstName(getClient(s.clientId) || { name: '' }))}</button>`),
      ...self.map((s) => `<a class="cal-chip self" href="#/client/${s.clientId}" title="Cvičil/a sám/sama">${esc(firstName(getClient(s.clientId) || { name: '' }))} · sám</a>`)].join('');
    return { d, i, head: `<div class="cal-dh${d === t ? ' today' : ''}"><small>${CAL_DAYS[i]}</small><b>${parseDate(d).getDate()}</b>${allDay ? `<div class="cal-allday">${allDay}</div>` : ''}</div>`, col: `<div class="cal-col${d === t ? ' today' : ''}" data-date="${d}">${off}${now}${evs}</div>` };
  });

  return `
  <div class="page-head cal-page-head">
    <div><h1>Kalendár</h1><p class="muted" style="margin:0">${nTr(count)} v týždni</p></div>
    ${calModeSwitch()}
    <div class="week-nav">
      <a class="icon-btn" href="#/calendar/${addDays(ws, -7)}" aria-label="Predchádzajúci týždeň">‹</a>
      <span class="label">${fmtShort(ws)} – ${fmtShort(we)} ${parseDate(we).getFullYear()}</span>
      <a class="icon-btn" href="#/calendar/${addDays(ws, 7)}" aria-label="Nasledujúci týždeň">›</a>
      ${ws !== startOfWeek(t) ? '<a class="btn small" href="#/calendar">Dnes</a>' : ''}
      <button class="btn small primary cal-add" data-action="new-session" data-date="${ws === startOfWeek(t) ? t : ws}">+ Tréning</button>
    </div>
  </div>
  <p class="cal-hint muted">${matchMedia('(pointer: coarse)').matches ? 'Podrž tréning a potiahni · spodný okraj = dĺžka · ťuk do prázdna = nový' : 'Tréning presuň myšou · spodný okraj = dĺžka · klik do prázdna = nový tréning'}</p>
  <div class="cal-wrap" data-week="${ws}" data-h0="${h0}" data-h1="${h1}">
    <div class="cal-grid" style="--rows:${h1 - h0};--hpx:${HOUR_PX}px">
      <div class="cal-corner"></div>
      ${cols.map((c) => c.head).join('')}
      <div class="cal-times">${Array.from({ length: h1 - h0 }, (_, k) => `<span style="top:${k * HOUR_PX}px">${pad(h0 + k)}:00</span>`).join('')}</div>
      ${cols.map((c) => c.col).join('')}
    </div>
  </div>`;
}

/* ---------- Pozícia posúvania (prvé otvorenie: aktuálny čas a dnešný deň) ---------- */
// výška kalendára: od jeho vrchu po spodné menu (na mobile) / spodok okna (na PC)
function calFit() {
  const wrap = document.querySelector('.cal-wrap');
  if (!wrap) return;
  const nav = document.querySelector('.nav');
  const nr = nav?.getBoundingClientRect();
  const bottom = nr && nr.top > innerHeight / 2 ? innerHeight - nr.top + 12 : 20;
  const top = wrap.getBoundingClientRect().top + window.scrollY;
  wrap.style.height = `${Math.max(320, innerHeight - top - bottom)}px`;
}
addEventListener('resize', () => { clearTimeout(calFit.t); calFit.t = setTimeout(calFit, 100); });

function calRestoreScroll() {
  const wrap = document.querySelector('.cal-wrap');
  if (!wrap) return;
  calFit();
  const ws = wrap.dataset.week, h0 = Number(wrap.dataset.h0);
  const saved = calScroll.get(ws);
  if (saved) { wrap.scrollTop = saved.top; wrap.scrollLeft = saved.left; }
  else {
    const t = today();
    const nowH = new Date().getHours();
    const first = [...wrap.querySelectorAll('.cal-ev')].reduce((m, el) => Math.min(m, parseFloat(el.style.top)), Infinity);
    const target = ws === startOfWeek(t) ? Math.max(0, (Math.max(h0, Math.min(nowH - 1, 20)) - h0) * HOUR_PX) : Number.isFinite(first) ? Math.max(0, first - 40) : (8 - h0) * HOUR_PX;
    wrap.scrollTop = target;
    const tc = wrap.querySelector('.cal-col.today');
    if (tc && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = Math.max(0, tc.offsetLeft - wrap.querySelector('.cal-times').offsetWidth);
  }
  wrap.addEventListener('scroll', () => calScroll.set(ws, { top: wrap.scrollTop, left: wrap.scrollLeft }), { passive: true });
}

/* ---------- Ťahanie: presun a zmena dĺžky ---------- */
function calPoint(e, wrap) {
  // stĺpec dňa pod prstom/myšou a minúty od začiatku osi
  const cols = [...wrap.querySelectorAll('.cal-col')];
  let col = cols.find((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; });
  if (!col) col = e.clientX < cols[0].getBoundingClientRect().left ? cols[0] : cols[cols.length - 1];
  const r = col.getBoundingClientRect();
  const h0 = Number(wrap.dataset.h0);
  return { col, min: h0 * 60 + ((e.clientY - r.top) / HOUR_PX) * 60 };
}
const snap = (m) => Math.round(m / SNAP) * SNAP;

document.addEventListener('pointerdown', (e) => {
  const ev = e.target.closest('.cal-ev[data-sid]');
  if (!ev || e.button > 0 || ev.classList.contains('st-cancelled')) return;
  const wrap = ev.closest('.cal-wrap');
  const s = getSession(ev.dataset.sid);
  if (!s) return;
  const resize = !!e.target.closest('.cal-rs');
  const p = calPoint(e, wrap);
  calDrag = {
    ev, wrap, s, resize, id: e.pointerId, x: e.clientX, y: e.clientY, active: false,
    grab: p.min - toMin(s.time), start: toMin(s.time), dur: durOf(s), date: s.date, h0: Number(wrap.dataset.h0), h1: Number(wrap.dataset.h1)
  };
  // myš a úchyt dĺžky: hneď; prst na bloku: po podržaní (inak sa kalendár normálne posúva)
  if (resize || e.pointerType === 'mouse') calDrag.mouse = true;
  else calDrag.timer = setTimeout(() => calDragStart(), 320);
}, { passive: true });

function calDragStart() {
  if (!calDrag || calDrag.active) return;
  calDrag.active = true;
  calDrag.ev.classList.add('dragging');
  calDrag.wrap.classList.add('dragging');
  navigator.vibrate?.(12);
}

document.addEventListener('pointermove', (e) => {
  const g = calDrag;
  if (!g || e.pointerId !== g.id) return;
  if (!g.active) {
    const moved = Math.hypot(e.clientX - g.x, e.clientY - g.y);
    if (g.mouse && moved > 4) calDragStart();
    else if (!g.mouse && moved > 8) { clearTimeout(g.timer); calDrag = null; } // posúvanie kalendára
    if (!calDrag?.active) return;
  }
  // okraje: kalendár sa pri ťahaní sám posúva
  const wr = g.wrap.getBoundingClientRect();
  if (e.clientY < wr.top + 40) g.wrap.scrollTop -= 12; else if (e.clientY > wr.bottom - 40) g.wrap.scrollTop += 12;
  if (e.clientX < wr.left + 60) g.wrap.scrollLeft -= 10; else if (e.clientX > wr.right - 30) g.wrap.scrollLeft += 10;
  const p = calPoint(e, g.wrap);
  const top = (m) => ((m - g.h0 * 60) / 60) * HOUR_PX;
  if (g.resize) {
    g.dur = Math.max(15, Math.min(g.h1 * 60 - g.start, snap(p.min - g.start)));
  } else {
    g.start = Math.max(g.h0 * 60, Math.min(g.h1 * 60 - SNAP, snap(p.min - g.grab)));
    g.date = p.col.dataset.date;
    if (g.ev.parentElement !== p.col) { p.col.appendChild(g.ev); g.ev.style.left = '2px'; g.ev.style.width = 'calc(100% - 4px)'; }
  }
  g.ev.style.top = `${top(g.start)}px`;
  g.ev.style.height = `${Math.max(22, (g.dur / 60) * HOUR_PX - 2)}px`;
  const tt = g.ev.querySelector('.cal-t');
  if (tt) tt.textContent = `${fromMin(g.start)}–${fromMin(Math.min(24 * 60 - 1, g.start + g.dur))}`;
});

// počas ťahania sa stránka ani kalendár neposúvajú
document.addEventListener('touchmove', (e) => { if (calDrag?.active && e.cancelable) e.preventDefault(); }, { passive: false });

async function calDragEnd(e) {
  const g = calDrag;
  if (!g || (e && e.pointerId !== g.id)) return;
  clearTimeout(g.timer);
  calDrag = null;
  if (!g.active) return;
  calSuppressClick = true;
  setTimeout(() => { calSuppressClick = false; }, 350);
  g.ev.classList.remove('dragging');
  g.wrap.classList.remove('dragging');
  const s = g.s;
  const time = fromMin(g.start);
  const changed = g.resize ? g.dur !== durOf(s) : g.date !== s.date || time !== s.time;
  if (!changed || (e && e.type === 'pointercancel')) { render(); return; }
  const before = db.sessions.map((x) => ({ ...x }));
  let targets = [s];
  const later = s.seriesId ? db.sessions.filter((x) => x !== s && x.seriesId === s.seriesId && x.date > s.date && x.status === 'planned') : [];
  if (later.length) {
    const pick = await askChoice(`Opakovaný tréning – zmeniť len tento, alebo aj ${nTr(later.length)} po ňom?`, [['one', 'Len tento', ''], ['all', 'Tento a nasledujúce', 'primary'], [null, 'Zrušiť', '']]);
    if (!pick) { render(); return; }
    if (pick === 'all') targets = [s, ...later];
  }
  const shift = g.resize ? 0 : Math.round((parseDate(g.date) - parseDate(s.date)) / 86400000);
  for (const x of targets) {
    if (g.resize) x.duration = g.dur;
    else {
      if (x.date !== addDays(x.date, shift) || x.time !== time) delete x.reminded;
      x.date = addDays(x.date, shift);
      x.time = time;
    }
  }
  flashId = s.id;
  save();
  render();
  navigator.vibrate?.(8);
  const undo = () => { db.sessions = before; save(); render(); toast('Vrátené späť'); };
  toast(g.resize ? `Dĺžka: ${g.dur} min${targets.length > 1 ? ` · ${nTr(targets.length)}` : ''}` : `Presunuté na ${CAL_DAYS[weekday(s.date)]} ${fmtShort(s.date)} ${time}${targets.length > 1 ? ` · ${nTr(targets.length)}` : ''}`, undo);
}
document.addEventListener('pointerup', calDragEnd);
document.addEventListener('pointercancel', calDragEnd);

/* ---------- Ťuknutia ---------- */
document.addEventListener('click', async (e) => {
  if (calSuppressClick && e.target.closest('.cal-wrap')) { e.preventDefault(); e.stopPropagation(); return; }
  const mode = e.target.closest('[data-cal-mode]');
  if (mode) {
    calMode = mode.dataset.calMode;
    try { localStorage.setItem(CAL_MODE_KEY, calMode); } catch (x) { /* ok */ }
    render();
    return;
  }
  const req = e.target.closest('.cal-ev.req');
  if (req) {
    const r = pendingRequests.find((x) => x.id === req.dataset.reqId && x.code === req.dataset.reqCode);
    if (!r) return;
    const c = clientByCode(r.code);
    const pick = await askChoice(`Žiadosť o tréning: ${c?.name || r.clientName || 'Klient'} · ${DAYS_LONG[weekday(r.date)]} ${fmtShort(r.date)} o ${r.time}${r.note ? ` · „${r.note}“` : ''}`, [['yes', '✓ Prijať', 'primary'], ['no', 'Odmietnuť', 'danger'], [null, 'Zavrieť', '']]);
    if (pick) actions[pick === 'yes' ? 'req-accept' : 'req-decline']({ code: r.code, id: r.id });
    return;
  }
  const ev = e.target.closest('.cal-ev[data-sid]');
  if (ev) { const s = getSession(ev.dataset.sid); if (s) openSessionForm(s); return; }
  const col = e.target.closest('.cal-col');
  if (col) {
    // prázdne miesto: nový tréning na zaokrúhlený čas (po pol hodine)
    const wrap = col.closest('.cal-wrap');
    const m = Math.floor((Number(wrap.dataset.h0) * 60 + ((e.clientY - col.getBoundingClientRect().top) / HOUR_PX) * 60) / 30) * 30;
    openSessionForm(null, { date: col.dataset.date, time: fromMin(Math.max(0, Math.min(23 * 60 + 30, m))) });
  }
}, true);

// klávesnica: Enter na bloku otvorí tréning
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const ev = e.target.closest?.('.cal-ev[data-sid]');
  if (ev) { const s = getSession(ev.dataset.sid); if (s) openSessionForm(s); }
});

// čiara aktuálneho času sa posúva každú minútu
setInterval(() => {
  const line = document.querySelector('.cal-col.today .cal-now');
  const wrap = document.querySelector('.cal-wrap');
  if (!line || !wrap || calDrag) return;
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  line.style.top = `${((m - Number(wrap.dataset.h0) * 60) / 60) * HOUR_PX}px`;
}, 60000);

/* ---------- Napojenie na appku ---------- */
const calListView = viewCalendar;
const calRoute = routes.find((r) => r[1] === viewCalendar);
if (calRoute) calRoute[1] = viewCalendarGrid;
const renderWithoutCal = render;
render = function (...args) { const r = renderWithoutCal.apply(this, args); calRestoreScroll(); return r; };
if (/^#\/calendar/.test(location.hash)) render();
