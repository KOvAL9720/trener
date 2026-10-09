'use strict';

/* =========================================================
   Správy a týždenný check-in s klientmi (cez klientsku zónu)
   Správy sú v cloude pod kódom klienta: shared/{kód}/messages.
   Appka počúva správy všetkých klientov s prístupom do zóny. Záložka Správy
   v menu = zoznam rozhovorov (#/messages) a rozhovor s klientom (#/messages/{id}).
   Neprečítané (od klienta, novšie než posledné otvorenie rozhovoru) ukazuje
   v menu, na Prehľade, v zozname klientov a v detaile klienta.
   ========================================================= */
const CHAT_SEEN_KEY = window.DEMO ? 'trener-chat-seen-demo' : 'trener-chat-seen';
const chat = { msgs: new Map(), subs: new Map(), seen: {}, open: null, uid: null };
try { chat.seen = JSON.parse(localStorage.getItem(CHAT_SEEN_KEY) || '{}') || {}; } catch (e) { chat.seen = {}; }
const chatSaveSeen = () => { try { localStorage.setItem(CHAT_SEEN_KEY, JSON.stringify(chat.seen)); } catch (e) { /* ok */ } };

const chatList = (code) => chat.msgs.get(code) || [];
const chatUnread = (code) => chatList(code).filter((m) => m.from === 'client' && m.at > (chat.seen[code] || 0)).length;
const chatUnreadClients = () => db.clients.filter((c) => c.share && !c.archived && chatUnread(c.share.code) > 0);
const chatUnreadTotal = () => chatUnreadClients().reduce((n, c) => n + chatUnread(c.share.code), 0);
const chatMarkSeen = (code) => {
  const last = chatList(code).reduce((t, m) => Math.max(t, m.at), 0);
  if (last > (chat.seen[code] || 0)) { chat.seen[code] = last; chatSaveSeen(); }
};

