'use strict';

/* =========================================================
   Babka Greta – maskot Lift Tara. Na Prehľade povie trénerovi
   krátku hlášku (každý deň inú, počas dňa sa nemení).
   ========================================================= */
const GRETA_IMG = 'icons/greta/avatar.jpg';
const GRETA_TRAINER = [
  'Ráno som odcvičila skôr, než vstali sliepky. Tvoji klienti majú celý deň.',
  'Klient, ktorý príde načas, je zlato. Ten, čo príde aj v daždi, je diamant.',
  'Nezabudni si zapísať, kto zaplatil. Ja si pamätám každé euro od roku 1962.',
  'Pochváľ dnes aspoň jedného klienta. Mňa za drep chválili naposledy pri žatve.',
  'Plán bez zápisu je ako koláč bez cukru. Dá sa, ale prečo.',
  'Kto netrénuje nohy, nech mi nechodí na oči.',
  'Voda, spánok, kroky. Toto som vedela aj bez appky, ale nech sa páči.'
];
const gretaPick = (list) => {
  const d = new Date();
  const day = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
  return list[day % list.length];
};
const gretaHtml = (text, cls = '') => `<div class="greta${cls ? ' ' + cls : ''}">
  <img src="${GRETA_IMG}" alt="Babka Greta" width="52" height="52" loading="lazy">
  <div class="greta-bubble"><b>Greta</b>${esc(tr(text))}</div>
</div>`;

const renderWithoutGreta = render;
render = function (...args) {
  const r = renderWithoutGreta.apply(this, args);
  const h = location.hash || '#/';
  if ((h === '#/' || h === '#') && !document.getElementById('greta-home')) {
    const hero = document.querySelector('#main > .hero, main > .hero');
    if (hero) hero.insertAdjacentHTML('afterend', gretaHtml(gretaPick(GRETA_TRAINER)).replace('<div class="greta', '<div id="greta-home" class="greta'));
  }
  return r;
};
