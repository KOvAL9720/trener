'use strict';

/* =========================================================
   Živý tréning – počas tréningu krok za krokom cez plán:
   zápis sérií naživo, časovač pauzy, návrh váhy (progresívne preťaženie),
   oslava rekordu a zhrnutie na konci. Stav sa ukladá do zariadenia,
   takže tréning prežije aj zatvorenie appky.
   ========================================================= */
const LIVE_KEY = 'trener-live-v1';
let live = null;          // { sid, start, cur, ex: [...], rest: { until, total } | null, summary }
let liveTick = 0;
let wakeLock = null;

try { live = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null'); } catch (e) { live = null; }
const liveSave = () => { try { if (live) localStorage.setItem(LIVE_KEY, JSON.stringify(live)); else localStorage.removeItem(LIVE_KEY); } catch (e) { /* plné úložisko */ } };

/* ---------- Pomocné výpočty ---------- */
// „10–12“ → [10, 12], „8“ → [8, 8], „30 s“ → [30, 30]
function parseReps(v) {
  const m = String(v ?? '').match(/(\d+)\s*(?:[–-]\s*(\d+))?/);
  if (!m) return [null, null];
  const lo = Number(m[1]);
  return [lo, m[2] ? Number(m[2]) : lo];
}
// „20 kg“ → 20, „vlastná váha“ → null
function parseKg(v) {
  const m = String(v ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
// „60 s“, „90s“, „2 min“, „1:30“, „1,5 min“ → sekundy
function parseRest(v) {
  const t = String(v ?? '').trim().replace(',', '.');
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/(\d+(?:\.\d+)?)\s*(min|m\b|')/i);
  if (m) return Math.round(Number(m[1]) * 60);
  m = t.match(/(\d+)/);
  return m ? Number(m[1]) : 90;
}
const fmtClock = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
// čas tréningu bez zastavení a zostávajúca pauza (aj zastavená)
const elapsed = () => ((live.pausedAt || Date.now()) - live.start - (live.pausedMs || 0)) / 1000;
const restLeft = () => (live.rest ? (live.rest.paused != null ? live.rest.paused : live.rest.until - Date.now()) / 1000 : 0);
const restOver = () => live.rest && live.rest.paused == null && live.rest.until <= Date.now();
const REST_PRESETS = [[30, '30 s'], [45, '45 s'], [60, '1 min'], [90, '1:30'], [120, '2 min'], [180, '3 min']];
const restOf = (e) => (e && e.restSec) || parseRest(e?.plan.rest || '90 s');
const restChips = (cur, where) => `<div class="rest-pick${where ? ` ${where}` : ''}" role="group" aria-label="Dĺžka pauzy">${REST_PRESETS.map(([sec, label]) => `<button type="button" class="chip${sec === cur ? ' active' : ''}" data-l="rest-set" data-sec="${sec}">${label}</button>`).join('')}</div>`;
const numOrNull = (v) => { const t = String(v ?? '').trim().replace(/\s/g, '').replace(',', '.'); if (t === '') return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const kgText = (n) => (n == null ? '' : String(Math.round(n * 100) / 100).replace('.', ','));

// krok váhy: nohy/zadok s väčšou váhou po 5 kg, jednoručky po 1 kg, inak 2,5 kg
function weightStep(exerciseId, w) {
  const cat = fold(getExercise(exerciseId)?.category);
  if ((cat === 'nohy' || cat === 'zadok') && (w ?? 0) >= 40) return 5;
  if ((w ?? 0) > 0 && w < 10) return 1;
  return 2.5;
}

// Návrh na dnes podľa posledného tréningu a plánu (progresívne preťaženie)
function suggestFor(s, item) {
  const [lo, hi] = parseReps(item.reps);
  const timed = /\d\s*s\b|sek/i.test(String(item.reps || ''));
  const prev = lastLog(s, item.exerciseId);
  const planW = parseKg(item.weight);
  if (!prev || !prev.sets.length) {
    return { w: planW, r: timed ? lo : (lo ?? null), why: planW != null ? `Podľa plánu ${kgText(planW)} kg` : '' };
  }
  const top = topSet(prev.sets);
  const w = top.w || null;
  if (!w) { // vlastná váha – o opakovanie viac
    const best = Math.max(...prev.sets.map((x) => x.r ?? 0));
    const r = best + (timed ? 5 : 1);
    return { w: null, r, why: `Minule ${best}${timed ? ' s' : ' opak.'} → skús ${r}${timed ? ' s' : ''}` };
  }
  const atW = prev.sets.filter((x) => x.w === w);
  const minR = Math.min(...atW.map((x) => x.r ?? 0));
  if (hi != null && atW.length && minR >= hi) {
    const inc = weightStep(item.exerciseId, w);
    return { w: w + inc, r: lo, why: `Minule ${fmtSet(top)} na maxime → pridaj ${kgText(inc)} kg`, up: true };
  }
  if (lo != null && minR < lo) return { w, r: lo, why: `Udrž ${kgText(w)} kg a doplň opakovania na ${lo}` };
  const r = hi != null ? Math.min(hi, (top.r ?? lo ?? 0) + 1) : (top.r ?? 0) + 1;
  return { w, r, why: `Rovnaká váha, o opakovanie viac (minule ${fmtSet(top)})` };
}

function buildExercise(s, item, logged) {
  const plan = { sets: item.sets || '', reps: item.reps || '', weight: item.weight || '', rest: item.rest || '', note: item.note || '' };
  const sug = suggestFor(s, item);
  const prev = lastLog(s, item.exerciseId);
  const n = Math.min(Math.max(Number(item.sets) || prev?.sets.length || 3, 1), 10);
  const sets = logged
    ? logged.sets.map((st) => ({ w: kgText(st.w), r: st.r == null ? '' : String(st.r), done: true }))
    : Array.from({ length: n }, () => ({ w: kgText(sug.w), r: sug.r == null ? '' : String(sug.r), done: false }));
  return { exerciseId: item.exerciseId, plan, sug, sets };
}

/* ---------- Spustenie ---------- */
async function liveStart(sid) {
  const s = getSession(sid);
  if (!s) return;
  if (live && live.sid !== sid && getSession(live.sid)) {
    const other = getSession(live.sid);
    const ok = await askConfirm(`Práve prebieha tréning s klientom ${clientName(other.clientId)}. Ukončiť ho bez uloženia a začať nový?`, { ok: 'Začať nový' });
    if (!ok) { liveOpen(); return; }
  }
  if (!live || live.sid !== sid) {
    const plan = s.planId ? getPlan(s.planId) : null;
    const logged = new Map((s.log || []).map((e) => [e.exerciseId, e]));
    const items = plan ? plan.items.filter((it) => it.exerciseId && getExercise(it.exerciseId)) : [];
    const ex = items.map((it) => buildExercise(s, it, logged.get(it.exerciseId)));
    // zapísané cviky, ktoré v pláne nie sú
    for (const [id, e] of logged) if (!items.some((it) => it.exerciseId === id)) ex.push(buildExercise(s, { exerciseId: id, sets: e.sets.length }, e));
    live = { sid, start: Date.now(), cur: 0, ex, rest: null, prs: [] };
    liveSave();
  }
  liveOpen();
}

/* ---------- Vykreslenie ---------- */
function liveEl() {
  let el = document.getElementById('live');
  if (!el) {
    el = document.createElement('div');
    el.id = 'live';
    el.className = 'live';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Živý tréning');
    document.body.appendChild(el);
    el.addEventListener('click', liveClick);
    el.addEventListener('input', liveInput);
    el.addEventListener('change', liveChange);
    liveSwipe(el);
    liveRestDrag(el);
  }
  return el;
}

function liveOpen() {
  const s = live && getSession(live.sid);
  if (!s) { live = null; liveSave(); livePill(); return; }
  const el = liveEl();
  el.classList.remove('closing');
  el.hidden = false;
  document.documentElement.classList.add('live-on');
  liveDraw();
  requestAnimationFrame(() => el.classList.add('open'));
  livePill();
  liveTimers();
  keepAwake(true);
}

function liveMinimize() {
  const el = document.getElementById('live');
  if (!el) return;
  el.classList.remove('open');
  el.classList.add('closing');
  document.documentElement.classList.remove('live-on');
  setTimeout(() => { if (el.classList.contains('closing')) el.hidden = true; }, reduceMotion.matches ? 0 : 320);
  keepAwake(false);
  livePill();
}

function liveDraw() {
  const el = liveEl();
  const s = getSession(live.sid);
  const c = getClient(s.clientId);
  if (live.summary) { el.innerHTML = liveSummaryHtml(s, c); return; }
  const total = live.ex.reduce((a, e) => a + e.sets.length, 0);
  const done = live.ex.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  const e = live.ex[live.cur];
  el.innerHTML = `
  <header class="live-head">
    <button type="button" class="icon-btn" data-l="min" aria-label="Zbaliť tréning"><svg class="i" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button>
    <div class="live-title"><b>${esc(c ? c.name : 'Tréning')}</b><small><button type="button" class="live-clock${live.pausedAt ? ' paused' : ''}" data-l="clock-toggle" aria-label="${live.pausedAt ? 'Pustiť čas tréningu' : 'Zastaviť čas tréningu'}"><span class="live-dot"></span><span id="live-clock">${fmtClock(elapsed())}</span>${live.pausedAt ? '<span class="pz">⏸</span>' : ''}</button> · ${done}/${total} sérií</small></div>
    <button type="button" class="btn small primary" data-l="finish">Dokončiť</button>
  </header>
  <div class="live-progress" aria-hidden="true"><i style="width:${total ? Math.round((done / total) * 100) : 0}%"></i></div>
  <nav class="live-tabs" aria-label="Cviky">${live.ex.map((x, i) => {
    const d = x.sets.filter((st) => st.done).length;
    return `<button type="button" class="live-tab${i === live.cur ? ' active' : ''}${d && d === x.sets.length ? ' complete' : ''}" data-l="go" data-i="${i}"><span class="ex-pic">${EXERCISE_ICONS(getExercise(x.exerciseId))}</span><span>${esc(exName(x.exerciseId))}</span><small>${d}/${x.sets.length}</small></button>`;
  }).join('')}
    <label class="live-tab add"><span class="ex-pic">+</span><span>Cvik</span><select data-l="add-ex" aria-label="Pridať cvik"><option value="">+ Pridať cvik…</option>${[...db.exercises].sort(byName).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select></label>
  </nav>
  <main class="live-body">${e ? liveExerciseHtml(s, e) : `<div class="live-empty"><p>Tréning nemá plán.</p><p class="muted">Pridaj prvý cvik tlačidlom <b>+ Cvik</b> hore.</p></div>`}</main>
  <footer class="live-foot">
    <button type="button" class="btn" data-l="prev" ${live.cur <= 0 ? 'disabled' : ''}>‹ Späť</button>
    <span class="live-pos">${live.ex.length ? `${live.cur + 1} / ${live.ex.length}` : ''}</span>
    <button type="button" class="btn ${e && e.sets.every((x) => x.done) ? 'primary' : ''}" data-l="next" ${live.cur >= live.ex.length - 1 ? 'disabled' : ''}>Ďalší cvik ›</button>
  </footer>
  ${liveRestHtml()}`;
  el.querySelector('.live-tab.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  liveFit(el);
}

// obsah sa odsunie nad okno s pauzou a aktuálna séria je vždy na očiach
function liveFit(el) {
  const rest = el.querySelector('.live-rest');
  const foot = el.querySelector('.live-foot');
  el.style.setProperty('--foot-h', `${foot?.offsetHeight || 0}px`);
  el.style.setProperty('--rest-h', rest ? `${rest.offsetHeight - (rest.classList.contains('mini') ? 0 : (foot?.offsetHeight || 0))}px` : '0px');
  const cur = el.querySelector('.lset.cur') || el.querySelector('.lset.done:last-of-type');
  const body = el.querySelector('.live-body');
  if (cur && body && rest) {
    // poloha okna bez jeho nábehovej animácie (transform)
    const r = cur.getBoundingClientRect(), b = body.getBoundingClientRect(), top = el.getBoundingClientRect().top + rest.offsetTop;
    if (r.bottom > top - 8 || r.top < b.top) body.scrollBy({ top: r.bottom - (top - 16), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  }
}

function liveExerciseHtml(s, e) {
  const ex = getExercise(e.exerciseId);
  const prev = lastLog(s, e.exerciseId);
  const best = bestBefore(s, e.exerciseId);
  const dose = [e.plan.sets && e.plan.reps ? `${e.plan.sets} × ${e.plan.reps}` : e.plan.reps, e.plan.weight, e.plan.rest ? `pauza ${e.plan.rest}` : ''].filter(Boolean).join(' · ');
  const firstOpen = e.sets.findIndex((x) => !x.done);
  return `
  <section class="live-ex">
    <div class="live-ex-head">
      <span class="ex-pic big">${EXERCISE_ICONS(ex)}</span>
      <div><h2>${esc(exName(e.exerciseId))}</h2>${dose ? `<p>${esc(dose)}</p>` : ''}</div>
      <button type="button" class="icon-btn small" data-l="rm-ex" aria-label="Odobrať cvik z tréningu">✕</button>
    </div>
    ${e.plan.note ? `<p class="live-note">${esc(e.plan.note)}</p>` : ''}
    ${e.sug.why ? `<p class="live-hint${e.sug.up ? ' up' : ''}"><span aria-hidden="true">${e.sug.up ? '📈' : '💡'}</span> ${esc(e.sug.why)}</p>` : ''}
    <div class="live-meta">${prev ? `<span>Minule (${fmtShort(prev.session.date)}): ${esc(prev.sets.map(fmtSet).join(' · '))}</span>` : '<span>Prvý zápis tohto cviku</span>'}${best ? `<span>🏆 Rekord: ${esc(fmtSet(best.set))}</span>` : ''}</div>
    <div class="rest-row"><span>⏱ Pauza medzi sériami</span>${restChips(restOf(e))}</div>
    <div class="live-sets">
      <div class="lset head" aria-hidden="true"><span>Séria</span><span>kg</span><span>Opakovania</span><span></span></div>
      ${e.sets.map((st, j) => `<div class="lset${st.done ? ' done' : ''}${j === firstOpen ? ' cur' : ''}${st.pr ? ' pr' : ''}">
        <span class="n">${st.pr ? '🏆' : j + 1}</span>
        <div class="stepper"><button type="button" data-l="dec" data-k="w" data-j="${j}" aria-label="Menej kg">−</button><input type="text" inputmode="decimal" autocomplete="off" data-k="w" data-j="${j}" value="${esc(st.w)}" placeholder="–" aria-label="Séria ${j + 1} – kg"><button type="button" data-l="inc" data-k="w" data-j="${j}" aria-label="Viac kg">+</button></div>
        <div class="stepper"><button type="button" data-l="dec" data-k="r" data-j="${j}" aria-label="Menej opakovaní">−</button><input type="text" inputmode="numeric" autocomplete="off" data-k="r" data-j="${j}" value="${esc(st.r)}" placeholder="–" aria-label="Séria ${j + 1} – opakovania"><button type="button" data-l="inc" data-k="r" data-j="${j}" aria-label="Viac opakovaní">+</button></div>
        <button type="button" class="lcheck" data-l="done" data-j="${j}" aria-pressed="${st.done}" aria-label="${st.done ? 'Séria hotová – zrušiť' : 'Označiť sériu ako hotovú'}"><svg class="i" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      </div>`).join('')}
    </div>
    <div class="live-set-btns">
      <button type="button" class="btn small" data-l="add-set">+ Séria</button>
      <button type="button" class="btn small" data-l="rm-set" ${e.sets.length < 2 ? 'disabled' : ''}>− Séria</button>
      ${prev ? '<button type="button" class="btn small" data-l="copy-prev">Ako minule</button>' : ''}
    </div>
  </section>`;
}

function liveRestHtml() {
  // bez pauzy: lišta s časom tréningu – časovač je vidieť hneď od spustenia
  if (!live.rest) {
    const off = !!live.pausedAt;
    const e = live.ex[live.cur];
    return `<div class="live-rest mini idle${off ? ' paused' : ''}">
      <button type="button" class="ring mini-ring" data-l="clock-toggle" aria-label="${off ? 'Pustiť čas tréningu' : 'Zastaviť čas tréningu'}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg spin" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="22 78"/></svg><span class="mini-ic" aria-hidden="true">${off ? '▶' : '⏸'}</span></button>
      <button type="button" class="mini-txt" data-l="clock-toggle" aria-label="${off ? 'Pustiť čas tréningu' : 'Zastaviť čas tréningu'}"><small>${off ? 'Tréning zastavený' : 'Čas tréningu'}</small><b id="live-clock-big">${fmtClock(elapsed())}</b></button>
      ${e ? `<button type="button" class="btn small" data-l="rest-now">⏱ Pauza ${fmtClock(restOf(e))}</button>` : ''}
    </div>`;
  }
  const left = Math.max(0, restLeft());
  const nxt = nextTarget();
  const paused = live.rest.paused != null;
  const off = 100 - (left / live.rest.total) * 100;
  const nextTxt = nxt ? `Ďalej: <b>${esc(exName(nxt.e.exerciseId))}</b> · séria ${nxt.j + 1}${nxt.e.sets[nxt.j].w || nxt.e.sets[nxt.j].r ? ` · ${esc([nxt.e.sets[nxt.j].w && `${nxt.e.sets[nxt.j].w} kg`, nxt.e.sets[nxt.j].r && `× ${nxt.e.sets[nxt.j].r}`].filter(Boolean).join(' '))}` : ''}` : 'Posledná séria hotová 💪';
  const ring = (big) => `<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="52"/><circle class="fg"${big ? ' id="rest-ring"' : ' id="rest-ring-mini"'} cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset="${off}"/></svg>`;
  // zbalená pauza – tenká lišta dole, cvik a série ostávajú celé viditeľné
  if (live.restMin) {
    return `<div class="live-rest mini${paused ? ' paused' : ''}" role="timer" aria-live="polite" data-drag="rest">
      <button type="button" class="ring mini-ring" data-l="rest-toggle" aria-label="${paused ? 'Pustiť odpočet' : 'Zastaviť odpočet'}">${ring(false)}<span class="mini-ic" aria-hidden="true">${paused ? '▶' : '⏸'}</span></button>
      <button type="button" class="mini-txt" data-l="rest-expand" aria-label="Rozbaliť odpočet"><small id="rest-state">${paused ? 'Zastavené' : 'Pauza'}</small><b id="rest-left">${fmtClock(left)}</b></button>
      <button type="button" class="btn small" data-l="rest-plus">+15 s</button>
      <button type="button" class="btn small primary" data-l="rest-skip">Preskočiť</button>
    </div>`;
  }
  return `<div class="live-rest${paused ? ' paused' : ''}" role="timer" aria-live="polite" data-drag="rest">
    <button type="button" class="rest-grab" data-l="rest-collapse" aria-label="Zbaliť odpočet"><span></span></button>
    <div class="rest-main">
      <button type="button" class="ring" data-l="rest-toggle" aria-label="${paused ? 'Pustiť odpočet' : 'Zastaviť odpočet'}">${ring(true)}
        <span class="ring-txt"><small id="rest-state">${paused ? 'Zastavené' : 'Pauza'}</small><b id="rest-left">${fmtClock(left)}</b><span class="ring-hint">${paused ? '▶ pokračovať' : '⏸ zastaviť'}</span></span></button>
      <div class="rest-side">
        <p class="rest-next">${nextTxt}</p>
        <div class="rest-btns"><button type="button" class="btn" data-l="rest-minus">−15 s</button><button type="button" class="btn" data-l="rest-plus">+15 s</button></div>
        <button type="button" class="btn primary rest-skip" data-l="rest-skip">Preskočiť</button>
      </div>
    </div>
    ${restChips(live.rest.total, 'in-rest')}
  </div>`;
}

function nextTarget() {
  for (let i = live.cur; i < live.ex.length; i++) {
    const j = live.ex[i].sets.findIndex((x) => !x.done);
    if (j >= 0) return { e: live.ex[i], i, j };
  }
  for (let i = 0; i < live.cur; i++) {
    const j = live.ex[i].sets.findIndex((x) => !x.done);
    if (j >= 0) return { e: live.ex[i], i, j };
  }
  return null;
}

/* ---------- Plávajúca lišta, keď je tréning zbalený ---------- */
function livePill() {
  // namiesto plávajúcej lišty: tlačidlo ▶ pri rozbehnutom tréningu svieti a ťuknutím sa v ňom pokračuje
  document.getElementById('live-pill')?.remove();
  const sid = live && !live.summary && getSession(live.sid) && !document.getElementById('live')?.classList.contains('open') ? live.sid : null;
  document.querySelectorAll('[data-action="live-start"]').forEach((b) => {
    const on = b.dataset.id === sid;
    b.classList.toggle('on', on);
    b.title = on ? 'Pokračovať v tréningu' : 'Začať živý tréning';
    b.setAttribute('aria-label', b.title);
  });
}
// po každom prekreslení obrazovky znova označiť rozbehnutý tréning
const renderWithoutLive = render;
render = function (...args) { const r = renderWithoutLive.apply(this, args); livePill(); return r; };

/* ---------- Časovače (hodiny tréningu a odpočet pauzy) ---------- */
function liveTimers() {
  clearInterval(liveTick);
  if (!live) return;
  liveTick = setInterval(() => {
    if (!live) { clearInterval(liveTick); return; }
    const clock = document.getElementById('live-clock');
    if (clock) clock.textContent = fmtClock(elapsed());
    const big = document.getElementById('live-clock-big');
    if (big) big.textContent = fmtClock(elapsed());
    const pc = null;
    if (live.rest && live.rest.paused == null) {
      const left = restLeft();
      if (left <= 0) { restDone(); return; }
      const t = document.getElementById('rest-left');
      if (t) t.textContent = fmtClock(left);
      const ring = document.getElementById('rest-ring');
      if (ring) ring.setAttribute('stroke-dashoffset', String(100 - (left / live.rest.total) * 100));
      const mr = document.getElementById('rest-ring-mini');
      if (mr) mr.setAttribute('stroke-dashoffset', String(100 - (left / live.rest.total) * 100));
      if (pc) pc.textContent = `Pauza ${fmtClock(left)}`;
      if (left <= 3.2 && left > 0 && !live.rest.warned) { live.rest.warned = true; beep(2, 660); }
    } else if (pc && !live.rest) pc.textContent = `${live.pausedAt ? '⏸ ' : ''}${fmtClock(elapsed())}`;
  }, 250);
}

function restStart(sec, exIdx = live.cur) {
  live.rest = { until: Date.now() + sec * 1000, total: sec, ex: exIdx };
  liveSave();
}
function restDone(skipped = false) {
  live.rest = null;
  liveSave();
  if (!skipped) { beep(3, 880); navigator.vibrate?.([200, 100, 200]); }
  if (document.getElementById('live')?.classList.contains('open')) liveDraw();
  livePill();
}

// krátke pípnutie (Web Audio – bez súborov)
let audioCtx = null;
function beep(times = 1, freq = 880) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    for (let i = 0; i < times; i++) {
      const t0 = audioCtx.currentTime + i * 0.22;
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + 0.18);
    }
  } catch (e) { /* bez zvuku */ }
}

// obrazovka sa počas tréningu nevypína
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch (e) { wakeLock = null; }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !live) return;
  if (document.getElementById('live')?.classList.contains('open')) keepAwake(true);
  if (restOver()) restDone(true);
  else livePill();
});

/* ---------- Ovládanie ---------- */
function setVal(e, j, k, v) {
  e.sets[j][k] = v;
  const inp = document.querySelector(`#live input[data-k="${k}"][data-j="${j}"]`);
  if (inp) inp.value = v;
}

function liveStep(e, j, k, dir) {
  const st = e.sets[j];
  if (k === 'w') {
    const cur = numOrNull(st.w);
    const base = Number.isNaN(cur) ? 0 : cur ?? (e.sug.w ?? 0);
    const inc = weightStep(e.exerciseId, base || (dir > 0 ? 0 : base));
    const v = Math.max(0, Math.round((base + dir * inc) * 100) / 100);
    setVal(e, j, 'w', v ? kgText(v) : '');
  } else {
    const cur = numOrNull(st.r);
    const base = Number.isNaN(cur) ? 0 : cur ?? (e.sug.r ?? 0);
    setVal(e, j, 'r', String(Math.max(0, base + dir)));
  }
  // nasledujúce nehotové série prevezmú novú hodnotu (ako v appkách na cvičenie)
  for (let x = j + 1; x < e.sets.length; x++) if (!e.sets[x].done) setVal(e, x, k, e.sets[j][k]);
  liveSave();
}

function toggleDone(e, j) {
  const st = e.sets[j];
  if (st.done) { st.done = false; delete st.pr; liveSave(); liveDraw(); return; }
  const w = numOrNull(st.w), r = numOrNull(st.r);
  if (Number.isNaN(w) || Number.isNaN(r)) { toast('Zadaj číslo, napr. 62,5'); return; }
  if (w == null && r == null) { toast('Zadaj váhu alebo opakovania'); return; }
  st.done = true;
  navigator.vibrate?.(12);
  // nový rekord oproti všetkým predchádzajúcim tréningom aj dnešným sériám
  const s = getSession(live.sid);
  const best = bestBefore(s, e.exerciseId);
  const set = { w, r };
  const todayBest = e.sets.filter((x, i) => i !== j && x.done).map((x) => ({ w: numOrNull(x.w), r: numOrNull(x.r) }));
  const beatsToday = todayBest.every((x) => betterSet(set, x) > 0);
  if (best && betterSet(set, best.set) > 0 && beatsToday) {
    e.sets.forEach((x) => delete x.pr);
    st.pr = true;
    if (!live.prs.includes(e.exerciseId)) live.prs.push(e.exerciseId);
    const btn = document.querySelector(`#live .lcheck[data-j="${j}"]`)?.getBoundingClientRect();
    if (btn) burst(btn.left + btn.width / 2, btn.top + btn.height / 2);
    navigator.vibrate?.([15, 60, 15, 60, 30]);
    toast(`🔥 Nový rekord: ${exName(e.exerciseId)} ${fmtSet(set)}`);
  }
  // pauza podľa plánu; po poslednej sérii cviku prejsť na ďalší cvik
  const nxt = nextTarget();
  if (nxt) {
    restStart(restOf(e), live.ex.indexOf(e));
    if (e.sets.every((x) => x.done) && nxt.i !== live.cur) live.cur = nxt.i;
  }
  liveSave();
  liveDraw();
}

function liveClick(ev) {
  const b = ev.target.closest('[data-l]');
  if (!b || b.tagName === 'SELECT') return;
  const d = b.dataset;
  const e = live.ex[live.cur];
  const j = d.j != null ? Number(d.j) : null;
  switch (d.l) {
    case 'min': liveMinimize(); return;
    case 'go': live.cur = Number(d.i); break;
    case 'prev': live.cur = Math.max(0, live.cur - 1); break;
    case 'next': live.cur = Math.min(live.ex.length - 1, live.cur + 1); break;
    case 'inc': case 'dec': liveStep(e, j, d.k, d.l === 'inc' ? 1 : -1); return;
    case 'done': toggleDone(e, j); return;
    case 'add-set': { const last = e.sets[e.sets.length - 1] || { w: '', r: '' }; e.sets.push({ w: last.w, r: last.r, done: false }); break; }
    case 'rm-set': { const k = e.sets.map((x) => x.done).lastIndexOf(false); if (e.sets.length > 1) e.sets.splice(k >= 0 ? k : e.sets.length - 1, 1); break; }
    case 'copy-prev': {
      const prev = lastLog(getSession(live.sid), e.exerciseId);
      if (prev) prev.sets.forEach((st, i) => { if (!e.sets[i]) e.sets.push({ w: '', r: '', done: false }); if (!e.sets[i].done) { e.sets[i].w = kgText(st.w); e.sets[i].r = st.r == null ? '' : String(st.r); } });
      break;
    }
    case 'rm-ex':
      if (e.sets.some((x) => x.done) && !confirm(`Odobrať ${exName(e.exerciseId)} aj so zapísanými sériami?`)) return;
      live.ex.splice(live.cur, 1);
      live.cur = Math.max(0, Math.min(live.cur, live.ex.length - 1));
      break;
    case 'rest-skip': restDone(true); return;
    case 'rest-plus': if (live.rest.paused != null) live.rest.paused += 15000; else live.rest.until += 15000; live.rest.total += 15; break;
    case 'rest-minus':
      if (live.rest.paused != null) live.rest.paused = Math.max(1000, live.rest.paused - 15000);
      else live.rest.until = Math.max(Date.now() + 1000, live.rest.until - 15000);
      break;
    case 'rest-now': if (e) restStart(restOf(e)); break; // pauza spustená ručne
    case 'rest-collapse': live.restMin = true; break;
    case 'rest-expand': live.restMin = false; break;
    case 'rest-toggle': // ťuknutie na odpočet: zastaviť / pustiť
      if (live.rest.paused != null) { live.rest.until = Date.now() + live.rest.paused; delete live.rest.paused; delete live.rest.warned; }
      else live.rest.paused = Math.max(0, live.rest.until - Date.now());
      navigator.vibrate?.(8);
      break;
    case 'rest-set': { // zvolená dĺžka pauzy platí pre tento cvik (aj pre bežiaci odpočet)
      const sec = Number(d.sec);
      const target = live.rest ? live.ex[live.rest.ex] || e : e;
      if (target) target.restSec = sec;
      if (live.rest) { live.rest.total = sec; if (live.rest.paused != null) live.rest.paused = sec * 1000; else live.rest.until = Date.now() + sec * 1000; delete live.rest.warned; }
      break;
    }
    case 'clock-toggle': // zastaviť / pustiť čas celého tréningu
      if (live.pausedAt) { live.pausedMs = (live.pausedMs || 0) + (Date.now() - live.pausedAt); delete live.pausedAt; }
      else live.pausedAt = Date.now();
      navigator.vibrate?.(8);
      break;
    case 'finish': liveFinish(); return;
    case 'back': delete live.summary; break;
    case 'save': liveCommit(); return;
    case 'discard': liveDiscard(); return;
    default: return;
  }
  liveSave();
  liveDraw();
}

function liveInput(ev) {
  const t = ev.target;
  if (!t.dataset.k) return;
  const e = live.ex[live.cur];
  e.sets[Number(t.dataset.j)][t.dataset.k] = t.value;
  liveSave();
}

function liveChange(ev) {
  const t = ev.target;
  if (t.dataset.l !== 'add-ex' || !t.value) return;
  const s = getSession(live.sid);
  const id = t.value;
  const existing = live.ex.findIndex((x) => x.exerciseId === id);
  if (existing >= 0) live.cur = existing;
  else {
    const prev = lastLog(s, id);
    live.ex.push(buildExercise(s, { exerciseId: id, sets: prev?.sets.length || 3 }));
    live.cur = live.ex.length - 1;
  }
  liveSave();
  liveDraw();
}

// potiahnutie prstom doľava/doprava na cviku = ďalší/predchádzajúci cvik
function liveRestDrag(el) {
  let g = null;
  el.addEventListener('touchstart', (e) => {
    const sheet = e.target.closest('[data-drag="rest"]');
    g = sheet && e.touches.length === 1 && !e.target.closest('.rest-pick') ? { y: e.touches[0].clientY, sheet, dy: 0, mini: sheet.classList.contains('mini') } : null;
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    if (!g) return;
    g.dy = e.touches[0].clientY - g.y;
    if (Math.abs(g.dy) < 6) return;
    if (e.cancelable) e.preventDefault();
    g.moved = true;
    const d = g.mini ? Math.min(0, g.dy) * 0.4 : Math.max(0, g.dy);
    g.sheet.style.transition = 'none';
    g.sheet.style.transform = `translateY(${d}px)`;
  }, { passive: false });
  const end = () => {
    if (!g) return;
    const { sheet, dy, mini, moved } = g;
    g = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (!moved || !live?.rest) return;
    if (!mini && dy > 60) { live.restMin = true; liveSave(); liveDraw(); }
    else if (mini && dy < -30) { live.restMin = false; liveSave(); liveDraw(); }
  };
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', end, { passive: true });
}

function liveSwipe(el) {
  let sx = null, sy = 0, st = 0;
  el.addEventListener('touchstart', (e) => {
    sx = e.touches.length === 1 && e.target.closest('.live-body') && !e.target.closest('input, .stepper, .live-rest') ? e.touches[0].clientX : null;
    sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  el.addEventListener('touchend', (e) => {
    if (sx == null || !live || live.summary) return;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Date.now() - st > 600 || Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const to = live.cur + (dx < 0 ? 1 : -1);
    if (to < 0 || to >= live.ex.length) return;
    live.cur = to;
    liveSave();
    liveDraw();
    el.querySelector('.live-ex')?.classList.add(dx < 0 ? 'from-right' : 'from-left');
  }, { passive: true });
}

/* ---------- Koniec tréningu ---------- */
function liveLog() {
  return live.ex.map((e) => ({
    exerciseId: e.exerciseId,
    sets: e.sets.filter((x) => x.done).map((x) => ({ w: numOrNull(x.w), r: numOrNull(x.r) })).map((x) => ({ w: Number.isNaN(x.w) ? null : x.w, r: Number.isNaN(x.r) ? null : x.r }))
  })).filter((e) => e.sets.length);
}
const volumeOf = (log) => log.reduce((a, e) => a + e.sets.reduce((b, st) => b + (st.w || 0) * (st.r || 0), 0), 0);

function liveFinish() {
  const log = liveLog();
  if (!log.length) {
    askConfirm('Zatiaľ nie je odškrtnutá žiadna séria. Ukončiť tréning bez uloženia?', { ok: 'Ukončiť' }).then((ok) => { if (ok) liveDiscard(true); });
    return;
  }
  live.rest = null;
  live.summary = { end: live.pausedAt || Date.now() };
  liveSave();
  liveDraw();
}

function liveSummaryHtml(s, c) {
  const log = liveLog();
  const dur = ((live.summary.end || Date.now()) - live.start - (live.pausedMs || 0)) / 1000;
  const sets = log.reduce((a, e) => a + e.sets.length, 0);
  const vol = volumeOf(log);
  // objem rovnakých cvikov minule
  const prevLog = log.map((e) => { const p = lastLog(s, e.exerciseId); return p ? { exerciseId: e.exerciseId, sets: p.sets } : null; }).filter(Boolean);
  const prevVol = volumeOf(prevLog);
  const diff = prevVol && vol ? Math.round(((vol - prevVol) / prevVol) * 100) : null;
  const prs = live.prs.filter((id) => log.some((e) => e.exerciseId === id));
  return `
  <header class="live-head"><button type="button" class="icon-btn" data-l="back" aria-label="Späť k tréningu"><svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button><div class="live-title"><b>Tréning hotový</b><small>${esc(c ? c.name : '')} · ${fmtDay(s.date)}</small></div><span></span></header>
  <main class="live-body live-summary">
    <div class="sum-hero"><span class="sum-emoji" aria-hidden="true">${prs.length ? '🏆' : '💪'}</span><h2>${prs.length ? (prs.length > 1 ? `${prs.length} nové rekordy!` : 'Nový rekord!') : 'Výborná práca!'}</h2></div>
    <div class="sum-stats">
      <div><b>${fmtClock(dur)}</b><span>čas</span></div>
      <div><b>${sets}</b><span>sérií</span></div>
      <div><b>${!vol ? '–' : vol < 10000 ? `${fmtNum(vol, 0)} kg` : `${fmtNum(vol / 1000, 1)} t`}</b><span>objem${diff != null ? ` <em class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff} %</em>` : ''}</span></div>
    </div>
    <ul class="sum-list">${log.map((e) => `<li><span class="ex-pic">${EXERCISE_ICONS(getExercise(e.exerciseId))}</span><div><b>${esc(exName(e.exerciseId))}${prs.includes(e.exerciseId) ? ' 🏆' : ''}</b><small>${esc(e.sets.map(fmtSet).join(' · '))}</small></div></li>`).join('')}</ul>
  </main>
  <footer class="live-foot sum-foot">
    <button type="button" class="btn danger" data-l="discard">Zahodiť</button>
    <button type="button" class="btn primary" data-l="save">Uložiť tréning</button>
  </footer>`;
}

function liveCommit() {
  const s = getSession(live.sid);
  if (!s) { liveDiscard(true); return; }
  const log = liveLog();
  if (log.length) s.log = log; else delete s.log;
  if (s.status === 'planned' && s.date <= today()) s.status = 'done';
  const prs = live.prs.length;
  live = null;
  liveSave();
  clearInterval(liveTick);
  liveMinimize();
  livePill();
  flashId = s.id;
  save();
  render();
  toast(prs ? `Tréning uložený · 🏆 ${prs > 1 ? `${prs} rekordy` : 'nový rekord'}` : 'Tréning uložený · výkony zapísané');
}

async function liveDiscard(force = false) {
  if (!force && !(await askConfirm('Zahodiť tréning? Zapísané série sa neuložia.', { ok: 'Zahodiť' }))) return;
  live = null;
  liveSave();
  clearInterval(liveTick);
  liveMinimize();
  livePill();
}

/* ---------- Napojenie na appku ---------- */
actions['live-start'] = (d) => liveStart(d.id);
// po štarte appky: rozbehnutý tréning sa ukáže ako lišta „Pokračovať“
if (live) { if (restOver()) live.rest = null; livePill(); liveTimers(); }
