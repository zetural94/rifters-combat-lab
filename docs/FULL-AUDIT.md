# Pełny audyt — Rifters Combat Lab

Data: 2026-09-24. Commit: `779b823` (`Seal the Pages lab behind the designer password`). Gałąź: `main`.

Zakres: drzewo Pages vs źródło, silnik, karty, wizard, `serve.py` / ODPAL, dokumenty, testy, pieczęć. Bez zmian balansu, schodów Soft/BP, semantyki Help i bez rotacji hasła.

## Status remediacji

Opis poniżej jest stanem z `779b823`. Tabela jest stanem po tej poprawce. Hasło nie było obracane.

| Id | Status |
| --- | --- |
| A-01 | naprawione — skrót hasła zdjęty z publikowanej bramki; flaga sesji to `open`, nie hash |
| A-02 | naprawione — zasięg kliknięcia = `ability.range`; `aoe.range` / tier `aoeRange` = promień wybuchu |
| A-03 | naprawione — martwe linki i przycisk Builder / verify / smoke / mc zdjęte z chrome sandboxa |
| A-04 | naprawione — cios wręcz przywołania wojownika nie jest specialem przez prefiks `summon` |
| A-05 | accepted — docs na Pages bez hasła są OK; repo zostaje publiczne z wyboru Adriana; `docs/` nie wykluczono |
| A-06 | naprawione — CI odpala też schema, `lab-qa-pass` i `help-and-minions-check` (bez Puppeteera) |
| A-07 | dopisane — zmiana sandbox/engine/mc/cards wymaga `scripts/seal-lab.mjs` i `lab.enc` w tym samym commicie |
| A-08 | naprawione — słownik rozdziela Rank 1 i range R1; tiery to T1–T3 |
| A-09 | naprawione — train / Dummy podaje prawdziwe id tokenów (`fighter-a`, `fighter-b`) |
| A-10 | naprawione — notatka Savage Claws mówi, że to basic, nie Silence special |
| A-11 | naprawione — generator zachowuje oznaczoną sekcję przeglądarkową |
| A-12 | naprawione — martwe wywołania `shockOnReaction` wycięte; funkcja zostaje jako deprecated |
| A-13 | naprawione — prywatne repo nie jest pozostałym krokiem |
| A-14 | naprawione — Abort to ręczny stop playtestu, nie Defeat (rany ≥ 5) |
| D-01 | nie ruszane w remedacji |
| D-02 | nie ruszane w remedacji |
| D-03 | resolved: Warrior removed for now |
| D-04 | udokumentowane, mechaniki nie zmieniano — Stealth jest 1/round, wolno nawet po ataku w tej turze; atak nadal zdejmuje stealth |

W tym przebiegu nie było blokera, który wyłącza laba. Pieczęć na żywym Pages działa tak, jak opisuje README: plaintext `engine/`, `cards/`, `mc/` i `sandbox.html` zwracają 404, a `lab.enc` jest serwowany. Zostają błędy reguł w silniku, martwe linki w sandboxie i dziura w samej bramce (opublikowany skrót hasła).

## Streszczenie