/* ---------- Počúvanie cloudu ---------- */
function chatWatch() {
  const uid = window.cloud?.state?.().uid;
  if (!window.cloud?.watchMessages || !uid) return;
  if (chat.uid !== uid) { chat.subs.forEach((un) => un()); chat.subs.clear(); chat.msgs.clear(); chat.uid = uid; }
  const codes = new Set(db.clients.filter((c) => c.share && !c.archived).map((c) => c.share.code));
  for (const [code, un] of chat.subs) if (!codes.has(code)) { un(); chat.subs.delete(code); chat.msgs.delete(code); }
  for (const code of codes) {
    if (chat.subs.has(code)) continue;
    chat.subs.set(code, window.cloud.watchMessages(code, (list) => { chat.msgs.set(code, list); chatUpdated(code); }, () => {}));
  }
}
function chatUpdated(code) {
  if (chatOpenCode() === code) { chatMarkSeen(code); chatThreadUi(); }
  if ((location.hash || '') === '#/messages') chatInboxUi();
  chatBadges();
}
// kód klienta, ktorého rozhovor je práve otvorený (#/messages/{id})
const chatOpenCode = () => { const m = (location.hash || '').match(/^#\/messages\/([\w-]+)$/); const c = m && getClient(m[1]); return c?.share ? c.share.code : null; };

/* ---------- Odznaky s počtom neprečítaných ---------- */
function chatBadges() {
  document.querySelectorAll('[data-chat-badge]').forEach((el) => {
    const k = el.dataset.chatBadge;
    const n = k === 'all' ? chatUnreadTotal() : chatUnread(k);
    el.textContent = n > 9 ? '9+' : String(n);
    el.hidden = !n;
  });
  const notice = document.getElementById('chat-notice');
  const html = chatNotice();
  if (notice && !html) notice.remove();
  else if (notice) notice.outerHTML = html;
  else if (html && /^#?\/?$/.test(location.hash || '#/')) chatPlaceNotice(html);
}
function chatNotice() {
  const list = chatUnreadClients();
  if (!list.length) return '';
  const names = list.map((c) => `${esc(firstName(c))}${chatUnread(c.share.code) > 1 ? ` (${chatUnread(c.share.code)})` : ''}`).join(', ');
  const href = list.length === 1 ? `#/messages/${list[0].id}` : '#/messages';
  return `<a class="notice notice-chat" id="chat-notice" href="${href}"><span>${ciIc('chat')} Nové správy: <b>${names}</b></span><span class="chev" aria-hidden="true">›</span></a>`;
}
function chatPlaceNotice(html) {
  const hero = main.querySelector('.hero');
  if (hero) hero.insertAdjacentHTML('afterend', html); else main.insertAdjacentHTML('afterbegin', html);
}
const chatBadge = (k) => `<span class="chat-count" data-chat-badge="${esc(k)}" hidden></span>`;

// po každom prekreslení doplniť tlačidlá a odznaky na správne miesta
function chatDecorate() {
  chatWatch();
  const hash = location.hash || '#/';
  if (/^#?\/?$/.test(hash)) { const n = chatNotice(); if (n) chatPlaceNotice(n); }
  if (hash === '#/clients') {
    main.querySelectorAll('#client-list a.list-item[href^="#/client/"]').forEach((a) => {
      const c = getClient(a.getAttribute('href').slice(9));
      if (c?.share) a.insertAdjacentHTML('beforeend', chatBadge(c.share.code));
    });
  }
  const m = hash.match(/^#\/client\/([\w-]+)$/);
  const c = m && getClient(m[1]);
  const actions = main.querySelector('.client-actions');
  if (c?.share && actions) actions.insertAdjacentHTML('afterbegin', `<a class="btn btn-chat" href="#/messages/${c.id}">${ciIc('chat')} Správy${chatBadge(c.share.code)}</a>`);
  const code = chatOpenCode();
  if (code) { chatMarkSeen(code); chatScrollEnd(); }
  chatBadges();
}

// ikonky check-inu a správ (čiarové, tyrkysové – namiesto emoji)
const CI_SVG = {
  weight: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><path d="M8.3 11a3.7 3.7 0 0 1 7.4 0"/><path d="M12 11l1.6-2.2"/>',
  sleep: '<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/>',
  energy: '<path d="M13 3L5.5 13.5H11l-1 7.5 7.5-10.5H12z"/>',
  diet: '<path d="M12 7.5c-1.6-1.5-5.2-1.5-6.6 1.3-1.5 3 .2 8.6 3.2 10.8 1.2.9 2.2.5 3.4.1 1.2.4 2.2.8 3.4-.1 3-2.2 4.7-7.8 3.2-10.8-1.4-2.8-5-2.8-6.6-1.3z"/><path d="M12 7.5c0-2 .9-3.6 3-4.5"/>',
  stress: '<circle cx="12" cy="12" r="8.5"/><path d="M8.6 13.8a4 4 0 0 0 6.8 0"/><path d="M9.3 9.6h.01M14.7 9.6h.01" stroke-width="2.6"/>',
  checkin: '<rect x="5.5" y="4.5" width="13" height="16" rx="2.5"/><path d="M9.5 3.5h5v3h-5z"/><path d="M9 11.5l1.8 1.8L15 9.5M9 16.5h6"/>',
  note: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/><path d="M12.8 7.2l4 4"/>',
  chat: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.6A8.5 8.5 0 1 1 20.5 12z"/>'
};
const ciIc = (k) => `<span class="ci-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${CI_SVG[k]}</svg></span>`;

/* ---------- Okno s rozhovorom ---------- */
const chatTime = (t) => new Date(t).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
const chatDay = (t) => { const d = new Date(t); return fmtDay(isoDate(d)); };
const chatDots = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? `<span class="ci-dots" aria-label="${v} z 5">${'●'.repeat(v)}<i>${'●'.repeat(5 - v)}</i></span>` : '–');
const CHECKIN_ROWS = [['sleep', 'Spánok'], ['energy', 'Energia'], ['diet', 'Strava'], ['stress', 'Pohoda']];
function chatCheckinHtml(ci = {}) {
  return `<b class="ci-title">${ciIc('checkin')} Týždenný check-in</b>
    <div class="ci-grid">
      ${typeof ci.weight === 'number' ? `<span class="ci-lbl">${ciIc('weight')} Váha</span><b>${fmtNum(ci.weight)} kg</b>` : ''}
      ${CHECKIN_ROWS.map(([k, label]) => `<span class="ci-lbl">${ciIc(k)} ${label}</span>${chatDots(ci[k])}`).join('')}
    </div>
    ${ci.note ? `<p class="ci-note">${esc(ci.note)}</p>` : ''}`;
}
function chatMsgHtml(m) {
  const mine = m.from === 'trainer';
  const body = m.kind === 'checkin' ? chatCheckinHtml(m.checkin) : esc(m.text || '').replace(/\n/g, '<br>');
  return `<div class="msg ${mine ? 'mine' : 'theirs'}${m.kind === 'checkin' ? ' checkin' : ''}" data-mid="${esc(m.id)}">
    <div class="bubble">${body}</div><time>${chatTime(m.at)}</time></div>`;
}
function chatThreadHtml(code) {
  const list = chatList(code);
  if (!list.length) return '<p class="empty chat-empty">Zatiaľ žiadne správy. Napíš klientovi – správu uvidí v klientskej zóne.</p>';
  let day = '';
  return list.map((m) => {
    const d = chatDay(m.at);
    const sep = d !== day ? `<div class="chat-day">${esc(d)}</div>` : '';
    day = d;
    return sep + chatMsgHtml(m);
  }).join('');
}
function chatThreadUi() {
  const el = document.getElementById('chat-thread');
  const code = chatOpenCode();
  if (!el || !code) return;
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
  el.innerHTML = chatThreadHtml(code);
  if (atBottom) chatScrollEnd();
}
const chatScrollEnd = () => requestAnimationFrame(() => window.scrollTo(0, document.documentElement.scrollHeight));

/* ---------- Záložka Správy: zoznam rozhovorov ---------- */
const chatPreview = (code) => {
  const m = chatList(code).at(-1);
  if (!m) return '';
  const t = m.kind === 'checkin' ? 'Týždenný check-in' : (m.text || '').replace(/\s+/g, ' ').slice(0, 90);
  return m.from === 'trainer' ? `Ty: ${t}` : t;
};
const chatWhen = (t) => { const d = new Date(t); return isoDate(d) === today() ? chatTime(t) : fmtShort(isoDate(d)); };
function chatInboxHtml() {
  const list = db.clients.filter((c) => c.share && !c.archived)
    .map((c) => ({ c, last: chatList(c.share.code).at(-1) }))
    .sort((a, b) => (b.last?.at || 0) - (a.last?.at || 0) || byName(a.c, b.c));
  if (!list.length) return '<p class="empty">Správy fungujú cez klientsku zónu. Klientovi vytvor prístup v jeho detaile (tlačidlo „Klientska zóna“) a potom si môžete písať.</p>';
  return `<ul class="list chat-inbox">${list.map(({ c, last }) => `<li><a class="list-item chat-item${chatUnread(c.share.code) ? ' unread' : ''}" href="#/messages/${c.id}">
    ${avatar(c)}
    <span class="info"><strong>${esc(c.name)}</strong><small>${last ? esc(chatPreview(c.share.code)) : 'Zatiaľ žiadne správy – napíš ako prvý'}</small></span>
    <span class="chat-meta">${last ? `<time>${chatWhen(last.at)}</time>` : ''}${chatBadge(c.share.code)}</span>
  </a></li>`).join('')}</ul>`;
}
function chatInboxUi() {
  const el = document.getElementById('chat-inbox');
  if (el) { el.innerHTML = chatInboxHtml(); chatBadges(); }
}
function viewMessages() {
  const off = window.DEMO ? 'V ukážkovej verzii sú správy vypnuté – nič sa neposiela na internet.'
    : !window.cloud ? 'Správy sa načítavajú z cloudu – ak sa nič nezobrazí, skontroluj internet.' : '';
  return `<div class="page-head"><div><h1>Správy</h1><p class="muted" style="margin:0">Rozhovory s klientmi z klientskej zóny</p></div>
    <a class="btn small" href="#/settings/chat">${ciIc('checkin')} Check-in</a></div>
  ${off ? `<p class="notice">${off}</p>` : ''}
  <section class="card" id="chat-inbox">${chatInboxHtml()}</section>`;
}

/* ---------- Rozhovor s klientom ---------- */
function viewThread(id) {
  const c = getClient(id);
  if (!c) return '<a class="back-link" href="#/messages">‹ Správy</a><p class="empty">Klient neexistuje.</p>';
  if (!c.share) return `<a class="back-link" href="#/messages">‹ Správy</a><p class="empty">${esc(c.name)} ešte nemá prístup do klientskej zóny. Vytvor ho v <a href="#/client/${c.id}">detaile klienta</a> a potom si môžete písať.</p>`;
  return `<a class="back-link" href="#/messages">‹ Správy</a>
  <div class="page-head chat-head"><a class="chat-who" href="#/client/${c.id}">${avatar(c)}<span><h1>${esc(c.name)}</h1><small>Profil klienta ›</small></span></a></div>
  <section class="card chat-card"><div class="chat-thread" id="chat-thread">${chatThreadHtml(c.share.code)}</div></section>
  <form class="chat-compose" id="chat-compose">
    <textarea id="chat-input" rows="1" maxlength="2000" placeholder="Napíš správu…" aria-label="Správa"></textarea>
    <button type="submit" class="btn primary chat-send" aria-label="Odoslať"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button>
  </form>`;
}
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'chat-compose') return;
  e.preventDefault();
  const code = chatOpenCode();
  const input = document.getElementById('chat-input');
  const text = input.value.trim();
  if (!code || !text) return;
  if (window.DEMO) { notify(DEMO_OFF); return; }
  if (cloudMissing()) return;
  input.value = ''; input.style.height = '';
  try { await window.cloud.sendMessage(code, text); chatScrollEnd(); } catch (err) {
    input.value = text;
    toast(err?.code === 'permission-denied' ? 'Správu sa nepodarilo odoslať – skontroluj pravidlá cloudu.' : 'Správu sa nepodarilo odoslať – skontroluj internet.');
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'chat-input') { const t = e.target; t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight, 140)}px`; }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'chat-input' && e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) { e.preventDefault(); e.target.form.requestSubmit(); }
});
// otvorenie rozhovoru z iného miesta appky
function openChat(clientId) {
  const c = getClient(clientId);
  if (c) location.hash = `#/messages/${c.id}`;
}

/* ---------- Nastavenia → Správy a check-in ---------- */
function chatSettingsView() {
  const d = checkinDay();
  return `<a class="back-link" href="#/settings">‹ Nastavenia</a><div class="page-head"><h1>Správy a check-in</h1></div>
  <section class="card">
    <div class="card-head"><h2>Správy</h2></div>
    <p class="muted" style="margin-top:-6px">Klienti s prístupom do klientskej zóny ti môžu písať priamo v zóne (záložka <b>Správy</b>). Odpovedáš v detaile klienta v záložke <b>Správy</b> v menu alebo tlačidlom <b>Správy</b> v detaile klienta; nové správy uvidíš aj na Prehľade. Ak máš zapnuté upozornenia (ntfy), príde ti aj upozornenie do mobilu.</p>
  </section>
  <section class="card">
    <div class="card-head"><h2>Týždenný check-in</h2></div>
    <p class="muted" style="margin-top:-6px">V zvolený deň klient v zóne uvidí výzvu vyplniť krátky check-in: váhu, spánok, energiu, stravu, pohodu a poznámku. Príde ti ako karta v správach.</p>
    <div class="chips" role="radiogroup" aria-label="Deň check-inu">
      ${[[-1, 'Vypnutý'], ...DAYS_LONG.map((n, i) => [i, n])].map(([v, n]) => `<button type="button" class="chip${v === d ? ' active' : ''}" role="radio" aria-checked="${v === d}" data-action="checkin-day" data-day="${v}">${esc(n)}</button>`).join('')}
    </div>
  </section>
  <section class="card">
    <div class="card-head"><h2>Pravidlá cloudu</h2></div>
    <p class="muted" style="margin-top:-6px">Správy potrebujú jednorazové doplnenie pravidiel vo Firebase (Firestore → Rules). Ak sa správa nedá odoslať, pravidlá ešte nie sú doplnené.</p>
  </section>`;
}
routes.push([/^#\/settings\/chat$/, chatSettingsView], [/^#\/messages$/, viewMessages], [/^#\/messages\/([\w-]+)$/, viewThread]);

actions['open-chat'] = (d) => openChat(d.id);
actions['checkin-day'] = (d) => {
  db.settings.checkinDay = Number(d.day);
  db.settings.shareDirty = true;
  save();
  render();
  toast(Number(d.day) < 0 ? 'Check-in vypnutý' : `Check-in: ${(window.LANG === 'en' ? DAYS_LONG[Number(d.day)] : DAYS_LONG[Number(d.day)].toLowerCase())}`);
};

// cloud sa načíta neskôr – po prihlásení začať počúvať
window.addEventListener('cloud-ready', () => { window.cloud?.onChange?.(() => { chatWatch(); }); });
const renderWithoutChat = render;
render = function (...args) {
  const draft = document.getElementById('chat-input')?.value || '';   // rozpísaná správa prežije obnovenie obrazovky
  const r = renderWithoutChat.apply(this, args);
  const input = document.getElementById('chat-input');
  if (input && draft) input.value = draft;
  chatDecorate();
  return r;
};
chatDecorate();
