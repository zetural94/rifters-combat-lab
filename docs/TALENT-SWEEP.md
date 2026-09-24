# Przegląd kombinatoryczny talentów wobec Soft/BP v0.3g

Werdykt: **schody v0.3g nie trzymają się wszystkich buildów.** Trzymają się drabinki R1 (re-gate w `docs/SOFT-REGATE-A02.md`, kotwica bit-identyczna). Pełna chmura podzbiorów i losowych party leży wyraźnie powyżej sufitu ran. Ten przebieg niczego nie retunuje. Schody, pasma i liczby talentów zostają. Na dole jest tylko propozycja.

Pasma Soft, bez zmian: Easy 0–4, Medium 0–6, Hard 4–10. Pad v0.3g przy n=0..4: Easy 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9. Build jest **w paśmie**, gdy średnia ran party z jego riftów mieści się w paśmie włącznie. **Zbyt słaby** znaczy średnią powyżej sufitu (za dużo ran). **Zbyt silny** znaczy średnią poniżej podłogi (za mało ran). Easy ma podłogę 0, więc tam „zbyt silny” nie występuje.

## Jak to było liczone

Runner: `tools/run-talent-sweep.mjs`. Warrior jest pominięty. `mc/talent-ladder.js` nie jest edytowany; skrypt tylko czyta `r1LadderFeats`.

Każda z siedmiu klas (fighter, brawler, assassin, scout, mystic, acolyte, primalist) ma w `FEAT_SMOKE_STUBS` dokładnie 8 talentów. Podzbiory n=1..4 to 8+28+56+70 = **162 zestawy na klasę**, 1134 buildy, razy 3 pasy = **3402 komórki exhaustive**. Klasa w fokusie dostaje wylosowany albo wyliczony podzbiór. Reszta party z `partyForClass` zostaje na plasterku drabinki A o długości n. `talentsPerHero` jest równe n, więc wchodzi pad v0.3g dla tego n. Polityka `table`.

Próbka mieszana: **1000 party na pas na n** (n=1..4), czyli 4000 party na pas i **12 000 party** łącznie. Każda party to cztery różne klasy spośród siedmiu, a każdy bohater ma niezależny, jednostajny podzbiór swoich talentów o rozmiarze n.

**4 rifty na build.** Średnia tych czterech jest testem pasma. Seed główny **1**. Seedy riftów to FNV od `seed|klucz|indeks`. **4 procesy** robocze. Łącznie 15 402 joby i **61 608 riftów**. Czas ścienny **572 s**.

```
node tools/run-talent-sweep.mjs --seed 1 --runs 4 --mixed 1000 --jobs 4 --out /tmp/talent-sweep
node tools/run-talent-sweep.mjs --analyze /tmp/talent-sweep --report /tmp/talent-sweep/summary.json
```

Szum: średni błąd standardowy średniej z 4 riftów to około 1,0–1,3 rany na Easy, 1,5–2,0 na Medium i 2,0–2,3 na Hard (`meanSe` w tabelach). Build przy samej krawędzi może zmienić etykietę. Udział buildów w paśmie ma ciasny 95% przedział Wilsona, bo N to 56 / 196 / 392 / 490 (exhaustive, siedem klas razem) albo 1000 (mieszane). Środek rozkładu nie jest artefaktem krawędzi: mieszane Easy ma p50 średnich 5,75–6,5 przy suficie 4, a exhaustive Hard n=3 ma p50 11,75 przy suficie 10.

Efekt talentu to delta z/bez w obrębie klasy × pas × n: średnia buildów, które talent mają, minus średnia tych, które go nie mają, potem średnia nieważona po n=1..4 i po trzech pasach. Plus znaczy więcej ran, czyli słabiej niż inne talenty tej samej wielkości. Efekt pary (n≥2) to interakcja `oba − tylko A − tylko B + żaden`, uśredniona po n=2..4 i po pasach. Plus znaczy, że razem dają więcej ran, niż wynikałoby z samych efektów głównych.

## Exhaustive, jedna klasa na raz

Reszta party siedzi na drabince A. Wygrane są prawie pełne. Wypadnięcia to niemal zawsze zbyt słabe buildy (za dużo ran), z jednym wyjątkiem: Hard n=2, gdzie 17% buildów jest zbyt silnych.

