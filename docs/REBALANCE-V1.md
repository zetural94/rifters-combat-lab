# Rebalance v1 — próba przed kanonem

Werdykt: **w kartach zostaje wariant B. Śmierć Living Bomb to 8+3×INT.** Wariant A, czyli 8+2×INT, daje deltę +0,76 i nie wchodzi w okno około −0,50 do +0,50. Wariant B daje +0,44 i w to okno wchodzi. A było słabszym wzmocnieniem i miało pierwszeństwo, ale zostało poza oknem, więc do PR wchodzi B. Grapple i Riposte zostają dokładnie tak, jak w poprzedniej wersji tego PR. Kotwica R1 jest taka sama dla A i dla B. Hard n=3 zostaje poza pasmem, mediana 11 przy paśmie 4–10, tak jak przed próbą.

To jest wariant do decyzji Adriana. Schody Soft/BP v0.3g i pasma ran nie były ruszane. Bramka T1 Shadowplay i Living Bomb też nie.

Pasma: Easy 0–4, Medium 0–6, Hard 4–10. Pad v0.3g przy n=0..4: Easy 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9. Plus na delcie znaczy więcej ran party niż buildy tej samej klasy i tego samego n bez tego talentu. Talent z plusem jest słabszy od alternatyw. Talent z minusem jest od nich mocniejszy.

## Co zostaje w tym PR

- **Living Bomb.** Koszt wraca do 2 AP. Mana zostaje 2, upcast zostaje +1 many. Bramka Burn na T1 zostaje DEX ≤ INT − 1. Detonacja w kartach to 8+3×INT Fire w Range 3. Upcast dokłada +2×INT na wierzchu. Zasięg 3 zostaje. AI znowu wymaga 2 AP, tak jak karta.
- **Grapple.** Bez zmian wobec poprzedniego commita tego PR. Obrażenia: T1 WD+STR, T2 WD+2×STR, T3 WD+3×STR. Przy rękawicach 6/8/11 i STR 1 wychodzi 7/10/14, i tyle jest w `dmgFallback`. Bramka Restrain: T1 STR ≤ twoje STR, T2 STR ≤ twoje STR + 1, T3 STR ≤ twoje STR + 1. Zamek, Adv i Restrain trzymają do końca następnej tury chwytającego, nie do jej startu. T2 nadal daje Adv 1 w obie strony, T3 tylko w cel.
- **Riposte.** Bez zmian. Raz na rundę na bohatera. Drugi cios w tej samej rundzie nie schodzi ze stressu. AI i okno reakcji w labie czytają ten sam licznik. Licznik schodzi przy nowej rundzie, razem ze Stealth.

W PR zostaje T3 Grapple przy +1. Osobny przebieg z T3 przy +2 jest niżej i nie wchodzi do kart.

## Jak to było liczone

Ten sam runner co `docs/TALENT-OUTLIERS.md`, ten sam seed, ta sama próbka. „Przed” to świeży przebieg `main` na `9b6b06b`. Potem dwa przebiegi detonacji, przy koszcie 2 AP i przy Grapple oraz Riposte z tego PR.

```
node tools/run-talent-sweep.mjs --seed 1 --runs 4 --mixed 1000 --jobs 4 --out /tmp/talent-sweep
node tools/run-talent-sweep.mjs --analyze /tmp/talent-sweep --report /tmp/talent-sweep/summary.json
```

7 klas × podzbiory n=1..4 × 3 pasy = 3402 komórki exhaustive, plus 12 000 party mieszanych. 4 rifty na build. **15 402 joby, 61 608 riftów.** Czas ścienny bazy **548 s**, wariantu A **561 s**, wariantu B **559 s**. Ślad użycia w tym przebiegu jest wyłączony.

Delty bazy schodzą do liczb z `docs/TALENT-OUTLIERS.md`: Living Bomb +1,24, Grapple +1,48, Riposte −2,40, Shadowplay +1,17, Bargain +3,91, Pin Shot −1,19, Summon Archer −1,84.

