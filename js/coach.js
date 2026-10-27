'use strict';

/* =========================================================
   Lift Tara – osobný tréner v mobile
   Appka pre človeka, ktorý cvičí sám: úvodný dotazník → program na mieru,
   dnešný tréning jedným ťuknutím (živý tréning), knižnica cvikov s technikou
   a progres (rekordy, merania, fotky). Používateľ je v dátach jeden „klient“
   s id „me“, takže živý tréning, rekordy, merania aj cloud fungujú bez zmeny.
   ========================================================= */
const ME = 'me';
const meClient = () => getClient(ME);
const profile = () => db.settings.profile || null;
const programPlans = () => db.plans.filter((p) => p.program).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const mySessions = () => db.sessions.filter((s) => s.clientId === ME);
const doneSessions = () => mySessions().filter((s) => s.status === 'done').sort(bySessionTime);
const exByName = (n) => db.exercises.find((e) => catFold(e.name) === catFold(n));
// balíček z predplatného (license.js); bez predplatného plná verzia
const tierNow = () => (typeof ltTier === 'function' ? ltTier() : 'pro');
const canTier = (t) => (typeof hasTier === 'function' ? hasTier(t) : true);
const programKind = () => (canTier('medium') ? 'custom' : 'basic');
// Basic: hotový program na celé telo (3 dni), miesto, úroveň a obmedzenia ostávajú
const basicOf = (p) => ({ ...p, goal: 'postava', days: 3 });
function upsell(t, title, text) {
  const names = { medium: 'Medium', pro: 'Pro' };
  return `<section class="card upsell"><span class="badge">${names[t]}</span><h2>${title}</h2><p class="muted">${text}</p>
    <button class="btn primary" data-action="tier-upgrade" data-tier="${t}">Prejsť na ${names[t]}</button></section>`;
}

// používateľ a cviky z knižnice musia v dátach existovať
function coachEnsure() {
  let changed = false;
  if (!meClient()) { db.clients.push({ id: ME, name: db.settings.trainerName || '', createdAt: today(), archived: false }); changed = true; }
  CATALOG.forEach((c) => { if (!exByName(c.name)) { db.exercises.push({ id: uid(), name: c.name, category: c.category }); changed = true; } });
  if (changed) { db = normalize(db); _idx = null; save(); }
}

function coachGenerate(p) {
  coachEnsure();
  const kind = programKind();
  const days = buildProgram(kind === 'basic' ? basicOf(p) : p);
  db.plans = db.plans.filter((x) => !x.program);
  days.forEach((d, i) => {
    db.plans.push({
      id: uid(), clientId: ME, program: true, order: i, name: d.name, notes: d.notes || '',
      items: d.items.map((it) => ({ id: uid(), exerciseId: exByName(it.name).id, sets: it.sets, reps: it.reps, rest: it.rest, ...(it.note ? { note: it.note } : {}) }))
    });
  });
  db.settings.profile = { ...p, kind, createdAt: today() };
  _idx = null;
  save();
}

// ďalší tréning v poradí: po poslednom odcvičenom dni programu
function nextPlan() {
  const plans = programPlans();
  if (!plans.length) return null;
  const last = [...doneSessions()].reverse().find((s) => plans.some((p) => p.id === s.planId));
  if (!last) return plans[0];
  const i = plans.findIndex((p) => p.id === last.planId);
  return plans[(i + 1) % plans.length];
}

async function coachStart(planId) {
  if (live && getSession(live.sid)) { liveOpen(); return; }
  const plan = getPlan(planId);
  if (!plan) return;
  const now = new Date();
  const s = { id: uid(), clientId: ME, date: today(), time: `${pad(now.getHours())}:${pad(now.getMinutes())}`, duration: planMinutes(plan), status: 'planned', planId, price: 0 };
  db.sessions.push(s);
  _idx = null;
  save();
  liveStart(s.id);
}

