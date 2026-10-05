# Tréner

Webová aplikácia (PWA) pre osobného trénera: klienti, rozvrh tréningov, permanentky, tréningové plány a merania progresu.
Funguje v prehliadači na mobile aj počítači, dá sa nainštalovať na plochu telefónu a beží aj offline.
Nepotrebuje server ani účet – dáta sa ukladajú v zariadení (s možnosťou zálohy a obnovy cez JSON súbor).

## Funkcie
- **Prehľad** – dnešné a najbližšie tréningy, tréningy na vyhodnotenie, klienti, ktorým dochádza permanentka, pripomienka zálohy
- **Klienti** – kontakt, cieľ, poznámky (zranenia…), archivácia, vyhľadávanie
- **Permanentky** – balíky tréningov a platby, automatický odpočet odtrénovaných tréningov
- **Kalendár** – týždenný prehľad, opakované tréningy (každý týždeň), stav naplánovaný / odtrénovaný / zrušený, SMS pripomienka klientovi
- **Tréningové plány** – šablóny a plány pre klientov, série/opakovania/záťaž/pauza, kopírovanie, zdieľanie, tlač
- **Knižnica cvikov** – vlastné cviky podľa partií
- **Merania** – váha, % tuku, obvody, zmena od predchádzajúceho merania

## Spustenie
Stačí servírovať priečinok ako statický web, napr.:

```bash
npx http-server .
```

a otvoriť `http://localhost:8080`. Na trvalé nasadenie sa hodí GitHub Pages, Netlify alebo Cloudflare Pages
(service worker a inštalácia na telefón vyžadujú HTTPS).
