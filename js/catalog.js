'use strict';

/* =========================================================
   Lift Tara – knižnica cvikov a generátor programov
   Každý cvik má partiu, náradie (kde sa dá cvičiť), zapojené svaly,
   rady k technike a najčastejšie chyby. Generátor z dotazníka (cieľ,
   úroveň, dni týždenne, miesto, obmedzenia) poskladá týždenný program.
   ========================================================= */

// kde sa dá cvik robiť: gym = posilňovňa, db = doma s jednoručkami, bw = bez náradia
const CATALOG = [
  // Nohy
  { name: 'Drep', category: 'Nohy', places: ['gym'], muscles: 'Stehná, zadok, stred tela', mistakes: ['Kolená padajú dovnútra.', 'Päty sa dvíhajú zo zeme.', 'Guľatý chrbát v spodnej polohe.'] },
  { name: 'Goblet drep', category: 'Nohy', places: ['gym', 'db'], muscles: 'Stehná, zadok, stred tela', tips: ['Jednoručku drž zvislo pri hrudi oboma rukami.', 'Chodidlá na šírku ramien, špičky mierne von.', 'Zadok dole medzi päty, lakte idú popri kolenách.', 'Hrudník hore, hore sa odraz celým chodidlom.'], mistakes: ['Jednoručka odstupuje od hrudníka.', 'Predklon trupu namiesto drepu.', 'Plytký drep.'] },
  { name: 'Drep s vlastnou váhou', category: 'Nohy', places: ['gym', 'db', 'bw'], muscles: 'Stehná, zadok', tips: ['Chodidlá na šírku ramien, ruky pred sebou.', 'Zadok dozadu a dole, ako keď si sadáš na stoličku.', 'Kolená idú v smere špičiek, päty na zemi.', 'Hore vystri boky a zatni zadok.'], mistakes: ['Kolená padajú dovnútra.', 'Váha na špičkách.', 'Príliš rýchle tempo bez kontroly.'] },
  { name: 'Leg press', category: 'Nohy', places: ['gym'], muscles: 'Stehná, zadok', mistakes: ['Driek sa odlepuje od operadla.', 'Zamknuté kolená hore.', 'Príliš malý rozsah.'] },
  { name: 'Výpady', category: 'Nohy', places: ['gym', 'db', 'bw'], muscles: 'Stehná, zadok, rovnováha', mistakes: ['Predné koleno padá dovnútra.', 'Krátky krok – koleno ide ďaleko pred špičku.', 'Predklon trupu.'] },
  { name: 'Bulharský drep', category: 'Nohy', places: ['gym', 'db', 'bw'], muscles: 'Stehná, zadok, rovnováha', tips: ['Zadnú nohu polož nártom na lavičku alebo stoličku.', 'Predná noha dostatočne vpredu, trup vzpriamený.', 'Klesaj rovno dole, kým stehno nie je vodorovne.', 'Odraz cez pätu prednej nohy.'], mistakes: ['Predná noha príliš blízko lavičky.', 'Odrážanie sa zadnou nohou.', 'Koleno padá dovnútra.'] },
  { name: 'Rumunský mŕtvy ťah', category: 'Nohy', places: ['gym'], muscles: 'Zadná strana stehien, zadok, chrbát', mistakes: ['Guľatý chrbát.', 'Kolená sa krčia ako pri drepe.', 'Činka sa vzďaľuje od nôh.'] },
  { name: 'Rumunský mŕtvy ťah s jednoručkami', category: 'Nohy', places: ['gym', 'db'], muscles: 'Zadná strana stehien, zadok, chrbát', tips: ['Jednoručky drž pred stehnami, kolená mierne pokrčené.', 'Tlač zadok dozadu, jednoručky kĺžu tesne po nohách.', 'Chrbát rovný, ramená dozadu.', 'Choď len kým cítiš ťah v zadnej strane stehien.'], mistakes: ['Guľatý chrbát.', 'Príliš hlboký predklon bez ťahu v stehnách.', 'Jednoručky ďaleko od nôh.'] },
  { name: 'Výpony na lýtka', category: 'Nohy', places: ['gym', 'db', 'bw'], muscles: 'Lýtka', tips: ['Postav sa na špičky na schod alebo platňu.', 'Päty spusti čo najnižšie, kým cítiš ťah.', 'Vytlač sa vysoko na špičky a chvíľu podrž.', 'Pohyb pomaly, bez hojdania.'], mistakes: ['Malý rozsah pohybu.', 'Pérovanie bez kontroly.', 'Krčenie kolien.'] },
  // Zadok
  { name: 'Hip thrust', category: 'Zadok', places: ['gym'], muscles: 'Zadok, zadná strana stehien', mistakes: ['Prehýbanie v driekovej chrbtici.', 'Chodidlá príliš ďaleko alebo blízko.', 'Hore bez zatnutia zadku.'] },
  { name: 'Glute bridge', category: 'Zadok', places: ['gym', 'db', 'bw'], muscles: 'Zadok, zadná strana stehien, stred tela', tips: ['Ľahni na chrbát, kolená pokrčené, chodidlá na šírku bokov.', 'Zatni brucho a zadok.', 'Zdvihni boky, kým telo netvorí líniu od ramien po kolená.', 'Hore chvíľu podrž, spúšťaj pomaly.'], mistakes: ['Prehýbanie v drieku namiesto zatnutia zadku.', 'Odtláčanie sa špičkami.', 'Príliš rýchle tempo.'] },
  // Chrbát
  { name: 'Mŕtvy ťah', category: 'Chrbát', places: ['gym'], muscles: 'Celá zadná strana tela', mistakes: ['Guľatý chrbát.', 'Trhnutie činky zo zeme.', 'Záklon hore.'] },
  { name: 'Príťahy na hrazde', category: 'Chrbát', places: ['gym'], muscles: 'Široký sval chrbta, biceps', mistakes: ['Hojdanie a švihanie nohami.', 'Polovičný rozsah.', 'Ramená vytiahnuté k ušiam.'] },
  { name: 'Stiahnutie kladky', category: 'Chrbát', places: ['gym'], muscles: 'Široký sval chrbta, biceps', mistakes: ['Záklon a ťahanie trupom.', 'Tyč za hlavu.', 'Ramená hore pri ušiach.'] },
  { name: 'Veslovanie s činkou', category: 'Chrbát', places: ['gym', 'db'], muscles: 'Stred chrbta, zadné ramená, biceps', mistakes: ['Rotácia trupu.', 'Ťahanie lakťom k uchu.', 'Guľatý chrbát.'] },
  { name: 'Austrálske príťahy', category: 'Chrbát', places: ['gym', 'db', 'bw'], muscles: 'Stred chrbta, biceps, stred tela', tips: ['Ľahni pod pevný stôl alebo nízku hrazdu a chyť hranu.', 'Telo rovné ako doska, päty na zemi.', 'Pritiahni hrudník k hrane, lopatky k sebe.', 'Spúšťaj sa pomaly do vystretých rúk.'], mistakes: ['Boky padajú dole.', 'Ťahanie len rukami bez lopatiek.', 'Trhavý pohyb.'] },
  { name: 'Superman', category: 'Chrbát', places: ['gym', 'db', 'bw'], muscles: 'Vzpriamovače chrbta, zadok', tips: ['Ľahni na brucho, ruky vystreté pred sebou.', 'Súčasne zdvihni ruky, hrudník a nohy kúsok od zeme.', 'Hore 2 sekundy podrž, pozeraj do zeme.', 'Pomaly spusti.'], mistakes: ['Záklon hlavy.', 'Prudké trhnutie hore.', 'Príliš vysoký zdvih s bolesťou v drieku.'] },
  // Hrudník
  { name: 'Bench press', category: 'Hrudník', places: ['gym'], muscles: 'Prsné svaly, predné ramená, triceps', mistakes: ['Lakte roztiahnuté do strán.', 'Zadok sa dvíha z lavičky.', 'Odrážanie činky od hrudníka.'] },
  { name: 'Tlak jednoručiek na lavičke', category: 'Hrudník', places: ['gym', 'db'], muscles: 'Prsné svaly, predné ramená, triceps', tips: ['Ľahni na lavičku alebo na zem, jednoručky nad hrudníkom.', 'Lopatky stiahnuté, chodidlá pevne na zemi.', 'Spúšťaj k hrudníku, lakte asi 45° od tela.', 'Vytlač hore a jednoručky mierne priblíž.'], mistakes: ['Lakte do strán.', 'Nerovnomerný pohyb rúk.', 'Príliš rýchle spúšťanie.'] },
  { name: 'Kliky', category: 'Hrudník', places: ['gym', 'db', 'bw'], muscles: 'Prsné svaly, triceps, stred tela', mistakes: ['Boky padajú alebo trčia.', 'Lakte do strán.', 'Hlava predbieha telo.'] },
  { name: 'Kliky na kolenách', category: 'Hrudník', places: ['gym', 'db', 'bw'], muscles: 'Prsné svaly, triceps', tips: ['Kolená na podložke, telo rovné od kolien po hlavu.', 'Ruky trochu širšie ako ramená.', 'Hrudník spúšťaj takmer k zemi.', 'Vytlač sa hore, brucho zatnuté.'], mistakes: ['Zadok trčí hore.', 'Malý rozsah.', 'Lakte do strán.'] },
  // Ramená
  { name: 'Tlaky nad hlavu', category: 'Ramená', places: ['gym'], muscles: 'Ramená, triceps, stred tela', mistakes: ['Záklon trupu.', 'Činka ide pred tvárou ďaleko od tela.', 'Neúplné vystretie hore.'] },
  { name: 'Tlaky jednoručiek nad hlavu', category: 'Ramená', places: ['gym', 'db'], muscles: 'Ramená, triceps', tips: ['Jednoručky pri ramenách, dlane dopredu.', 'Zatni brucho a zadok.', 'Vytlač hore nad hlavu, ruky vedľa uší.', 'Spúšťaj pomaly späť k ramenám.'], mistakes: ['Prehýbanie v drieku.', 'Jednoručky sa zrážajú hore.', 'Malý rozsah dole.'] },
  { name: 'Pike kliky', category: 'Ramená', places: ['gym', 'db', 'bw'], muscles: 'Ramená, triceps', tips: ['Z kliku zdvihni zadok hore, telo tvorí obrátené V.', 'Ruky na šírku ramien.', 'Hlavu spúšťaj medzi ruky k zemi.', 'Vytlač sa späť hore.'], mistakes: ['Boky klesajú – z cviku je bežný klik.', 'Lakte do strán.', 'Náraz hlavou o zem.'] },
  { name: 'Upažovanie', category: 'Ramená', places: ['gym', 'db'], muscles: 'Bočné ramená', mistakes: ['Hojdanie trupom.', 'Dvíhanie nad úroveň ramien.', 'Vytiahnuté ramená k ušiam.'] },
  // Ruky
  { name: 'Bicepsový zdvih', category: 'Ruky', places: ['gym', 'db'], muscles: 'Biceps', mistakes: ['Lakte idú dopredu.', 'Hojdanie trupom.', 'Rýchle spúšťanie.'] },
  { name: 'Tricepsové stlačenie', category: 'Ruky', places: ['gym'], muscles: 'Triceps', mistakes: ['Lakte odstupujú od tela.', 'Pomáhanie trupom.', 'Neúplné vystretie.'] },
  { name: 'Francúzsky tlak s jednoručkou', category: 'Ruky', places: ['gym', 'db'], muscles: 'Triceps', tips: ['Jednoručku drž oboma rukami nad hlavou.', 'Lakte smerujú dopredu a ostávajú pri hlave.', 'Spúšťaj jednoručku za hlavu.', 'Vystri ruky späť hore.'], mistakes: ['Lakte sa rozťahujú do strán.', 'Prehýbanie chrbta.', 'Príliš ťažká váha.'] },
  { name: 'Dipy na stoličke', category: 'Ruky', places: ['gym', 'db', 'bw'], muscles: 'Triceps, predné ramená', tips: ['Oprí dlane o hranu stabilnej stoličky za sebou.', 'Nohy pred sebou, zadok tesne pri stoličke.', 'Krč lakte dozadu do pravého uhla.', 'Vytlač sa hore do vystretých rúk.'], mistakes: ['Lakte do strán.', 'Zadok ďaleko od stoličky.', 'Príliš hlboko s bolesťou v ramenách.'] },
  // Stred tela
  { name: 'Plank', category: 'Core', places: ['gym', 'db', 'bw'], muscles: 'Brucho, stred tela', mistakes: ['Boky padajú.', 'Zadok trčí hore.', 'Zadržiavanie dychu.'] },
  { name: 'Bočný plank', category: 'Core', places: ['gym', 'db', 'bw'], muscles: 'Šikmé brušné svaly, boky', tips: ['Ľahni na bok, lakeť pod ramenom.', 'Zdvihni boky, telo v jednej línii.', 'Druhú ruku polož na bok.', 'Vydrž a vymeň strany.'], mistakes: ['Boky klesajú.', 'Rameno uteká k uchu.', 'Telo sa stáča dopredu.'] },
  { name: 'Dead bug', category: 'Core', places: ['gym', 'db', 'bw'], muscles: 'Hlboké brušné svaly', mistakes: ['Driek sa dvíha od zeme.', 'Príliš rýchly pohyb.', 'Zadržiavanie dychu.'] },
  // Celé telo a kardio
  { name: 'Kettlebell swing', category: 'Celé telo', places: ['gym'], muscles: 'Zadok, zadná strana stehien, chrbát', mistakes: ['Drep namiesto pohybu z bokov.', 'Dvíhanie rukami.', 'Záklon hore.'] },
  { name: 'Burpees', category: 'Celé telo', places: ['gym', 'db', 'bw'], muscles: 'Celé telo, kondícia', mistakes: ['Prehnutý chrbát v kliku.', 'Tvrdý dopad.', 'Strata techniky pri únave.'] },
  { name: 'Horolezec', category: 'Kardio', places: ['gym', 'db', 'bw'], muscles: 'Stred tela, kondícia', tips: ['Začni v polohe kliku, ruky pod ramenami.', 'Striedavo priťahuj kolená k hrudi.', 'Boky ostávajú nízko, telo stabilné.', 'Udrž svižné tempo a pravidelný dych.'], mistakes: ['Zadok trčí hore.', 'Ruky ďaleko pred ramenami.', 'Plytké priťahovanie kolien.'] },
  { name: 'Skákajúci panák', category: 'Kardio', places: ['gym', 'db', 'bw'], muscles: 'Kondícia, lýtka, ramená', tips: ['Stoj spatne, ruky pri tele.', 'Výskokom roznož a ruky nad hlavu.', 'Výskokom späť do stoja spatne.', 'Dopadaj mäkko na špičky.'], mistakes: ['Tvrdý dopad na päty.', 'Kolená padajú dovnútra.', 'Polovičný pohyb rúk.'] },
  { name: 'Veslovací trenažér', category: 'Kardio', places: ['gym'], muscles: 'Celé telo, kondícia', mistakes: ['Ťahanie rukami skôr ako nohami.', 'Guľatý chrbát.', 'Príliš rýchle tempo bez sily.'] }
];
const catFold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CATALOG_BY = new Map(CATALOG.map((c) => [catFold(c.name), c]));
const catalogOf = (exercise) => CATALOG_BY.get(catFold(exercise?.name)) || null;
// rady k technike pre nové cviky (v appke ich ukazuje knižnica aj živý tréning)
CATALOG.forEach((c) => { if (c.tips && !EXERCISE_TIPS[catFold(c.name)]) EXERCISE_TIPS[catFold(c.name)] = c.tips; });
// cvik bez vlastného obrázka dostane piktogram podobného cviku
const ICON_ALIAS = {
  'goblet drep': 'Drep', 'drep s vlastnou vahou': 'Drep', 'bulharsky drep': 'Výpady', 'rumunsky mrtvy tah s jednoruckami': 'Rumunský mŕtvy ťah',
  'glute bridge': 'Hip thrust', 'tlak jednoruciek na lavicke': 'Bench press', 'kliky na kolenach': 'Kliky', 'tlaky jednoruciek nad hlavu': 'Tlaky nad hlavu',
  'pike kliky': 'Kliky', 'australske pritahy': 'Veslovanie s činkou', 'superman': 'Plank',
  'francuzsky tlak s jednoruckou': 'Tricepsové stlačenie', 'dipy na stolicke': 'Kliky', 'bocny plank': 'Plank', 'horolezec': 'Burpees', 'skakajuci panak': 'Burpees'
};
const exThumb = (e) => EXERCISE_ICONS(ICON_ALIAS[catFold(e?.name)] ? { name: ICON_ALIAS[catFold(e?.name)], category: e.category } : e);

