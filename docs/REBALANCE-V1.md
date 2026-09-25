# Rebalance v1 — próba przed kanonem

Werdykt: **Living Bomb przy 1 AP przestaje być słabym talentem i staje się mocniejszy niż reszta puli Mystica.** Grapple nadal dokłada rany, tylko trochę mniej, i prawie całe zejście siedzi na Easy. Riposte po limicie jednej reakcji na rundę zostaje mocny: delta rusza się o +0,10. Kotwica R1 nie wypada z żadnej komórki, która była w paśmie. Hard n=3 zostaje poza pasmem, mediana 11 przy paśmie 4–10, tak jak przed próbą.

To jest wariant do decyzji Adriana. Schody Soft/BP v0.3g i pasma ran nie były ruszane. Bramka T1 Shadowplay i Living Bomb też nie.

Pasma: Easy 0–4, Medium 0–6, Hard 4–10. Pad v0.3g przy n=0..4: Easy 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9. Plus na delcie znaczy więcej ran party niż buildy tej samej klasy i tego samego n bez tego talentu. Talent z plusem jest słabszy od alternatyw. Talent z minusem jest od nich mocniejszy.

## Co wchodzi w ten wariant

- **Living Bomb.** Koszt to 1 AP. Mana zostaje 2, upcast zostaje +1 many. Bramka Burn na T1 zostaje DEX ≤ INT − 1.
- **Grapple.** Obrażenia: T1 WD+STR, T2 WD+2×STR, T3 WD+3×STR. Przy rękawicach 6/8/11 i STR 1 wychodzi 7/10/14, i tyle jest w `dmgFallback`. Bramka Restrain: T1 STR ≤ twoje STR, T2 STR ≤ twoje STR + 1, T3 STR ≤ twoje STR + 1. Zamek, Adv i Restrain trzymają do końca następnej tury chwytającego, nie do jej startu. T2 nadal daje Adv 1 w obie strony, T3 tylko w cel.
- **Riposte.** Raz na rundę na bohatera. Drugi cios w tej samej rundzie nie schodzi ze stressu. AI i okno reakcji w labie czytają ten sam licznik. Licznik schodzi przy nowej rundzie, razem ze Stealth.

W PR zostaje T3 Grapple przy +1. Osobny przebieg z T3 przy +2 jest niżej i nie wchodzi do kart.

## Jak to było liczone

Ten sam runner co `docs/TALENT-OUTLIERS.md`, ten sam seed, ta sama próbka. „Przed” to świeży przebieg `main` na `9b6b06b`. „Po” to ten wariant.

```
node tools/run-talent-sweep.mjs --seed 1 --runs 4 --mixed 1000 --jobs 4 --out /tmp/talent-sweep
node tools/run-talent-sweep.mjs --analyze /tmp/talent-sweep --report /tmp/talent-sweep/summary.json
```

7 klas × podzbiory n=1..4 × 3 pasy = 3402 komórki exhaustive, plus 12 000 party mieszanych. 4 rifty na build. **15 402 joby, 61 608 riftów.** Czas ścienny bazy **548 s**, wariantu **559 s**. Ślad użycia w tym przebiegu jest wyłączony.

Delty bazy schodzą do liczb z `docs/TALENT-OUTLIERS.md`: Living Bomb +1,24, Grapple +1,48, Riposte −2,40, Shadowplay +1,17, Bargain +3,91, Pin Shot −1,19, Summon Archer −1,84.

Kotwica R1 to osobne 100 riftów na komórkę, seed 1, polityka `table`, drabinka R1, party Fighter / Brawler / Assassin / Scout. Mediana jest medianą ran wśród clearów, ten sam kwantyl co w `docs/SOFT-REGATE-A02.md`. Piętnaście median bazy jest zgodnych z tą kotwicą, łącznie z Hard n=3 na 11.

Ślad użycia, poza deltami: 8 seedów × 3 pasy, n=1, talent w fokusie, reszta party na plasterku drabinki A. 24 rifty, 72 walki. Baza tego śladu jest blisko tabeli w `docs/TALENT-OUTLIERS.md` (bomba 1,67 przy tam 1,75, Grapple 1,43 przy tam 1,50, Riposte 1,29 i tam, i tu).

## Delty talentów

| Talent | przed | po | zmiana |
| --- | --- | --- | --- |
| `mystic-living-bomb` | +1,24 | −0,73 | −1,97 |
| `brawler-grapple` | +1,48 | +1,13 | −0,35 |
| `assassin-riposte` | −2,40 | −2,30 | +0,10 |
| `mystic-game-knowledge` | +0,35 | +0,76 | +0,41 |
| `mystic-blink` | −1,21 | −0,81 | +0,40 |
| `mystic-ice-wall` | −0,18 | +0,20 | +0,38 |

Inny talent nie przesunął się o więcej niż 0,30. Game Knowledge, Blink i Ice Wall nie mają nowej karty. Ich delta ruszyła się, bo Living Bomb wszedł do puli porównawczej Mystica jako mocny talent. Build bez bomby wypada teraz gorzej na tle buildu z bombą.

### Living Bomb

Po pasach: Easy +1,01 → −0,09, Medium +0,96 → −1,29, Hard +1,74 → −0,82. Na każdym pasie znak się odwraca albo schodzi do zera. Na Medium bomba jest wyraźnie mocniejsza niż inne talenty Mystica tej samej wielkości.

AI traktuje ją jako akcję za 1 AP, zgodnie z kartą. W śladzie solo rzutów jest 1,67 → 2,42 na walkę. Upcast pada prawie za każdym razem, gdy mana starcza na 3 (120 ze 120 rzutów przed, 173 ze 174 po). Detonacje: 1,36 → 1,81 na walkę. Tańsza bomba jest używana częściej, i to widać w ranach.