- Żywy Pages (`https://zetural94.github.io/rifters-combat-lab/`) serwuje `index.html` i `lab.enc` bajt w bajt z `779b823`. `sandbox.html`, `engine/index.js`, `cards/fighter.json` i `mc/r1.js` dają 404. `.nojekyll` nie ma. Wykluczenie Jekylla z `_config.yml` jest wdrożone.
- Bramka AES-256-GCM (PBKDF2-SHA256, 120000 iteracji, magia `RFLB`) jest prawdziwa, ale opublikowany `index.html` nadal zawiera ten sam nieposolony skrót SHA-256 hasła, którego stara bramka używała do porównania. Skrót leży obok `lab.enc`, więc łamanie słownikowe omija PBKDF2. Hasła nie obracać w tej poprawce.
- Repozytorium zostaje publiczne z wyboru. Klon i tak ma plaintext. Pieczęć chroni link Pages, nie `github.com`. `docs/AUDIT-REMEDIATION.md` nadal nazywa prywatne repo „pozostałym krokiem” — to napięcie z zablokowaną decyzją, nie defekt do cichego „naprawienia”.
- Potwierdzony rozjazd zasięgu: lista akcji bierze `aoe.range`, a `resolveStrike` bierze `ability.range`. Entangle 2 vs 5, Toxic Cloud 3 vs 4, Fireball 2 vs 4. Schemat 82/82 tego nie widzi.
- Help, porażka (rany ≥ 5), Soft/BP v0.3g, HP przywołań 14/8/10/10×INT i brak `camouflage` są zgodne z kanonem. Testy silnika, które dało się odpalić, są zielone.
- resolved: Warrior removed for now. Klasa bohatera Warrior (klon Fightera) jest zdjęta z laba. Zostaje przywołanie Acolyte Summon Warrior. Cold Blooded, Spotter i „Stealth tylko przed pierwszym atakiem” zostają decyzjami do domknięcia (D-01, D-02, D-04).
- `builder.html`, `verify.html`, `smoke.html` i `mc.html` nadal nie istnieją. Przycisk Builder prowadzi w 404. Link do kanonu w nagłówku został już podmieniony na istniejące `docs/`.
- CI odpala 17 testów jednostkowych. Nie odpala lab-qa (50), Help (96) ani playthrough (56+16). Skrypty przeglądarkowe nie były tu powtórzone (brak `puppeteer-core`).

## Tabela ustaleń