/* ---------- Generátor programu ---------- */
const GOALS = [['postava', 'Postava a svaly'], ['sila', 'Sila'], ['chudnutie', 'Chudnutie'], ['kondicia', 'Kondícia']];
const LEVELS = [['zaciatocnik', 'Začiatočník'], ['mierne', 'Mierne pokročilý'], ['pokrocily', 'Pokročilý']];
const DAYS_OPT = [[2, '2 dni'], [3, '3 dni'], [4, '4 dni'], [5, '5 dní']];
const PLACES = [['gym', 'Posilňovňa'], ['db', 'Doma s jednoručkami'], ['bw', 'Doma bez náradia']];
const LIMITS = [['chrbat', 'Chrbát'], ['kolena', 'Kolená'], ['ramena', 'Ramená']];
const optLabel = (list, v) => (list.find(([k]) => String(k) === String(v)) || [, ''])[1];

// pohybové vzory → cviky v poradí podľa vhodnosti
const PATTERNS = {
  squat: { gym: ['Drep', 'Leg press', 'Goblet drep'], db: ['Goblet drep', 'Drep s vlastnou váhou'], bw: ['Drep s vlastnou váhou'] },
  hinge: { gym: ['Rumunský mŕtvy ťah', 'Mŕtvy ťah', 'Hip thrust'], db: ['Rumunský mŕtvy ťah s jednoručkami', 'Glute bridge'], bw: ['Glute bridge'] },
  lunge: { gym: ['Výpady', 'Bulharský drep'], db: ['Bulharský drep', 'Výpady'], bw: ['Výpady', 'Bulharský drep'] },
  glute: { gym: ['Hip thrust', 'Glute bridge'], db: ['Glute bridge'], bw: ['Glute bridge'] },
  hpush: { gym: ['Bench press', 'Tlak jednoručiek na lavičke', 'Kliky'], db: ['Tlak jednoručiek na lavičke', 'Kliky'], bw: ['Kliky', 'Kliky na kolenách'] },
  vpush: { gym: ['Tlaky nad hlavu', 'Tlaky jednoručiek nad hlavu'], db: ['Tlaky jednoručiek nad hlavu'], bw: ['Pike kliky'] },
  hpull: { gym: ['Veslovanie s činkou'], db: ['Veslovanie s činkou'], bw: ['Austrálske príťahy'] },
  vpull: { gym: ['Stiahnutie kladky', 'Príťahy na hrazde'], db: ['Superman'], bw: ['Superman'] },
  lat: { gym: ['Upažovanie'], db: ['Upažovanie'], bw: [] },
  bi: { gym: ['Bicepsový zdvih'], db: ['Bicepsový zdvih'], bw: [] },
  tri: { gym: ['Tricepsové stlačenie'], db: ['Francúzsky tlak s jednoručkou'], bw: ['Dipy na stoličke'] },
  calf: { gym: ['Výpony na lýtka'], db: ['Výpony na lýtka'], bw: ['Výpony na lýtka'] },
  core: { gym: ['Plank', 'Dead bug', 'Bočný plank'], db: ['Plank', 'Dead bug', 'Bočný plank'], bw: ['Plank', 'Dead bug', 'Bočný plank'] },
  cond: { gym: ['Veslovací trenažér', 'Kettlebell swing', 'Burpees'], db: ['Burpees', 'Horolezec'], bw: ['Burpees', 'Horolezec', 'Skákajúci panák'] }
};
// čo vynechať pri bolestiach
const AVOID = {
  chrbat: ['Mŕtvy ťah', 'Rumunský mŕtvy ťah', 'Rumunský mŕtvy ťah s jednoručkami', 'Kettlebell swing', 'Burpees', 'Drep', 'Superman'],
  kolena: ['Výpady', 'Bulharský drep', 'Burpees', 'Skákajúci panák', 'Drep', 'Goblet drep'],
  ramena: ['Tlaky nad hlavu', 'Tlaky jednoručiek nad hlavu', 'Pike kliky', 'Dipy na stoličke', 'Bench press']
};
// náhrady, keď vzor nemá bezpečný cvik
const FALLBACK = { squat: ['Leg press', 'Glute bridge'], hinge: ['Glute bridge', 'Hip thrust'], lunge: ['Glute bridge'], vpush: ['Upažovanie'], cond: ['Horolezec', 'Veslovací trenažér'] };

