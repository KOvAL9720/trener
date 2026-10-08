'use strict';

/* =========================================================
   Synchronizácia s Google kalendárom (Google Calendar API priamo z appky).
   Appka si v účte vytvorí vlastný kalendár „Tréningy – Tréner“ a má prístup
   len k nemu (oprávnenie calendar.app.created). Každý tréning = udalosť
   s pevným ID odvodeným z ID tréningu, takže synchronizácia z PC aj mobilu
   upravuje tie isté udalosti. Zrušené a vymazané tréningy sa z kalendára odstránia.
   ========================================================= */
// OAuth Client ID z Google Cloud konzoly (projekt trener-31965) – verejný údaj, nie je to heslo
const GCAL_CLIENT_ID = '828584673508-3gtav39ed4hplaf2c4tnt53951nlpjal.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const GCAL_API = 'https://www.googleapis.com/calendar/v3';
const GCAL_TZ = 'Europe/Bratislava';
const GCAL_PAST_DAYS = 60;
const GCAL_STATE_KEY = 'trener-gcal-v1';

const gcal = {
  token: null, exp: 0, busy: false, last: null, error: '', sig: '', timer: 0, tokenClient: null,
  get clientId() { return GCAL_CLIENT_ID || db.settings.gcalClientId || ''; },
  get on() { return !!db.settings.gcalOn; }
};
try { Object.assign(gcal, JSON.parse(sessionStorage.getItem(GCAL_STATE_KEY) || '{}')); } catch (e) { /* ok */ }
const gcalKeep = () => { try { sessionStorage.setItem(GCAL_STATE_KEY, JSON.stringify({ token: gcal.token, exp: gcal.exp, last: gcal.last, sig: gcal.sig })); } catch (e) { /* ok */ } };
const gcalTokenOk = () => gcal.token && Date.now() < gcal.exp - 60000;

// ID udalosti: povolené sú znaky 0-9 a a-v → ID tréningu zapíšeme v šestnástkovej sústave
const gcalEventId = (sid) => 'tr' + [...String(sid)].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('');

/* ---------- Prihlásenie (Google Identity Services) ---------- */
function gcalLoadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google prihlásenie sa nepodarilo načítať (internet?)'));
    document.head.appendChild(s);
  });
}

// musí sa volať priamo z ťuknutia (otvára okno Google)
async function gcalAuthorize(consent = false) {
  if (!gcal.clientId) throw new Error('Chýba Client ID – doplň ho v Nastaveniach → Google kalendár.');
  await gcalLoadGis();
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: gcal.clientId,
      scope: GCAL_SCOPE,
      hint: signedUser()?.email || undefined,
      callback: (r) => {
        if (r.error) { reject(new Error(r.error_description || r.error)); return; }
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, GCAL_SCOPE)) { reject(new Error('Prístup ku kalendáru nebol povolený.')); return; }
        gcal.token = r.access_token;
        gcal.exp = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        gcalKeep();
        resolve();
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Okno Google bolo zatvorené.' : e?.message || 'Prihlásenie zlyhalo.'))
    });
    client.requestAccessToken({ prompt: consent ? 'consent' : '' });
  });
}

const gcalSleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Google obmedzuje počet zmien za sekundu – pri „spomaľ“ (403 rateLimitExceeded / 429) počkať a skúsiť znova
async function gcalFetch(path, opt = {}, attempt = 0) {
  const res = await fetch(GCAL_API + path, {
    ...opt,
    headers: { Authorization: `Bearer ${gcal.token}`, 'Content-Type': 'application/json', ...(opt.headers || {}) }
  });
  if (res.status === 429 || res.status === 403) {
    const body = await res.clone().json().catch(() => ({}));
    const reason = body?.error?.errors?.[0]?.reason || '';
    if ((res.status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(reason)) && attempt < 6) {
      await gcalSleep(Math.min(32000, 1000 * 2 ** attempt) + Math.random() * 500);
      return gcalFetch(path, opt, attempt + 1);
    }
    if (res.status === 429 || /rateLimit/.test(reason)) throw Object.assign(new Error('Google dočasne obmedzil počet zmien – zvyšok sa dokončí o chvíľu.'), { code: 429 });
  }
  if (res.status === 401) { gcal.token = null; gcal.exp = 0; gcalKeep(); throw Object.assign(new Error('Pripojenie ku Google vypršalo – ťukni na Synchronizovať.'), { code: 401 }); }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || `Google kalendár: chyba ${res.status}`), { code: res.status });
  return body;
}