| Id | Severity | Obszar | Dowód | Rekomendacja |
| --- | --- | --- | --- | --- |
| A-01 | high | pieczęć / Pages | `index.html` (opublikowany, zgodny bajtowo z Pages) trzyma stały skrót SHA-256 hasła i po udanym AES zapisuje go do `sessionStorage`. Ten sam literał jest w `sandbox.html`. Nagłówek `lab.enc` to `RFLB`, wersja 1, 120000 iteracji. Żywy `lab.enc` = plik z commita (889498 B). | Nie rotować hasła. Z opublikowanej bramki zdjąć skrót hasła (flaga sesji nie musi być SHA-256 hasła). PBKDF2 chroni tylko tego, kto nie czyta źródła strony. |
| A-02 | high | silnik / karty | `engine/actions.js` ok. 703–708: gdy jest `aoe.range`, ten promień jest zasięgiem kliknięcia. `engine/strike.js` ok. 574: cel główny sprawdzany przez `ability.range`. Karty: `primalist-entangle.json` range 5 / aoe 2; `acolyte-toxic-cloud.json` 4 / 3; `summon-mage-fireball.json` 4 / 2, a w tierach `aoeRange` 1/1/2. Źródło Fireballa: „R4 · AoE 1/1/2”. Przycisk Entangle w labie ma zasięg 2. | Adrian ustala jedną liczbę (zasięg kliknięcia, zasięg czaru, promień wybuchu i środek: caster czy punkt trafienia). Potem obie funkcje mają czytać to samo. |
| A-03 | high | UX | `sandbox.html` ok. 797 oraz ok. 7867 i 8200: `builder.html`, `verify.html`, `smoke.html`, `mc.html`. Żywy `builder.html` = 404. Plików nie ma w drzewie ani w paczce (111 plików: sandbox + engine + mc + cards). | Usunąć martwe linki i przycisk Builder albo podłączyć je do czegoś, co jest w paczce. Nie przywracać starych stron „na zapas”. |
| A-04 | medium | Silence / Disarm | `engine/status.js` ok. 48: regex `howl\|charge\|…\|summon` na id lub nazwie. `summon-warrior-strike` ma range 1 i i tak wypada jako special. Reszta ciosów przywołań jest specjalna także przez range > 1. W paczce nie ma karty Silence. Disarm jest na Dirty Trick (wróg). | Wyjąć `summon` z regexu albo klasyfikować po roli (basic vs special), nie po prefiksie id. Dziś to się nie odpala w bestiariuszu — efekt jest uśpiony. |
| A-05 | medium | Pages / docs | `_config.yml` wyklucza engine/cards/mc/sandbox, nie wyklucza `docs/`. Żywy `docs/LAB-QA-PASS.md` zwraca 200 bez hasła (liczby talentów, Help, BP). | Zdecydować, czy notatki na linku Pages są jawne. Jeśli link ma chować reguły, `docs/` też idą do pieczęci albo poza Pages. |
| A-06 | medium | testy | `.github/workflows/test.yml` uruchamia tylko `node --test tests/*.test.mjs` (17). Osobno, ręcznie: schema 82, lab-qa 50, Help 96, playthrough 56+16. UI (`lab-qa-ui.mjs`, `help-minion-ui.mjs`) wymaga Puppeteera; tu go nie ma. | Dorzucić do CI lab-qa, Help i checker semantyki (A-02, A-04). UI zostawić jako ręczny przebieg z Chrome. |
| A-07 | medium | pieczęć / proces | `tests/seal.test.mjs` nie odszyfrowuje committed `lab.enc` (hasła nie ma w CI). Sprawdza magię, brak plaintextowego snippeta i exclude. `collectPlayableFiles()` = 111 plików. Żywy blob = blob z gita, więc dziś paczka nie jest zestarzała. | Przy każdej zmianie sandbox/engine/mc/cards odpalać `scripts/seal-lab.mjs` i commitować `lab.enc` w tym samym commicie. Test bez hasła tego nie wymusi. |
| A-08 | low | UX / słownik | `sandbox.html` glossary: „R1 = range 1”, a tytuł strony i wizard mówią R1 / Rank 1. Słownik ma też „T0–T3”; rzut jest T1–T3. | Rozdzielić skróty (zasięg vs ranga) w słowniku. |
| A-09 | low | wizard / kolejka | `<select id="start-actor">` ma id klas (`fighter`, …). Walka train używa `fighter-a` / `fighter-b` (`mc/r1.js`). `rotateQueueStart` szuka dokładnego id, więc wybór nie przestawia kolejki Dummy. Lista nie zwęża się do party. | Albo chować select w train, albo podawać prawdziwe id tokenów. |
| A-10 | low | karta vs silnik | `cards/ember-wolf-ember-claws.json` notes: „Bloodied special”. `isMonsterSpecialAbility` nie traktuje `bloodied-only` jako special (range 1). `docs/LAB-QA-PASS.md` już mówi, że Savage Claws jest basic. | Zostawić zachowanie. Poprawić zdanie na karcie, gdy będzie redakcja kart. |
| A-11 | low | docs | Ponowne `node scripts/talent-playthrough.mjs` daje te same 56/16, ale obcina dwa ręczne akapity o kliknięciach Riposte / Hidden Bola z końca `docs/TALENT-PLAYTHROUGH.md`. | Generator nie powinien nadpisywać ręcznej sekcji przeglądarkowej. |
| A-12 | low | martwy kod | `engine/status.js`: `shockOnReaction` jest `@deprecated` i zwraca 0. Help, Defend i Interpose nadal go wołają. | Zostawić albo wyciąć wywołania przy najbliższym dotknięciu tych funkcji. Na obrażenia Shocka to nie wpływa. |
| A-13 | low | docs | `docs/AUDIT-REMEDIATION.md`: „Making the repo private is the remaining step”. Kanon tej tury: repo zostaje publiczne. | Zostawić repo publiczne. W remediacji dopisać, że prywatność jest świadomie odrzucona, albo usunąć to zdanie przy następnej redakcji. |
| A-14 | low | UX / abort | Abort w `sandbox.html` (ok. 7234) uznaje bohatera za żywego, gdy `!dead`, bez progu ran ≥ 5, i liczy przywołania (`side === "hero"`). Prawdziwe zakończenie walki jest w `engine/encounter.js` `checkOver`. | Abort może zostać etykietą ręczną. Nie mylić go z Defeat. |
| D-01 | design-open | drabina Assassin | `mc/talent-ladder.js`: Cold Blooded nie ma w `R1_LADDER_PICKS.assassin` (shadow-dash, riposte, stealth, dirty-trick). W wariancie B jest na slocie 0. Stub: +2 max Stress, crit czyści +1. | Adrian wybiera slot na drabinie A albo zostawia talent tylko w ręcznym naborze. |
| D-02 | design-open | drabina Scout | Spotter (`scout-spotter`) nie wchodzi w drabinę A ani B przy n=1–4. Poza drabiną A są też barrage, survival-tactics, vigilant. Sam talent w silniku działa (marka, BREAK 2 sojusznikom, Crit 1 na następnym dystansie). | Domknąć, czy Spotter jest w pakiecie Rank 1, czy zostaje off-ladder. |
| D-03 | resolved | Warrior Rank 0 | Klasa bohatera zdjęta: karty `warrior` / `warrior-*`, stuby `warrior-*` w `FEAT_SMOKE_STUBS`, preset `warriorProbe` i ścieżki silnika tylko dla tych talentów. Przywołanie Acolyte (`acolyte-summon-warrior`, `cards/summon-warrior-*.json`, HP 14×INT) zostaje. | resolved: Warrior removed for now |
| D-04 | design-open | Stealth | `applyStealth` / `legalActions`: 0 AP, 1 stress, raz na rundę, bez sprawdzenia `attacksThisTurn`. Po ustawieniu `attacksThisTurn = 1` przycisk Stealth nadal jest. Komentarz: „1/round”, nie „tylko przed pierwszym atakiem”. Atak ściąga stealth (`strike.js` ok. 964–970). | Jeśli reguła to „tylko zanim zaatakujesz w tej turze”, dodać bramkę. Jeśli zostaje 1/rundę w dowolnym momencie, dopisać to jednym zdaniem przy talencie. |