### Grapple

Po pasach: Easy +1,06 → +0,10, Medium +1,76 → +1,74, Hard +1,62 → +1,56. Easy n=1 schodzi z +2,36 do −0,64. Medium i Hard zostają przy około +1,6 do +1,7. Talent dalej dokłada rany względem innych talentów Brawlera.

Ślad solo: 1,43 → 1,46 rzutu na walkę. Koszt zostaje 2 AP i 1 stress, więc picker nie ma nowego powodu, żeby chwytać częściej. Restrain na starcie tury wroga: 3,4% → 4,0%. Adv z T2/T3: 1,7% → 2,0%. Dłuższe okno wydłuża uptime o ułamek, nie o rundę ognia party.

### Riposte

Po pasach delta zostaje mocno ujemna: Easy −1,90 → −1,91, Medium −2,25 → −2,11, Hard −3,06 → −2,89. Limit jednej reakcji na rundę zdejmuje kilka użyć. W śladzie solo jest 1,29 → 1,22 reakcji na walkę. Assassin i tak rzadko miał drugi Riposte w tej samej rundzie, więc rany party prawie stoją.

## Exhaustive, udział w paśmie

Reszta party siedzi na drabince A. Komórka jest w paśmie, gdy średnia ran z jej czterech riftów mieści się w paśmie włącznie.

| Pas | n | w paśmie przed | w paśmie po | średnia przed | średnia po |
| --- | --- | --- | --- | --- | --- |
| Easy | 1 | 82,1% | 85,7% | 2,74 | 2,64 |
| Easy | 2 | 90,8% | 90,3% | 2,32 | 2,43 |
| Easy | 3 | 66,1% | 66,8% | 3,70 | 3,69 |
| Easy | 4 | 65,7% | 67,1% | 3,65 | 3,63 |
| Medium | 1 | 75,0% | 76,8% | 4,69 | 4,63 |
| Medium | 2 | 84,7% | 83,7% | 3,61 | 3,66 |
| Medium | 3 | 58,9% | 60,7% | 5,98 | 5,92 |
| Medium | 4 | 59,6% | 59,8% | 5,91 | 5,81 |
| Hard | 1 | 66,1% | 66,1% | 9,21 | 9,16 |
| Hard | 2 | 65,8% | 63,8% | 6,84 | 7,11 |
| Hard | 3 | 34,9% | 37,0% | 11,01 | 10,87 |
| Hard | 4 | 47,1% | 50,6% | 10,20 | 10,09 |

Chmura n=3 i n=4 dalej leży nad sufitem. Mystic, który dostaje tańszą bombę, poprawia się najbardziej: Medium n=3 z 10,7% do 21,4% w paśmie, Hard n=3 z 19,6% do 33,9%, Hard n=4 z 31,4% do 48,6%. To nadal mniejszość buildów. Hard n=2 exhaustive ma wyższą średnią (6,84 → 7,11) i niższy udział w paśmie. Riposte jest na drabince Assassina od n=2, więc komórki z tym Assassinem w party widzą limit reakcji.

## Party mieszane, średnia ran

Średnia nieważona po n=1..4: Easy 5,40 → 5,17, Medium 6,53 → 6,26, Hard 10,20 → 9,83. Sufit Easy to 4, Medium to 6, Hard to 10. Środek Easy i Medium dalej jest nad sufitem. Środek Hard schodzi pod 10, a Hard n=3 zostaje nad nim.

| Pas | n | średnia przed | średnia po |
| --- | --- | --- | --- |
| Easy | 1 | 5,50 | 5,44 |
| Easy | 2 | 5,23 | 5,04 |
| Easy | 3 | 5,59 | 5,29 |
| Easy | 4 | 5,28 | 4,90 |
| Medium | 1 | 6,05 | 5,96 |
| Medium | 2 | 5,99 | 5,75 |
| Medium | 3 | 7,25 | 6,92 |
| Medium | 4 | 6,82 | 6,43 |
| Hard | 1 | 9,83 | 9,66 |
| Hard | 2 | 9,51 | 9,18 |
| Hard | 3 | 10,99 | 10,62 |
| Hard | 4 | 10,47 | 9,87 |

## Kotwica R1

Komórka jest w paśmie, gdy mediana ran clearów mieści się w paśmie. Grapple i Living Bomb nie siedzą na tej drabince. Od n=2 siedzi Riposte, więc ruch może iść tylko stamtąd. n=0 i n=1 są bit-identyczne z bazą.

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

Ten przebieg ma resztę wariantu (bomba 1 AP, obrażenia i czas Grapple, T2 przy +1, Riposte raz na rundę) i podnosi bramkę T3 do STR ≤ twoje STR + 2. W kartach PR zostaje +1.

Wynik jest identyczny z wariantem +1 na każdej delcie i na każdej komórce exhaustive oraz mieszanej. Delta Grapple zostaje +1,13 (Easy +0,10, Medium +1,74, Hard +1,56). Living Bomb zostaje −0,73.

Powód jest w bestiariuszu, nie w szumie. Brawler ma STR 1. Najwyższe STR wroga to 2, u niedźwiedzia i żółwia. T3 przy +1 już łapie STR ≤ 2. T3 przy +2 łapie STR ≤ 3, a takiego ciała na planszy nie ma. Wilk ma STR 1, alfa STR 1, jeż STR 0. Dodatkowy punkt progu nie ma kogo wpuścić.