/* ---------- Pomocné výpočty ---------- */
const weekDone = (ws) => doneSessions().filter((s) => s.date >= ws && s.date <= addDays(ws, 6));
function weekStreak() {
  let ws = startOfWeek(today());
  let n = weekDone(ws).length ? 1 : 0;
  for (;;) { ws = addDays(ws, -7); if (!weekDone(ws).length) break; n++; }
  return n;
}
const setsOf = (s) => (s.log || []).reduce((a, e) => a + e.sets.length, 0);
const workoutVolume = (s) => (s.log || []).reduce((a, e) => a + e.sets.reduce((b, st) => b + (st.w || 0) * (st.r || 0), 0), 0);
const fmtVol = (v) => (v < 10000 ? `${fmtNum(v, 0)} kg` : `${fmtNum(v / 1000, 1)} t`);
const PLAY = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

/* ---------- Úvodný dotazník ---------- */
function choice(name, list, val, multi = false) {
  const has = (k) => (multi ? (val || []).map(String).includes(String(k)) : String(val) === String(k));
  return `<div class="pick-row" role="${multi ? 'group' : 'radiogroup'}">${list.map(([k, label]) => `<label class="pick"><input type="${multi ? 'checkbox' : 'radio'}" name="${name}" value="${k}"${has(k) ? ' checked' : ''}${multi ? '' : ' required'}><span>${label}</span></label>`).join('')}</div>`;
}
function viewStart() {
  const p = profile() || { goal: 'postava', level: 'zaciatocnik', days: 3, place: 'gym', limits: [] };
  const first = !profile();
  return `<section class="start">
    ${first ? `<div class="start-hero">
      <img class="start-logo" src="icons/icon.svg?v=4" alt="" width="64" height="64">
      <h1>Tvoj tréner v mobile</h1>
      <p class="muted">Odpovedz na pár otázok a Lift Tara ti zostaví tréningový program na mieru. Pri každom cviku uvidíš, ako ho robiť správne.</p>
    </div>` : `<a href="#/program" class="back-link">‹ Program</a><div class="page-head"><h1>Nový program</h1></div>
      <p class="muted">Zmeň odpovede a Lift Tara ti zostaví nový program. História tréningov a rekordy ostanú.</p>`}
    <form id="coach-form" class="card start-form">
      <label class="q"><span>Ako ťa máme oslovovať?</span><input id="f_coach_name" name="name" autocomplete="given-name" placeholder="Tvoje meno (nepovinné)" value="${esc(db.settings.trainerName || '')}"></label>
      <fieldset class="q"><legend>Čo je tvoj hlavný cieľ?</legend>${choice('goal', GOALS, p.goal)}</fieldset>
      <fieldset class="q"><legend>Aké máš skúsenosti s cvičením?</legend>${choice('level', LEVELS, p.level)}</fieldset>
      <fieldset class="q"><legend>Koľko dní v týždni chceš cvičiť?</legend>${choice('days', DAYS_OPT, p.days)}</fieldset>
      <fieldset class="q"><legend>Kde budeš cvičiť?</legend>${choice('place', PLACES, p.place)}</fieldset>
      <fieldset class="q"><legend>Máš problémy s niektorou časťou tela?</legend>${choice('limits', LIMITS, p.limits, true)}<small class="hint">Nepovinné. Cviky, ktoré by ju zaťažovali, vynecháme.</small></fieldset>
      <button class="btn primary block" type="submit">${first ? 'Vytvoriť môj program' : 'Vytvoriť nový program'}</button>
      ${first ? '<p class="hint" style="text-align:center;margin-top:12px">Odpovede môžeš kedykoľvek zmeniť v sekcii Program.</p>' : ''}
    </form>
  </section>`;
}

