'use strict';

/* =========================================================
   Predplatné Lift Tara (Lemon Squeezy)
   Tréner si apku kúpi na platobnej stránke Lemon Squeezy (7 dní zadarmo,
   potom 15 € mesačne) a e-mailom dostane licenčný kľúč. Kľúč zadá v apke,
   apka ho overí a uloží do nastavení (synchronizujú sa s jeho účtom).
   Keď predplatné skončí, kľúč prestane platiť a apka ukáže platobnú obrazovku.
   Dáta ostávajú uložené. Ukážka (?demo) a klientska zóna sú zadarmo.
   Kým nie je vyplnený odkaz na platbu, zamykanie je vypnuté.
   ========================================================= */
const LT_PAY = {
  checkout: 'https://liftara.lemonsqueezy.com/checkout/buy/15fb9ba1-bfda-470a-a7e2-52a8c8c64b66',   // odkaz na platbu z Lemon Squeezy (Share → Checkout URL)
  portal: 'https://liftara.lemonsqueezy.com/billing',     // stránka zákazníka na zrušenie predplatného (https://<obchod>.lemonsqueezy.com/billing)
  storeId: 504347,     // číslo obchodu – kľúč z iného obchodu neplatí
  productId: 1462756,   // číslo produktu Lift Tara
  price: '15 €',
  trialDays: 7
};
const LIC_API = 'https://api.lemonsqueezy.com/v1/licenses/validate';
const LIC_RECHECK = 12 * 3600e3;
const payOn = () => !!LT_PAY.checkout && !window.DEMO;

// Kto mal v appke dáta ešte pred spustením predplatného, má ju natrvalo zadarmo
(function licenseMigrate() {
  const K = 'lt-license-mig';
  try {
    if (window.DEMO || localStorage.getItem(K)) return;
    if (db.clients.some((c) => c.id !== 'me') && !db.settings.license) { db.settings.license = { plan: 'owner', since: today() }; save(); }
    localStorage.setItem(K, '1');
  } catch (e) { /* bez úložiska nič */ }
})();

const lic = () => db.settings.license || null;
const licOpen = () => {
  if (!payOn()) return true;
  const l = lic();
  return !!l && (l.plan === 'owner' || (l.key && l.status === 'active'));
};

async function licCheck(key) {
  const r = await fetch(LIC_API, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ license_key: key })
  });
  const j = await r.json().catch(() => ({}));
  if (r.status >= 500 || (!j.license_key && r.status !== 404 && r.status !== 400)) throw new Error('net');
  const m = j.meta || {};
  const ours = (!LT_PAY.storeId || m.store_id === LT_PAY.storeId) && (!LT_PAY.productId || m.product_id === LT_PAY.productId);
  const st = j.license_key?.status;
  const ok = !!j.valid && ours && (st === 'active' || st === 'inactive');
  return { ok, status: ok ? 'active' : (ours ? (st || 'invalid') : 'invalid'), email: m.customer_email || '', expires: j.license_key?.expires_at || null };
}

async function licRefresh(force = false) {
  const l = lic();
  if (!payOn() || !l?.key || !navigator.onLine) return;
  if (!force && Date.now() - (l.checkedAt || 0) < LIC_RECHECK) return;
  try {
    const r = await licCheck(l.key);
    const was = licOpen();
    db.settings.license = { ...l, status: r.status, email: r.email || l.email || '', checkedAt: Date.now() };
    save();
    if (was !== licOpen() || (location.hash || '').startsWith('#/settings')) render();
  } catch (e) { /* bez spojenia ostáva posledný známy stav */ }
}

