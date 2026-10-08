/* =========================================================
   QR platba (PAY by square) – klient naskenuje QR v bankovej appke
   a suma, IBAN aj správa pre príjemcu sa vyplnia samé.
   Knižnice (QR + LZMA) sa načítajú až pri prvom použití.
   ========================================================= */
const PAYQR_LIBS = ['js/vendor/qrcode.min.js', 'js/vendor/lzma1.min.js'];
let payqrLibs = null;
const payqrLoad = () => payqrLibs || (payqrLibs = Promise.all(PAYQR_LIBS.map((src) => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src; s.onload = resolve;
  s.onerror = () => { payqrLibs = null; reject(new Error('QR sa nepodarilo načítať – skontroluj internet.')); };
  document.head.appendChild(s);
}))));

/* ---------- IBAN ---------- */
const ibanClean = (v) => String(v || '').replace(/\s+/g, '').toUpperCase();
const ibanFmt = (v) => ibanClean(v).replace(/(.{4})/g, '$1 ').trim();
function ibanValid(v) {
  const s = ibanClean(v);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const num = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of num) r = (r * 10 + Number(d)) % 97;
  return r === 1;
}

/* ---------- PAY by square (verzia 1.1.0 – s menom príjemcu) ---------- */
const payqrPlain = (v, max) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2013\u2014]/g, '-').replace(/[\t\r\n]+/g, ' ').replace(/[^\x20-\x7E]/g, '').trim().slice(0, max);
function payqrCrc32(bytes) {
  let crc = -1;
  for (const b of bytes) {
    crc ^= b;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ -1) >>> 0;
}
function payBySquare({ iban, amount, name, note }) {
  const fields = [
    '', '1',                                   // ID dokladu, počet platieb
    '1', String(Number(Number(amount).toFixed(2))), 'EUR', '', // príkaz na úhradu, suma, mena, splatnosť
    '', '', '', '',                            // VS, KS, ŠS, referencia
    payqrPlain(note, 140),                     // správa pre príjemcu
    '1', ibanClean(iban), '',                  // 1 účet: IBAN, BIC
    '0', '0',                                  // bez trvalého príkazu a inkasa
    payqrPlain(name, 70), '', ''               // príjemca, adresa
  ];
  const text = new TextEncoder().encode(fields.join('\t'));
  const payload = new Uint8Array(4 + text.length);
  new DataView(payload.buffer).setUint32(0, payqrCrc32(text), true);
  payload.set(text, 4);
  const body = LZMA1.compress(payload).subarray(13);   // bez 13-bajtovej hlavičky LZMA
  const out = new Uint8Array(4 + body.length);
  out[0] = 0x01;                                       // typ 0 (platba), verzia 1.1.0
  out[1] = 0x00;
  new DataView(out.buffer).setUint16(2, payload.length, true);
  out.set(body, 4);
  // base32hex bez doplnenia
  const abc = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
  let res = '', buf = 0, bits = 0;
  for (const b of out) {
    buf = ((buf << 8) | b) & 0xFFFF; bits += 8;
    while (bits >= 5) { bits -= 5; res += abc[(buf >> bits) & 31]; }
  }
  if (bits > 0) res += abc[(buf << (5 - bits)) & 31];
  return res;
}

// QR → canvas (biely okraj 4 moduly, aby ho banky spoľahlivo načítali)
function payqrCanvas(text, px = 640) {
  const qr = qrcode(0, 'M');
  qr.addData(text, 'Alphanumeric');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const cell = Math.floor(px / (n + quiet * 2));
  const size = cell * (n + quiet * 2);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
  return cv;
}

/* ---------- Údaje príjemcu ---------- */
const payqrIban = () => db.settings.payIban || '';
const payqrName = () => db.settings.payName || db.settings.trainerName || '';

function payqrFields() {
  return `<div class="field"><label for="pq-iban">IBAN (číslo účtu)</label><input id="pq-iban" value="${esc(ibanFmt(payqrIban()))}" placeholder="SK00 0000 0000 0000 0000 0000" autocomplete="off" spellcheck="false" inputmode="text"></div>
    <div class="field"><label for="pq-name">Meno príjemcu</label><input id="pq-name" value="${esc(payqrName())}" placeholder="Meno a priezvisko, ako je pri účte" autocomplete="name"></div>
    <p class="hint" style="margin:0">Banka meno príjemcu porovná s menom majiteľa účtu – napíš ho rovnako, ako je v banke.</p>`;
}
function payqrSaveFields(root) {
  const iban = ibanClean(root.querySelector('#pq-iban')?.value);
  const name = (root.querySelector('#pq-name')?.value || '').trim();
  if (!ibanValid(iban)) { toast('IBAN nie je správny – skontroluj ho'); root.querySelector('#pq-iban')?.focus(); return false; }
  if (!name) { toast('Doplň meno príjemcu'); root.querySelector('#pq-name')?.focus(); return false; }
  db.settings.payIban = iban;
  db.settings.payName = name;
  save();
  return true;
}