/* ---------- Udalosti z tréningov ---------- */
function gcalDesired() {
  const from = addDays(today(), -GCAL_PAST_DAYS);
  const out = new Map();
  for (const s of db.sessions) {
    if (s.status === 'cancelled' || !s.time || s.date < from || !/^\d{1,2}:\d{2}$/.test(s.time)) continue;
    const c = getClient(s.clientId);
    if (c?.test) continue;   // testovacích klientov do Google neposielame
    const plan = s.planId ? getPlan(s.planId) : null;
    const [h, m] = s.time.split(':').map(Number);
    const startMin = h * 60 + m;
    const endMin = startMin + (Number(s.duration) || 60);
    const endDate = addDays(s.date, Math.floor(endMin / 1440));
    const hm = (x) => `${pad(Math.floor((x % 1440) / 60))}:${pad(x % 60)}`;
    const due = s.status === 'done' && isDue(s);
    const desc = [
      s.status === 'done' ? (due ? `Odtrénovaný · nezaplatený ${fmtMoney(priceOf(s))}` : 'Odtrénovaný') : 'Naplánovaný',
      c?.phone ? `Telefón: ${c.phone}` : '',
      plan ? `Plán: ${plan.name}` : '',
      s.notes ? `Poznámky: ${s.notes}` : '',
      '— z appky Tréner'
    ].filter(Boolean).join('\n');
    out.set(gcalEventId(s.id), {
      id: gcalEventId(s.id),
      summary: `${c ? c.name : 'Tréning'}${plan ? ` · ${plan.name}` : ''}`,
      description: desc,
      start: { dateTime: `${s.date}T${hm(startMin)}:00`, timeZone: GCAL_TZ },
      end: { dateTime: `${endDate}T${hm(endMin)}:00`, timeZone: GCAL_TZ },
      colorId: s.status === 'done' ? (due ? '5' : '2') : '7',
      status: 'confirmed',
      transparency: 'opaque',
      reminders: { useDefault: true }
    });
  }
  return out;
}
// podpis stavu – synchronizuje sa len pri zmene
const gcalSignature = (m) => JSON.stringify([...m.values()].map((e) => [e.id, e.summary, e.description, e.start.dateTime, e.end.dateTime, e.colorId]).sort());
const sameEvent = (a, b) => a.summary === b.summary && (a.description || '') === b.description && a.colorId === b.colorId
  && new Date(a.start?.dateTime).getTime() === new Date(`${b.start.dateTime}+00:00`).getTime() - gcalTzOffset(b.start.dateTime)
  && new Date(a.end?.dateTime).getTime() === new Date(`${b.end.dateTime}+00:00`).getTime() - gcalTzOffset(b.end.dateTime);
// posun časovej zóny Europe/Bratislava v danom okamihu (ms)
function gcalTzOffset(local) {
  const d = new Date(`${local}Z`);
  const s = d.toLocaleString('en-US', { timeZone: GCAL_TZ, hourCycle: 'h23' });
  const t = new Date(`${s} UTC`).getTime();
  return t - d.getTime();
}

async function gcalEnsureCalendar() {
  if (db.settings.gcalId) {
    try { await gcalFetch(`/calendars/${encodeURIComponent(db.settings.gcalId)}`); return db.settings.gcalId; } catch (e) { if (e.code !== 404 && e.code !== 403) throw e; }
  }
  const cal = await gcalFetch('/calendars', { method: 'POST', body: JSON.stringify({ summary: 'Tréningy – Tréner', description: 'Tréningy z appky Tréner (synchronizované automaticky)', timeZone: GCAL_TZ }) });
  db.settings.gcalId = cal.id;
  save();
  return cal.id;
}

async function gcalListAll(calId) {
  const items = [];
  let pageToken = '';
  const timeMin = new Date(parseDate(addDays(today(), -GCAL_PAST_DAYS - 1))).toISOString();
  do {
    const q = new URLSearchParams({ maxResults: '2500', showDeleted: 'false', singleEvents: 'true', timeMin, fields: 'items(id,summary,description,start,end,colorId),nextPageToken' });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await gcalFetch(`/calendars/${encodeURIComponent(calId)}/events?${q}`);
    items.push(...(r.items || []));
    pageToken = r.nextPageToken || '';
  } while (pageToken);
  return items;
}

// po dvoch naraz s krátkou pauzou – Google nemá rád desiatky požiadaviek naraz
async function gcalPool(tasks, n = 2) {
  let i = 0, done = 0;
  const errs = [];
  gcal.progress = tasks.length > 10 ? [0, tasks.length] : null;
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, async () => {
    while (i < tasks.length) {
      const t = tasks[i++];
      try { await t(); } catch (e) { errs.push(e); if (e.code === 401) { i = tasks.length; break; } }
      done++;
      if (gcal.progress) { gcal.progress = [done, tasks.length]; gcalProgressUi(); }
      if (tasks.length > 10) await gcalSleep(150);
    }
  }));
  gcal.progress = null;
  if (errs.length) throw errs.find((e) => e.code === 401) || errs[0];
}
function gcalProgressUi() {
  const el = document.getElementById('gcal-state');
  if (el && gcal.progress) el.textContent = `Synchronizujem… ${gcal.progress[0]}/${gcal.progress[1]}`;
}

