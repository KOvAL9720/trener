'use strict';

/* =========================================================
   Predplatné Lift Tara (Gumroad) – balíčky Basic, Medium a Pro
   Používateľ si balíček kúpi na stránke produktu v Gumroade (7 dní zadarmo)
   a e-mailom dostane licenčný kľúč. Kľúč zadá v apke,
   apka ho overí a uloží do nastavení (synchronizujú sa s jeho účtom).
   Keď predplatné skončí, kľúč prestane platiť a apka ukáže platobnú obrazovku.
   Dáta ostávajú uložené. Ukážka (?demo) je zadarmo.
   Balíček sa zistí z názvu balíčka (tier) v Gumroade (Basic / Medium / Pro).
   Kým nie je vyplnený žiadny odkaz na platbu, zamykanie je vypnuté.
   ========================================================= */
const LT_PAY = {
  checkout: 'https://kubo44.gumroad.com/l/lift-tara',   // stránka produktu v Gumroade
  portal: 'https://app.gumroad.com/library',     // knižnica zákazníka – tam spravuje a ruší predplatné
  productId: 'pBzAuLPF6ajAPVprtxhi0A==',   // ID produktu Lift Tara (Content → License key) – kľúč z iného produktu neplatí
  price: '14,99 €',
  trialDays: 7,
  // balíčky – odkaz na stránku produktu s predvybraným balíčkom (?option=ID balíčka)
  tiers: {
    basic: { name: 'Basic', price: '4,99 €', checkout: 'https://kubo44.gumroad.com/l/lift-tara?option=GMNDqHGrpfsTsi0279caOA%3D%3D' },
    medium: { name: 'Medium', price: '9,99 €', checkout: 'https://kubo44.gumroad.com/l/lift-tara?option=3sMS25t2Rtd7Q0zK10l7jQ%3D%3D' },
    pro: { name: 'Pro', price: '14,99 €', checkout: 'https://kubo44.gumroad.com/l/lift-tara?option=65TqrmuJM-7ki57phOWdxw%3D%3D' }
  }
};
const TIER_KEYS = ['basic', 'medium', 'pro'];
const TIER_RANK = { basic: 1, medium: 2, pro: 3 };
const tiersOn = () => TIER_KEYS.some((k) => LT_PAY.tiers[k].checkout);
// balíček „Basic“ / „Medium“ / „Pro“ (Gumroad ho vracia ako „(Pro)“); iný = plná verzia
const tierOfVariant = (name) => TIER_KEYS.find((k) => String(name || '').toLowerCase().includes(k)) || 'pro';
try { const q = new URLSearchParams(location.search).get('plan'); if (TIER_KEYS.includes(q)) sessionStorage.setItem('lt-plan', q); } catch (e) { /* ok */ }
const wantedTier = () => { try { return sessionStorage.getItem('lt-plan') || 'medium'; } catch (e) { return 'medium'; } };
const LIC_API = 'https://api.gumroad.com/v2/licenses/verify';
const LIC_RECHECK = 12 * 3600e3;
const payOn = () => (!!LT_PAY.checkout || tiersOn()) && !window.DEMO;

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

// aktuálny balíček: null = zamknuté, inak 'basic' | 'medium' | 'pro'
function ltTier() {
  if (!licOpen()) return null;
  const l = lic();
  if (!payOn() || !l || l.plan === 'owner') return 'pro';
  return TIER_KEYS.includes(l.tier) ? l.tier : 'pro';
}
const hasTier = (t) => (TIER_RANK[ltTier()] || 0) >= TIER_RANK[t];
const tierCheckout = (t) => LT_PAY.tiers[t]?.checkout || LT_PAY.checkout;

async function licCheck(key) {
  const r = await fetch(LIC_API, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ product_id: LT_PAY.productId, license_key: key, increment_uses_count: 'false' })
  });
  const j = await r.json().catch(() => ({}));
  // 404 = kľúč k tomuto produktu neexistuje; iná chyba bez odpovede = problém so spojením
  if (r.status >= 500 || (!j.purchase && r.status !== 404)) throw new Error('net');
  const p = j.purchase || {};
  if (!j.success || !p.license_key) return { ok: false, status: 'invalid', email: '', tier: 'pro' };
  // skončené, neuhradené alebo vrátené predplatné už neplatí
  const ended = !!(p.subscription_ended_at || p.subscription_failed_at || p.refunded || p.chargebacked || p.disputed);
  return { ok: !ended, status: ended ? 'expired' : 'active', email: p.email || '', expires: p.subscription_ended_at || null, tier: tierOfVariant(p.variants) };
}

async function licRefresh(force = false) {
  const l = lic();
  if (!payOn() || !l?.key || !navigator.onLine) return;
  if (!force && Date.now() - (l.checkedAt || 0) < LIC_RECHECK) return;
  try {
    const r = await licCheck(l.key);
    const was = licOpen();
    db.settings.license = { ...l, status: r.status, email: r.email || l.email || '', tier: r.ok ? r.tier : l.tier, checkedAt: Date.now() };
    save();
    if (was !== licOpen() || (location.hash || '').startsWith('#/settings')) render();
  } catch (e) { /* bez spojenia ostáva posledný známy stav */ }
}