/* ---------- Okno s QR kódom pre klienta ---------- */
async function openPayQr(clientId) {
  const c = getClient(clientId);
  if (!c) return;
  if (!ibanValid(payqrIban())) { openPayQrSetup(() => openPayQr(clientId)); return; }
  const due = clientDue(clientId);
  const dueSum = sumPrice(due);
  let amount = dueSum > 0 ? dueSum : (Number(db.settings.sessionPrice) || 0);
  const noteFor = () => payqrPlain(due.length ? `Treningy ${due.map((s) => fmtShort(s.date)).join(', ')} - ${c.name}` : `Trening - ${c.name}`, 140);

  modalForm.innerHTML = `
    <header class="modal-head"><h2>QR platba · ${esc(firstName(c))}</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">
      <div class="payqr-box"><div class="payqr-img" id="pq-img"><span class="muted">Pripravujem QR…</span></div><small>PAY by square</small></div>
      <div class="field payqr-amt"><label for="pq-amt">Suma (€)</label><input id="pq-amt" type="text" inputmode="decimal" value="${String(amount).replace('.', ',')}"></div>
      <p class="hint" id="pq-info" style="margin:0"></p>
    </div>
    <footer class="modal-foot">
      <button type="button" class="btn small" data-pq="edit">Účet</button>
      <span class="spacer"></span>
      ${due.length ? '<button type="button" class="btn" data-pq="paid">Zaplatené</button>' : ''}
      <button type="button" class="btn primary" data-pq="share">Poslať</button>
    </footer>`;
  const $ = (s) => modalForm.querySelector(s);
  let canvas = null;
  const draw = async () => {
    const v = Number(String($('#pq-amt').value).replace(',', '.').replace(/[^\d.]/g, ''));
    amount = Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
    $('#pq-info').innerHTML = `${due.length ? `${esc(nTr(due.length))} · ` : ''}Príjemca <b>${esc(payqrName())}</b><br>${esc(ibanFmt(payqrIban()))}<br>Správa: ${esc(noteFor())}`;
    if (!(amount > 0)) { $('#pq-img').innerHTML = '<span class="muted">Zadaj sumu</span>'; canvas = null; return; }
    try {
      await payqrLoad();
      canvas = payqrCanvas(payBySquare({ iban: payqrIban(), amount, name: payqrName(), note: noteFor() }));
      const img = new Image(); img.alt = `QR platba ${fmtMoney(amount)}`; img.src = canvas.toDataURL('image/png');
      $('#pq-img').replaceChildren(img);
    } catch (e) { $('#pq-img').innerHTML = `<span class="muted">${esc(e.message)}</span>`; canvas = null; }
  };
  let t = 0;
  $('#pq-amt').oninput = () => { clearTimeout(t); t = setTimeout(draw, 250); };
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.onsubmit = (e) => e.preventDefault();
  $('[data-pq="edit"]').onclick = () => { modal.close(); openPayQrSetup(() => openPayQr(clientId)); };
  const paidBtn = $('[data-pq="paid"]');
  if (paidBtn) paidBtn.onclick = () => { modal.close(); if (due.length === 1) payDue(due, 'bank', null); else openPaySheet(clientId, 'bank'); };
  $('[data-pq="share"]').onclick = () => payqrShare(c, canvas, amount, due.length);
  modal.showModal();
  draw();
}

async function payqrShare(c, canvas, amount, n) {
  if (!canvas) { toast('Najprv zadaj sumu'); return; }
  const text = `Ahoj ${firstName(c)}, posielam QR kód na platbu ${fmtMoney(amount)}${n ? ` (${nTr(n)})` : ''}. Stačí ho naskenovať v bankovej appke – suma aj účet sa vyplnia samé. Ďakujem!`;
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  const file = new File([blob], `qr-platba-${payqrPlain(firstName(c), 30).toLowerCase() || 'klient'}.png`, { type: 'image/png' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  // bez zdieľania: stiahnuť obrázok a skopírovať text
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { await navigator.clipboard.writeText(text); toast('QR uložený, text správy skopírovaný'); } catch (e) { toast('QR uložený'); }
}

function openPayQrSetup(then) {
  modalForm.innerHTML = `
    <header class="modal-head"><h2>Účet pre QR platby</h2><button type="button" class="icon-btn" data-close aria-label="Zavrieť">✕</button></header>
    <div class="modal-body">${payqrFields()}</div>
    <footer class="modal-foot"><span class="spacer"></span><button type="button" class="btn" data-close>Zrušiť</button><button type="submit" class="btn primary">Uložiť</button></footer>`;
  modalForm.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => modal.close(); });
  modalForm.onsubmit = (e) => {
    e.preventDefault();
    if (!payqrSaveFields(modalForm)) return;
    modal.close();
    toast('Účet uložený');
    if (then) then(); else render();
  };
  modal.showModal();
  if (!payqrIban()) setTimeout(() => modalForm.querySelector('#pq-iban')?.focus(), 50);
}

/* ---------- Nastavenia → QR platby ---------- */
function payqrView() {
  const ok = ibanValid(payqrIban());
  return `<a class="back-link" href="#/settings">‹ Nastavenia</a><div class="page-head"><h1>QR platby</h1></div>
  <section class="card">
    <div class="card-head"><h2>Účet</h2><span class="badge ${ok ? 'done' : 'warn'}">${ok ? 'Nastavené' : 'Nenastavené'}</span></div>
    <p class="muted" style="margin-top:-6px">Pri nezaplatených tréningoch ťukni na <b>QR</b> – appka vytvorí QR kód PAY by square. Klient ho naskenuje v bankovej appke a suma, účet aj správa sa vyplnia samé. QR mu pošleš cez WhatsApp alebo ho ukážeš na mobile.</p>
    <div id="pq-form">${payqrFields()}</div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-action="payqr-save">Uložiť</button></div>
  </section>`;
}
routes.push([/^#\/settings\/pay$/, payqrView]);

actions['pay-qr'] = (d) => openPayQr(d.id);
actions['payqr-save'] = () => { const f = document.getElementById('pq-form'); if (f && payqrSaveFields(f)) { toast('Účet uložený'); render(); } };
