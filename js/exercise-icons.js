'use strict';

/* =========================================================
   Miniatúry cvikov – moderné piktogramy (SVG) v štýle športových piktogramov
   Postava: plná hlava, hrubý trup, zaoblené končatiny; vzdialenejšia ruka a noha
   sú priesvitnejšie (hĺbka). Náradie (.eq) a podlaha (.fl) majú tyrkysový prechod.
   Kľúč = názov cviku bez diakritiky a malými písmenami; ak cvik nemá vlastný
   obrázok, použije sa piktogram jeho partie, inak všeobecná činka.
   ========================================================= */
const EXERCISE_ICONS = (() => {
  // rámček 48 × 48, body zadávané ako [x, y]
  // Postava je plná silueta: časti tela sú zúžené „kapsuly“ (hrubšie stehno, tenšie lýtko…),
  // ktoré sa prekrývajú do jedného tvaru – ako siluety na fitness plagátoch.
  const r1 = (v) => Math.round(v * 10) / 10;
  const dot = ([x, y], r) => `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r}"/>`;
  const cap = (a, b, ra, rb) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 0.001;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const s = Math.max(-0.95, Math.min(0.95, (ra - rb) / L)), c = Math.sqrt(1 - s * s);
    const pt = (o, r, sg) => [r1(o[0] + r * (sg * nx * c + ux * s)), r1(o[1] + r * (sg * ny * c + uy * s))];
    const [a1, b1, b2, a2] = [pt(a, ra, 1), pt(b, rb, 1), pt(b, rb, -1), pt(a, ra, -1)];
    // lichobežník medzi dotyčnicami + kruhy na koncoch (zaoblené kĺby)
    return `<path d="M${a1}L${b1}L${b2}L${a2}Z"/>`.replace(/,/g, ' ') + dot(a, ra) + dot(b, rb);
  };
  const add = (p, dx, dy) => [p[0] + dx, p[1] + dy];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // ruka: rameno → lakeť → dlaň (ramenný sval, predlaktie, päsť)
  const arm = (s, [e, hnd]) => cap(s, e, 2.3, 1.7) + cap(e, hnd, 1.7, 1.25) + dot(hnd, 1.6);
  // noha: bedro → koleno → členok + chodidlo smerom „dopredu“
  const leg = (hp, [k, f], dir) => {
    const ux = f[0] - k[0], uy = f[1] - k[1], L = Math.hypot(ux, uy) || 1;
    const toe = Math.abs(uy / L) > 0.6 ? [f[0] + dir * 3.4, f[1] + 0.4] : [f[0] + (ux / L) * 2.6, f[1] + 1.8];
    return cap(hp, k, 3.1, 2.1) + cap(k, f, 2.1, 1.25) + cap(f, toe, 1.25, 1.05);
  };
  // postava: h hlava, n ramená (krk), p panva; a1/l1 bližšia ruka/noha [lakeť/koleno, dlaň/chodidlo], a2/l2 vzdialenejšia
  // front: pohľad spredu (a1/l1 = ľavá strana obrázka); dir: kam smerujú chodidlá pri pohľade zboku
  const fig = ({ h, n, p, a1, a2, l1, l2, front = false, dir }) => {
    const d = dir || (h[0] >= p[0] ? 1 : -1);
    let body = '', back = '';
    const neck = cap(n, lerp(n, h, 0.6), 1.9, 1.6) + `<ellipse cx="${h[0]}" cy="${h[1]}" rx="3.5" ry="3.9"/>`;
    if (front) {
      const sl = add(n, -5, 1), sr = add(n, 5, 1), hl = add(p, -3, 0.5), hr = add(p, 3, 0.5);
      const waist = lerp(n, p, 0.72);
      body = `<path d="M${sl}L${sr}L${add(waist, 3.2, 0)}L${hr}L${hl}L${add(waist, -3.2, 0)}Z" stroke-width="3.2" stroke-linejoin="round" class="sk"/>`.replace(/,/g, ' ')
        + dot(sl, 2.2) + dot(sr, 2.2)
        + (l1 ? leg(hl, l1, -1) : '') + (l2 ? leg(hr, l2, 1) : '') + (a1 ? arm(sl, a1) : '') + (a2 ? arm(sr, a2) : '');
    } else {
      const chest = lerp(n, p, 0.3);
      back = (a2 ? arm(add(n, 0, 1), a2) : '') + (l2 ? leg(p, l2, d) : '');
      body = cap(n, chest, 3.3, 3.9) + cap(chest, p, 3.9, 3.5) + dot(p, 3.6)
        + (l1 ? leg(p, l1, d) : '') + (a1 ? arm(add(n, 0, 1), a1) : '');
    }
    return (back ? `<g class="sil far">${back}</g>` : '') + `<g class="sil">${body}${neck}</g>`;
  };
  const eq = (inner) => `<g class="eq">${inner}</g>`;
  const plate = (x, y, r = 5) => eq(`<circle class="pl" cx="${x}" cy="${y}" r="${r}"/>`);            // činka zboku (kotúč)
  const dumbbell = (x, y) => eq(`<rect class="pl" x="${x - 3.4}" y="${y - 2.4}" width="6.8" height="4.8" rx="2"/>`);
  const barFront = (x1, x2, y) => eq(`<path d="M${x1} ${y}H${x2}" stroke-width="2.4"/><rect class="pl" x="${x1 - 2.2}" y="${y - 4.5}" width="4.4" height="9" rx="1.6"/><rect class="pl" x="${x2 - 2.2}" y="${y - 4.5}" width="4.4" height="9" rx="1.6"/>`);
  const floor = '<path class="fl" d="M6 42.5h36"/>';

  const icons = {
    // Nohy
    'drep': plate(20, 17, 4) + fig({ h: [29, 10], n: [25, 16], p: [18, 28], a1: [[21, 21], [21, 16]], a2: [[23, 22], [23, 17]], l1: [[29, 28], [27, 41]], l2: [[27, 30], [24, 41]] }) + floor,
    'leg press': eq('<path d="M5 39h12L10 22"/><path d="M34 13l5 19M37 22l7 5" />') + fig({ h: [8, 17], n: [11, 22], p: [16, 34], a1: [[13, 30], [17, 34]], l1: [[24, 23], [35, 22]], l2: [[25, 26], [36, 26]] }) + floor,
    'vypady': fig({ h: [22, 9], n: [22, 15], p: [21, 27], a1: [[23, 21], [23, 27]], a2: [[21, 21], [21, 27]], l1: [[31, 28], [31, 41]], l2: [[15, 37], [7, 40]] }) + dumbbell(23, 28) + floor,
    'rumunsky mrtvy tah': fig({ h: [35, 15], n: [30, 18], p: [18, 24], a1: [[30, 25], [29, 31]], a2: [[28, 25], [27, 31]], l1: [[20, 33], [19, 41]], l2: [[22, 33], [22, 41]] }) + plate(29, 32, 4.8) + floor,
    // Zadok
    'hip thrust': eq('<path d="M3 30h11v12"/>') + fig({ h: [8, 24], n: [12, 28], p: [25, 25], a1: [[18, 24], [24, 21]], l1: [[34, 26], [34, 41]], l2: [[32, 27], [31, 41]] }) + plate(24, 19.5, 4.6) + floor,
    // Chrbát
    'mrtvy tah': fig({ h: [31, 12], n: [27, 17], p: [17, 26], a1: [[27, 26], [26, 34]], a2: [[25, 26], [24, 34]], l1: [[24, 31], [22, 41]], l2: [[22, 32], [20, 41]] }) + plate(26, 37, 5.2) + floor,
    'pritahy na hrazde': eq('<path d="M5 5.5h38" stroke-width="2.8"/>') + fig({ front: true, h: [24, 13], n: [24, 19], p: [24, 31], a1: [[14, 14], [16, 6]], a2: [[34, 14], [32, 6]], l1: [[21, 38], [23, 45]], l2: [[27, 38], [29, 45]] }),
    'veslovanie s cinkou': eq('<path d="M4 31h15M7 31v11M16 31v11"/>') + fig({ h: [9, 16], n: [15, 20], p: [29, 21], a1: [[23, 15], [22, 25]], a2: [[12, 25], [12, 30]], l1: [[29, 31], [30, 41]], l2: [[33, 31], [35, 41]] }) + dumbbell(22, 26) + floor,
    'stiahnutie kladky': eq('<path d="M24 1.5v5.5M11 7.5h26" stroke-width="2.6"/><path d="M14 34h20"/>') + fig({ front: true, h: [24, 15], n: [24, 21], p: [24, 33], a1: [[13, 16], [14, 8]], a2: [[35, 16], [34, 8]], l1: [[18, 37], [18, 44]], l2: [[30, 37], [30, 44]] }),
    // Hrudník
    'bench press': eq('<path d="M7 33.5h33M12 33.5v8.5M35 33.5v8.5"/>') + fig({ h: [10, 28], n: [15, 30], p: [28, 30], a1: [[18, 23], [18, 15]], a2: [[20, 23], [20, 15]], l1: [[35, 31], [37, 42]], l2: [[33, 32], [34, 42]] }) + plate(19, 12.5, 4.8),
    'kliky': fig({ h: [40, 20], n: [35, 24], p: [18, 30], a1: [[34, 32], [34, 40]], a2: [[32, 32], [32, 40]], l1: [[12, 35], [6, 40]], l2: [[13, 36], [8, 41]] }) + floor,
    // Ramená
    'tlaky nad hlavu': barFront(8, 40, 5) + fig({ front: true, h: [24, 12], n: [24, 18], p: [24, 30], a1: [[15, 14], [15, 6]], a2: [[33, 14], [33, 6]], l1: [[20, 36], [19, 42]], l2: [[28, 36], [29, 42]] }) + floor,
    'upazovanie': fig({ front: true, h: [24, 10], n: [24, 16], p: [24, 29], a1: [[16, 17], [9, 17]], a2: [[32, 17], [39, 17]], l1: [[21, 35], [20, 42]], l2: [[27, 35], [28, 42]] }) + dumbbell(8, 17) + dumbbell(40, 17) + floor,
    // Ruky
    'bicepsovy zdvih': fig({ front: true, h: [24, 10], n: [24, 16], p: [24, 29], a1: [[18, 24], [15, 17]], a2: [[30, 24], [33, 17]], l1: [[21, 35], [20, 42]], l2: [[27, 35], [28, 42]] }) + dumbbell(14.5, 16) + dumbbell(33.5, 16) + floor,
    'tricepsove stlacenie': eq('<path d="M32 2v4M31 6L29 25" stroke-width="2.2"/><path d="M26 26h6" stroke-width="2.8"/>') + fig({ h: [21, 10], n: [21, 16], p: [20, 29], a1: [[23, 23], [29, 26]], a2: [[21, 23], [27, 27]], l1: [[22, 35], [22, 42]], l2: [[19, 35], [18, 42]] }) + floor,
    // Core
    'plank': fig({ h: [39, 25], n: [34, 28], p: [18, 30], a1: [[33, 39], [40, 39]], a2: [[31, 39], [37, 40]], l1: [[11, 35], [5, 40]], l2: [[12, 36], [7, 41]] }) + floor,
    'dead bug': fig({ h: [8, 36], n: [13, 37], p: [26, 37], a1: [[14, 29], [15, 21]], a2: [[8, 31], [3, 27]], l1: [[27, 28], [35, 28]], l2: [[34, 35], [43, 34]] }) + floor,
    // Celé telo
    'kettlebell swing': fig({ h: [21, 10], n: [21, 16], p: [20, 28], a1: [[28, 18], [35, 19]], a2: [[27, 19], [34, 20]], l1: [[23, 35], [23, 42]], l2: [[19, 35], [17, 42]] }) + eq('<circle class="pl" cx="38" cy="23.5" r="4.2"/><path d="M35.2 20a2.8 2.8 0 0 1 5.6 0"/>') + floor,
    'burpees': fig({ front: true, h: [24, 8], n: [24, 14], p: [24, 26], a1: [[18, 8], [16, 2]], a2: [[30, 8], [32, 2]], l1: [[20, 32], [20, 38]], l2: [[28, 32], [28, 38]] }) + eq('<path d="M15 41.5l-3 2M33 41.5l3 2" opacity=".7"/>') + floor,
    // Kardio
    'veslovaci trenazer': eq('<path d="M4 41h40M39 41V30"/><circle cx="40" cy="26" r="4.2"/><path d="M17 25L36 26" stroke-width="1.8" opacity=".8"/>') + fig({ h: [11, 16], n: [12, 22], p: [14, 35], a1: [[9, 28], [17, 25]], l1: [[24, 26], [33, 34]], l2: [[25, 28], [34, 36]] })
  };
  const run = fig({ h: [27, 8], n: [26, 14], p: [22, 26], a1: [[31, 18], [35, 14]], a2: [[19, 20], [14, 17]], l1: [[30, 31], [28, 40]], l2: [[16, 33], [10, 30]] }) + floor;
  const categories = {
    'nohy': icons['drep'], 'zadok': icons['hip thrust'], 'chrbat': icons['mrtvy tah'], 'hrudnik': icons['bench press'],
    'ramena': icons['tlaky nad hlavu'], 'ruky': icons['bicepsovy zdvih'], 'core': icons['plank'],
    'cele telo': icons['kettlebell swing'], 'kardio': run
  };
  const generic = barFront(8, 40, 24) + eq('<path d="M13 17v14M35 17v14" stroke-width="3"/>');
  const fold = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // prechody farieb (gradient) – definované raz v dokumente, súradnice v rámčeku 48 × 48
  // (userSpaceOnUse: funguje aj pre vodorovné/zvislé čiary, ktoré nemajú výšku/šírku)
  const defs = () => {
    if (typeof document === 'undefined' || !document.body || document.getElementById('exg-defs')) return;
    document.body.insertAdjacentHTML('beforeend', `<svg id="exg-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
      <linearGradient id="exg-body" gradientUnits="userSpaceOnUse" x1="0" y1="8" x2="0" y2="40"><stop offset="0" class="exg-b0"/><stop offset="1" class="exg-b1"/></linearGradient>
      <linearGradient id="exg-eq" gradientUnits="userSpaceOnUse" x1="6" y1="4" x2="42" y2="44"><stop offset="0" class="exg-e0"/><stop offset="1" class="exg-e1"/></linearGradient>
    </defs></svg>`);
  };
  const svg = (inner) => `<svg class="ex-thumb" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  return (exercise) => (defs(), svg(icons[fold(exercise?.name)] || categories[fold(exercise?.category)] || generic));
})();

/* =========================================================
   Technika cvikov – krátke rady pre základné cviky (keď tréner nenapísal vlastný popis)
   Kľúč = názov cviku bez diakritiky a malými písmenami.
   ========================================================= */
const EXERCISE_TIPS = {
  'drep': ['Chodidlá na šírku ramien, špičky mierne von.', 'Zadok dozadu a dole, kolená idú v smere špičiek.', 'Chrbát rovný, hrudník hore, päty celý čas na zemi.', 'Choď aspoň do paralely, hore sa odraz celým chodidlom.'],
  'leg press': ['Chodidlá na plošine na šírku ramien, celé chodidlo na plošine.', 'Spúšťaj pomaly, kým stehná nie sú zhruba v pravom uhle.', 'Driek ostáva pritlačený k operadlu.', 'Hore nezamykaj kolená úplne.'],
  'vypady': ['Krok dopredu dlhší, trup vzpriamený.', 'Zadné koleno ide kolmo dole takmer k zemi.', 'Predné koleno nad členkom, nepadá dovnútra.', 'Odraz cez pätu prednej nohy.'],
  'rumunsky mrtvy tah': ['Kolená len mierne pokrčené, celý čas rovnako.', 'Pohyb ide z bokov – zadok tlač dozadu.', 'Činka tesne pri stehnách, chrbát rovný.', 'Choď len kým cítiš ťah v zadnej strane stehien.'],
  'hip thrust': ['Lopatky opreté o lavičku, chodidlá na šírku bokov.', 'Bradu drž pri hrudi, rebrá dole.', 'Hore zatni zadok, boky v jednej línii s kolenami a ramenami.', 'Neprehýbaj sa v driekovej chrbtici.'],
  'mrtvy tah': ['Činka nad stredom chodidla, ramená mierne pred činkou.', 'Pred ťahom napni chrbát a „odlomi“ činku zo zeme.', 'Činka ide tesne po holeniach a stehnách.', 'Hore vystri boky, nezakláňaj sa.'],
  'pritahy na hrazde': ['Úchop trochu širší ako ramená.', 'Začni stiahnutím lopatiek dole a k sebe.', 'Ťahaj lakte k bokom, brada nad hrazdu.', 'Spúšťaj sa kontrolovane do takmer vystretých rúk.'],
  'veslovanie s cinkou': ['Opri sa rukou a kolenom o lavičku, chrbát rovno.', 'Ťahaj lakeť dozadu k boku, nie hore k uchu.', 'Hore stiahni lopatku, chvíľu podrž.', 'Neotáčaj trup, pohyb ide len z ruky a lopatky.'],
  'stiahnutie kladky': ['Úchop trochu širší ako ramená, sed vzpriamene.', 'Ťahaj tyč k hornej časti hrudníka.', 'Lakte smerujú dole k bokom, lopatky dole.', 'Nezakláňaj sa a nehojdaj trupom.'],
  'bench press': ['Lopatky stiahnuté a pritlačené k lavičke.', 'Chodidlá pevne na zemi, malý oblúk v chrbte je v poriadku.', 'Činka ide na spodnú časť hrudníka, lakte asi 45° od tela.', 'Tlač hore a mierne k hlave.'],
  'kliky': ['Ruky trochu širšie ako ramená, telo v jednej línii.', 'Zatni brucho a zadok, boky nepadajú.', 'Lakte smerujú šikmo dozadu, nie do strán.', 'Hrudník ide takmer k zemi.'],
  'tlaky nad hlavu': ['Zatni brucho a zadok, nezakláňaj sa.', 'Činka ide tesne okolo tváre rovno hore.', 'Hore sú ruky vedľa uší, hlava mierne vpred.', 'Spúšťaj kontrolovane k hornej časti hrudníka.'],
  'upazovanie': ['Mierne pokrčené lakte, ramená dole od uší.', 'Dvíhaj do strán len po výšku ramien.', 'Vedie lakeť, nie dlaň.', 'Spúšťaj pomaly, bez hojdania.'],
  'bicepsovy zdvih': ['Lakte pri tele, nehýbu sa dopredu.', 'Zdvihni s výdychom, hore zatni biceps.', 'Spúšťaj pomaly do takmer vystretých rúk.', 'Nehojdaj trupom.'],
  'tricepsove stlacenie': ['Lakte pri bokoch, nehýbu sa.', 'Tlač dole až do vystretých rúk.', 'Dole chvíľu podrž, hore pomaly.', 'Trup mierne naklonený, ramená dole.'],
  'plank': ['Lakte pod ramenami, telo v jednej línii.', 'Zatni brucho a zadok, boky nepadajú ani netrčia.', 'Hlava v predĺžení chrbta, pozeraj do zeme.', 'Dýchaj pokojne, nezadržiavaj dych.'],
  'dead bug': ['Ľahni na chrbát, ruky hore, kolená nad bokmi v 90°.', 'Driek pritlačený k zemi celý čas.', 'Pomaly vystri opačnú ruku a nohu.', 'Vráť sa a vymeň strany, s výdychom.'],
  'kettlebell swing': ['Pohyb ide z bokov, nie z drepu.', 'Kettlebell pošli dozadu medzi nohy, chrbát rovný.', 'Výbušne vystri boky a zatni zadok.', 'Ruky len vedú, kettlebell letí do výšky hrudníka.'],
  'burpees': ['Z drepu polož ruky na zem a vyskoč do kliku.', 'Telo v kliku rovné, boky nepadajú.', 'Nohy vráť k rukám a vyskoč s rukami hore.', 'Dopadaj mäkko na celé chodidlá.'],
  'veslovaci trenazer': ['Poradie: nohy – trup – ruky, späť naopak.', 'Odraz nohami, trup mierne dozadu.', 'Ťahaj rukoväť k spodným rebrám.', 'Chrbát rovný, ramená dole.']
};
const EXERCISE_TIP_KEY = (name) => String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const exerciseTips = (exercise) => EXERCISE_TIPS[EXERCISE_TIP_KEY(exercise?.name)] || null;
// odkaz na video: YouTube → adresa na vloženie (bez sledovacích cookies), iné https odkazy ostanú odkazom
function exerciseVideo(url) {
  const u = String(url || '').trim();
  if (!/^https:\/\/[^\s"'<>]+$/.test(u)) return null;
  const m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? { embed: `https://www.youtube-nocookie.com/embed/${m[1]}`, url: u } : { embed: '', url: u };
}