const TIER_FEATS = {
  basic: ['Hotový program na celé telo', 'Knižnica cvikov s technikou', 'Živý tréning a rekordy'],
  medium: ['Program na mieru tvojmu cieľu', 'Vlastné tréningy, 2 až 5 dní', 'Merania, fotky a návyky'],
  pro: ['Všetko z Medium', 'AI asistent (pripravujeme)', 'Nové funkcie ako prvý']
};

function viewPaywall() {
  const back = new URLSearchParams(location.search).has('kluc');
  const l = lic();
  const ended = l?.key && l.status !== 'active';
  return `<section class="paywall">
    <img class="pw-logo" src="icons/icon.svg?v=4" alt="" width="72" height="72">
    <span class="pw-stamp">${LT_PAY.trialDays} dní zadarmo</span>
    <h1>${ended ? 'Lift Tara' : db.settings.profile ? 'Tvoj program je pripravený' : 'Tvoj tréner v mobile'}</h1>
    ${tiersOn() ? `<p class="pw-lead">${ended ? 'Tvoje predplatné skončilo. Dáta máš uložené – po obnovení predplatného sa všetko vráti.' : `Vyber si balíček. Každý má ${LT_PAY.trialDays} dní zadarmo a zrušiť ho môžeš kedykoľvek.`}</p>
    <div class="pw-tiers">${TIER_KEYS.map((k) => { const t = LT_PAY.tiers[k]; const sel = k === wantedTier(); return `<div class="pw-tier${sel ? ' sel' : ''}">
      <div class="pw-tier-head"><b>${t.name}</b><span><strong>${t.price}</strong> / mesiac</span></div>
      <ul>${TIER_FEATS[k].map((x) => `<li>${x}</li>`).join('')}</ul>
      ${t.checkout ? `<a class="btn${sel ? ' primary' : ''} block" href="${esc(t.checkout)}" rel="noopener">${ended ? 'Obnoviť' : `Vyskúšať ${LT_PAY.trialDays} dní zadarmo`}</a>` : ''}
    </div>`; }).join('')}</div>` : `<p class="pw-lead">${ended ? 'Tvoje predplatné skončilo. Dáta máš uložené – po obnovení predplatného sa všetko vráti.' : `Vyskúšaj appku ${LT_PAY.trialDays} dní zadarmo, potom ${LT_PAY.price} mesačne. Zrušiť môžeš kedykoľvek.`}</p>
    <ul class="pw-list">
      <li>Tréningový program na mieru tvojmu cieľu</li>
      <li>Ukážky a technika pri každom cviku</li>
      <li>Živý tréning s pauzami a návrhom váhy</li>
      <li>Rekordy, merania a progres na jednom mieste</li>
    </ul>
    <a class="btn primary block" href="${esc(LT_PAY.checkout)}" rel="noopener">${ended ? 'Obnoviť predplatné' : `Vyskúšať ${LT_PAY.trialDays} dní zadarmo`}</a>`}
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
  const tierName = tiersOn() && l?.key ? `Balíček ${LT_PAY.tiers[TIER_KEYS.includes(l.tier) ? l.tier : 'pro'].name} · ` : '';
  const sub = owner ? 'Bez obmedzenia' : l?.key ? `${tierName}Kľúč …${esc(l.key.slice(-4))}${l.email ? ' · ' + esc(l.email) : ''}` : 'Bez predplatného';
  const val = owner || l?.status === 'active' ? '<span class="badge done">Aktívne</span>' : '<span class="badge warn">Neaktívne</span>';
  return setGroup('Predplatné', [
    setRow({ icon: 'key', title: 'Lift Tara', sub, val, action: owner ? '' : 'license-manage', chev: !owner })
  ], owner ? '' : `${tiersOn() && l?.key ? (LT_PAY.tiers[l.tier] || LT_PAY.tiers.pro).price : LT_PAY.price} mesačne. Predplatné spravuješ v Gumroade (Library).`);
}

actions['license-manage'] = async () => {
  const l = lic();
  licRefresh(true);
  if (LT_PAY.portal && l?.key) {
    const yes = await askConfirm('Otvoriť stránku predplatného? Tam zmeníš kartu alebo predplatné zrušíš.', { ok: 'Otvoriť', cancel: 'Zavrieť' });
    if (yes) window.open(LT_PAY.portal, '_blank', 'noopener');
  } else if (!l?.key) location.hash = '#/';
};

actions['tier-upgrade'] = async (d) => {
  const t = TIER_KEYS.includes(d.tier) ? d.tier : 'medium';
  const l = lic();
  if (l?.key && LT_PAY.portal) {
    const yes = await askConfirm(`Balíček zmeníš na stránke predplatného. Po zmene ťukni v Nastaveniach na Predplatné a appka sa aktualizuje.`, { ok: 'Otvoriť', cancel: 'Zavrieť' });
    if (yes) window.open(LT_PAY.portal, '_blank', 'noopener');
  } else if (tierCheckout(t)) window.open(tierCheckout(t), '_blank', 'noopener');
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
    db.settings.license = { key, status: 'active', email: r.email, tier: r.tier, checkedAt: Date.now(), since: today() };
    save();
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    render();
    toast(tiersOn() ? `Balíček ${LT_PAY.tiers[r.tier].name} je aktívny. Vitaj v Lift Tara!` : 'Apka je odomknutá. Vitaj v Lift Tara!');
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