/* ---------- Dnes ---------- */
function viewToday() {
  if (!profile()) return viewStart();
  const t = today();
  const p = profile();
  const next = nextPlan();
  const hour = new Date().getHours();
  const greet = hour < 10 ? 'Dobré ráno' : hour < 18 ? 'Dobrý deň' : 'Dobrý večer';
  const ws = startOfWeek(t);
  const wd = weekDone(ws);
  const doneToday = wd.filter((s) => s.date === t).length;
  const running = live && getSession(live.sid);
  const recs = clientRecords(ME);
  const last = doneSessions().slice(-1)[0];
  const target = Number(p.days) || 3;
  return `
  <section class="hero hero-photo">
    <div class="hero-top"><span class="eyebrow">${DAYS_LONG[weekday(t)]} · ${fmtShort(t)} ${parseDate(t).getFullYear()}</span></div>
    <h1 class="hero-title">${greet}${db.settings.trainerName ? `,<br>${esc(db.settings.trainerName.split(' ')[0])}` : ''}</h1>
    <p class="hero-sub">${running ? 'Tréning práve beží.' : doneToday ? 'Dnes máš odcvičené. Výborne!' : next ? `Na rade: ${esc(next.name)}` : 'Vytvor si program.'}</p>
    ${next ? `<div class="hero-tiles">
      <div class="hero-tile"><span class="ti" aria-hidden="true">${IC.clock}</span><span class="tv"><strong>~${planMinutes(next)} min</strong><span class="eyebrow">${esc(next.name)}</span></span></div>
      <div class="hero-tile hero-big"><span class="ti" aria-hidden="true">${IC.check}</span><span class="tv"><b>${wd.length}/${target}</b><span class="eyebrow">tento týždeň</span></span></div>
    </div>
    <button class="btn primary cta" data-action="${running ? 'coach-resume' : 'coach-start'}" data-id="${next.id}">${running ? 'Pokračovať v tréningu' : doneToday ? 'Cvičiť znova' : 'Začať tréning'} <span aria-hidden="true">${IC.arrow}</span></button>` : ''}
  </section>

  ${next ? `<section class="card today-plan">
    <div class="card-head"><h2>${esc(next.name)}</h2><a class="btn small" href="#/plan/${next.id}">Upraviť</a></div>
    <ol class="list ex-list">${next.items.map((it) => { const e = getExercise(it.exerciseId); const l = exerciseLine(it); return e ? `<li><a class="list-item" href="#/exercise/${e.id}">
      <span class="ex-pic">${exThumb(e)}</span><span class="info"><strong>${esc(e.name)}</strong><small>${esc(l.dose)}</small></span><span aria-hidden="true">›</span></a></li>` : ''; }).join('')}</ol>
  </section>` : ''}

  ${habitsTodayCard()}

  <section class="card week-card">
    <div class="card-head"><h2>Tento týždeň</h2><span class="badge ${wd.length >= target ? 'done' : 'planned'}">${wd.length} z ${target}</span></div>
    <div class="week-dots">${Array.from({ length: 7 }, (_, i) => { const d = addDays(ws, i); const n = wd.filter((s) => s.date === d).length; return `<div class="wd${n ? ' on' : ''}${d === t ? ' today' : ''}"><span>${DAYS_LONG[i].slice(0, 2)}</span><i>${n ? IC.check : ''}</i></div>`; }).join('')}</div>
  </section>

  <div class="stats">
    <div class="stat"><i aria-hidden="true">${IC.check}</i><b>${doneSessions().length}</b><span>${pl(doneSessions().length, 'tréning', 'tréningy', 'tréningov')} spolu</span></div>
    <div class="stat"><i aria-hidden="true">${IC.calendar}</i><b>${weekStreak()}</b><span>${pl(weekStreak(), 'týždeň', 'týždne', 'týždňov')} v rade</span></div>
    <div class="stat"><i aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg></i><b>${recs.length}</b><span>${pl(recs.length, 'rekord', 'rekordy', 'rekordov')}</span></div>
  </div>

  ${last ? `<section class="card">
    <div class="card-head"><h2>Posledný tréning</h2><a class="btn small" href="#/progress">Progres ›</a></div>
    ${historyRow(last)}
  </section>` : ''}`;
}

