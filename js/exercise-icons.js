'use strict';

/* =========================================================
   Miniatúry cvikov – jednoduché piktogramy (SVG), kreslené čiarou
   Kľúč = názov cviku bez diakritiky a malými písmenami; ak cvik nemá vlastný
   obrázok, použije sa piktogram jeho partie, inak všeobecná činka.
   ========================================================= */
const EXERCISE_ICONS = (() => {
  // postavička: hlava + telo z čiar; všetko v rámčeku 48 × 48, kreslí sa aktuálnou farbou
  const head = (x, y) => `<circle cx="${x}" cy="${y}" r="3.2"/>`;
  const bar = (x1, y1, x2, y2) => `<path d="M${x1} ${y1}L${x2} ${y2}" stroke-width="3.4"/><circle cx="${x1}" cy="${y1}" r="2.2" fill="currentColor"/><circle cx="${x2}" cy="${y2}" r="2.2" fill="currentColor"/>`;
  const floor = '<path d="M6 42h36" opacity=".35"/>';
  const icons = {
    // Nohy
    'drep': head(24, 10) + '<path d="M24 13v10l-7 8v9M24 23l7 8v9M14 16h20"/>' + bar(10, 16, 38, 16) + floor,
    'leg press': head(10, 30) + '<path d="M10 33h10l10-8 8 2M20 33l8 6M30 25l6-10"/><path d="M36 15l5-3M36 15l6 4" opacity=".6"/>' + floor,
    'vypady': head(16, 9) + '<path d="M16 12v12l-8 9v8M16 24l10 6 6 10M8 18h16"/>' + floor,
    'rumunsky mrtvy tah': head(30, 10) + '<path d="M30 13l-10 10 2 18M22 23l-4 16M20 23l10 4v6"/>' + bar(24, 31, 34, 31) + floor,
    // Zadok
    'hip thrust': '<path d="M8 36v-10h6"/>' + head(10, 22) + '<path d="M14 26l12-2 10 2 6 12M26 24l-2 10M30 26l-4 8"/>' + bar(18, 23, 30, 23) + floor,
    // Chrbát
    'mrtvy tah': head(24, 12) + '<path d="M24 15l-6 10v10M24 15l6 10v10M18 25l6-2 6 2M19 34v-9M29 34v-9"/>' + bar(14, 34, 34, 34) + floor,
    'pritahy na hrazde': '<path d="M8 8h32"/>' + head(24, 16) + '<path d="M24 19v12l-4 9M24 31l4 9M16 8l8 11 8-11"/>',
    'veslovanie s cinkou': head(32, 12) + '<path d="M32 15l-12 8-4 18M20 23l-2 18M20 23l8 2 2 7M30 32l-6 1"/>' + bar(24, 34, 34, 34) + floor,
    'stiahnutie kladky': '<path d="M24 4v6M16 10h16"/>' + head(24, 20) + '<path d="M24 23v9l-6 10M24 32l6 10M16 10l8 10 8-10"/>' + floor,
    // Hrudník
    'bench press': '<path d="M10 32h28M14 32v10M34 32v10"/>' + head(13, 27) + '<path d="M17 28h20M24 28v-10M20 18h8"/>' + bar(14, 16, 34, 16),
    'kliky': head(38, 22) + '<path d="M35 25L12 33l-4 8M20 30l-3 9M12 33l-4-1"/>' + floor,
    // Ramená
    'tlaky nad hlavu': head(24, 14) + '<path d="M24 17v12l-6 12M24 29l6 12M24 20l-7-6M24 20l7-6"/>' + bar(12, 10, 36, 10) + floor,
    'upazovanie': head(24, 12) + '<path d="M24 15v14l-5 12M24 29l5 12M24 19l-12 0M24 19h12"/><circle cx="10" cy="19" r="2.4" fill="currentColor"/><circle cx="38" cy="19" r="2.4" fill="currentColor"/>' + floor,
    // Ruky
    'bicepsovy zdvih': head(24, 12) + '<path d="M24 15v14l-5 12M24 29l5 12M24 20l-7 8-2-6M24 20l7 8 2-6"/><circle cx="15" cy="22" r="2.4" fill="currentColor"/><circle cx="33" cy="22" r="2.4" fill="currentColor"/>' + floor,
    'tricepsove stlacenie': '<path d="M24 4v4M18 8h12"/>' + head(24, 16) + '<path d="M24 19v12l-5 10M24 31l5 10M24 23l-6 4 2 6M24 23l6 4-2 6"/><path d="M18 33h12" stroke-width="3"/>' + floor,
    // Core
    'plank': head(40, 26) + '<path d="M37 28L12 32l-4 7M12 32l0 7M30 29l0 10"/>' + floor,
    'dead bug': head(8, 34) + '<path d="M11 34h18M19 34l6-12M29 34l-2-12M14 34l3-14M26 34l10-6"/>' + floor,
    // Celé telo
    'kettlebell swing': head(24, 12) + '<path d="M24 15v12l-6 14M24 27l6 14M24 18l10-6"/><circle cx="36" cy="10" r="3.5"/><path d="M34 7a2 2 0 0 1 4 0"/>' + floor,
    'burpees': head(24, 8) + '<path d="M24 11v8M18 14l6 5 6-5M24 19l-5 9M24 19l5 9" opacity=".55"/>' + head(42, 30) + '<path d="M39 32L20 36l-6 6M20 36l2 6"/>' + floor,
    // Kardio
    'veslovaci trenazer': '<path d="M6 38h36M10 38v-4h22"/>' + head(26, 20) + '<path d="M26 23l-8 10M18 33l-6 3M26 25l6-2 4 6M36 29l-4 0"/>'
  };
  const categories = {
    'nohy': head(24, 10) + '<path d="M24 13v10l-7 8v9M24 23l7 8v9"/>' + floor,
    'zadok': head(10, 22) + '<path d="M14 26l12-2 10 2 6 12M26 24l-2 10"/>' + floor,
    'chrbat': head(24, 12) + '<path d="M24 15l-6 10v10M24 15l6 10v10M18 25l12 0"/>' + floor,
    'hrudnik': head(24, 12) + '<path d="M24 15v14l-6 12M24 29l6 12M12 20l12 2 12-2"/>' + floor,
    'ramena': head(24, 12) + '<path d="M24 15v14l-6 12M24 29l6 12M24 19l-10-6M24 19l10-6"/>' + floor,
    'ruky': head(24, 12) + '<path d="M24 15v14l-6 12M24 29l6 12M24 20l-8 6M24 20l8 6"/>' + floor,
    'core': head(40, 26) + '<path d="M37 28L12 32l-4 7M12 32l0 7"/>' + floor,
    'cele telo': head(24, 10) + '<path d="M24 13v12l-7 14M24 25l7 14M24 16l-10 6M24 16l10 6"/>' + floor,
    'kardio': head(28, 10) + '<path d="M28 13l-6 10 4 8-6 10M22 23l-8-2M26 31l8 4M28 13l8 6"/>' + floor
  };
  const generic = bar(8, 24, 40, 24) + '<path d="M12 18v12M36 18v12" stroke-width="3.4"/>';
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const svg = (inner) => `<svg class="ex-thumb" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  return (exercise) => svg(icons[fold(exercise?.name)] || categories[fold(exercise?.category)] || generic);
})();