const SPLITS = {
  2: [['Celé telo A', ['squat', 'hpush', 'hpull', 'glute', 'lat', 'core']], ['Celé telo B', ['hinge', 'vpush', 'vpull', 'lunge', 'bi', 'core']]],
  3: [['Celé telo A', ['squat', 'hpush', 'hpull', 'glute', 'lat', 'core']], ['Celé telo B', ['hinge', 'vpush', 'vpull', 'lunge', 'tri', 'core']], ['Celé telo C', ['lunge', 'hpush', 'vpull', 'glute', 'bi', 'core']]],
  4: [['Vrch tela A', ['hpush', 'hpull', 'vpush', 'vpull', 'bi', 'tri']], ['Spodok tela A', ['squat', 'hinge', 'lunge', 'calf', 'core']], ['Vrch tela B', ['vpush', 'vpull', 'hpush', 'hpull', 'lat', 'tri']], ['Spodok tela B', ['hinge', 'squat', 'glute', 'calf', 'core']]],
  5: [['Tlak', ['hpush', 'vpush', 'lat', 'tri', 'core']], ['Ťah', ['vpull', 'hpull', 'bi', 'core']], ['Nohy', ['squat', 'hinge', 'lunge', 'calf']], ['Vrch tela', ['hpush', 'hpull', 'vpush', 'vpull', 'lat']], ['Spodok tela', ['hinge', 'glute', 'lunge', 'core']]]
};
// cviky na čas alebo s vlastnou dávkou
const TIMED = { 'Plank': ['30 s', '45 s', '60 s'], 'Bočný plank': ['20 s', '30 s', '40 s'], 'Horolezec': ['30 s', '40 s', '45 s'], 'Skákajúci panák': ['30 s', '40 s', '45 s'], 'Veslovací trenažér': ['5 min', '8 min', '10 min'] };
const DOSE = {
  sila: { main: ['5', '2 min'], acc: ['8–10', '90 s'], extra: 1 },
  postava: { main: ['8–10', '2 min'], acc: ['10–12', '60 s'], extra: 0 },
  chudnutie: { main: ['10–12', '60 s'], acc: ['12–15', '45 s'], extra: 0, cond: true },
  kondicia: { main: ['12–15', '45 s'], acc: ['15', '30 s'], extra: 0, cond: true }
};
const LEVEL_CFG = { zaciatocnik: { slots: 4, sets: [3, 2], li: 0 }, mierne: { slots: 5, sets: [3, 3], li: 1 }, pokrocily: { slots: 6, sets: [4, 3], li: 2 } };