Podejrzenia, których nie podnoszę do buga: środek wybuchu Fireballa jest casterem (`inRange(atk, other, aoeR)` w `strike.js`, komentarz „blast around caster”). To jest spójne z kodem i niespójne ze zdaniem „R4 · AoE 1/1/2” na karcie. Rozstrzyga to samo domknięcie co A-02, nie osobna łatka.

## Wyniki uruchomień

Wszystko poniżej na drzewie `779b823`, bez zmian w kartach i silniku.

| Polecenie | Wynik |
| --- | --- |
| `node --test tests/*.test.mjs` | 17 pass, 0 fail (schema, playSummons, puppeteer path, reactPrompt, seal) |
| `node scripts/check-card-schema.mjs` | cards 82, pass 82, fail 0 |
| `node scripts/lab-qa-pass.mjs` | ok 50, fail 0 (sekcje 22 / 6 / 12 / 4 / 6) |
| `node scripts/help-and-minions-check.mjs` | 96× `OK`, exit 0 |
| `node scripts/talent-playthrough.mjs` | talenty 56 OK / 0 FAIL; kity bazowe 16 OK / 0 FAIL. Plik docs przywrócony — generator ścina dopisek przeglądarkowy (A-11) |
| `node scripts/audit-talent-dummy.mjs` | 56 OK, 0 ISSUE. Docs przywrócone |
| `node scripts/lab-qa-ui.mjs` | nieodpalone. Brak `puppeteer-core` (skrypt szuka `PUPPETEER_CORE` albo `/tmp/puppeteer-run`). Wcześniejszy zapis w `docs/LAB-QA-PASS.md`: 33 OK / 0 FAIL — niepotwierdzone w tej turze |
| `node scripts/help-minion-ui.mjs` | nieodpalone, ten sam brak Puppeteera. Zapis w `docs/HELP-AND-MINIONS.md`: 71 Help OK, 131 N/A, 0 FAIL — niepotwierdzone w tej turze |

Żywy Pages (GET, 2026-09-24):

| URL | Wynik |
| --- | --- |
| `/` i `/index.html` | 200, bajtowo = `index.html` z commita (5291 B) |
| `/lab.enc` | 200, bajtowo = `lab.enc` (889498 B), magia `RFLB` |
| `/sandbox.html`, `/engine/index.js`, `/cards/fighter.json`, `/mc/r1.js`, `/builder.html` | 404 |
| `/docs/LAB-QA-PASS.md` | 200 |