| Pas | n | buildy | w paśmie | Wilson 95% | średnia | p50 | zbyt słabe | zbyt silne | wygrane | timeout | SE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 56 | 76,8% | 64,2–85,9 | 2,92 | 2,50 | 23,2% | 0% | 100% | 0% | 1,25 |
| Easy | 2 | 196 | 85,7% | 80,1–89,9 | 2,54 | 2,25 | 14,3% | 0% | 100% | 0% | 1,03 |
| Easy | 3 | 392 | 62,0% | 57,1–66,7 | 3,93 | 3,75 | 38,0% | 0% | 100% | 0% | 1,33 |
| Easy | 4 | 490 | 62,7% | 58,3–66,8 | 3,83 | 3,50 | 37,4% | 0% | 100% | 0% | 1,24 |
| Medium | 1 | 56 | 71,4% | 58,5–81,6 | 4,96 | 4,00 | 28,6% | 0% | 100% | 0% | 1,56 |
| Medium | 2 | 196 | 82,1% | 76,2–86,9 | 3,90 | 3,25 | 17,9% | 0% | 99,9% | 0,1% | 1,48 |
| Medium | 3 | 392 | 55,9% | 50,9–60,7 | 6,35 | 5,50 | 44,1% | 0% | 99,6% | 0% | 1,98 |
| Medium | 4 | 490 | 55,1% | 50,7–59,5 | 6,29 | 5,75 | 44,9% | 0% | 99,7% | 0,1% | 1,88 |
| Hard | 1 | 56 | 66,1% | 53,0–77,1 | 9,49 | 9,00 | 32,1% | 1,8% | 99,1% | 0,4% | 2,24 |
| Hard | 2 | 196 | 61,2% | 54,3–67,8 | 7,22 | 6,50 | 21,4% | 17,3% | 98,9% | 0,4% | 2,27 |
| Hard | 3 | 392 | 33,2% | 28,7–38,0 | 11,37 | 11,75 | 65,3% | 1,5% | 96,2% | 1,7% | 2,25 |
| Hard | 4 | 490 | 43,9% | 39,6–48,3 | 10,53 | 10,50 | 55,5% | 0,6% | 96,8% | 1,4% | 2,22 |

n=1 i n=2 są w większości w paśmie. n=3 i n=4 wypadają, bo pad rośnie wolniej niż rozrzut słabych podzbiorów. Hard n=3 jest najgorszą komórką exhaustive: jedna trzecia buildów w paśmie, średnia 11,37 przy suficie 10.

### Udział w paśmie według klasy

Osiem talentów na klasę, więc n=1 to 8 buildów, n=2 to 28, n=3 to 56, n=4 to 70.

Easy:

| Klasa | n=1 | n=2 | n=3 | n=4 |
| --- | --- | --- | --- | --- |
| Fighter | 75% | 100% | 71% | 71% |
| Brawler | 75% | 96% | 73% | 73% |
| Assassin | 88% | 61% | 52% | 53% |
| Scout | 63% | 86% | 80% | 76% |
| Mystic | 63% | 82% | 39% | 34% |
| Acolyte | 75% | 75% | 41% | 44% |
| Primalist | 100% | 100% | 77% | 87% |

Medium:

| Klasa | n=1 | n=2 | n=3 | n=4 |
| --- | --- | --- | --- | --- |
| Fighter | 88% | 100% | 84% | 76% |
| Brawler | 100% | 93% | 70% | 64% |
| Assassin | 75% | 86% | 64% | 66% |
| Scout | 75% | 86% | 64% | 67% |
| Mystic | 38% | 46% | 7% | 16% |
| Acolyte | 75% | 64% | 30% | 20% |
| Primalist | 50% | 100% | 71% | 77% |

Hard:

| Klasa | n=1 | n=2 | n=3 | n=4 |
| --- | --- | --- | --- | --- |
| Fighter | 75% | 64% | 25% | 49% |
| Brawler | 75% | 75% | 32% | 41% |
| Assassin | 50% | 61% | 34% | 44% |
| Scout | 75% | 75% | 38% | 60% |
| Mystic | 38% | 54% | 14% | 20% |
| Acolyte | 63% | 39% | 30% | 17% |
| Primalist | 88% | 61% | 59% | 76% |

Mystic i Acolyte wypadają najmocniej przy n=3–4. Mystic Medium n=3 jest w paśmie w 7% (średnia 10,25), Hard n=3 w 14% (średnia 13,68). Acolyte Hard n=4 jest w paśmie w 17% (średnia 12,73), Medium n=4 w 20% (średnia 8,93). Primalist zostaje w większości w paśmie. Hard n=2 bywa zbyt silny: Primalist 32% poniżej podłogi, Fighter 25%, Brawler 21%, Acolyte 25%. Pad Hard przy n=2 jest za duży względem mocnych dwójek tych klas, a za mały względem słabych trójek i czwórek Mistica i Acolyte. Jedna liczba padu nie obsłuży obu końców.

## Losowe party

