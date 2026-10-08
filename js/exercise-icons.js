'use strict';

/* =========================================================
   Miniatúry cvikov – moderné piktogramy (SVG)
   Postavička je vo farbe textu (plná hlava, zaoblené čiary), náradie (.eq)
   a podlaha (.fl) majú tyrkysový nádych – farby určuje CSS.
   Kľúč = názov cviku bez diakritiky a malými písmenami; ak cvik nemá vlastný
   obrázok, použije sa piktogram jeho partie, inak všeobecná činka.
   ========================================================= */
const EXERCISE_ICONS = (() => {
  // všetko v rámčeku 48 × 48
  const head = (x, y) => `<circle class="hd" cx="${x}" cy="${y}" r="3.6"/>`;
  const eq = (inner) => `<g class="eq">${inner}</g>`;
  // činka: tyč + kotúče
  const bar = (x1, y1, x2, y2) => eq(`<path d="M${x1} ${y1}L${x2} ${y2}" stroke-width="2.6"/><rect class="pl" x="${x1 - 2.2}" y="${y1 - 4.2}" width="4.4" height="8.4" rx="1.6"/><rect class="pl" x="${x2 - 2.2}" y="${y2 - 4.2}" width="4.4" height="8.4" rx="1.6"/>`);
  // jednoručka
  const db = (x, y) => eq(`<rect class="pl" x="${x - 3.2}" y="${y - 2.2}" width="6.4" height="4.4" rx="1.8"/>`);
  const floor = '<path class="fl" d="M8 42.5h32"/>';
  const icons = {
    // Nohy
    'drep': head(24, 9) + '<path d="M24 13v10l-7 8v9M24 23l7 8v9M15 16h18"/>' + bar(10, 16, 38, 16) + floor,
    'leg press': head(10, 30) + '<path d="M10 34h10l10-8 6 1M20 34l8 6"/>' + eq('<path d="M30 26l6-10M35 13l6-3M35 13l7 5"/>') + floor,
    'vypady': head(16, 8) + '<path d="M16 12v12l-8 9v8M16 24l10 6 6 10M9 18h14"/>' + db(8, 18) + db(24, 18) + floor,
    'rumunsky mrtvy tah': head(30, 9) + '<path d="M30 13l-10 10 2 18M22 23l-4 16M20 23l10 4v4"/>' + bar(23, 31, 35, 31) + floor,
    // Zadok
    'hip thrust': eq('<path d="M6 36v-10h7"/>') + head(10, 22) + '<path d="M14 26l12-2 10 2 6 12M26 24l-2 10M30 26l-4 8"/>' + bar(17, 22, 31, 22) + floor,
    // Chrbát
    'mrtvy tah': head(24, 11) + '<path d="M24 15l-6 10v10M24 15l6 10v10M18 25l6-2 6 2M19 34v-9M29 34v-9"/>' + bar(13, 34, 35, 34) + floor,
    'pritahy na hrazde': eq('<path d="M7 7h34" stroke-width="2.8"/>') + head(24, 16) + '<path d="M24 20v11l-4 9M24 31l4 9M16 7l8 12 8-12"/>',
    'veslovanie s cinkou': head(32, 11) + '<path d="M32 15l-12 8-4 18M20 23l-2 18M20 23l8 2 2 7"/>' + db(30, 33) + floor,
    'stiahnutie kladky': eq('<path d="M24 3v6M15 9h18" stroke-width="2.8"/>') + head(24, 20) + '<path d="M24 24v8l-6 10M24 32l6 10M15 9l9 11 9-11"/>' + floor,
    // Hrudník
    'bench press': eq('<path d="M9 32h30M14 32v9M34 32v9"/>') + head(13, 27) + '<path d="M17 28h19M24 28v-11"/>' + bar(14, 16, 34, 16),
    'kliky': head(38, 21) + '<path d="M35 25L12 33l-4 8M20 30l-3 10M12 33l-4-1"/>' + floor,
    // Ramená
    'tlaky nad hlavu': head(24, 14) + '<path d="M24 18v11l-6 12M24 29l6 12M24 21l-8-7M24 21l8-7"/>' + bar(11, 10, 37, 10) + floor,
    'upazovanie': head(24, 11) + '<path d="M24 15v14l-5 12M24 29l5 12M24 19H12M24 19h12"/>' + db(10, 19) + db(38, 19) + floor,
    // Ruky
    'bicepsovy zdvih': head(24, 11) + '<path d="M24 15v14l-5 12M24 29l5 12M24 20l-7 8-2-6M24 20l7 8 2-6"/>' + db(15, 21) + db(33, 21) + floor,
    'tricepsove stlacenie': eq('<path d="M24 3v4M17 7h14" stroke-width="2.8"/>') + head(24, 15) + '<path d="M24 19v12l-5 10M24 31l5 10M24 23l-6 4 2 6M24 23l6 4-2 6"/>' + eq('<path d="M18 33h12" stroke-width="2.8"/>') + floor,
    // Core
    'plank': head(40, 25) + '<path d="M36 28L12 32l-4 8M12 32v8M30 29v11"/>' + floor,
    'dead bug': head(8, 33) + '<path d="M12 34h17M19 34l6-12M29 34l-2-12M14 34l3-14M26 34l10-6"/>' + floor,
    // Celé telo
    'kettlebell swing': head(24, 11) + '<path d="M24 15v12l-6 14M24 27l6 14M24 18l9-6"/>' + eq('<circle class="pl" cx="36" cy="10" r="4"/><path d="M33.5 6.5a2.6 2.6 0 0 1 5 0"/>') + floor,
    'burpees': '<g opacity=".45">' + head(24, 7) + '<path d="M24 11v8M18 14l6 5 6-5M24 19l-5 9M24 19l5 9"/></g>' + head(41, 29) + '<path d="M37 31L20 35l-6 6M20 35l2 6"/>' + floor,
    // Kardio
    'veslovaci trenazer': eq('<path d="M6 38h36M10 38v-4h22"/>') + head(26, 19) + '<path d="M26 23l-8 10M18 33l-6 3M26 25l6-2 4 6"/>' + eq('<path d="M36 29h-4"/>')
  };
  const categories = {
    'nohy': head(24, 9) + '<path d="M24 13v10l-7 8v9M24 23l7 8v9"/>' + floor,
    'zadok': head(10, 22) + '<path d="M14 26l12-2 10 2 6 12M26 24l-2 10"/>' + floor,
    'chrbat': head(24, 11) + '<path d="M24 15l-6 10v10M24 15l6 10v10M18 25h12"/>' + floor,
    'hrudnik': head(24, 11) + '<path d="M24 15v14l-6 12M24 29l6 12M12 20l12 2 12-2"/>' + floor,
    'ramena': head(24, 11) + '<path d="M24 15v14l-6 12M24 29l6 12M24 19l-10-6M24 19l10-6"/>' + floor,
    'ruky': head(24, 11) + '<path d="M24 15v14l-6 12M24 29l6 12M24 20l-8 6M24 20l8 6"/>' + floor,
    'core': head(40, 25) + '<path d="M36 28L12 32l-4 8M12 32v8"/>' + floor,
    'cele telo': head(24, 9) + '<path d="M24 13v12l-7 14M24 25l7 14M24 16l-10 6M24 16l10 6"/>' + floor,
    'kardio': head(28, 9) + '<path d="M28 13l-6 10 4 8-6 10M22 23l-8-2M26 31l8 4M28 13l8 6"/>' + floor
  };
  const generic = bar(9, 24, 39, 24) + eq('<path d="M14 18v12M34 18v12" stroke-width="2.8"/>');
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const svg = (inner) => `<svg class="ex-thumb" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  return (exercise) => svg(icons[fold(exercise?.name)] || categories[fold(exercise?.category)] || generic);
})();