Grepy po drzewie (js/mjs/html/md/json): `TODO` 0, `FIXME` 0, `HACK` 0, `XXX` 0, `camouflage` 0. `CARD_FILES` w `mc/r1.js` pokrywa się z `cards/*.json` (poza `card.schema.json`, który nie jest kartą). Po zdjęciu klasy Warrior hero zostaje 78 kart. Brak wiszących id w `abilities` / `reactions`.

W audycie `collectPlayableFiles()` było 111. Po zdjęciu czterech kart Warrior hero drzewo ma 107 plików gry. `lab.enc` nie został przebity, bo `RIFTERS_LAB_PASSWORD` nie było w środowisku.

## Nie bugi / zablokowane

- Soft: Easy 0–4, Medium 0–6, Hard 4–10 (`RIFT_KPI_BY_LANE`, README, ODPAL). Schody v0.3g: Easy 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9. Komentarz w `mc/r1.js` („Soft bands may be retuned later”) jest starym zdaniem nad tabelą, która w następnym wierszu jest oznaczona LOCKED. Liczby się zgadzają; zdania nie ruszać przy retunie.
- Porażka: `checkOver` kończy walkę, gdy każdy bohater (nie przywołanie) ma rany ≥ 5 albo `dead`. Dying (0 HP, rany < 5) zostaje w walce. Dying dostaje 2 AP (`apMaxFor`). To jest zgodne z kanonem, nie luka.
- Help: przerzut niższego d10 (`helpRerollLowerDie`), bez dokładania Advantage. Kolejność zapłaty: Ranger free (`rangerFreeHelps`) → Light Armor free reaction → inaczej −1 AP (`resolveHelp` → `tryPayReaction`). Test 96 OK.
- HP przywołań w `SUMMON_TEMPLATES`: Warrior 14, Mage 8, Archer 10, Elemental 10, razy INT (minimum 1). Zgadza się ze stubami. Karty przywołań nie mają osobnego bloku HP stwora — nie ma tu starego, sprzecznego HP do poprawy.
- resolved: Warrior removed for now. Klasa bohatera nie jest już w `HERO_CATALOG` ani w `warriorProbe`. Przywołanie Summon Warrior zostaje.
- Hasło nie było rotowane. Ten audyt go nie rusza i nie wkleja skrótu.
- Publiczne repo jest wyborem Adriana. Plaintext na `github.com` nie jest tu usterką do zamknięcia.
- `serve.py` jest w drzewie, bind `127.0.0.1`, CORS tylko localhost, POST logów z LAN tylko z `LAB_TOKEN`. ODPAL i README opisują ten sam lokalny start (`python3 serve.py` albo `npx serve`). Wcześniejsza rozbieżność „ODPAL woła serve.py, którego nie ma” jest zamknięta w `779b823`.
- Brak `RULES-CANON.md` jest nazwane w `engine/README.md`. Nagłówek sandboxa linkuje `docs/HELP-AND-MINIONS.md` i `docs/LAB-QA-PASS.md`, nie martwy kanon.

## Następne 5 kroków

1. Zdjąć skrót hasła z publikowanego `index.html` (A-01). Hasła nie zmieniać. Potem sprawdzić, że zły wpis nadal zostaje na bramce, a Pages nadal daje 404 na `engine/index.js`.
2. Domknąć zasięg Entangle / Toxic Cloud / Fireball (A-02): jedna reguła dla kliknięcia, ciosu i wybuchu. Schemat tego nie złapie — to zmiana w `legalActions` i `resolveStrike` po decyzji, nie w liczbach Soft.
3. Wyciąć martwy Builder / verify / smoke / mc (A-03), żeby playtest nie wychodził w 404.
4. Trzy decyzje: slot Cold Blooded, Spotter na drabinie Scouta, Stealth przed pierwszym atakiem czy 1/rundę (D-01, D-02, D-04). D-03: resolved: Warrior removed for now.
5. Dopisać do CI checker semantyki (range ≠ aoe.range, id `summon-*` nie robi z ciosu wręcz speciala) oraz `lab-qa-pass` i `help-and-minions-check`. Przy edycji plików gry odnawiać `lab.enc` w tym samym commicie (A-07).
