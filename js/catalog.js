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
// ---------- Ďalšie cviky: celková sila (funkčný silový plán), mobilita, kondícia, svalová hmota ----------
CATALOG.push(
  // Celková sila
  { name: 'Front squat', category: 'Nohy', places: ['gym'], muscles: 'Stehná, zadok, stred tela, horný chrbát', tips: ['Činka leží na predných ramenách, lakte vysoko vpredu.', 'Chodidlá na šírku ramien, špičky mierne von.', 'Klesaj rovno dole so vzpriameným trupom.', 'Hore sa odraz celým chodidlom, lakte stále hore.'], mistakes: ['Lakte padajú a činka sa kotúľa dopredu.', 'Predklon trupu.', 'Päty sa dvíhajú zo zeme.'] },
  { name: 'Trap-bar deadlift', category: 'Chrbát', places: ['gym'], muscles: 'Stehná, zadok, chrbát, úchop', tips: ['Postav sa do stredu šesťhrannej činky, chodidlá na šírku bokov.', 'Chyť rúčky, boky dole, hrudník hore, chrbát rovný.', 'Vytlač sa nohami zo zeme a vystri boky.', 'Spúšťaj kontrolovane rovnakou dráhou.'], mistakes: ['Guľatý chrbát.', 'Trhnutie činky zo zeme.', 'Záklon hore.'] },
  { name: 'Príťahy v predklone s veľkou činkou', category: 'Chrbát', places: ['gym'], muscles: 'Stred chrbta, široký sval chrbta, biceps', tips: ['Predklon v bokoch asi 45°, kolená mierne pokrčené.', 'Chrbát rovný, činka visí pod ramenami.', 'Ťahaj činku k spodnej časti brucha, lakte popri tele.', 'Hore stiahni lopatky, spúšťaj pomaly.'], mistakes: ['Švihanie trupom hore.', 'Guľatý chrbát.', 'Ťahanie k hrudníku s lakťami do strán.'] },
  { name: 'Pallof press', category: 'Core', places: ['gym'], muscles: 'Stred tela, šikmé brušné svaly (anti-rotácia)', tips: ['Postav sa bokom ku kladke alebo gume, rukoväť pri hrudi.', 'Zatni brucho a zadok, boky aj ramená vpred.', 'Vytlač ruky rovno pred seba a odolaj ťahu do strany.', 'Podrž 1–2 s a vráť ruky k hrudi.'], mistakes: ['Trup sa otáča za kladkou.', 'Prehýbanie v drieku.', 'Príliš veľký odpor.'] },
  { name: 'Výpady v chôdzi', category: 'Nohy', places: ['gym', 'db', 'bw'], muscles: 'Stehná, zadok, rovnováha', tips: ['Jednoručky v rukách pri tele, trup vzpriamený.', 'Veľký krok vpred, zadné koleno klesá takmer k zemi.', 'Odraz cez pätu prednej nohy a krok rovno do ďalšieho výpadu.', 'Kráčaj plynulo, pohľad pred seba.'], mistakes: ['Predné koleno padá dovnútra.', 'Krátky krok.', 'Predklon trupu.'] },
  { name: 'Tlak jednoručkou nad hlavu v kľaku', category: 'Ramená', places: ['gym', 'db'], muscles: 'Ramená, triceps, stred tela', tips: ['Kľakni na jedno koleno, jednoručka v ruke na strane kolena.', 'Zatni zadok a brucho, trup vzpriamený.', 'Vytlač jednoručku rovno nad hlavu.', 'Spúšťaj pomaly k ramenu, trup sa nenakláňa.'], mistakes: ['Úklon trupu do strany.', 'Prehýbanie v drieku.', 'Neúplné vystretie ruky.'] },
  { name: 'TRX fallout', category: 'Core', places: ['gym'], muscles: 'Brucho, stred tela (anti-extenzia)', tips: ['Chyť popruhy TRX, telo v jednej línii, ruky pred sebou.', 'Zatni brucho a zadok.', 'Pomaly sa nakláňaj dopredu, ruky idú nad hlavu.', 'Vráť sa späť silou brucha, nie rúk.'], mistakes: ['Driek sa prehýba.', 'Boky sa lámu.', 'Príliš veľký rozsah na začiatku.'] },
  { name: 'Jednonožový rumunský mŕtvy ťah', category: 'Nohy', places: ['gym', 'db'], muscles: 'Zadná strana stehien, zadok, rovnováha', tips: ['Kettlebell v ruke oproti stojnej nohe.', 'Stojné koleno mierne pokrčené.', 'Predkláňaj sa v boku, zadná noha ide dozadu v línii s trupom.', 'Boky ostávajú rovnobežne so zemou, vráť sa do stoja.'], mistakes: ['Boky sa otáčajú do strany.', 'Guľatý chrbát.', 'Rýchly pohyb bez rovnováhy.'] },
  { name: 'TRX príťah k tvári', category: 'Chrbát', places: ['gym'], muscles: 'Zadné ramená, stred chrbta, rotátory ramien', tips: ['Chyť popruhy TRX, zakloň sa s rovným telom.', 'Ťahaj rúčky k tvári, lakte vysoko a do strán.', 'Na konci stiahni lopatky a vytoč ruky von.', 'Vráť sa pomaly do vystretých rúk.'], mistakes: ['Boky padajú.', 'Lakte nízko pri tele.', 'Švihanie telom.'] },
  { name: 'Farmárska chôdza', category: 'Celé telo', places: ['gym', 'db'], muscles: 'Úchop, stred tela, ramená, nohy', tips: ['Zdvihni kettlebelly alebo jednoručky ako pri mŕtvom ťahu.', 'Ramená dole a dozadu, trup vzpriamený.', 'Kráčaj krátkymi pevnými krokmi.', 'Polož záťaž kontrolovane, chrbát rovný.'], mistakes: ['Ramená vytiahnuté k ušiam.', 'Kývanie trupom do strán.', 'Guľatý chrbát pri zdvihnutí.'] },
  { name: 'Plank na fitlopte', category: 'Core', places: ['gym', 'db'], muscles: 'Brucho, stred tela, ramená', tips: ['Lakte na fitlopte pod ramenami.', 'Nohy vzadu, telo v jednej línii.', 'Zatni brucho a zadok, lopta sa nehýbe.', 'Dýchaj pokojne počas výdrže.'], mistakes: ['Boky padajú.', 'Zadok trčí hore.', 'Zadržiavanie dychu.'] },
  { name: 'Bird dog', category: 'Core', places: ['gym', 'db', 'bw'], muscles: 'Hlboký stred tela, vzpriamovače chrbta, zadok', tips: ['Kľakni na štyri, ruky pod ramenami, kolená pod bokmi.', 'Súčasne vystri opačnú ruku a nohu.', 'Chrbát ostáva rovný ako stôl, boky sa netočia.', 'Podrž 2 s a vymeň strany.'], mistakes: ['Prehýbanie v drieku.', 'Boky sa otáčajú.', 'Príliš rýchly pohyb.'] },
  { name: 'Hip airplane', category: 'Zadok', places: ['gym', 'db', 'bw'], muscles: 'Zadok, stabilizátory bedra, rovnováha', tips: ['Stoj na jednej nohe, predkloň sa ako pri jednonožovom mŕtvom ťahu.', 'Pomaly otoč panvu von a späť dole.', 'Stojné koleno ostáva v smere špičky.', 'Pomôž si rukou o stenu, ak treba.'], mistakes: ['Koleno padá dovnútra.', 'Pohyb z chrbta namiesto z bedra.', 'Príliš rýchle otáčanie.'] },
  // Mobilita
  { name: 'Holubica', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Zadok, bedrové rotátory, bedrové flexory', tips: ['Predné koleno pokrčené pred sebou, holeň šikmo.', 'Zadná noha vystretá dozadu.', 'Boky rovno, pomaly sa predkloň nad predné koleno.', 'Dýchaj zhlboka a uvoľni sa do natiahnutia.'], mistakes: ['Boky sa nakláňajú na stranu.', 'Bolesť v kolene.', 'Zadržiavanie dychu.'] },
  { name: 'Rotácie bokov 90/90', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Bedrové kĺby, zadok', tips: ['Sed na zemi, obe kolená pokrčené do 90°.', 'Trup vzpriamený, ruky za telom alebo pred sebou.', 'Pomaly preklop kolená na druhú stranu.', 'Pohyb ide z bokov, nie z chrbta.'], mistakes: ['Guľatý chrbát.', 'Švihanie kolenami.', 'Odliepanie chodidiel bez kontroly.'] },
  { name: 'Výpad s rotáciou trupu', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Bedrové flexory, hrudná chrbtica, zadná strana stehien', tips: ['Z kliku prekroč jednou nohou vedľa ruky.', 'Lakeť vnútornej ruky spusti k zemi.', 'Otoč trup a ruku vytiahni k stropu.', 'Vráť sa a vymeň strany.'], mistakes: ['Zadné koleno padá na zem bez kontroly.', 'Rotácia len z ramena.', 'Príliš rýchle tempo.'] },
  { name: 'Natiahnutie bedrových flexorov v kľaku', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Bedrové flexory, predná strana stehna', tips: ['Kľakni na jedno koleno, druhá noha vpredu.', 'Zatni zadok na strane zadného kolena.', 'Posuň boky mierne dopredu, trup vzpriamený.', 'Ruku na strane zadnej nohy môžeš zdvihnúť hore.'], mistakes: ['Prehýbanie v drieku.', 'Uvoľnený zadok.', 'Predklon trupu.'] },
  { name: 'Žabka', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Vnútorná strana stehien, bedrá', tips: ['Na štyroch roztiahni kolená do strán.', 'Chodidlá a kolená v jednej línii.', 'Pomaly posúvaj boky dozadu.', 'Drž chrbát rovný a dýchaj pokojne.'], mistakes: ['Bolesť v kolenách.', 'Prehýbanie v drieku.', 'Príliš hlboko na začiatku.'] },
  { name: 'Mačka – krava', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Chrbtica, stred tela', tips: ['Na štyroch, ruky pod ramenami, kolená pod bokmi.', 'S nádychom prehni chrbát a zdvihni hlavu.', 'S výdychom zguľať chrbát a bradu k hrudi.', 'Pohybuj sa pomaly, stavec po stavci.'], mistakes: ['Pohyb len v krku.', 'Príliš rýchle tempo.', 'Lakte sa krčia.'] },
  { name: 'Rotácia hrudníka v ľahu na boku', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Hrudná chrbtica, hrudník, ramená', tips: ['Ľahni na bok, kolená pokrčené pred sebou, ruky spolu.', 'Hornú ruku otvor oblúkom na druhú stranu.', 'Pohľad sleduje ruku, kolená ostávajú spolu.', 'Vráť sa pomaly späť.'], mistakes: ['Kolená sa rozchádzajú.', 'Násilné tlačenie ramena k zemi.', 'Zadržiavanie dychu.'] },
  { name: 'Detská pozícia', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Chrbát, boky, ramená', tips: ['Kľakni, palce nôh spolu, kolená mierne od seba.', 'Sadni si na päty a predkloň sa.', 'Ruky natiahni pred seba, čelo k zemi.', 'Dýchaj do chrbta a uvoľni ramená.'], mistakes: ['Ramená vytiahnuté k ušiam.', 'Zadok ďaleko od piat.', 'Zadržiavanie dychu.'] },
  { name: 'Natiahnutie hrudníka na valci', category: 'Mobilita', places: ['gym', 'db'], muscles: 'Hrudník, hrudná chrbtica', tips: ['Ľahni na penový valec pozdĺž chrbtice.', 'Hlava aj panva sú na valci, kolená pokrčené.', 'Rozpaž ruky do strán dlaňami hore.', 'Uvoľni sa a dýchaj zhlboka.'], mistakes: ['Prehýbanie v drieku.', 'Hlava visí mimo valca.', 'Napäté ramená.'] },
  { name: 'Dislokácie ramien s palicou', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Ramená, hrudník', tips: ['Chyť palicu alebo uterák široko pred telom.', 'S vystretými rukami ju preveď oblúkom nad hlavou za telo.', 'Vráť sa rovnakou cestou dopredu.', 'Čím užší úchop, tým ťažšie – začni široko.'], mistakes: ['Krčenie lakťov.', 'Prehýbanie v drieku.', 'Príliš úzky úchop.'] },
  { name: 'Kĺzanie rúk po stene', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Ramená, lopatky, horný chrbát', tips: ['Postav sa chrbtom k stene, driek, lopatky a hlava pri stene.', 'Lakte a zápästia oprené o stenu v tvare W.', 'Pomaly kĺž rukami hore do tvaru Y.', 'Vráť sa dole a stiahni lopatky.'], mistakes: ['Lakte alebo zápästia odchádzajú od steny.', 'Prehýbanie v drieku.', 'Ramená idú k ušiam.'] },
  { name: 'Natiahnutie ramien pri stene', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Hrudník, predné ramená', tips: ['Oprí predlaktie o stenu, lakeť vo výške ramena.', 'Pomaly otáčaj trup od steny.', 'Rameno drž dole, nie pri uchu.', 'Vymeň strany.'], mistakes: ['Prudké natiahnutie.', 'Rameno vytiahnuté hore.', 'Bolesť namiesto ťahu.'] },
  { name: 'Hlboký drep s výdržou', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Bedrá, členky, chrbát', tips: ['Chodidlá na šírku ramien, špičky von.', 'Klesni čo najhlbšie, päty na zemi.', 'Lakťami jemne tlač kolená von.', 'Hrudník hore a dýchaj pokojne.'], mistakes: ['Päty sa dvíhajú.', 'Guľatý chrbát.', 'Kolená padajú dovnútra.'] },
  { name: 'Mobilita členka pri stene', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Členky, lýtka', tips: ['Postav sa čelom k stene, jedna noha vpredu.', 'Tlač predné koleno k stene, päta ostáva na zemi.', 'Koleno ide v smere druhého prsta.', 'Postupne posúvaj chodidlo ďalej od steny.'], mistakes: ['Päta sa dvíha.', 'Koleno padá dovnútra.', 'Prudké pérovanie.'] },
  { name: 'Natiahnutie zadnej strany stehien', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Zadná strana stehien, lýtka', tips: ['Pätu polož na nízku vyvýšeninu, noha vystretá.', 'Predkloň sa v bokoch s rovným chrbtom.', 'Špička smeruje hore.', 'Drž ťah, nie bolesť.'], mistakes: ['Guľatý chrbát.', 'Pérovanie.', 'Zamknuté koleno s bolesťou.'] },
  { name: 'Natiahnutie lýtok', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Lýtka, Achillova šľacha', tips: ['Oprí sa rukami o stenu, jedna noha vzadu.', 'Zadná päta tlačí do zeme, noha vystretá.', 'Boky posuň dopredu, kým cítiš ťah v lýtku.', 'Pre spodnú časť lýtka zadné koleno mierne pokrč.'], mistakes: ['Päta sa dvíha.', 'Špička vytočená von.', 'Prehýbanie v drieku.'] },
  { name: 'Psík dolu hlavou', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Zadná strana tela, ramená, lýtka', tips: ['Z kliku vytlač boky hore a dozadu.', 'Ruky a chrbát v jednej línii, hlava medzi rukami.', 'Päty tlač k zemi, kolená môžu byť pokrčené.', 'Striedavo pokrčuj kolená a uvoľňuj lýtka.'], mistakes: ['Guľatý chrbát.', 'Ramená pri ušiach.', 'Váha len na rukách.'] },
  { name: 'Kobra', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Brucho, hrudník, chrbtica', tips: ['Ľahni na brucho, dlane pod ramenami.', 'Pomaly sa vytlač hore, boky ostávajú na zemi.', 'Ramená dole, pohľad dopredu.', 'Choď len tak vysoko, ako je to príjemné.'], mistakes: ['Ostrá bolesť v drieku.', 'Ramená pri ušiach.', 'Záklon hlavy.'] },
  { name: 'Inchworm', category: 'Mobilita', places: ['gym', 'db', 'bw'], muscles: 'Zadná strana stehien, ramená, stred tela', tips: ['Zo stoja sa predkloň a polož ruky na zem.', 'Kráčaj rukami dopredu až do kliku.', 'Kráčaj nohami späť k rukám.', 'Vzpriam sa a opakuj.'], mistakes: ['Boky padajú v kliku.', 'Príliš rýchle tempo.', 'Krčenie kolien bez potreby.'] },
  // Kondícia
  { name: 'Airbike', category: 'Kardio', places: ['gym'], muscles: 'Celé telo, kondícia', tips: ['Nastav sedlo, koleno je dole mierne pokrčené.', 'Tlač nohami a zároveň tlač a ťahaj rúčky.', 'Pri intervaloch naplno, v pauze voľne pedáluj.', 'Trup ostáva stabilný, nehojdaj sa.'], mistakes: ['Pohyb len nohami.', 'Príliš nízke sedlo.', 'Prepálený štart a vyčerpanie po pár sekundách.'] },
  { name: 'Švihadlo', category: 'Kardio', places: ['gym', 'db', 'bw'], muscles: 'Lýtka, kondícia, koordinácia', tips: ['Lakte pri tele, švihadlo točíš zápästiami.', 'Skáč nízko na špičkách.', 'Kolená mierne pokrčené, dopad mäkký.', 'Udrž rovnomerný rytmus.'], mistakes: ['Točenie celými rukami.', 'Vysoké skoky.', 'Dopad na päty.'] },
  { name: 'Bicykel (ergometer)', category: 'Kardio', places: ['gym'], muscles: 'Nohy, kondícia', tips: ['Nastav sedlo tak, aby bolo koleno dole mierne pokrčené.', 'Šliapaj plynulo, kolená idú rovno.', 'Odpor nastav podľa cieľa – vytrvalosť alebo intervaly.', 'Trup vzpriamený, ramená uvoľnené.'], mistakes: ['Príliš nízke sedlo.', 'Kolená idú do strán.', 'Kývanie trupom.'] },
  { name: 'Výskoky na box', category: 'Kardio', places: ['gym'], muscles: 'Nohy, zadok, výbušnosť', tips: ['Postav sa pred stabilný box.', 'Švihni rukami a vyskoč s odrazom oboch nôh.', 'Dopadni mäkko celými chodidlami, kolená von.', 'Zostúp dole krokom, nie skokom.'], mistakes: ['Príliš vysoký box.', 'Tvrdý dopad.', 'Zoskakovanie dozadu.'] },
  { name: 'Šprinty', category: 'Kardio', places: ['gym', 'db', 'bw'], muscles: 'Nohy, kondícia, výbušnosť', tips: ['Pred šprintmi sa poriadne rozcvič.', 'Bež na špičkách, ruky pracujú pri tele.', 'Krátky úsek naplno, potom pauza chôdzou.', 'Udrž techniku aj pri únave.'], mistakes: ['Šprint bez rozcvičky.', 'Krátka pauza a strata rýchlosti.', 'Dopad na päty.'] },
  // Svalová hmota
  { name: 'Rozpažovanie s jednoručkami', category: 'Hrudník', places: ['gym', 'db'], muscles: 'Prsné svaly, predné ramená', tips: ['Ľahni na lavičku, jednoručky nad hrudníkom.', 'Lakte mierne pokrčené počas celého pohybu.', 'Spúšťaj ruky oblúkom do strán po úroveň hrudníka.', 'Vráť ich oblúkom späť nad hrudník.'], mistakes: ['Príliš hlboko s bolesťou v ramenách.', 'Krčenie lakťov ako pri tlaku.', 'Príliš ťažká váha.'] },
  { name: 'Predkopávanie na stroji', category: 'Nohy', places: ['gym'], muscles: 'Predná strana stehien', tips: ['Nastav opierku tak, aby koleno bolo v osi stroja.', 'Valček je nad členkami.', 'Vystri nohy a hore zatni stehná.', 'Spúšťaj pomaly.'], mistakes: ['Švihanie.', 'Zadok sa dvíha zo sedadla.', 'Príliš rýchle spúšťanie.'] },
  { name: 'Zakopávanie na stroji', category: 'Nohy', places: ['gym'], muscles: 'Zadná strana stehien', tips: ['Nastav stroj tak, aby koleno bolo v osi otáčania.', 'Valček je nad pätami.', 'Pokrč nohy čo najviac a podrž.', 'Spúšťaj pomaly do takmer vystretých nôh.'], mistakes: ['Boky sa dvíhajú.', 'Švihanie.', 'Malý rozsah.'] },
  { name: 'Kladivový zdvih', category: 'Ruky', places: ['gym', 'db'], muscles: 'Biceps, predlaktie', tips: ['Jednoručky drž neutrálne, dlane k sebe.', 'Lakte pri tele.', 'Zdvihni jednoručky k ramenám bez otáčania.', 'Spúšťaj pomaly.'], mistakes: ['Lakte idú dopredu.', 'Hojdanie trupom.', 'Rýchle spúšťanie.'] },
  { name: 'Príťah kladky k tvári', category: 'Ramená', places: ['gym'], muscles: 'Zadné ramená, stred chrbta', tips: ['Kladka vo výške tváre, lano úchopom zhora.', 'Ťahaj lano k tvári a rozťahuj konce.', 'Lakte vysoko, na konci vytoč ruky von.', 'Vráť sa pomaly.'], mistakes: ['Ťahanie k hrudníku.', 'Záklon trupu.', 'Príliš ťažká váha.'] }
);
// zameranie cvikov: mobilita, sila (celková sila), kondicia, svaly (svalová hmota)
const FOCUSES = [['svaly', 'Svalová hmota'], ['sila', 'Celková sila'], ['kondicia', 'Kondícia'], ['mobilita', 'Mobilita']];
const FOCUS_EXTRA = {
  sila: ['Drep', 'Mŕtvy ťah', 'Rumunský mŕtvy ťah', 'Bench press', 'Tlaky nad hlavu', 'Príťahy na hrazde', 'Veslovanie s činkou', 'Hip thrust', 'Výpady', 'Bulharský drep', 'Plank', 'Dead bug', 'Kettlebell swing', 'Front squat', 'Trap-bar deadlift', 'Príťahy v predklone s veľkou činkou', 'Pallof press', 'Výpady v chôdzi', 'Tlak jednoručkou nad hlavu v kľaku', 'TRX fallout', 'Jednonožový rumunský mŕtvy ťah', 'TRX príťah k tvári', 'Farmárska chôdza', 'Plank na fitlopte', 'Tlak jednoručiek na lavičke', 'Stiahnutie kladky', 'Glute bridge', 'Bočný plank'],
  kondicia: ['Burpees', 'Horolezec', 'Skákajúci panák', 'Kettlebell swing', 'Farmárska chôdza'],
  mobilita: ['Bird dog', 'Hip airplane', 'Dead bug', 'Glute bridge', 'Superman']
};
function focusOf(c) {
  const out = new Set();
  if (c.category === 'Mobilita') out.add('mobilita');
  if (c.category === 'Kardio') out.add('kondicia');
  if (['Nohy', 'Zadok', 'Chrbát', 'Hrudník', 'Ramená', 'Ruky'].includes(c.category) && !['Bird dog', 'Hip airplane', 'Superman'].includes(c.name)) out.add('svaly');
  for (const [f, list] of Object.entries(FOCUS_EXTRA)) if (list.includes(c.name)) out.add(f);
  return FOCUSES.map(([k]) => k).filter((k) => out.has(k));
}
CATALOG.forEach((c) => { c.focus = focusOf(c); });
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
Object.assign(ICON_ALIAS, {
  'front squat': 'Drep', 'trap-bar deadlift': 'Mŕtvy ťah', 'pritahy v predklone s velkou cinkou': 'Veslovanie s činkou', 'pallof press': 'Upažovanie',
  'vypady v chodzi': 'Výpady', 'tlak jednoruckou nad hlavu v klaku': 'Tlaky nad hlavu', 'trx fallout': 'Plank', 'jednonozovy rumunsky mrtvy tah': 'Rumunský mŕtvy ťah',
  'trx pritah k tvari': 'Veslovanie s činkou', 'farmarska chodza': 'Bicepsový zdvih', 'plank na fitlopte': 'Plank', 'bird dog': 'Plank', 'hip airplane': 'Rumunský mŕtvy ťah',
  'holubica': 'Výpady', 'rotacie bokov 90/90': 'Dead bug', 'vypad s rotaciou trupu': 'Výpady', 'natiahnutie bedrovych flexorov v klaku': 'Výpady',
  'zabka': 'Plank', 'macka – krava': 'Plank', 'rotacia hrudnika v lahu na boku': 'Dead bug', 'detska pozicia': 'Plank', 'natiahnutie hrudnika na valci': 'Dead bug',
  'dislokacie ramien s palicou': 'Tlaky nad hlavu', 'klzanie ruk po stene': 'Tlaky nad hlavu', 'natiahnutie ramien pri stene': 'Upažovanie', 'hlboky drep s vydrzou': 'Drep',
  'mobilita clenka pri stene': 'Výpady', 'natiahnutie zadnej strany stehien': 'Rumunský mŕtvy ťah', 'natiahnutie lytok': 'Výpady', 'psik dolu hlavou': 'Kliky', 'kobra': 'Plank', 'inchworm': 'Kliky',
  'airbike': 'Veslovací trenažér', 'vyskoky na box': 'Burpees', 'rozpazovanie s jednoruckami': 'Bench press', 'predkopavanie na stroji': 'Leg press', 'zakopavanie na stroji': 'Leg press',
  'kladivovy zdvih': 'Bicepsový zdvih', 'pritah kladky k tvari': 'Veslovanie s činkou'
});
const exThumb = (e) => EXERCISE_ICONS(ICON_ALIAS[catFold(e?.name)] ? { name: ICON_ALIAS[catFold(e?.name)], category: e.category } : e);

/* ---------- Generátor programu ---------- */
const GOALS = [['postava', 'Svalová hmota'], ['sila', 'Celková sila'], ['kondicia', 'Kondícia'], ['mobilita', 'Mobilita'], ['chudnutie', 'Chudnutie']];
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
  cond: { gym: ['Airbike', 'Veslovací trenažér', 'Kettlebell swing', 'Burpees'], db: ['Švihadlo', 'Burpees', 'Horolezec'], bw: ['Burpees', 'Horolezec', 'Švihadlo', 'Skákajúci panák'] }
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
const TIMED = { 'Plank': ['30 s', '45 s', '60 s'], 'Bočný plank': ['20 s', '30 s', '40 s'], 'Horolezec': ['30 s', '40 s', '45 s'], 'Skákajúci panák': ['30 s', '40 s', '45 s'], 'Veslovací trenažér': ['5 min', '8 min', '10 min'], 'Airbike': ['6 min', '8 min', '10 min'], 'Švihadlo': ['45 s', '60 s', '90 s'] };
const DOSE = {
  sila: { main: ['5', '2 min'], acc: ['8–10', '90 s'], extra: 1 },
  postava: { main: ['8–10', '2 min'], acc: ['10–12', '60 s'], extra: 0 },
  chudnutie: { main: ['10–12', '60 s'], acc: ['12–15', '45 s'], extra: 0, cond: true },
  kondicia: { main: ['12–15', '45 s'], acc: ['15', '30 s'], extra: 0, cond: true },
  mobilita: { main: ['10', '30 s'], acc: ['10', '30 s'], extra: 0 }
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
// Celková sila – hotový 4-dňový funkčný silový plán (predný a zadný reťazec, A a B), k tomu 2× beh týždenne.
// Každý tréning začína aktivačným blokom. RPE = ako ťažko to má byť (10 = maximum).
const STRENGTH_PLAN = [
  ['Predný reťazec A', [['Dead bug', 2, '8 na stranu', '30 s', 'Aktivácia, ľahko a s kontrolou'], ['Pallof press', 2, '8 na stranu', '30 s', 'Aktivácia'], ['Drep', 4, '6–8', '2–3 min', 'RPE 7–8'], ['Bench press', 4, '6–8', '2 min', 'RPE 7–8'], ['Bulharský drep', 3, '8–10 na nohu', '90 s', 'S jednoručkami, RPE 7'], ['Tlaky nad hlavu', 3, '8–10', '90 s', 'V stoji, RPE 7'], ['Plank na fitlopte', 3, '30–45 s', '45 s', '']]],
  ['Zadný reťazec A', [['Glute bridge', 2, '10', '30 s', 'Aktivácia'], ['Bird dog', 2, '8 na stranu', '30 s', 'Aktivácia'], ['Mŕtvy ťah', 4, '5–6', '3 min', 'RPE 7–8'], ['Príťahy v predklone s veľkou činkou', 4, '6–8', '2 min', 'RPE 7–8'], ['Rumunský mŕtvy ťah', 3, '8–10', '90 s', 'RPE 7'], ['Príťahy na hrazde', 3, '8–10', '90 s', 'Alebo stiahnutie kladky, RPE 7–8'], ['Pallof press', 3, '10 na stranu', '45 s', 'Anti-rotácia']]],
  ['Predný reťazec B', [['Pallof press', 2, '8 na stranu', '30 s', 'Aktivácia v kľaku na jednom kolene'], ['Rotácie bokov 90/90', 2, '8 na stranu', '30 s', 'Mobilita bedier'], ['Front squat', 4, '6–8', '2–3 min', 'RPE 7'], ['Tlak jednoručiek na lavičke', 3, '8–10', '90 s', 'Neutrálny úchop, RPE 7'], ['Výpady v chôdzi', 3, '10 na nohu', '90 s', 'S jednoručkami, RPE 7'], ['Tlak jednoručkou nad hlavu v kľaku', 3, '8 na stranu', '75 s', 'RPE 7, stabilita'], ['TRX fallout', 3, '8–12', '60 s', '']]],
  ['Zadný reťazec B', [['Hip airplane', 2, '6 na stranu', '30 s', 'Aktivácia, s kontrolou'], ['Glute bridge', 2, '8', '30 s', 'Aktivácia'], ['Trap-bar deadlift', 4, '6–8', '2–3 min', 'RPE 7–8'], ['Veslovanie s činkou', 3, '10 na stranu', '75 s', 'Jednoručný príťah na lavičke, RPE 7'], ['Jednonožový rumunský mŕtvy ťah', 3, '8 na nohu', '90 s', 'S kettlebellom, RPE 7, balans'], ['TRX príťah k tvári', 3, '12–15', '60 s', ''], ['Farmárska chôdza', 3, '30–40 m', '60 s', 'S kettlebellmi']]]
];
// Mobilita – tri striedajúce sa tréningy
const MOBILITY_PLAN = [
  ['Mobilita: boky a chrbát', [['Mačka – krava', 2, '10'], ['Výpad s rotáciou trupu', 2, '5 na stranu'], ['Rotácie bokov 90/90', 2, '8 na stranu'], ['Holubica', 2, '45 s na stranu'], ['Natiahnutie bedrových flexorov v kľaku', 2, '45 s na stranu'], ['Detská pozícia', 2, '60 s']]],
  ['Mobilita: ramená a hrudník', [['Kĺzanie rúk po stene', 2, '10'], ['Dislokácie ramien s palicou', 2, '10'], ['Rotácia hrudníka v ľahu na boku', 2, '8 na stranu'], ['Natiahnutie hrudníka na valci', 2, '60 s'], ['Natiahnutie ramien pri stene', 2, '45 s na stranu'], ['Kobra', 2, '30 s']]],
  ['Mobilita: nohy a celé telo', [['Inchworm', 2, '6'], ['Mobilita členka pri stene', 2, '10 na stranu'], ['Hlboký drep s výdržou', 2, '45 s'], ['Žabka', 2, '45 s'], ['Natiahnutie zadnej strany stehien', 2, '45 s na stranu'], ['Natiahnutie lýtok', 2, '45 s na stranu'], ['Psík dolu hlavou', 2, '45 s']]]
];
const MOBILITY_AVOID = { kolena: ['Hlboký drep s výdržou', 'Žabka'], chrbat: ['Kobra'], ramena: ['Dislokácie ramien s palicou'] };
// aktivácia na začiatok tréningov z generátora (pri mobilite nie)
const ACTIVATION = ['Mačka – krava', 'Bird dog', 'Rotácie bokov 90/90', 'Výpad s rotáciou trupu'];
const usesStrengthPlan = (p) => p.goal === 'sila' && p.place === 'gym' && Number(p.days) >= 4 && !(p.limits || []).length;

function buildProgram(p) {
  if (usesStrengthPlan(p)) {
    const beg = p.level === 'zaciatocnik';
    return STRENGTH_PLAN.map(([name, items]) => ({ name, notes: 'K tomu 2× týždenne beh.', items: items.map(([n, sets, reps, rest, note]) => ({ name: n, sets: beg && sets > 2 ? sets - 1 : sets, reps, rest, note })) }));
  }
  if (p.goal === 'mobilita') {
    const avoid = new Set((p.limits || []).flatMap((l) => MOBILITY_AVOID[l] || []));
    const n = Math.max(2, Math.min(5, Number(p.days) || 3));
    return Array.from({ length: n }, (_, i) => {
      const [name, items] = MOBILITY_PLAN[i % MOBILITY_PLAN.length];
      return { name: n > 3 && i >= 3 ? `${name} (2)` : name, items: items.filter(([x]) => !avoid.has(x)).map(([x, sets, reps]) => ({ name: x, sets, reps, rest: '15 s' })) };
    });
  }
  const days = buildProgramGen(p);
  const avoidAct = new Set((p.limits || []).includes('kolena') ? ['Výpad s rotáciou trupu'] : []);
  const acts = ACTIVATION.filter((x) => !avoidAct.has(x));
  return days.map((d, i) => { const a = acts[i % acts.length]; return { ...d, items: [{ name: a, sets: 2, reps: a === 'Výpad s rotáciou trupu' || a === 'Rotácie bokov 90/90' || a === 'Bird dog' ? '5 na stranu' : '8', rest: '30 s', note: 'Aktivácia' }, ...d.items] }; });
}

function buildProgramGen(p) {
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
      if (TIMED[name]) { r = TIMED[name][lv.li] + (name === 'Bočný plank' ? ' na stranu' : ''); rs = /min/.test(TIMED[name][0]) ? '' : '45 s'; sets = /min/.test(TIMED[name][0]) ? 1 : Math.max(2, lv.sets[1]); }
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