function viewPaywall() {
  const back = new URLSearchParams(location.search).has('kluc');
  const l = lic();
  const ended = l?.key && l.status !== 'active';
  return `<section class="paywall">
    <img class="pw-logo" src="icons/icon.svg?v=4" alt="" width="72" height="72">
    <span class="pw-stamp">${LT_PAY.trialDays} dní zadarmo</span>
    <h1>${ended ? 'Lift Tara' : db.settings.profile ? 'Tvoj program je pripravený' : 'Tvoj tréner v mobile'}</h1>
    <p class="pw-lead">${ended ? 'Tvoje predplatné skončilo. Dáta máš uložené – po obnovení predplatného sa všetko vráti.' : `Vyskúšaj appku ${LT_PAY.trialDays} dní zadarmo, potom ${LT_PAY.price} mesačne. Zrušiť môžeš kedykoľvek.`}</p>
    <ul class="pw-list">
      <li>Tréningový program na mieru tvojmu cieľu</li>
      <li>Ukážky a technika pri každom cviku</li>
      <li>Živý tréning s pauzami a návrhom váhy</li>
      <li>Rekordy, merania a progres na jednom mieste</li>
    </ul>
    <a class="btn primary block" href="${esc(LT_PAY.checkout)}" rel="noopener">${ended ? 'Obnoviť predplatné' : `Vyskúšať ${LT_PAY.trialDays} dní zadarmo`}</a>
    <form id="lic-form" class="pw-key" novalidate>
      <label for="lic-key">${back ? 'Ďakujeme! Licenčný kľúč ti prišiel e-mailom.' : 'Už máš licenčný kľúč?'}</label>
      <div class="pw-row">
        <input id="lic-key" name="key" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Licenčný kľúč" value="${esc(l?.key || '')}"${back ? ' autofocus' : ''}>
        <button class="btn" type="submit">Odomknúť</button>
      </div>
      <p class="pw-err" id="lic-err" role="alert"></p>
    </form>
    <p class="pw-foot"><span>Máš už účet na inom zariadení?</span> <a href="#/settings">Prihlás sa v Nastaveniach</a><br><span>Chceš sa najprv pozrieť?</span> <a href="?demo">Otvoriť ukážku</a></p>
  </section>`;
}

function licenseGroup() {
  if (!payOn()) return '';
  const l = lic();
  const owner = l?.plan === 'owner';
  const sub = owner ? 'Bez obmedzenia' : l?.key ? `Kľúč …${esc(l.key.slice(-4))}${l.email ? ' · ' + esc(l.email) : ''}` : 'Bez predplatného';
  const val = owner || l?.status === 'active' ? '<span class="badge done">Aktívne</span>' : '<span class="badge warn">Neaktívne</span>';
  return setGroup('Predplatné', [
    setRow({ icon: 'key', title: 'Lift Tara', sub, val, action: owner ? '' : 'license-manage', chev: !owner })
  ], owner ? '' : `${LT_PAY.price} mesačne. Predplatné spravuješ na stránke Lemon Squeezy.`);
}

actions['license-manage'] = async () => {
  const l = lic();
  if (LT_PAY.portal && l?.key) {
    const yes = await askConfirm('Otvoriť stránku predplatného? Tam zmeníš kartu alebo predplatné zrušíš.', { ok: 'Otvoriť', cancel: 'Zavrieť' });
    if (yes) window.open(LT_PAY.portal, '_blank', 'noopener');
  } else if (!l?.key) location.hash = '#/';
};

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'lic-form') return;
  e.preventDefault();
  const input = document.getElementById('lic-key');
  const err = document.getElementById('lic-err');
  const btn = e.target.querySelector('button');
  const key = input.value.trim();
  if (!key) { err.textContent = tr('Zadaj licenčný kľúč z e-mailu.'); input.focus(); return; }
  btn.disabled = true; err.textContent = '';
  try {
    const r = await licCheck(key);
    if (!r.ok) {
      err.textContent = tr(r.status === 'expired' || r.status === 'disabled' ? 'Tento kľúč už neplatí – predplatné skončilo.' : 'Tento kľúč nepoznáme. Skontroluj, či si ho skopíroval celý.');
      return;
    }
    db.settings.license = { key, status: 'active', email: r.email, checkedAt: Date.now(), since: today() };
    save();
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    render();
    toast('Apka je odomknutá. Vitaj v Lift Tara!');
  } catch (x) {
    err.textContent = tr('Nepodarilo sa overiť kľúč. Skontroluj pripojenie na internet a skús znova.');
  } finally { btn.disabled = false; }
});

// odkaz z webu „Kúpiť“ (?kupit) ide rovno na platbu
if (payOn() && new URLSearchParams(location.search).has('kupit') && !licOpen()) location.replace(LT_PAY.checkout);

const renderWithoutLicense = render;
render = function (...args) {
  const r = renderWithoutLicense.apply(this, args);
  const h = location.hash || '#/';
  // nový používateľ najprv vyplní dotazník, až potom vidí ponuku
  const onboarding = !db.settings.profile && (h === '#/' || h === '#' || h === '#/start');
  if (!licOpen() && !h.startsWith('#/settings') && !onboarding) {
    main.innerHTML = viewPaywall();
    document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === 'home'));
  }
  return r;
};
licRefresh();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') licRefresh(); });
render();