Każdy bohater ma własny losowy zestaw. Tu schody nie trzymają się nigdzie: większość party jest zbyt słaba. Zbyt silne party pojawiają się prawie tylko na Hard i to w 3–7%.

| Pas | n | party | w paśmie | Wilson 95% | średnia | p50 | zbyt słabe | zbyt silne | wygrane | timeout | SE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 1000 | 27,4% | 24,7–30,3 | 6,38 | 5,75 | 72,6% | 0% | 98,8% | 0,6% | 1,62 |
| Easy | 2 | 1000 | 31,2% | 28,4–34,1 | 6,20 | 5,75 | 68,8% | 0% | 98,8% | 0,4% | 1,60 |
| Easy | 3 | 1000 | 25,9% | 23,3–28,7 | 6,95 | 6,50 | 74,1% | 0% | 97,6% | 0,9% | 1,64 |
| Easy | 4 | 1000 | 29,7% | 27,0–32,6 | 6,68 | 6,00 | 70,3% | 0% | 98,3% | 0,6% | 1,61 |
| Medium | 1 | 1000 | 50,1% | 47,0–53,2 | 6,78 | 6,00 | 49,9% | 0% | 99,1% | 0,6% | 1,70 |
| Medium | 2 | 1000 | 50,0% | 46,9–53,1 | 6,89 | 6,00 | 50,0% | 0% | 98,2% | 1,3% | 1,65 |
| Medium | 3 | 1000 | 33,9% | 31,0–36,9 | 8,41 | 8,25 | 66,1% | 0% | 96,5% | 2,5% | 1,81 |
| Medium | 4 | 1000 | 37,1% | 34,2–40,1 | 8,11 | 7,75 | 62,9% | 0% | 97,1% | 2,0% | 1,74 |
| Hard | 1 | 1000 | 35,3% | 32,4–38,3 | 11,05 | 11,25 | 58,8% | 5,9% | 92,7% | 3,6% | 2,06 |
| Hard | 2 | 1000 | 36,0% | 33,1–39,0 | 10,88 | 11,00 | 57,2% | 6,8% | 91,9% | 4,0% | 2,03 |
| Hard | 3 | 1000 | 25,6% | 23,0–28,4 | 12,40 | 12,75 | 71,3% | 3,1% | 86,2% | 7,0% | 1,97 |
| Hard | 4 | 1000 | 26,6% | 24,0–29,4 | 11,97 | 12,50 | 68,3% | 5,1% | 86,9% | 7,1% | 1,96 |

Easy mieszane ma średnią 6,2–6,9 przy suficie 4. Medium n=3–4 ma średnią 8,1–8,4 przy suficie 6. Hard n=3–4 wygrywa już tylko w około 86–87%, a timeout dochodzi do 7%. Party nadal zwykle kończą rift, tylko z za dużą liczbą ran.

## Talenty, które wypychają z pasma

Delta jest średnią po pasach i po n. „Poza” to średnia po pasach z (udział poza pasmem z talentem − udział bez niego). Wysoki udział „zbyt słabe” przy talencie jest w nawiasie, uśredniony po trzech pasach.

Słabsze niż alternatywy tej samej wielkości (więcej ran):

| Talent | delta ran | poza pasmem | zbyt słabe, gdy jest |
| --- | --- | --- | --- |
| `acolyte-systems-bargain` | +4,41 | +46 pp | 91% |
| `mystic-shadowplay` | +2,82 | +24 pp | 85% |
| `acolyte-toxic-cloud` | +2,13 | +19 pp | 74% |
| `mystic-living-bomb` | +1,76 | +30 pp | 89% |
| `brawler-grapple` | +1,49 | +24 pp | 49% |
| `scout-vigilant` | +1,37 | +20 pp | 43% |
| `fighter-intimidating-shout` | +1,09 | +11 pp | — |
| `primalist-entangle` | +1,01 | +5 pp | — |

Systems Bargain jest outlierem bez dyskusji: Easy +2,65, Medium +5,29, Hard +5,28, i to na każdym n. Z nim poza pasmem jest 83% / 95% / 94% buildów Acolyte. Shadowplay, Toxic Cloud i Living Bomb robią to samo, słabiej, ale w tę samą stronę na wszystkich trzech pasach.

Mocniejsze niż alternatywy (mniej ran). Te ciągną build w stronę pasma albo pod podłogę Hard:

| Talent | delta ran | poza pasmem |
| --- | --- | --- |
| `acolyte-summon-archer` | −2,52 | −15 pp |
| `assassin-riposte` | −2,40 | −24 pp |
| `scout-pin-shot` | −1,83 | −20 pp |
| `mystic-enhance-weapon` | −1,43 | −14 pp |
| `acolyte-summon-warrior` | −1,39 | −4 pp |
| `acolyte-summon-mage` | −1,37 | −1 pp |
| `mystic-blink` | −1,34 | −12 pp |
| `scout-survival-tactics` | −0,77 | −4 pp |

