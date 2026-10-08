'use strict';

/* =========================================================
   Správy a týždenný check-in s klientmi (cez klientsku zónu)
   Správy sú v cloude pod kódom klienta: shared/{kód}/messages.
   Appka počúva správy všetkých klientov s prístupom do zóny; neprečítané
   (od klienta, novšie než posledné otvorenie chatu) ukazuje v menu,
   na Prehľade, v zozname klientov a v detaile klienta.
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
  if (chat.open === code && modal.open) { chatMarkSeen(code); chatThreadUi(); }
  chatBadges();
}

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
  const id = list.length === 1 ? list[0].id : '';
  return `<button type="button" class="notice notice-chat" id="chat-notice" data-action="${id ? 'open-chat' : 'chat-pick'}" data-id="${id}"><span>💬 Nové správy: <b>${names}</b></span><span class="chev" aria-hidden="true">›</span></button>`;
}
function chatPlaceNotice(html) {
  const hero = main.querySelector('.hero');
  if (hero) hero.insertAdjacentHTML('afterend', html); else main.insertAdjacentHTML('afterbegin', html);
}
const chatBadge = (k) => `<span class="chat-count" data-chat-badge="${esc(k)}" hidden></span>`;

// po každom prekreslení doplniť tlačidlá a odznaky na správne miesta
function chatDecorate() {
  chatWatch();
  const navA = document.querySelector('.nav a[data-nav="clients"]');
  if (navA && !navA.querySelector('[data-chat-badge]')) navA.insertAdjacentHTML('beforeend', chatBadge('all'));
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
  if (c?.share && actions) actions.insertAdjacentHTML('afterbegin', `<button class="btn btn-chat" data-action="open-chat" data-id="${c.id}">💬 Správy${chatBadge(c.share.code)}</button>`);
  chatBadges();
}

/* ---------- Okno s rozhovorom ---------- */
const chatTime = (t) => new Date(t).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' });
const chatDay = (t) => { const d = new Date(t); return fmtDay(isoDate(d)); };
const chatDots = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? `<span class="ci-dots" aria-label="${v} z 5">${'●'.repeat(v)}<i>${'●'.repeat(5 - v)}</i></span>` : '–');
const CHECKIN_ROWS = [['sleep', '😴 Spánok'], ['energy', '⚡ Energia'], ['diet', '🥗 Strava'], ['stress', '🧠 Pohoda']];
function chatCheckinHtml(ci = {}) {
  return `<b class="ci-title">📋 Týždenný check-in</b>
    <div class="ci-grid">
      ${typeof ci.weight === 'number' ? `<span>⚖️ Váha</span><b>${fmtNum(ci.weight)} kg</b>` : ''}
      ${CHECKIN_ROWS.map(([k, label]) => `<span>${label}</span>${chatDots(ci[k])}`).join('')}
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
  if (!el || !chat.open) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  el.innerHTML = chatThreadHtml(chat.open);
  if (atBottom) el.scrollTop = el.scrollHeight;
}

function openChat(clientId) {
  const c = getClient(clientId);
  if (!c) return;
  if (window.DEMO) { notify(DEMO_OFF); return; }
  if (!c.share) { notify('Správy fungujú cez klientsku zónu. Najprv klientovi vytvor prístup (v detaile klienta tlačidlo „Klientska zóna“).'); return; }
  if (cloudMissing()) return;
  chatWatch();
  const code = c.share.code;
  chat.open = code;
  chatMarkSeen(code);
  modalForm.innerHTML = `
    <header class="modal-head"><h2>${avatar(c, 'sm')} ${esc(c.name)}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body chat-thread" id="chat-thread">${chatThreadHtml(code)}</div>
    <footer class="modal-foot chat-foot">
      <textarea id="chat-input" rows="1" maxlength="2000" placeholder="Napíš správu…" aria-label="Správa"></textarea>
      <button type="submit" class="btn primary chat-send" aria-label="Odoslať"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button>
    </footer>`;
  modal.classList.add('chat-modal');
  const input = modalForm.querySelector('#chat-input');
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover: hover)').matches) { e.preventDefault(); modalForm.requestSubmit(); }
  });
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; grow();
    try { await window.cloud.sendMessage(code, text); } catch (err) {
      input.value = text; grow();
      toast(err?.code === 'permission-denied' ? 'Správu sa nepodarilo odoslať – treba doplniť pravidlá cloudu (Nastavenia → Správy a check-in).' : 'Správu sa nepodarilo odoslať – skontroluj internet.');
    }
  };
  modal.addEventListener('close', () => { chat.open = null; modal.classList.remove('chat-modal'); chatBadges(); }, { once: true });
  modal.showModal();
  const th = document.getElementById('chat-thread');
  th.scrollTop = th.scrollHeight;
  if (matchMedia('(hover: hover)').matches) input.focus();
}

// viac klientov s novými správami – vybrať, komu odpovedať
function chatPick() {
  const list = chatUnreadClients();
  if (list.length === 1) { openChat(list[0].id); return; }
  modalForm.innerHTML = `
    <header class="modal-head"><h2>Nové správy</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body"><ul class="list" style="width:100%">${list.map((c) => `<li><button type="button" class="list-item" data-pick="${c.id}">${avatar(c)}<span class="info"><strong>${esc(c.name)}</strong><small>${esc(chatPreview(c.share.code))}</small></span>${chatBadge(c.share.code)}</button></li>`).join('')}</ul></div>`;
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.querySelectorAll('[data-pick]').forEach((b) => { b.onclick = () => { modal.close(); openChat(b.dataset.pick); }; });
  modal.showModal();
  chatBadges();
}
const chatPreview = (code) => { const m = chatList(code).filter((x) => x.from === 'client').pop(); return !m ? '' : m.kind === 'checkin' ? '📋 Týždenný check-in' : (m.text || '').slice(0, 80); };

/* ---------- Nastavenia → Správy a check-in ---------- */
function chatSettingsView() {
  const d = checkinDay();
  return `<a class="back-link" href="#/settings">‹ Nastavenia</a><div class="page-head"><h1>Správy a check-in</h1></div>
  <section class="card">
    <div class="card-head"><h2>Správy</h2></div>
    <p class="muted" style="margin-top:-6px">Klienti s prístupom do klientskej zóny ti môžu písať priamo v zóne (záložka <b>Správy</b>). Odpovedáš v detaile klienta tlačidlom <b>💬 Správy</b>; nové správy uvidíš aj na Prehľade a v menu pri <b>Klientoch</b>. Ak máš zapnuté upozornenia (ntfy), príde ti aj upozornenie do mobilu.</p>
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
routes.push([/^#\/settings\/chat$/, chatSettingsView]);

actions['open-chat'] = (d) => openChat(d.id);
actions['chat-pick'] = () => chatPick();
actions['checkin-day'] = (d) => {
  db.settings.checkinDay = Number(d.day);
  db.settings.shareDirty = true;
  save();
  render();
  toast(Number(d.day) < 0 ? 'Check-in vypnutý' : `Check-in: ${DAYS_LONG[Number(d.day)].toLowerCase()}`);
};

// cloud sa načíta neskôr – po prihlásení začať počúvať
window.addEventListener('cloud-ready', () => { window.cloud?.onChange?.(() => { chatWatch(); }); });
const renderWithoutChat = render;
render = function (...args) { const r = renderWithoutChat.apply(this, args); chatDecorate(); return r; };
chatDecorate();