/* ---------- Program ---------- */
function viewProgram() {
  const p = profile();
  if (!p) return viewStart();
  const plans = programPlans();
  const next = nextPlan();
  const own = db.plans.filter((x) => x.clientId === ME && !x.program).sort(byName);
  const basic = p.kind === 'basic';
  const fixed = !basic && usesStrengthPlan(p);
  const summary = basic ? ['Hotový program na celé telo', '3 dni v týždni', optLabel(LEVELS, p.level), optLabel(PLACES, p.place), ...(p.limits || []).map((l) => `bez záťaže: ${optLabel(LIMITS, l).toLowerCase()}`)]
    : fixed ? ['Funkčný silový plán', '4 silové tréningy + 2× beh týždenne', optLabel(LEVELS, p.level), optLabel(PLACES, p.place)]
    : [optLabel(GOALS, p.goal), optLabel(LEVELS, p.level), optLabel(DAYS_OPT, p.days) + ' v týždni', optLabel(PLACES, p.place), ...(p.limits || []).map((l) => `bez záťaže: ${optLabel(LIMITS, l).toLowerCase()}`)];
  return `
  <div class="page-head"><h1>Môj program</h1><a class="btn" href="#/start">Zmeniť</a></div>
  <div class="tag-row">${summary.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
  <section class="card">
    <div class="card-head"><h2>Tréningové dni</h2><span class="badge">${plans.length}</span></div>
    <p class="muted" style="margin-top:-6px">Cvič ich po poradí. Keď jeden odcvičíš, na rade je ďalší.${fixed ? ' Každý tréning začína aktivačným blokom. Váhu zvyšuj, keď zvládneš horný počet opakovaní v dobrej technike. RPE hovorí, ako ťažko to má byť (10 = maximum).' : ''}</p>
    <ul class="list prog-days">${plans.map((pl, i) => `<li class="prog-day${pl === next ? ' next' : ''}">
      <a class="list-item" href="#/plan/${pl.id}"><span class="day-n">${i + 1}</span><span class="info"><strong>${esc(pl.name)}${pl === next ? ' <span class="badge planned">Na rade</span>' : ''}</strong><small>${esc(pl.items.map((it) => exName(it.exerciseId)).join(' · '))}</small><small>${nEx(pl.items.length)} · ~${planMinutes(pl)} min</small></span></a>
      <button class="icon-btn play" data-action="coach-start" data-id="${pl.id}" title="Začať tréning" aria-label="Začať tréning">${PLAY}</button>
    </li>`).join('')}</ul>
  </section>
  ${basic ? upsell('medium', 'Program presne podľa teba', `V balíčku Medium ti Lift Tara zostaví program podľa tvojho cieľa (${optLabel(GOALS, p.goal).toLowerCase()}) na ${optLabel(DAYS_OPT, p.days)} v týždni a môžeš si skladať vlastné tréningy.`) : `<section class="card">
    <div class="card-head"><h2>Vlastné tréningy</h2><button class="btn small primary" data-action="coach-new-plan">+ Nový</button></div>
    ${own.length ? `<ul class="list prog-days">${own.map((pl) => `<li class="prog-day"><a class="list-item" href="#/plan/${pl.id}"><span class="info"><strong>${esc(pl.name)}</strong><small>${nEx(pl.items.length)}</small></span></a>
      <button class="icon-btn play" data-action="coach-start" data-id="${pl.id}" title="Začať tréning" aria-label="Začať tréning">${PLAY}</button></li>`).join('')}</ul>` : '<p class="empty">Poskladaj si vlastný tréning z cvikov v knižnici.</p>'}
  </section>`}`;
}