Przywołania Acolyte są mocne względem reszty jego puli. To dlatego słabe talenty Acolyte tak mocno podbijają delty: porównanie jest wewnątrz klasy, przy tym samym n.

### Pięć talentów z briefu

- **`assassin-cold-blooded`** nie jest outlierem. Delta −0,20. Easy +0,70 (poza pasmem 50% z nim, 41% bez), Medium −0,42 (33% vs 30%), Hard −0,87 (58% vs 55%). Znak zmienia się między pasami, a udział poza pasmem prawie stoi.
- **`scout-spotter`** jest umiarkowanie słaby, delta +0,42, ale wypycha częściej, niż sama delta sugeruje: +15 pp poza pasmem. Easy +0,71 (28% vs 17%). Medium jest zaszumiony po n (n=1 −2,75, n=3 +1,81, n=4 +1,59), a udział poza pasmem i tak 44% vs 21%. Hard +0,49.
- **`scout-barrage`** jest lekko mocniejszy, delta −0,61, poza pasmem −7 pp. Sam nie wypycha. Z Pin Shot ma interakcję +2,41 (razem gorzej niż suma efektów). Z Vigilant ma interakcję −1,48 (razem lepiej niż suma).
- **`scout-vigilant`** wypycha górą. Delta +1,37. Medium poza pasmem 45% z nim i 20% bez. Easy +1,18, Medium +1,87, Hard +1,05 (n=2 +3,04, n=4 +2,21, n=1 −1,50).
- **`scout-survival-tactics`** jest lekko mocniejszy, delta −0,77, i lekko obniża udział poza pasmem. To nie jest problem schodów. Stub daje +1 Recovery i +1 obrony od ognia i powietrza.

### Pary

Największe interakcje, średnia po pasach. Minus znaczy, że para razem rani mniej, niż wynika z osobnych delt (efekty się znoszą albo jeden ratuje drugi). Plus znaczy, że razem jest gorzej niż addytywnie.

| Para | interakcja |
| --- | --- |
| `mystic-lightning-bolt` + `mystic-shadowplay` | −2,65 |
| `scout-pin-shot` + `scout-vigilant` | −2,44 |
| `scout-barrage` + `scout-pin-shot` | +2,41 |
| `assassin-expose-weakness` + `assassin-flurry-daggers` | −2,10 |
| `acolyte-bless` + `acolyte-toxic-cloud` | +1,88 |
| `assassin-expose-weakness` + `assassin-riposte` | +1,83 |
| `mystic-ice-wall` + `mystic-shadowplay` | +1,74 |
| `acolyte-summon-archer` + `acolyte-summon-mage` | +1,63 |
| `primalist-entangle` + `primalist-primal-instinct` | +1,61 |
| `acolyte-summon-warrior` + `acolyte-systems-bargain` | +1,55 |

Lightning Bolt częściowo gasi Shadowplay (interakcja ujemna, oba razem mają mniej ran, niż sam Shadowplay by sugerował), ale nie ściąga Mystica z powrotem do pasma: komórki Mystica przy n=3–4 zostają w większości powyżej sufitu. Bless + Toxic Cloud dokłada rany ponad same efekty. Dwa przywołania Acolyte (Archer + Mage, Archer + Warrior) też wchodzą sobie w drogę: drugie przywołanie dokłada mniej, niż jego delta solo obiecuje.

## Propozycja, niezaaplikowana

Nie ruszać globalnego schodka v0.3g, żeby dogonić chmurę kombinatoryczną.

Obcięcie padu tak, by mieszane Easy (średnia około 6,5) weszło w 0–4, zepchnęłoby kotwicę R1 pod pasmo. Ta kotwica już jest w paśmie i często po niskiej stronie (re-gate: Easy n=2 mediana 1, Medium n=2 mediana 1). Hard n=2 exhaustive pokazuje ten sam kierunek: 17% buildów jest już zbyt silnych przy obecnym padzie.

Rozjazd siedzi w talentach spoza drabinki A, nie w pasie. Najmniejsza dźwignia, gdyby kiedyś ruszać liczby, to moc kart, w tej kolejności: Systems Bargain, Shadowplay, Toxic Cloud, Living Bomb, Grapple, Vigilant. Spotter jest słabszy sygnał w tę samą stronę. Cold Blooded, Barrage i Survival Tactics nie wymagają ruchu. Ten dokument tego ruchu nie robi.
