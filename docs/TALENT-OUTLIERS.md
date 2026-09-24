# Outliery talentów po kanonie i polityce

Werdykt zbiorczy: część „słabych” delt z `docs/TALENT-SWEEP.md` była błędem silnika albo polityki, nie karty. Po poprawkach **Toxic Cloud** i **Vigilant** schodzą do zera względem alternatyw tej samej wielkości. **Shadowplay** i **Living Bomb** nadal dokładają rany, ale wyraźnie mniej. **Grapple** zostaje słaby. **System's Bargain** zostaje słaby, i to jest zgodne z intencją (inwestycja na późniejsze rangi). **Riposte**, **Pin Shot** i **Summon Archer** nadal są mocniejsze niż reszta puli; karty zgadzają się z tekstem, więc to siła projektu, nie mnożnik z błędu.

Schody v0.3g, pasma Soft i koszty kart **nie były ruszane**.

Pasma bez zmian: Easy 0–4, Medium 0–6, Hard 4–10. Pad v0.3g przy n=0..4: Easy 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9. Plus na delcie znaczy więcej ran niż buildy tej samej klasy i tego samego n bez tego talentu.

Gałąź wchłonęła `main` na `71264bf` (PR #9): klasa bohatera Warrior zniknęła, przywołanie Acolyte Summon Warrior zostaje. Poprzedni sweep i ten też pomijają klasę Warrior. Liczby „przed” są z `docs/TALENT-SWEEP.md` i dalej są bazą, bo tamten przebieg tej klasy nie grał.

## Jak liczone jest „po”

Ten sam runner, ten sam seed, ta sama próbka:

```
node tools/run-talent-sweep.mjs --seed 1 --runs 4 --mixed 1000 --jobs 4 --out /tmp/talent-sweep
node tools/run-talent-sweep.mjs --analyze /tmp/talent-sweep --report /tmp/talent-sweep/summary.json
```

7 klas × podzbiory n=1..4 × 3 pasy = 3402 komórki exhaustive, plus 12 000 party mieszanych. 4 rifty na build. **15 402 joby, 61 608 riftów.** Czas ścienny **631 s** (poprzednio 572 s). Ślad użycia (`traceTalents`) jest wyłączony w tym przebiegu.

Osobna próbka śladu, nie wliczona w delty: 8 seedów × 3 pasy, n równe liczbie wymienionych talentów, reszta party na drabince A tej samej długości. 24 rifty / 72 walki na układ. Służy do rzutów, trafień i uptime, nie do pasma.

## Co było nie po tekście, i co zostało

Koszty, progi obrażeń WD i mnożniki przywołań zostały. Ruszane były tylko miejsca, gdzie silnik mówił co innego niż tekst.

- **Shadowplay.** Wybór sojusznika jako źródła. Strach idzie z AoE 3 wokół tego sojusznika, nie wokół czarującego. Bramka to INT celu ≤ INT czarującego. Adv 1 czarującego przeciwko feared trwa do końca walki. UPCAST 1 dokłada Intimidate 2×INT tylko tym, którzy w tym rzucie naprawdę dostali Fear. Wcześniej blast był wokół Mystica, strach nie miał bramki, a T3 dawał Intimidate ×5 zamiast upcastu.
- **Toxic Cloud.** Strefa do końca walki, środek na kotwicy w Range 4, promień 3. Wejście albo start tury w strefie: 4×INT Toxic (DEF działa) i, gdy INT ≤ INT czarującego z chwili rzutu, Poison 2. Poison się sumuje. Tick na starcie tury jest po pulsie, więc świeże stosy wchodzą w ten sam tick, a potem stos spada o 1. UPCAST przesuwa chmurę o co najwyżej 2 na starcie tury właściciela. Wcześniej był jednorazowy flat 4 i trucizna tylko na T2/T3 rzutu. Przy INT 1 liczba 4×INT i tak wynosi 4; różnica to trwanie i ponawianie trucizny, nie większy pierwszy strzał.
- **Living Bomb.** Śmierć: 8+INT Fire w Range 3 (UPCAST +2×INT), bez sojuszników czarującego. Bramka Burn to DEX ≤ INT czarującego, z −1 / 0 / +1 na progach. Wcześniej paczka śmierci była 5, a bramka porównywała DEX do DEX.
- **Grapple.** Restrain i Adv trzymają do startu następnej tury chwytającego, nie do startu tury celu. T2 daje Adv 1 na ataki w chwytającego i w cel nawet gdy bramka STR nie przejdzie. T3 daje Adv 1 tylko w cel. T1 zakłada zamek, więc restrain nie spada na turze celu.
- **System's Bargain.** Progi już były −1 (≤10 / 11–15 / 16+). Backlash T1 był zahardkodowanym 5. Tekst to 3×YOUR TIER, na randze 1 wychodzi 3. AI nadal otwiera walkę tym talentem.
- **Vigilant.** Silnik już miał +1 Stability, Adv 1 ponad bazowe Adv 1 na OA i bezpieczny MOVE 1 po udanym OA. OA odpala, gdy ktoś **schodzi** z zasięgu, nie gdy wchodzi.
- **Pin Shot.** T2 Slow 2 i T3 Knockdown nie mają już bramki DEX. Bramka zostaje tylko na T1, tak jak w tekście. Koszt 1 AP, 1 stress, opcjonalny stress na Adv 1, WD na każdym progu.
- **Riposte.** Bez zmiany kodu. Reakcja, darmowa akcja, 1 stress, −5×DEX, tylko melee (Range 1). Gdy po redukcji nie ma obrażeń w HP, jest OA bronią.
- **Summon Archer.** Karty bez zmiany: strzał 7×INT na każdym progu, Range 5, Bone Arrow 6/8/10×INT i Bleed przy STR ≤ INT (T1 z −1). HP 10×INT, szybkość 6, INT zwierzaka to INT właściciela. Pet gra po przywołującym.

## Polityka

- Shadowplay: źródłem jest sojusznik, który pokrywa najwięcej jeszcze niefearowanych. Nie rzuca w pojedyncze ciało, gdy na planszy jest co najmniej dwóch wrogów. Potem party kończy cele ≤8 HP, a wśród reszty woli feared.
- Toxic Cloud: jeśli kotwica jest poza Range 4, Acolyte podchodzi, zanim wyda turę na Symbol albo Hex (te mają Range 5). Chmura na jedno ciało jest legalna, bo strefa trwa. Rzut odpada, gdy w promieniu jest więcej sojuszników niż wrogów. Dopóki chmura kogoś trzyma, nie jest odnawiana. Właściciel, który stoi we własnej chmurze, schodzi z niej, jeśli ma krok poza strefą.
- Living Bomb: najniższe HP w zasięgu, najlepiej przy sąsiedzie w Range 3, bez wcześniejszej bramki „elite albo HP ≥ 18”.
- Grapple / Fear: po finiszerach ≤8 HP cele z restrain albo Adv od grapple są przed resztą, feared tuż za nimi. To samo sortowanie ma przywołanie.
- Vigilant: scout zostaje w pierścieniu OA (glaive, zasięg 2), zamiast kitować łukiem. Pin Shot i Barrage, gdy są daleko, dalej trzymają łuk.

## Próbka użycia wobec rozsądnego ideału

Ideał, nie liczba z karty: AoE strachu pokrywa paczkę i trwa, chmura stoi na wrogach i nie na bohaterach, bomba schodzi ze śmierci, grapple jest skupiany przez rundę, Vigilant w ogóle widzi OA, Bargain odpala raz na walkę.

| Układ | Co widać | Ideał |
| --- | --- | --- |
| Shadowplay solo | 1,54 rzutu/walkę, 1,68 ciała na rzut, 89% ze sojusznika (99 vs 12 z siebie), upcast 42/111 rzutów, fear na 12,4% tur wroga, po pojawieniu się fearu 78% kolejnych rzutów bohaterów idzie w feared | rzut na paczkę 2–3, fear na dużej części walki |
| Living Bomb solo | 1,75 rzutu/walkę, wszystkie z upcastem, 77,8% znaków wybucha (1,36 detonacji/walkę) | większość znaków ma zejść, zanim walka się skończy |
| Toxic Cloud solo | 0,63 rzutu/walkę, 4,98 ciał przy postawieniu, potem 5,11 pulsów wroga i 0,68 pulsu bohatera na walkę, trucizna na 5,79 pulsach, średni stos gdy jest: 4,51 | około 1 rzutu na walkę, bohaterowie poza strefą |
| Bargain solo | 0,96 aktywacji/walkę | raz na walkę, jeśli Acolyte dojdzie do pełnego AP |
| Bargain + Toxic | Bargain 0,93, chmura tylko 0,22 | opener zjada 2 AP, więc chmura czeka; to widać |
| Grapple solo | 1,50 rzutu/walkę, restrain na 3,1% tur wroga, Adv z T2/T3 na 1,7%, skupienie 24% rzutów po założeniu zamka | chwyt na rundę i ogień party w ten cel |
| Vigilant solo | 0 OA na 72 walki, glaive jest podstawowym atakiem (5,65/walkę w tej próbce) | OA, gdy wróg schodzi z zasięgu |
| Pin Shot solo | 1,15 rzutu/walkę | regularny rzut z łuku, nie spam co turę |
| Riposte solo | 1,29 reakcji/walkę, 12,9% zeruje HP tego ciosu | redukcja 5 przy DEX 1; OA tylko gdy cios spadnie do zera |
| Summon Archer solo | Bone Arrow 1,40/walkę; strzał bazowy jest rzadszy niż dwunasty najczęstszy atak w próbce | dodatkowe ciało strzela, nie dubluje mnożnika |

Trucizna „sama z siebie” w układach bez chmury (około 30–40 tur ze stosem ~2,4) to inne źródła, nie Toxic Cloud. Przy samej chmurze tur z trucizną jest 206, a średni stos 4,51, czyli stosy przeżywają tick.

## Pasma po poprawkach

### Exhaustive

| Pas | n | buildy | w paśmie | Wilson 95% | średnia | p50 | zbyt słabe | zbyt silne | wygrane | timeout | SE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 56 | 82,1% | 70,2–90,0 | 2,74 | 2,50 | 17,9% | 0% | 100% | 0% | 1,18 |
| Easy | 2 | 196 | 90,8% | 86,0–94,1 | 2,32 | 2,00 | 9,2% | 0% | 100% | 0% | 0,99 |
| Easy | 3 | 392 | 66,1% | 61,3–70,6 | 3,70 | 3,50 | 33,9% | 0% | 100% | 0% | 1,29 |
| Easy | 4 | 490 | 65,7% | 61,4–69,8 | 3,65 | 3,50 | 34,3% | 0% | 100% | 0% | 1,21 |
| Medium | 1 | 56 | 75,0% | 62,3–84,5 | 4,69 | 4,00 | 25,0% | 0% | 100% | 0% | 1,58 |
| Medium | 2 | 196 | 84,7% | 79,0–89,1 | 3,61 | 3,00 | 15,3% | 0% | 100% | 0% | 1,42 |
| Medium | 3 | 392 | 58,9% | 54,0–63,7 | 5,98 | 5,50 | 41,1% | 0% | 99,7% | 0,1% | 1,97 |
| Medium | 4 | 490 | 59,6% | 55,2–63,8 | 5,91 | 5,50 | 40,4% | 0% | 99,7% | 0,2% | 1,85 |
| Hard | 1 | 56 | 66,1% | 53,0–77,1 | 9,21 | 9,00 | 30,4% | 3,6% | 99,6% | 0% | 2,25 |
| Hard | 2 | 196 | 65,8% | 58,9–72,1 | 6,84 | 6,25 | 16,3% | 17,9% | 99,1% | 0,3% | 2,31 |
| Hard | 3 | 392 | 35,0% | 30,4–39,8 | 11,01 | 11,25 | 63,5% | 1,5% | 97,2% | 1,0% | 2,32 |
| Hard | 4 | 490 | 47,1% | 42,8–51,6 | 10,20 | 10,25 | 52,0% | 0,8% | 97,9% | 0,8% | 2,27 |

Poprzednio Easy n=2 było 85,7% w paśmie przy średniej 2,54, Hard n=3 33,2% przy 11,37. Środek zszedł, sufit n=3–4 dalej nie trzyma chmury.

### Udział w paśmie według klasy

Easy:

| Klasa | n=1 | n=2 | n=3 | n=4 |
| --- | --- | --- | --- | --- |
| Fighter | 75% | 100% | 71% | 71% |
| Brawler | 75% | 96% | 71% | 73% |
| Assassin | 88% | 61% | 52% | 53% |
| Scout | 75% | 96% | 88% | 80% |
| Mystic | 75% | 89% | 55% | 53% |
| Acolyte | 88% | 93% | 48% | 43% |
| Primalist | 100% | 100% | 77% | 87% |

Medium:

| Klasa | n=1 | n=2 | n=3 | n=4 |
| --- | --- | --- | --- | --- |
| Fighter | 88% | 100% | 84% | 76% |
| Brawler | 100% | 93% | 68% | 66% |
| Assassin | 75% | 86% | 64% | 66% |
| Scout | 88% | 93% | 73% | 73% |
| Mystic | 38% | 46% | 11% | 23% |
| Acolyte | 88% | 75% | 41% | 31% |
| Primalist | 50% | 100% | 71% | 83% |

Hard:

| Klasa | n=1 | n=2 | n=3 | n=4 |
| --- | --- | --- | --- | --- |
| Fighter | 75% | 64% | 25% | 49% |
| Brawler | 75% | 75% | 30% | 41% |
| Assassin | 50% | 61% | 34% | 44% |
| Scout | 75% | 79% | 41% | 67% |
| Mystic | 38% | 71% | 20% | 31% |
| Acolyte | 62% | 46% | 34% | 24% |
| Primalist | 88% | 64% | 61% | 73% |

Mystic Medium n=3 był w paśmie w 7%, jest w 11%. Hard n=3 z 14% na 20%. Acolyte Hard n=4 z 17% na 24%, Medium n=4 z 20% na 31%. Nadal wypadają przy n=3–4. Scout Easy n=4 urósł z 76% do 80%, Hard n=4 z 60% do 67%, razem z zejściem Vigilanta z listy słabych.

### Mieszane

| Pas | n | w paśmie | Wilson 95% | średnia | p50 | zbyt słabe | zbyt silne | wygrane | timeout | SE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 35,4% | 32,5–38,4 | 5,50 | 5,25 | 64,6% | 0% | 99,6% | 0,2% | 1,54 |
| Easy | 2 | 40,1% | 37,1–43,2 | 5,23 | 4,75 | 59,9% | 0% | 99,6% | 0,1% | 1,46 |
| Easy | 3 | 34,9% | 32,0–37,9 | 5,59 | 5,25 | 65,1% | 0% | 99,5% | 0,2% | 1,50 |
| Easy | 4 | 42,5% | 39,5–45,6 | 5,28 | 4,75 | 57,5% | 0% | 99,4% | 0,2% | 1,45 |
| Medium | 1 | 56,4% | 53,3–59,4 | 6,05 | 5,50 | 43,6% | 0% | 99,4% | 0,4% | 1,66 |
| Medium | 2 | 58,0% | 54,9–61,0 | 5,99 | 5,25 | 42,0% | 0% | 99,3% | 0,4% | 1,61 |
| Medium | 3 | 42,7% | 39,7–45,8 | 7,25 | 7,00 | 57,3% | 0% | 98,5% | 1,1% | 1,81 |
| Medium | 4 | 48,5% | 45,4–51,6 | 6,82 | 6,25 | 51,5% | 0% | 98,7% | 0,6% | 1,75 |
| Hard | 1 | 36,8% | 33,9–39,8 | 9,83 | 10,25 | 50,1% | 13,1% | 94,7% | 2,8% | 2,01 |
| Hard | 2 | 45,6% | 42,5–48,7 | 9,51 | 9,50 | 45,1% | 9,3% | 95,3% | 2,3% | 2,10 |
| Hard | 3 | 34,9% | 32,0–37,9 | 10,99 | 11,00 | 60,1% | 5,0% | 92,5% | 3,5% | 2,10 |
| Hard | 4 | 38,0% | 35,0–41,0 | 10,47 | 10,50 | 54,6% | 7,4% | 92,6% | 4,0% | 2,13 |

Mieszane Easy zeszło ze średnich około 6,2–6,9 do 5,2–5,6. Sufit 4 dalej jest pod spodem. Hard n=3–4 wygrywa w około 93%, timeout do 4% (poprzednio do 7%).

## Talenty, po jednym

Delta to średnia nieważona po n=1..4 i po trzech pasach. „Poza” to udział buildów z talentem poza pasmem minus udział bez niego, uśredniony po pasach tam, gdzie da się to przeczytać z `withOutRate` i `withoutOutRate`.

| Talent | przed | po | zmiana |
| --- | --- | --- | --- |
| System's Bargain | +4,41 | +3,91 | −0,50 |
| Shadowplay | +2,82 | +1,17 | −1,65 |
| Toxic Cloud | +2,13 | −0,08 | −2,21 |
| Living Bomb | +1,76 | +1,24 | −0,52 |
| Grapple | +1,49 | +1,48 | −0,01 |
| Vigilant | +1,37 | −0,20 | −1,57 |
| Summon Archer | −2,52 | −1,84 | +0,68 |
| Riposte | −2,40 | −2,40 | 0,00 |
| Pin Shot | −1,83 | −1,19 | +0,64 |

Archer i Pin Shot są nadal mocniejsze niż alternatywy. Ich delta zbliżyła się do zera, bo pula porównawcza (Toxic, Vigilant) przestała być workiem ran. To nie jest nerf tych kart.

### System's Bargain

1. **Silnik.** Zgadza się z tekstem. 2 AP, 2 many, self, progi −1 do końca walki. T1: 3×tier obrażeń nie do zablokowania. Na randze 1 to 3, poprzednio silnik brał 5.
2. **Użycie.** 0,96 aktywacji na walkę. Otwiera, gdy AP jest pełne. Nie ma tu „nigdy nie rzuca”.
3. **Werdykt.** Słabość projektu. Inwestycja pod późniejsze rangi. Poprawka backlashu ścięła deltę z +4,41 do +3,91 (Easy +2,71, Medium +4,51, Hard +4,51). Poza pasmem z nim: Easy 80%, Medium 91%, Hard 86%. Zostaje najsłabszym talentem w puli.

### Shadowplay

1. **Silnik.** Zgadza się. 1 AP, 1 mana, Range 3 do sojusznika, AoE 3 wokół niego. Fear, gdy INT ≤ INT czarującego. Fear w silniku to Disadv 2 przy ataku w źródło (bez limitu zasięgu) i dodatkowe Disadv 1 w Range 1 od źródła. Adv 1 czarującego przeciw feared trwa do końca walki. UPCAST dokłada Intimidate 2×INT. Żółw ma INT 2, więc na randze 1 (INT 1) bramka go nie łapie. Wilki (INT 0) i niedźwiedź (INT 1) łapie.
2. **Użycie.** Rzuca. 1,54 raza na walkę, zwykle ze sojusznika z pierwszej linii, nie z siebie. Skupienie na feared jest 78%, gdy strach już jest. Blast ma średnio 1,68 ciała, a fear pokrywa 12% tur wroga. To nie jest „cała paczka do końca walki”. Razem z Living Bomb spada do 0,94 rzutu, bo bomba bierze 2 AP pierwsze.
3. **Werdykt.** Błąd silnika był realny i jest zdjęty (źródło, bramka, upcast). Polityka rzuca i skupia ogień. Zostaje **słabość projektu w tym bestiariuszu**: AoE 3 wokół jednego sojusznika nie obejmuje rozstawionej paczki, a Fear karze atak w źródło, nie daje Adv całej party. Delta +1,17 (Easy −0,21, Medium +2,33, Hard +1,38). Na Easy jest już lekko mocniejszy niż alternatywy. Medium i Hard dalej dokładają rany.

### Toxic Cloud

1. **Silnik.** Zgadza się. Strefa do końca walki, wejście i start tury, 4×INT, Poison 2 przy INT ≤ INT z rzutu, stosy się dodają i tick zdejmuje 1. Przy INT 1 pierwszy strzał ma tę samą 4, co stary flat. Siła jest w powtórzeniach: średni stos 4,51, gdy trucizna w ogóle jest.
2. **Użycie.** Przed podejściem było 0,26 rzutu na walkę, bo Symbol i Hex mają Range 5, a chmura 4, więc Acolyte stawał krok za krótko. Po poprawce: 0,63 rzutu, około 5 ciał przy postawieniu, 5,11 pulsu wroga na 0,68 pulsu bohatera. Ideał „raz na walkę” nie jest osiągnięty: część walk kończy się w trakcie podejścia, a rzut jest odrzucany, gdy w promieniu stoi więcej swoich niż wrogów. Z Bargainem chmura spada do 0,22, bo opener zjada turę. Interakcja Bargain + Toxic to +1,19 (razem gorzej niż suma delt).
3. **Werdykt.** Był błąd silnika i błąd polityki (prawie nigdy nie rzucał). Po poprawkach delta −0,08. To nie jest już outlier. Zostaje napięcie projektu: czołg w zwarciu stoi na kotwicy, więc albo chmura go łapie, albo w ogóle nie schodzi. Ten przebieg woli nie malować strefy, gdy sojusznicy przeważają.

### Living Bomb

1. **Silnik.** Zgadza się. Śmierć daje 8+INT (na randze 1 jest 9, upcast 11) w Range 3, tylko we wrogów. Burn: T1 DEX ≤ INT−1, T2 DEX ≤ INT, T3 DEX ≤ INT+1. Wilk ma DEX 1, więc T1 Burn na wilku nie siada. Jeż i niedźwiedź (DEX 0) siadają.
2. **Użycie.** 1,75 rzutu na walkę, upcast za każdym razem, gdy mana starcza na 3. 78% znaków wybucha. To blisko ideału „zaznacz tego, który zejdzie”. Nie ma już znakowania pełnych elit, które nie umierają.
3. **Werdykt.** Błąd paczki śmierci (5 zamiast 8+INT) i bramki DEX jest zdjęty. Polityka znakuje niskie HP. Zostaje **słabość projektu**: 2 AP i 2 many za znak bez obrażeń w rzucie, a T1 Burn omija typowego wilka. Delta +1,24 (Easy +1,01, Medium +0,96, Hard +1,74). Nadal słabszy niż inne talenty Mystica tej samej wielkości, tylko mniej.

### Grapple

1. **Silnik.** Zgadza się. 2 AP, 1 stress, WD, restrain przy STR ≤ STR (T3: STR+1), do startu następnej tury chwytającego. T2: Adv 1 w obie strony. T3: Adv 1 tylko w cel. Adv nie zależy od tego, czy restrain przeszedł.
2. **Użycie.** 1,50 rzutu na walkę, czyli talent jest używany. Restrain widać tylko na 3,1% tur wroga, Adv na 1,7%. Skupienie party po założeniu zamka to 24% rzutów. Okno kanonu jest krótkie (do własnej następnej tury), a duża część planszy to jeże z HP 4, czyli finiszerzy ≤8 HP, którzy sortują się przed chwytem, jeśli nie są sami chwyceni. Niedźwiedź i żółw mają STR 2, brawler STR 1, więc T1 ich nie krępuje.
3. **Werdykt.** Czas trwania był błędem silnika i jest poprawiony. Delta prawie stoi: +1,49 → +1,48 (Easy +1,06, Medium +1,76, Hard +1,62). Zostaje **słabość projektu**: 2 AP, krótki zamek, bramka STR, która odpada na STR 2. Polityka już woli skuty cel po finiszerach. Dalsze „skupiaj mocniej” nie wydłuży okna, które tekst sam zamyka na następnej turze.

### Vigilant

1. **Silnik.** Zgadza się i zgadzał się przed tą gałęzią. +1 Stability. Na OA: dodatkowe Adv 1 i potem bezpieczny MOVE 1. OA jest zejściem z zasięgu (glaive 2, inaczej 1).
2. **Użycie.** W 72 walkach **zero** OA. Przeciwnicy, którzy już stoją w zasięgu, gryzą w miejscu i nie schodzą, więc pierścień nigdy nie strzela. Scout z samym Vigilantem i tak trzyma glaive (5,65 ataku glaive na walkę) zamiast kitować.
3. **Werdykt.** Nie był to błąd tekstu. Była to polityka: kitowanie wynosiło scouta z walki i delta była +1,37. Stanie w zasięgu OA ściągnęło ją do −0,20 (Easy −0,24, Medium +0,05, Hard −0,42). Talent nie jest już outlierem słabości, mimo że sam OA się nie odpala. Zostaje fakt projektu: w tym bestiariuszu premia „na OA” nie ma kiedy zapłacić. Płaci +1 Stability i to, że scout nie ucieka.

### Summon Archer

1. **Silnik.** Karty i szablon się zgadzają z pomocą w `docs/HELP-AND-MINIONS.md`. Strzał 7×INT na T1, T2 i T3. Bone Arrow 6/8/10×INT. HP 10×INT, szybkość 6, Range 5. INT petu to INT Acolyte, nie zero. Nie ma podwójnego mnożnika.
2. **Użycie.** Pet jest na stole. Bone Arrow 1,40 raza na walkę. To dodatkowy atakujący, nie jeden strzał na całą walkę.
3. **Werdykt.** Siła projektu. Delta −1,84 (było −2,52). Nadal najmocniejszy z tej listy po stronie „mniej ran”. Zbliżenie do zera bierze się z tego, że reszta puli Acolyte mniej psuje porównanie, oraz z interakcji dwóch przywołań (Archer + Mage +1,21: drugie ciało dokłada mniej, niż solo obiecuje). Nie ma tu buga do zdjęcia.

### Riposte

1. **Silnik.** Zgadza się, bez zmiany. Reakcja, 0 AP, 1 stress, −5×DEX. DEX 1 na randze 1 daje −5. Tylko Range 1. OA bronią, gdy ten cios nie zdejmuje HP. Ranged jest zablokowany.
2. **Użycie.** 1,29 reakcji na walkę. 13% z nich zeruje cios, więc OA po Riposte jest rzadki. Wartość jest w ścięciu obrażeń, nie w kontrataku.
3. **Werdykt.** Siła projektu. Delta −2,40, identyczna jak przed poprawkami innych kart. Nie ma mnożnika ani darmowej reakcji ponad tekst. Interakcja z Expose Weakness zostaje +1,83 (razem gorzej niż suma), z Perfectionist −1,33.

### Pin Shot

1. **Silnik.** Po zdjęciu bramek DEX z T2 i T3 zgadza się z tekstem. T1: WD i Slow 1 przy DEX ≤ DEX. T2: WD i Slow 2 bez bramki. T3: WD i Knockdown. 1 AP, 1 stress, opcjonalnie jeszcze 1 stress na Adv 1. Nagłówek zostaje WR, WD jest na progach.
2. **Użycie.** 1,15 rzutu na walkę, jeden cel. Nie ma tu AoE do zmarnowania.
3. **Werdykt.** Siła projektu. Delta −1,19 (było −1,83). Zdjęcie nadmiarowych bramek powinno talent wzmocnić; to, że delta jest mniej ujemna, idzie z mocniejszej reszty scouta (Vigilant przestał być workiem ran), nie z błędu mnożnika. Nadal wyraźnie mniej ran niż buildy bez Pin Shota (Easy −0,48, Medium −0,94, Hard −2,14).

## Propozycje, niezaaplikowane

Żadna z nich nie wchodzi w liczby, koszty, schody ani pasma.

- **Bargain.** Zostawić jako podatek rangi 1. Dalsze cięcie backlashu albo AP nie jest tym, co tekst obiecuje.
- **Shadowplay.** Jeśli ma być „bardzo silny” na tej planszy, dźwignia jest w tym, ilu wrogów stoi w AoE 3 od czołgu, albo w tym, że Adv przeciw feared ma tylko czarujący. Nie w koszcie 1 AP.
- **Living Bomb.** 2 AP za znak bez obrażeń w rzucie, i T1 Burn, który omija DEX 1. To jest powód zostającej delty +1,24.
- **Grapple.** Krótkie okno i STR ≤ STR przy elitach STR 2. Skupianie ognia jest już w sortowaniu. Wydłużenie okna byłoby zmianą tekstu.
- **Vigilant.** OA przy zejściu z zasięgu nie płaci, gdy bestiariusz nie schodzi. Talent i tak przestał dokładać rany, gdy scout przestał kitować.
- **Archer, Riposte, Pin Shot.** Zostawić. Moc jest na kartach, które się zgadzają z tekstem. Dwa przywołania naraz kanibalizują się nawzajem; to nie jest powód, żeby ścinać sam Archer.