async function gcalSync({ manual = false } = {}) {
  if (!gcal.on || gcal.busy) return;
  if (!gcalTokenOk()) { gcal.error = 'Pripojenie vypršalo – ťukni na Synchronizovať.'; gcalUi(); return; }
  gcal.busy = true; gcal.error = ''; gcalUi();
  try {
    const calId = await gcalEnsureCalendar();
    const want = gcalDesired();
    const have = await gcalListAll(calId);
    const haveMap = new Map(have.map((e) => [e.id, e]));
    const tasks = [];
    let add = 0, upd = 0, del = 0;
    for (const [id, ev] of want) {
      const cur = haveMap.get(id);
      const path = `/calendars/${encodeURIComponent(calId)}/events`;
      if (!cur) {
        add++;
        tasks.push(async () => {
          try { await gcalFetch(path, { method: 'POST', body: JSON.stringify(ev) }); }
          catch (e) { if (e.code === 409) await gcalFetch(`${path}/${id}`, { method: 'PUT', body: JSON.stringify(ev) }); else throw e; } // udalosť s týmto ID bola kedysi vymazaná
        });
      } else if (!sameEvent(cur, ev)) { upd++; tasks.push(() => gcalFetch(`${path}/${id}`, { method: 'PUT', body: JSON.stringify(ev) })); }
    }
    for (const e of have) {
      if (e.id.startsWith('tr') && !want.has(e.id)) { del++; tasks.push(() => gcalFetch(`/calendars/${encodeURIComponent(calId)}/events/${e.id}`, { method: 'DELETE' }).catch((x) => { if (x.code !== 410 && x.code !== 404) throw x; })); }
    }
    await gcalPool(tasks);
    gcal.sig = gcalSignature(want);
    gcal.last = Date.now();
    gcalKeep();
    if (manual) toast(add + upd + del ? `Google kalendár: ${[add && `+${add}`, upd && `${upd} upravené`, del && `${del} odstránené`].filter(Boolean).join(' · ')}` : 'Google kalendár je aktuálny');
  } catch (e) {
    gcal.error = e.message || 'Synchronizácia zlyhala';
    if (manual) toast(gcal.error);
    // limit Google: dokončiť automaticky o minútu (kým platí pripojenie)
    if (e.code === 429) { clearTimeout(gcal.retry); gcal.retry = setTimeout(() => { if (gcalTokenOk()) gcalSync(); }, 60000); }
  } finally {
    gcal.busy = false;
    gcalUi();
  }
}

// po každej zmene dát: ak sa tréningy zmenili, o chvíľu synchronizovať (len keď je pripojenie platné)
function gcalSchedule() {
  if (!gcal.on || !gcalTokenOk()) return;
  const sig = gcalSignature(gcalDesired());
  if (sig === gcal.sig) return;
  clearTimeout(gcal.timer);
  gcal.timer = setTimeout(() => gcalSync(), 2500);
}