Kotwica R1 to osobne 100 riftów na komórkę, seed 1, polityka `table`, drabinka R1, party Fighter / Brawler / Assassin / Scout. Mediana jest medianą ran wśród clearów, ten sam kwantyl co w `docs/SOFT-REGATE-A02.md`. Piętnaście median bazy jest zgodnych z tą kotwicą, łącznie z Hard n=3 na 11.

Ślad użycia, poza deltami: 8 seedów × 3 pasy, n=1, talent w fokusie, reszta party na plasterku drabinki A. 24 rifty, 72 walki. Baza tego śladu jest blisko tabeli w `docs/TALENT-OUTLIERS.md` (bomba 1,67 przy tam 1,75, Grapple 1,43 przy tam 1,50, Riposte 1,29 i tam, i tu).

## Living Bomb

Koszt 1 AP był za mocny. Delta zeszła z +1,24 do −0,73, bo AI rzucało bombę częściej (1,67 → 2,42 na walkę). Ten przebieg cofa koszt do 2 AP i podnosi tylko paczkę śmierci. Baza to 8+INT. A to 8+2×INT. B to 8+3×INT. Upcast w obu zostaje +2×INT na wierzchu. Na randze 1, przy INT 1, wychodzi: baza 9 (upcast 11), A 10 (upcast 12), B 11 (upcast 13).

| Wariant | ogółem | Easy | Medium | Hard |
| --- | --- | --- | --- | --- |
| przed, 8+INT, 2 AP | +1,24 | +1,01 | +0,96 | +1,74 |
| próba 1 AP, 8+INT | −0,73 | −0,09 | −1,29 | −0,82 |
| A, 8+2×INT, 2 AP | +0,76 | +1,01 | +0,46 | +0,82 |
| B, 8+3×INT, 2 AP | +0,44 | +0,86 | +0,42 | +0,05 |

A schodzi o −0,47 wobec bazy i zostaje po stronie słabej. Easy przy A prawie stoi: po zaokrągleniu do setnych jest +1,01 i przed, i po (surowo 1,0095 wobec 1,0077). Medium i Hard schodzą mniej więcej o połowę, ale ogółem +0,76 jest poza oknem −0,50 do +0,50.

B schodzi o −0,80 wobec bazy. Hard dochodzi do +0,05. Medium zostaje przy +0,42. Easy zostaje słabe, przy +0,86. Średnia z trzech pasów to +0,44, więc B mieści się w oknie. Żaden wariant nie przewraca znaku na minus, tak jak zrobił to koszt 1 AP.

Inny talent nie przesunął się o więcej niż 0,30, poza Grapple. Grapple schodzi z +1,48 do +1,13 w A i w B, czyli o −0,34. To jest ten sam ruch, który dała zmiana Grapple w poprzednim commicie, i liczby Grapple oraz Riposte są te same co przy próbie 1 AP. Przy samym wzmocnieniu śmierci pula Mystica nie przestawia Game Knowledge, Blinka ani Ice Wall o więcej niż 0,30. Przy koszcie 1 AP te trzy ruszyły się o +0,41, +0,40 i +0,38, bo bomba weszła do puli jako mocny talent.

AI znowu widzi akcję za 2 AP. W śladzie solo rzutów bomba nie wraca do tempa z próby 1 AP.

| Ślad bomby | rzuty / walkę | upcasty | detonacje / walkę |
| --- | --- | --- | --- |
| przed, 8+INT | 1,67 (120) | 120 ze 120 | 1,36 (98) |
| próba 1 AP | 2,42 (174) | 173 ze 174 | 1,81 (130) |
| A, 8+2×INT | 1,60 (115) | 115 ze 115 | 1,32 (95) |
| B, 8+3×INT | 1,58 (114) | 114 ze 114 | 1,29 (93) |

Większa paczka nie dokłada rzutów. Przy 2 AP picker zostaje blisko bazy, trochę poniżej 1,67. Detonacje też nie rosną. Rany schodzą, bo znak, który już wybuchł, zabiera więcej, a nie dlatego, że bomba jest częstsza.

## Grapple

Po pasach, tak samo w A i w B: Easy +1,06 → +0,10, Medium +1,76 → +1,74, Hard +1,62 → +1,56. Easy n=1 schodzi z +2,36 do −0,64. Medium i Hard zostają przy około +1,6 do +1,7. Talent dalej dokłada rany względem innych talentów Brawlera.