function pickExercise(pattern, place, avoid, used, level) {
  let list = [...(PATTERNS[pattern]?.[place] || [])];
  if (pattern === 'hpush' && place === 'bw' && level === 'zaciatocnik') list = ['Kliky na kolenách', 'Kliky'];
  if (pattern === 'vpull' && place === 'gym' && level === 'pokrocily') list = ['Príťahy na hrazde', 'Stiahnutie kladky'];
  const ok = (n) => !avoid.has(n) && !used.has(n) && CATALOG_BY.get(catFold(n)) && CATALOG_BY.get(catFold(n)).places.includes(place);
  return list.find(ok) || (FALLBACK[pattern] || []).find(ok) || null;
}

// { goal, level, days, place, limits[] } → [{ name, items: [{ name, sets, reps, rest }] }]
function buildProgram(p) {
  const dose = DOSE[p.goal] || DOSE.postava;
  const lv = LEVEL_CFG[p.level] || LEVEL_CFG.mierne;
  const avoid = new Set((p.limits || []).flatMap((l) => AVOID[l] || []));
  const split = SPLITS[p.days] || SPLITS[3];
  return split.map(([dayName, patterns], di) => {
    const used = new Set();
    const items = [];
    let slots = patterns.slice(0, lv.slots);
    if (!slots.includes('core') && patterns.includes('core')) slots.push('core');
    // keď sa pre niektorý vzor nenájde bezpečný cvik, doplnia sa ďalšie
    slots.push(...['calf', 'tri', 'bi', 'lat', 'glute', 'core'].filter((x) => !slots.includes(x)).map((x) => `+${x}`));
    if (dose.cond) slots = [...slots.filter((x) => x !== 'lat' && x !== 'bi'), 'cond'];
    const want = Math.min(lv.slots, patterns.length) + (dose.cond ? 1 : 0);
    slots.forEach((slot) => {
      const extra = slot.startsWith('+');
      const pattern = extra ? slot.slice(1) : slot;
      if (extra && items.length >= want) return;
      if (pattern === 'core' && items.some((it) => PATTERNS.core.gym.includes(it.name))) return;
      const coreIdx = di % 3;
      let name;
      if (pattern === 'core') {
        const list = PATTERNS.core[p.place].filter((n) => !avoid.has(n) && !used.has(n));
        name = list[coreIdx % list.length] || null;
      } else name = pickExercise(pattern, p.place, avoid, used, p.level);
      if (!name) return;
      used.add(name);
      const main = items.length < 2 && !['core', 'cond', 'lat', 'bi', 'tri', 'calf'].includes(pattern) && name !== 'Superman';
      let [reps, rest] = main ? dose.main : dose.acc;
      if (p.place === 'bw' && rest === '2 min') rest = '90 s';
      let sets = (main ? lv.sets[0] + dose.extra : lv.sets[1]);
      let r = reps, rs = rest;
      if (TIMED[name]) { r = TIMED[name][lv.li] + (name === 'Bočný plank' ? ' na stranu' : ''); rs = name === 'Veslovací trenažér' ? '' : '45 s'; sets = name === 'Veslovací trenažér' ? 1 : Math.max(2, lv.sets[1]); }
      else if (name === 'Burpees') { r = ['8', '10', '12'][lv.li]; rs = '60 s'; sets = Math.max(2, lv.sets[1]); }
      else if (pattern === 'core') { r = name === 'Dead bug' ? '10 na stranu' : '12'; rs = '45 s'; }
      if (['Výpady', 'Bulharský drep'].includes(name) && !/strana/.test(r)) r = `${r} na nohu`;
      items.push({ name, sets, reps: r, rest: rs });
    });
    return { name: dayName, items };
  });
}

// odhad dĺžky tréningu v minútach (séria ~40 s + pauza)
function planMinutes(plan) {
  const sec = (plan?.items || []).reduce((a, it) => {
    const n = Number(it.sets) || 1;
    const rest = typeof parseRest === 'function' && it.rest ? parseRest(it.rest) : 60;
    const m = String(it.reps || '').match(/(\d+)\s*min/);
    return a + (m ? Number(m[1]) * 60 : n * 40 + (n - 1) * rest + 60);
  }, 0);
  return Math.max(10, Math.round(sec / 300) * 5);
}