/* ---------- Nastavenia → Google kalendár ---------- */
function gcalStatus() {
  if (!gcal.on) return ['Vypnuté', ''];
  if (gcal.busy) return [gcal.progress ? `Synchronizujem… ${gcal.progress[0]}/${gcal.progress[1]}` : 'Synchronizujem…', ''];
  if (gcal.error && /obmedzil/.test(gcal.error)) return ['Dokončí sa o chvíľu', 'warn'];
  if (gcal.error) return ['Treba obnoviť', 'warn'];
  if (!gcalTokenOk()) return ['Treba obnoviť', 'warn'];
  return ['Zapnuté', 'done'];
}
function gcalLastText() {
  if (!gcal.last) return '';
  const d = new Date(gcal.last);
  return `Naposledy ${d.toDateString() === new Date().toDateString() ? 'dnes' : `${d.getDate()}. ${d.getMonth() + 1}.`} o ${d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })}`;
}
function gcalView() {
  const back = '<a class="back-link" href="#/settings">‹ Nastavenia</a>';
  const [st, cls] = gcalStatus();
  const count = gcalDesired().size;
  return `${back}<div class="page-head"><h1>Google kalendár</h1></div>
  <section class="card" id="gcal-card">
    <div class="card-head"><h2>Synchronizácia</h2><span class="badge ${cls}" id="gcal-state">${st}</span></div>
    <p class="muted" style="margin-top:-6px">Tréningy sa automaticky prenášajú do samostatného kalendára <b>Tréningy – Tréner</b> v tvojom Google účte – zobrazia sa v Google kalendári v mobile aj na PC, aj s pripomienkami. Appka má prístup len k tomuto kalendáru, tvoje ostatné kalendáre nevidí.</p>
    ${gcal.on ? `<p class="muted" style="margin:0 0 4px">${count} ${count === 1 ? 'tréning' : count < 5 ? 'tréningy' : 'tréningov'} (posledných ${GCAL_PAST_DAYS} dní a všetky budúce, bez zrušených a testovacích).</p>
      <p class="muted" id="gcal-last" style="margin:0 0 4px">${gcalLastText()}</p>
      <p class="muted" id="gcal-err" style="margin:0 0 10px;color:var(--warn)">${esc(gcal.error)}</p>
      <div class="row">
        <button class="btn primary" data-action="gcal-sync" ${gcal.busy ? 'disabled' : ''}>${gcalTokenOk() ? 'Synchronizovať teraz' : 'Obnoviť pripojenie a synchronizovať'}</button>
        <button class="btn danger" data-action="gcal-off">Vypnúť</button>
      </div>
      <p class="hint" style="margin:12px 0 0">Pripojenie platí hodinu – kým platí, zmeny sa do Google kalendára prenesú samé do pár sekúnd. Potom stačí raz ťuknúť na tlačidlo vyššie.</p>`
    : `${gcal.clientId ? '' : '<p class="muted" style="color:var(--warn)">Najprv treba v Google Cloud konzole vytvoriť Client ID a vložiť ho nižšie.</p>'}
      <button class="btn primary" data-action="gcal-on" ${gcal.clientId ? '' : 'disabled'}>Pripojiť Google kalendár</button>`}
  </section>
  ${GCAL_CLIENT_ID ? '' : `<section class="card">
    <div class="card-head"><h2>Client ID</h2></div>
    <p class="muted" style="margin-top:-6px">Kód z Google Cloud konzoly (končí na <b>.apps.googleusercontent.com</b>). Stačí ho vložiť raz – uloží sa do účtu.</p>
    <div class="row"><input id="gcal-cid" value="${esc(db.settings.gcalClientId || '')}" placeholder="123…apps.googleusercontent.com" style="flex:1;min-width:0" autocomplete="off" spellcheck="false"><button class="btn" data-action="gcal-cid">Uložiť</button></div>
  </section>`}`;
}
function gcalUi() {
  const card = document.getElementById('gcal-card');
  if (card && !document.querySelector('#gcal-cid:focus')) { const y = scrollY; main.innerHTML = gcalView(); scrollTo(0, y); }
}

actions['gcal-cid'] = () => {
  const v = (document.getElementById('gcal-cid')?.value || '').trim();
  if (v && !/^[\w-]+\.apps\.googleusercontent\.com$/.test(v)) { toast('Toto nevyzerá ako Client ID (…apps.googleusercontent.com)'); return; }
  db.settings.gcalClientId = v; save(); render(); toast(v ? 'Client ID uložené' : 'Client ID vymazané');
};
actions['gcal-on'] = async () => {
  try {
    await gcalAuthorize(true);
    db.settings.gcalOn = true; save();
    gcal.error = '';
    render();
    await gcalSync({ manual: true });
  } catch (e) { gcal.error = e.message; toast(e.message); render(); }
};
actions['gcal-sync'] = async () => {
  try {
    if (!gcalTokenOk()) await gcalAuthorize(false);
    gcal.error = '';
    await gcalSync({ manual: true });
  } catch (e) { gcal.error = e.message; toast(e.message); gcalUi(); }
};
actions['gcal-off'] = async () => {
  if (!(await askConfirm('Vypnúť synchronizáciu? Kalendár „Tréningy – Tréner“ v Google ostane, len sa už nebude aktualizovať (môžeš ho vymazať v Google kalendári).', { ok: 'Vypnúť' }))) return;
  db.settings.gcalOn = false; save();
  try { if (gcal.token) google?.accounts?.oauth2?.revoke(gcal.token, () => {}); } catch (e) { /* ok */ }
  gcal.token = null; gcal.exp = 0; gcal.sig = ''; gcalKeep();
  render();
  toast('Synchronizácia s Google kalendárom vypnutá');
};

/* ---------- Napojenie na appku ---------- */
const settingsSubWithoutGcal = viewSettingsSub;
const gcalRoute = routes.find((r) => r[1] === viewSettingsSub);
if (gcalRoute) gcalRoute[1] = (sub) => (sub === 'gcal' ? gcalView() : settingsSubWithoutGcal(sub));
const renderWithoutGcal = render;
render = function (...args) { const r = renderWithoutGcal.apply(this, args); gcalSchedule(); return r; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') gcalSchedule(); });
if (/^#\/settings\/gcal$/.test(location.hash)) render();