Ślad solo: 1,43 → 1,46 rzutu na walkę. Koszt zostaje 2 AP i 1 stress, więc picker nie ma nowego powodu, żeby chwytać częściej. Restrain na starcie tury wroga: 3,4% → 4,0%. Adv z T2/T3: 1,7% → 2,0%. Dłuższe okno wydłuża uptime o ułamek, nie o rundę ognia party. Te liczby śladu są te same przy A i przy B.

## Riposte

Po pasach delta zostaje mocno ujemna, tak samo w A i w B: Easy −1,90 → −1,91, Medium −2,25 → −2,11, Hard −3,06 → −2,89. Ogółem −2,40 → −2,30, ruch +0,10. W śladzie solo jest 1,29 → 1,22 reakcji na walkę. Assassin i tak rzadko miał drugi Riposte w tej samej rundzie, więc rany party prawie stoją.

## Exhaustive, udział w paśmie

Reszta party siedzi na drabince A. Komórka jest w paśmie, gdy średnia ran z jej czterech riftów mieści się w paśmie włącznie. A i B są blisko siebie. Ruch wobec bazy jest mały, bo bomba jest jednym talentem w dużej chmurze.

| Pas | n | w paśmie przed | A | B | średnia przed | A | B |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 1 | 82,1% | 83,9% | 83,9% | 2,74 | 2,69 | 2,68 |
| Easy | 2 | 90,8% | 90,3% | 90,3% | 2,32 | 2,46 | 2,46 |
| Easy | 3 | 66,1% | 66,3% | 67,4% | 3,70 | 3,71 | 3,70 |
| Easy | 4 | 65,7% | 65,7% | 65,7% | 3,65 | 3,68 | 3,66 |
| Medium | 1 | 75,0% | 75,0% | 75,0% | 4,69 | 4,70 | 4,71 |
| Medium | 2 | 84,7% | 84,7% | 84,7% | 3,61 | 3,66 | 3,66 |
| Medium | 3 | 58,9% | 59,7% | 60,0% | 5,98 | 5,97 | 5,96 |
| Medium | 4 | 59,6% | 57,8% | 58,2% | 5,91 | 5,98 | 5,96 |
| Hard | 1 | 66,1% | 66,1% | 67,9% | 9,21 | 9,17 | 9,12 |
| Hard | 2 | 65,8% | 63,3% | 62,8% | 6,84 | 7,17 | 7,19 |
| Hard | 3 | 34,9% | 34,9% | 35,7% | 11,01 | 10,97 | 10,95 |
| Hard | 4 | 47,1% | 48,6% | 49,0% | 10,20 | 10,25 | 10,22 |

Chmura n=3 i n=4 dalej leży nad sufitem. Hard n=2 ma wyższą średnią i niższy udział w paśmie, tak jak przy limicie Riposte: Riposte jest na drabince Assassina od n=2. Sam Mystic rusza się mało. Przy B udział w paśmie na Medium n=3 idzie z 10,7% do 16,1%, na Hard n=3 z 19,6% do 25,0%, na Hard n=4 z 31,4% do 37,1%. To nadal mniejszość buildów. Przy koszcie 1 AP te same komórki dochodziły do 21,4%, 33,9% i 48,6%.

## Party mieszane, średnia ran

Średnia nieważona po n=1..4: Easy 5,40 → A 5,34 → B 5,31, Medium 6,53 → A 6,45 → B 6,40, Hard 10,20 → A 10,10 → B 10,03. Sufit Easy to 4, Medium to 6, Hard to 10. Środek Easy i Medium dalej jest nad sufitem. Środek Hard przy B schodzi tuż nad 10. Hard n=3 zostaje nad pasmem.

