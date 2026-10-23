'use strict';

/* =========================================================
   Babka Greta – maskot Lift Tara. Na obrazovke Dnes povie
   krátku hlášku (každý deň inú, počas dňa sa nemení).
   ========================================================= */
const GRETA_IMG = 'icons/greta/avatar.jpg';
const GRETA_TRAINER = [
  'Ráno som odcvičila skôr, než vstali sliepky. Ty máš na to celý deň.',
  'Nevynechávaj. Vymeň. Kto hľadá, nájde spôsob.',
  'Voda, spánok, kroky. Toto som vedela aj bez appky.',
  'Rekordy sa nerobia na gauči.',
  'Aj ja som raz začínala. V roku 1962.',
  'Zjedz niečo poriadne, vyzeráš ako rezanec.',
  'Radšej o jedno opakovanie menej, ale poriadne.',
  'Kolená von, hrudník hore. Ja drepujem hlbšie aj s vrecom zemiakov.'
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