/* ---------- Knižnica cvikov ---------- */
const CAT_ORDER = ['Nohy', 'Zadok', 'Chrbát', 'Hrudník', 'Ramená', 'Ruky', 'Core', 'Celé telo', 'Kardio'];
let libCat = '';
let libFocus = '';
const focusOfEx = (e) => catalogOf(e)?.focus || [];
function viewLibrary() {
  const cats = [...new Set(db.exercises.map((e) => e.category || 'Ostatné'))].sort((a, b) => ((CAT_ORDER.indexOf(a) + 1 || 99) - (CAT_ORDER.indexOf(b) + 1 || 99)) || a.localeCompare(b, 'sk'));
  const list = db.exercises.filter((e) => (!libCat || (e.category || 'Ostatné') === libCat) && (!libFocus || focusOfEx(e).includes(libFocus)));
  const groups = cats.filter((c) => !libCat || c === libCat).map((c) => [c, list.filter((e) => (e.category || 'Ostatné') === c).sort(byName)]).filter(([, l]) => l.length);
  return `
  <div class="page-head"><h1>Cviky</h1><button class="btn" data-action="new-exercise">+ Vlastný cvik</button></div>
  <input type="search" class="search" id="ex-search" placeholder="Hľadať cvik…" aria-label="Hľadať cvik">
  <div class="chips lib-chips lib-focus"><button class="chip${libFocus ? '' : ' active'}" data-action="lib-focus" data-val="">Všetky zamerania</button>${FOCUSES.map(([k, l]) => `<button class="chip${k === libFocus ? ' active' : ''}" data-action="lib-focus" data-val="${k}">${l}</button>`).join('')}</div>
  <div class="chips lib-chips"><button class="chip${libCat ? '' : ' active'}" data-action="lib-cat" data-val="">Všetky partie</button>${cats.map((c) => `<button class="chip${c === libCat ? ' active' : ''}" data-action="lib-cat" data-val="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <section class="card" id="lib-list">
    ${groups.map(([c, l]) => `<h3 class="section-title ex-cat">${esc(c)}</h3>
      <ul class="list">${l.map((e) => { const k = catalogOf(e); return `<li data-name="${esc(catFold(e.name))} ${esc(catFold(k?.muscles))}"><a class="list-item" href="#/exercise/${e.id}">
        <span class="ex-pic">${exThumb(e)}</span><span class="info"><strong>${esc(e.name)}</strong>${k ? `<small>${esc(k.muscles)}</small>` : e.note ? `<small>${esc(e.note)}</small>` : ''}</span><span aria-hidden="true">›</span>
      </a></li>`; }).join('')}</ul>`).join('')}
    <p class="empty" id="lib-empty" hidden>Žiadny cvik nezodpovedá hľadaniu.</p>
  </section>`;
}

function viewExercise(id) {
  const e = getExercise(id);
  if (!e) return '<p class="empty">Cvik neexistuje.</p><a class="btn" href="#/exercises">Späť na cviky</a>';
  const k = catalogOf(e);
  const tips = e.note ? e.note.split(/\n+|(?<=[.!?])\s+(?=\S)/).filter(Boolean) : exerciseTips(e) || [];
  const v = exerciseVideo(e.video);
  const places = k ? k.places.map((pl) => optLabel(PLACES, pl)) : [];
  const best = clientRecords(ME).find((r) => r.exerciseId === e.id);
  return `
  <a href="#/exercises" class="back-link">‹ Cviky</a>
  <section class="card ex-detail">
    <div class="ex-hero">${exThumb(e)}</div>
    <h1>${esc(e.name)}</h1>
    ${focusOfEx(e).length ? `<div class="tag-row focus-row">${focusOfEx(e).map((f) => `<a class="tag focus" href="#/exercises" data-action="lib-focus-go" data-val="${f}">${optLabel(FOCUSES, f)}</a>`).join('')}</div>` : ''}
    <div class="tag-row"><span class="tag">${esc(e.category || 'Ostatné')}</span>${places.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>
    ${k ? `<p class="ex-muscles"><b>Zapojené svaly:</b> ${esc(k.muscles)}</p>` : ''}
    ${best ? `<p class="ex-best"><b>Tvoj rekord:</b> ${esc(fmtSet(best.best))} · ${fmtShort(best.date)}</p>` : ''}
  </section>
  ${v ? `<section class="card"><div class="card-head"><h2>Video</h2></div>${v.embed ? `<div class="video-wrap"><iframe src="${esc(v.embed)}" title="${esc(e.name)}" loading="lazy" allow="encrypted-media; picture-in-picture" allowfullscreen></iframe></div>` : `<a class="btn" href="${esc(v.url)}" target="_blank" rel="noopener">Pozrieť video</a>`}</section>` : ''}
  ${tips.length ? `<section class="card"><div class="card-head"><h2>Ako na to</h2></div><ol class="steps">${tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></section>` : ''}
  ${k?.mistakes?.length ? `<section class="card"><div class="card-head"><h2>Najčastejšie chyby</h2></div><ul class="mistakes">${k.mistakes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
  <div class="row" style="margin-top:12px"><button class="btn" data-action="edit-exercise" data-id="${e.id}">Upraviť cvik</button></div>`;
}

/* ---------- Návyky (Medium a Pro) ---------- */
const HAB = [['steps', 'Kroky', '', 1000], ['water', 'Voda', 'l', 0.25], ['sleep', 'Spánok', 'h', 0.5]];
const habLog = () => db.settings.habitLog || {};
const habGoal = () => { const g = typeof habitGoals === 'function' ? habitGoals() : {}; return { steps: g.steps || 8000, water: g.water || 2, sleep: g.sleep || 8 }; };
const habFmt = (k, v) => (k === 'steps' ? fmtNum(v || 0, 0) : fmtNum(v || 0, 2));
function habitsTodayCard() {
  if (!canTier('medium')) return '';
  const d = habLog()[today()] || {};
  const g = habGoal();
  return `<section class="card habits-card" id="habits-today">
    <div class="card-head"><h2>Návyky dnes</h2><button class="btn small" data-action="coach-habit-goals">Ciele</button></div>
    ${HAB.map(([k, label, unit, step]) => { const v = d[k] || 0; const pct = Math.min(100, Math.round((v / g[k]) * 100)); return `<div class="hab-row${v >= g[k] ? ' hit' : ''}">
      <div class="hab-info"><b>${label}</b><small>${habFmt(k, v)}${unit ? ' ' + unit : ''} / ${habFmt(k, g[k])}${unit ? ' ' + unit : ''}</small><span class="hab-bar"><i style="width:${pct}%"></i></span></div>
      <div class="hab-btns"><button class="icon-btn" data-action="coach-hab" data-k="${k}" data-d="-${step}" aria-label="Menej: ${label}">−</button><button class="icon-btn" data-action="coach-hab" data-k="${k}" data-d="${step}" aria-label="Viac: ${label}">+</button></div>
    </div>`; }).join('')}
  </section>`;
}
function habitsWeekCard() {
  const log = habLog();
  const g = habGoal();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i - 6));
  if (!days.some((d) => log[d])) return '';
  return `<section class="card"><div class="card-head"><h2>Návyky za 7 dní</h2></div>
    <div class="table-wrap"><table class="hab-week"><thead><tr><th></th>${days.map((d) => `<th class="num">${DAYS_LONG[weekday(d)].slice(0, 2)}</th>`).join('')}</tr></thead>
    <tbody>${HAB.map(([k, label]) => `<tr><th>${label}</th>${days.map((d) => { const v = log[d]?.[k]; return `<td class="num${v >= g[k] ? ' hit' : ''}">${v ? habFmt(k, v) : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>
  </section>`;
}

/* ---------- Progres ---------- */
function historyRow(s) {
  const plan = s.planId ? getPlan(s.planId) : null;
  const sets = setsOf(s);
  const vol = workoutVolume(s);
  const meta = [plan ? plan.name : 'Tréning', sets ? `${sets} ${pl(sets, 'séria', 'série', 'sérií')}` : '', vol ? fmtVol(vol) : ''].filter(Boolean).map(esc).join(' · ');
  return `<ul class="list"><li class="session done"><button class="session-main" data-action="log-session" data-id="${s.id}">
    <span class="time">${fmtShort(s.date)}</span><span class="info"><strong>${fmtDay(s.date)}</strong><small>${meta}</small></span><span class="badge done">Odcvičené</span>
  </button></li></ul>`;
}
let showAllMine = false;
function viewProgress() {
  const me = meClient();
  if (!me) return viewStart();
  const done = [...doneSessions()].reverse();
  const totalVol = done.reduce((a, s) => a + workoutVolume(s), 0);
  const shown = showAllMine ? done : done.slice(0, 10);
  return `
  <div class="page-head"><h1>Progres</h1>${canTier('medium') ? `<button class="btn" data-action="new-measurement" data-client="${ME}">+ Meranie</button>` : ''}</div>
  <div class="stats">
    <div class="stat"><i aria-hidden="true">${IC.check}</i><b>${done.length}</b><span>${pl(done.length, 'tréning', 'tréningy', 'tréningov')}</span></div>
    <div class="stat"><i aria-hidden="true">${IC.calendar}</i><b>${weekStreak()}</b><span>${pl(weekStreak(), 'týždeň', 'týždne', 'týždňov')} v rade</span></div>
    <div class="stat"><i aria-hidden="true">${DUMBBELL}</i><b>${totalVol ? fmtVol(totalVol) : '0'}</b><span>zdvihnuté spolu</span></div>
  </div>
  ${recordsCard(me)}
  ${canTier('medium') ? measureCard(me) + habitsWeekCard() : upsell('medium', 'Merania, fotky a návyky', 'Sleduj váhu a obvody s grafom, porovnávaj fotky progresu a zapisuj si kroky, vodu a spánok.')}
  <section class="card" id="sec-history">
    <div class="card-head"><h2>História tréningov</h2>${done.length ? `<span class="badge">${done.length}</span>` : ''}</div>
    ${done.length ? shown.map(historyRow).join('') : '<p class="empty">Zatiaľ žiadny odcvičený tréning. Začni na obrazovke Dnes.</p>'}
    ${done.length > 10 && !showAllMine ? `<button class="btn small" style="margin-top:10px" data-action="coach-all-history">Zobraziť všetko (${done.length})</button>` : ''}
  </section>
  ${canTier('medium') ? `<section class="card" id="sec-photos">
    <div class="card-head"><h2>Fotky progresu</h2><span class="spacer"></span><span class="badge" id="photo-count" hidden></span><button class="btn small" data-action="add-photos" data-client="${ME}">+ Fotky</button></div>
    <div class="photo-grid" id="photo-grid" data-client="${ME}"></div>
  </section>` : ''}`;
}

/* ---------- Ukážka (?demo) ---------- */
function coachDemo() {
  const d = freshDb();
  db = d;
  db.settings.trainerName = 'Lucia';
  coachGenerate({ goal: 'postava', level: 'mierne', days: 3, place: 'gym', limits: [] });
  const plans = programPlans();
  const base = { 'Drep': 40, 'Rumunský mŕtvy ťah': 45, 'Bench press': 30, 'Tlaky nad hlavu': 20, 'Veslovanie s činkou': 14, 'Stiahnutie kladky': 35, 'Hip thrust': 50, 'Výpady': 8, 'Upažovanie': 5, 'Bicepsový zdvih': 8, 'Tricepsové stlačenie': 15 };
  const t = today();
  let n = 0;
  for (let w = 6; w >= 0; w--) {
    [0, 2, 4].forEach((dd) => {
      const date = addDays(startOfWeek(t), -7 * w + dd);
      if (date >= t) return;
      const pl = plans[n % plans.length];
      const log = pl.items.map((it) => {
        const nm = exName(it.exerciseId);
        const [lo, hi] = parseReps(it.reps);
        const r = hi || lo || 10;
        const w0 = base[nm];
        const kg = w0 ? Math.round((w0 + (6 - w) * (w0 >= 30 ? 2.5 : 1)) * 2) / 2 : null;
        return { exerciseId: it.exerciseId, sets: Array.from({ length: Number(it.sets) || 3 }, (_, j) => ({ w: kg, r: /s|min/.test(it.reps) ? null : Math.max(1, r - j) })).filter((st) => st.w != null || st.r != null) };
      }).filter((e) => e.sets.length);
      db.sessions.push({ id: uid(), clientId: ME, date, time: '17:30', duration: planMinutes(pl), status: 'done', planId: pl.id, price: 0, log });
      n++;
    });
  }
  for (let w = 6; w >= 0; w--) db.measurements.push({ id: uid(), clientId: ME, date: addDays(startOfWeek(t), -7 * w), weight: Math.round((68.4 - (6 - w) * 0.35) * 10) / 10, waist: 76 - Math.round((6 - w) * 0.4 * 10) / 10 });
  db = normalize(db);
  _idx = null;
  save();
}

/* ---------- Napojenie na appku ---------- */
routes.unshift(
  [/^#?\/?$/, viewToday],
  [/^#\/start$/, viewStart],
  [/^#\/program$/, viewProgram],
  [/^#\/exercises$/, viewLibrary],
  [/^#\/exercise\/([\w-]+)$/, viewExercise],
  [/^#\/progress$/, viewProgress]
);
// trénerské obrazovky v appke pre jedného človeka nie sú
const COACH_HIDDEN = /^#\/(clients|client\/|calendar|finance|messages|plans$|settings\/(hours|notify|zone|gcal|habits))/;
const coachSection = (h) => (/^#\/(program|plan\/|start)/.test(h) ? 'program' : /^#\/exercise/.test(h) ? 'exercises' : /^#\/progress/.test(h) ? 'progress' : /^#\/settings/.test(h) ? 'settings' : 'home');

const renderWithoutCoach = render;
render = function (...args) {
  const h = location.hash || '#/';
  if (COACH_HIDDEN.test(h)) { location.replace(h.startsWith('#/client/') ? '#/progress' : h.startsWith('#/settings/') ? '#/settings' : '#/'); return; }
  // po kúpe / zmene balíčka sa program prispôsobí (Basic = hotový program, Medium a Pro = na mieru)
  const pr = profile();
  if (pr && typeof ltTier === 'function' && ltTier() && (pr.kind || 'custom') !== programKind()) { const { kind, createdAt, ...answers } = pr; coachGenerate(answers); toast(programKind() === 'basic' ? 'Program upravený pre balíček Basic' : 'Tvoj program na mieru je pripravený'); }
  const r = renderWithoutCoach.apply(this, args);
  const sec = coachSection(h);
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === sec));
  if (render.coachSec !== sec) { render.coachSec = sec; if (typeof moveNavInd === 'function') moveNavInd(); }
  return r;
};

actions['coach-start'] = (d) => coachStart(d.id);
actions['coach-hab'] = (d) => {
  const log = { ...habLog() };
  const t = today();
  const cur = { ...(log[t] || {}) };
  cur[d.k] = Math.max(0, Math.round(((cur[d.k] || 0) + Number(d.d)) * 100) / 100);
  log[t] = cur;
  // držíme posledných 400 dní
  Object.keys(log).sort().slice(0, -400).forEach((k) => delete log[k]);
  db.settings.habitLog = log;
  save();
  const el = document.getElementById('habits-today');
  if (el) el.outerHTML = habitsTodayCard();
};
actions['coach-habit-goals'] = () => {
  const g = habGoal();
  openForm({
    title: 'Ciele návykov', values: { steps: g.steps, water: g.water, sleep: g.sleep },
    fields: [{ name: 'steps', label: 'Kroky za deň', type: 'number', min: 0, step: 500 }, { name: 'water', label: 'Voda za deň (l)', type: 'number', min: 0, step: 0.25, half: true }, { name: 'sleep', label: 'Spánok (h)', type: 'number', min: 0, step: 0.5, half: true }],
    onSubmit: (v) => { db.settings.habits = { ...(db.settings.habits || {}), steps: v.steps || 8000, water: v.water || 2, sleep: v.sleep || 8 }; toast('Ciele uložené'); }
  });
};
actions['coach-resume'] = () => liveOpen();
actions['coach-all-history'] = () => { showAllMine = true; render(); };
actions['lib-cat'] = (d) => { libCat = d.val || ''; render(); };
actions['lib-focus'] = (d) => { libFocus = d.val || ''; render(); };
actions['lib-focus-go'] = (d) => { libFocus = d.val || ''; libCat = ''; go('#/exercises'); };
actions['coach-new-plan'] = () => {
  openPlanForm(null, ME);
  const sel = document.querySelector('#modal-form [name="clientId"]');
  if (sel) { sel.value = ME; (sel.closest('.field') || sel.closest('label') || sel.parentElement).hidden = true; }
};
actions.demo = async () => {
  if (doneSessions().length && !(await askConfirm('Ukážkové dáta nahradia všetky aktuálne dáta.', { ok: 'Pokračovať' }))) return;
  coachDemo(); go('#/');
};

document.addEventListener('submit', (e) => {
  if (e.target.id !== 'coach-form') return;
  e.preventDefault();
  const f = e.target;
  const val = (n) => f.querySelector(`[name="${n}"]:checked`)?.value;
  const p = { goal: val('goal'), level: val('level'), days: Number(val('days')), place: val('place'), limits: [...f.querySelectorAll('[name="limits"]:checked')].map((x) => x.value) };
  if (!p.goal || !p.level || !p.days || !p.place) { toast('Vyber odpoveď pri každej otázke.'); return; }
  const name = f.querySelector('[name="name"]').value.trim();
  const again = !!profile();
  if (name) { db.settings.trainerName = name; const me = meClient(); if (me) me.name = name; }
  coachGenerate(p);
  go('#/');
  toast(again ? 'Nový program je pripravený' : 'Tvoj program je pripravený');
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'ex-search') return;
  const q = catFold(e.target.value).replace(/\s+/g, ' ');
  let shown = 0;
  document.querySelectorAll('#lib-list li[data-name]').forEach((li) => { const ok = !q || li.dataset.name.includes(q); li.hidden = !ok; if (ok) shown++; });
  document.querySelectorAll('#lib-list .ex-cat').forEach((h) => { h.hidden = ![...h.nextElementSibling.children].some((li) => !li.hidden); });
  const empty = document.getElementById('lib-empty');
  if (empty) empty.hidden = shown > 0;
});

if (window.DEMO && !profile()) coachDemo();
coachEnsure();
render();