| Pas | n | średnia przed | A | B |
| --- | --- | --- | --- | --- |
| Easy | 1 | 5,50 | 5,48 | 5,46 |
| Easy | 2 | 5,23 | 5,17 | 5,14 |
| Easy | 3 | 5,59 | 5,52 | 5,49 |
| Easy | 4 | 5,28 | 5,19 | 5,15 |
| Medium | 1 | 6,05 | 6,01 | 5,98 |
| Medium | 2 | 5,99 | 5,93 | 5,90 |
| Medium | 3 | 7,25 | 7,15 | 7,12 |
| Medium | 4 | 6,82 | 6,69 | 6,61 |
| Hard | 1 | 9,83 | 9,76 | 9,74 |
| Hard | 2 | 9,51 | 9,40 | 9,33 |
| Hard | 3 | 10,99 | 10,95 | 10,86 |
| Hard | 4 | 10,47 | 10,30 | 10,20 |

## Kotwica R1

Komórka jest w paśmie, gdy mediana ran clearów mieści się w paśmie. Grapple i Living Bomb nie siedzą na tej drabince. Od n=2 siedzi Riposte, więc ruch może iść tylko stamtąd. Przebieg A i przebieg B dają te same piętnaście komórek, bit w bit z kotwicą po limicie Riposte. n=0 i n=1 są bit-identyczne z bazą.

| Pas | n | mediana przed | mediana po | średnia przed | średnia po | pasmo | werdykt |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 0 | 2 | 2 | 2,89 | 2,89 | 0–4 | w paśmie |
| Easy | 1 | 2 | 2 | 2,58 | 2,58 | 0–4 | w paśmie |
| Easy | 2 | 1 | 1 | 1,58 | 1,64 | 0–4 | w paśmie |
| Easy | 3 | 3 | 3 | 3,25 | 3,19 | 0–4 | w paśmie |
| Easy | 4 | 3 | 3 | 3,73 | 3,82 | 0–4 | w paśmie |
| Medium | 0 | 2 | 2 | 2,57 | 2,57 | 0–6 | w paśmie |
| Medium | 1 | 2 | 2 | 3,77 | 3,77 | 0–6 | w paśmie |
| Medium | 2 | 1 | 1 | 1,42 | 1,73 | 0–6 | w paśmie |
| Medium | 3 | 3 | 3 | 3,91 | 4,03 | 0–6 | w paśmie |
| Medium | 4 | 4 | 3 | 4,50 | 4,32 | 0–6 | w paśmie |
| Hard | 0 | 4 | 4 | 4,77 | 4,77 | 4–10 | w paśmie |
| Hard | 1 | 9 | 9 | 9,15 | 9,15 | 4–10 | w paśmie |
| Hard | 2 | 5 | 4 | 5,63 | 5,72 | 4–10 | w paśmie |
| Hard | 3 | 11 | 11 | 10,58 | 10,57 | 4–10 | poza pasmem, tak jak przed |
| Hard | 4 | 10 | 10 | 9,63 | 9,88 | 4–10 | w paśmie |

Żadna komórka, która była w paśmie, z niego nie wypada. Medium n=4 schodzi z mediany 4 na 3 i zostaje w 0–6. Hard n=2 schodzi z mediany 5 na 4 i staje na podłodze 4–10. Średnia tej komórki idzie w górę, z 5,63 na 5,72, więc środek rozkładu nie jest lżejszy, tylko mediana. Hard n=3 zostaje poza pasmem.

## Grapple T3 przy +2, tylko porównanie

Ten przebieg był liczony wcześniej, przy bombie za 1 AP, i podnosił bramkę T3 do STR ≤ twoje STR + 2. W kartach PR zostaje +1. Nie był powtarzany przy detonacji B, bo bestiariusz się nie zmienił.

Wynik był identyczny z wariantem +1 na każdej delcie i na każdej komórce exhaustive oraz mieszanej. Delta Grapple została +1,13 (Easy +0,10, Medium +1,74, Hard +1,56).

Powód jest w bestiariuszu, nie w szumie. Brawler ma STR 1. Najwyższe STR wroga to 2, u niedźwiedzia i żółwia. T3 przy +1 już łapie STR ≤ 2. T3 przy +2 łapie STR ≤ 3, a takiego ciała na planszy nie ma. Wilk ma STR 1, alfa STR 1, jeż STR 0. Dodatkowy punkt progu nie ma kogo wpuścić.
