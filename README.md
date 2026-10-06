# Tréner

Webová aplikácia (PWA) pre osobného trénera: klienti, rozvrh tréningov, permanentky, tréningové plány a merania progresu.
Funguje v prehliadači na mobile aj počítači, dá sa nainštalovať na plochu telefónu a beží aj offline.
Nepotrebuje server ani účet – dáta sa ukladajú v zariadení (s možnosťou zálohy a obnovy cez JSON súbor).

## Funkcie
- **Prehľad** – dnešné a najbližšie tréningy, tréningy na vyhodnotenie, klienti, ktorým dochádza permanentka, pripomienka zálohy
- **Klienti** – kontakt, cieľ, poznámky (zranenia…), archivácia, vyhľadávanie
- **Kalendár** – týždenný prehľad, opakované tréningy (každý týždeň), stav naplánovaný / odtrénovaný / zrušený, SMS pripomienka klientovi
- **Tréningové plány** – šablóny a plány pre klientov, série/opakovania/záťaž/pauza, kopírovanie, zdieľanie, tlač
- **Knižnica cvikov** – vlastné cviky podľa partií
- **Merania** – váha, % tuku, obvody, zmena od predchádzajúceho merania
- **Financie** – každý tréning sa platí zvlášť (predvolene 20 €, nastaviteľné); príjem po mesiacoch rozdelený na hotovosť a na účet, nezaplatené tréningy s pripomienkou a tlačidlami Hotovosť / Na účet, platby, prehľad podľa klientov a posledných 6 mesiacov. Permanentky sú zatiaľ vypnuté (`PACKAGES` v `js/app.js`)

## Spustenie
Stačí servírovať priečinok ako statický web, napr.:

```bash
npx http-server .
```

a otvoriť `http://localhost:8080`. Na trvalé nasadenie sa hodí GitHub Pages, Netlify alebo Cloudflare Pages
(service worker a inštalácia na telefón vyžadujú HTTPS).

### Zverejnenie cez GitHub Pages
1. V repozitári otvor **Settings → Pages** a v časti *Build and deployment* nastav **Source: GitHub Actions** (stačí raz).
2. Každý push do vetvy `main` aplikáciu automaticky nasadí (workflow `.github/workflows/pages.yml`).
3. Aplikácia bude na adrese `https://<používateľ>.github.io/trainer-app/`.
