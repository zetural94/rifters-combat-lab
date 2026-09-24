# Re-gate Soft/BP v0.3g po poprawce A-02

Werdykt: **v0.3g się trzyma.** Poprawka zasięgu A-02 (PR #8, `main` `11054a4`) nie wymaga retune schodów BP ani pasm Soft. Liczby canonu są nietknięte.

Kotwica R1 (Fighter / Brawler / Assassin / Scout, drabinka R1, polityka `table`) jest bit-identyczna z commitem sprzed poprawki (`779b823`) na wszystkich 15 komórkach Easy/Medium/Hard × n=0..4. Jedna komórka tej kotwicy była już poza pasmem przed poprawką i została tam samo: Hard n=3, mediana 11 przy paśmie 4–10.

## Czy ścieżka Monte Carlo też się zmieniła

Tak. Zmiana nie jest ograniczona do kliknięć w UI.

`mc/r1.js` sam nie liczy zasięgu. W PR #8 zmienił się tam tylko cache-bust importu (`v=20260924remed`) i opis Stealth. Symulacja idzie przez `playRift` → `playFight` → `runHeroTurns` / `runSummonAfter`, a te biorą cele z `legalActions`.

Wspólny filtr celu jest w `engine/actions.js`. Przed poprawką zasięg kliknięcia brał `aoe.range`, gdy był ustawiony. Po poprawce bierze `ability.range`. `aoe.range` i `tier.aoeRange` zostają promieniem wybuchu w `resolveStrike`.

```705:707:engine/actions.js
      // Click / primary-target range is ability.range.
      // aoe.range and tier aoeRange are blast radius only (resolveStrike).
      const range = ab.range != null ? ab.range | 0 : 1;
```

Hero AI czyta tę listę przez `listLegal` (`engine/encounter.js`, ok. 1883). Entangle wchodzi, gdy jest choć jeden legalny cel (`engine/ai.js`, ok. 2471–2479). Toxic Cloud wchodzi, gdy są co najmniej dwa (`engine/ai.js`, ok. 2462–2464). Przywoływacz po turze przywoływacza woła `legalActions` wprost i strzela Fireballem, gdy specjal ma cele i najbliższy wróg jest w odległości ≤ 5 (`engine/encounter.js`, `runSummonAfter`, ok. 280 i 359).

W tym samym commicie `engine/ai.js` przestał brać `aoe.range` w dwóch miejscach klasyfikacji:

- `isRangedRifter` (ok. 28) liczy teraz `ability.range`. Entangle ma zasięg 5, więc Primalist z Entangle na kicie włóczni (Tide jest odfiltrowany przez `weaponId`) staje się dystansowym rifterem i kite'uje zamiast wejść w zwarcie.
- `heroSpellStrikeRange` (ok. 1101–1109) też czyta `ability.range`. Funkcja startuje od 5, a żaden z trzech spornych zasięgów nie jest większy niż 5, więc pasmo Blinka zostaje 5.

`howlAoeRange` (ok. 87–92) nadal czyta `aoe.range`. To promień wybuchu Howla, nie zasięg kliknięcia.

Karty, na których `ability.range` różni się od `aoe.range`, są dokładnie trzy. Reszta AoE ma te liczby równe, więc sam numer zasięgu kliknięcia się u nich nie zmienia.

| Karta | `ability.range` (klik / cel) | `aoe.range` (wybuch) |
| --- | --- | --- |
| `primalist-entangle` | 5 | 2 |
| `acolyte-toxic-cloud` | 4 | 3 |
| `summon-mage-fireball` | 4 | 2, a `aoeRange` tieru 1/1/2 |

Przed poprawką Entangle było legalne tylko na dystansie 2, Toxic Cloud na 3, Fireball na 2. Po poprawce odpowiednio 5, 4 i 4.

## Jak to było liczone

W repozytorium nie ma starszego skryptu „stairs gate”. Zamek siedzi w `runRiftMonteCarlo`, `RIFT_KPI_BY_LANE` i `TALENT_BP_V03` w `mc/r1.js`. Domyślne `n` tej funkcji to **100**. Tyle riftów na komórkę, te same seedy (`seed0 = 1`, rift `i` ma seed `1+i`), polityka `table` (w AI alias na `smart`, z twardym limitem 15 rund). Runner: `scripts/soft-regate-a02.mjs`.

Komórka jest **w paśmie**, gdy mediana ran party wśród clearów (`winner === "hero"`) mieści się w paśmie pasa. Kwantyl jest ten sam co `q()` w `mc/r1.js`: element o indeksie `floor((n-1) * 0.5)`. Procent w tabeli to udział clearów w paśmie, nie mediana. Porażka nadal jest wtedy, gdy każdy bohater ma rany ≥ 5. Help zostaje przerzutem niższego d10. Tych reguł ten przebieg nie zmienia.

Pasma: Easy 0–4, Medium 0–6, Hard 4–10. Schody padu n=0..4: Easy 0/2/3/4/5, Medium 0/4/5/6/7, Hard 0/6/7/8/9.

Pięć party, każde 15 komórek:

- **R1** — kotwica, drabinka R1.
- **Casters** — Mystic / Acolyte / Primalist / Scout, drabinka mix. Toxic Cloud od n≥3.
- **Frontline** — Fighter / Brawler / Primalist / Acolyte, drabinka mix. Entangle od n≥2.
- **Glass** — Assassin / Scout / Mystic / Acolyte, drabinka mix. Toxic Cloud od n≥3.
- **Summoner** — ta sama czwórka co Casters, ale drabinka R1. Summon Mage jest na niej od n≥3.

Pokrycie talentów: wszystkie **56** talentów z `allCoverageTalents()` (siedem klas T1 × 8, bez Warrior). Medium, paczka `featPackageForTalent` przy n=4, **40** riftów, seed 1. Przed i po identyczne są 54 z 56.

Kolumny „przed → po” to `779b823` → `11054a4`.

## Kotwica R1

Delta wynosi 0 na każdej komórce.

| Pas | n | p50 ran (clear) | średnia ran | % clearów w paśmie | wygrane | timeout | w paśmie | pasmo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 0 | 2 → 2 | 2.89 → 2.89 | 76% → 76% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 1 | 2 → 2 | 2.58 → 2.58 | 85% → 85% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 2 | 1 → 1 | 1.58 → 1.58 | 90% → 90% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 3 | 3 → 3 | 3.25 → 3.25 | 74% → 74% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 4 | 3 → 3 | 3.73 → 3.73 | 59% → 59% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Medium | 0 | 2 → 2 | 2.57 → 2.57 | 94% → 94% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 1 | 2 → 2 | 3.77 → 3.77 | 76% → 76% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 2 | 1 → 1 | 1.42 → 1.42 | 96% → 96% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 3 | 3 → 3 | 3.91 → 3.91 | 79% → 79% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 4 | 4 → 4 | 4.50 → 4.50 | 75% → 75% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Hard | 0 | 4 → 4 | 4.77 → 4.77 | 39% → 39% | 100% → 100% | 0% → 0% | tak → tak | 4–10 |
| Hard | 1 | 9 → 9 | 9.29 → 9.29 | 42% → 42% | 98% → 98% | 2% → 2% | tak → tak | 4–10 |
| Hard | 2 | 5 → 5 | 5.77 → 5.77 | 47% → 47% | 99% → 99% | 0% → 0% | tak → tak | 4–10 |
| Hard | 3 | 11 → 11 | 10.80 → 10.80 | 38% → 38% | 97% → 97% | 2% → 2% | nie → nie | 4–10 |
| Hard | 4 | 10 → 10 | 9.80 → 9.80 | 42% → 42% | 98% → 98% | 1% → 1% | tak → tak | 4–10 |

Hard n=3 jest poza pasmem (mediana 11, średnia 10.80, 38% clearów w 4–10) i był taki sam na `779b823`. To nie jest efekt A-02. Schodów pod tę komórkę nie ruszam.

## Party mieszane

Przy n=0 Casters i Summoner to ta sama czwórka bez talentów, stąd te same liczby. Od n=1 paczki się rozjeżdżają.

### Casters (Toxic Cloud od n≥3)

| Pas | n | p50 ran (clear) | średnia ran | % clearów w paśmie | wygrane | timeout | w paśmie | pasmo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 0 | 4 → 4 | 4.92 → 4.92 | 52% → 52% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 1 | 6 → 6 | 7.12 → 7.12 | 32% → 32% | 100% → 100% | 0% → 0% | nie → nie | 0–4 |
| Easy | 2 | 5 → 5 | 4.83 → 4.83 | 39% → 39% | 100% → 100% | 0% → 0% | nie → nie | 0–4 |
| Easy | 3 | 5 → 4 | 5.48 → 4.05 | 27% → 54% | 100% → 100% | 0% → 0% | nie → tak | 0–4 |
| Easy | 4 | 2 → 2 | 2.79 → 2.67 | 83% → 82% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Medium | 0 | 3 → 3 | 3.16 → 3.16 | 96% → 96% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 1 | 4 → 4 | 4.63 → 4.63 | 78% → 78% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 2 | 4 → 4 | 4.00 → 4.00 | 89% → 89% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 3 | 5 → 5 | 5.33 → 5.32 | 77% → 77% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 4 | 3 → 3 | 3.55 → 3.55 | 86% → 86% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Hard | 0 | 4 → 4 | 4.68 → 4.68 | 54% → 54% | 100% → 100% | 0% → 0% | tak → tak | 4–10 |
| Hard | 1 | 8 → 8 | 8.78 → 8.78 | 56% → 56% | 100% → 100% | 0% → 0% | tak → tak | 4–10 |
| Hard | 2 | 7 → 7 | 8.19 → 8.19 | 54% → 54% | 99% → 99% | 1% → 1% | tak → tak | 4–10 |
| Hard | 3 | 7 → 7 | 8.53 → 8.53 | 55% → 55% | 95% → 95% | 3% → 3% | tak → tak | 4–10 |
| Hard | 4 | 2 → 2 | 3.02 → 3.03 | 30% → 30% | 100% → 100% | 0% → 0% | nie → nie | 4–10 |

Easy n=1 i n=2 oraz Hard n=4 były poza pasmem już przed poprawką. Jedyna zmiana werdyktu komórki: Easy n=3 weszło w pasmo (mediana 5 → 4). Medium z Toxic Cloud (n=3 i n=4) zostało w paśmie, delta średniej to 0.01 i 0.

### Frontline (Entangle od n≥2)

| Pas | n | p50 ran (clear) | średnia ran | % clearów w paśmie | wygrane | timeout | w paśmie | pasmo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 0 | 1 → 1 | 1.76 → 1.76 | 91% → 91% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 1 | 5 → 5 | 4.96 → 4.96 | 41% → 41% | 100% → 100% | 0% → 0% | nie → nie | 0–4 |
| Easy | 2 | 5 → 5 | 4.59 → 4.87 | 44% → 42% | 100% → 100% | 0% → 0% | nie → nie | 0–4 |
| Easy | 3 | 3 → 3 | 3.60 → 3.65 | 63% → 67% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 4 | 5 → 6 | 5.98 → 6.09 | 38% → 42% | 100% → 100% | 0% → 0% | nie → nie | 0–4 |
| Medium | 0 | 1 → 1 | 1.36 → 1.36 | 99% → 99% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 1 | 3 → 3 | 4.74 → 4.74 | 79% → 79% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 2 | 3 → 4 | 4.78 → 5.10 | 77% → 73% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 3 | 3 → 4 | 4.03 → 4.15 | 82% → 83% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 4 | 7 → 7 | 8.35 → 8.28 | 41% → 40% | 100% → 100% | 0% → 0% | nie → nie | 0–6 |
| Hard | 0 | 1 → 1 | 2.23 → 2.23 | 22% → 22% | 100% → 100% | 0% → 0% | nie → nie | 4–10 |
| Hard | 1 | 9 → 9 | 8.70 → 8.70 | 35% → 35% | 99% → 99% | 1% → 1% | tak → tak | 4–10 |
| Hard | 2 | 7 → 7 | 8.22 → 7.73 | 47% → 40% | 98% → 98% | 0% → 1% | tak → tak | 4–10 |
| Hard | 3 | 7 → 9 | 8.82 → 9.72 | 33% → 42% | 98% → 97% | 1% → 1% | tak → tak | 4–10 |
| Hard | 4 | 14 → 13 | 12.73 → 12.42 | 23% → 30% | 93% → 94% | 3% → 1% | nie → nie | 4–10 |

Żadna komórka Frontline nie zmieniła werdyktu w paśmie. Od n=2 (Entangle na drabince) mediany Medium idą w górę o 1 i zostają w 0–6. Hard n=3 idzie 7 → 9 i zostaje w 4–10.

### Glass (Toxic Cloud od n≥3)

| Pas | n | p50 ran (clear) | średnia ran | % clearów w paśmie | wygrane | timeout | w paśmie | pasmo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 0 | 5 → 5 | 6.35 → 6.35 | 41% → 41% | 96% → 96% | 1% → 1% | nie → nie | 0–4 |
| Easy | 1 | 5 → 5 | 6.13 → 6.13 | 49% → 49% | 99% → 99% | 1% → 1% | nie → nie | 0–4 |
| Easy | 2 | 2 → 2 | 2.18 → 2.18 | 88% → 88% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 3 | 3 → 3 | 3.50 → 3.82 | 70% → 65% | 99% → 99% | 0% → 0% | tak → tak | 0–4 |
| Easy | 4 | 4 → 4 | 4.75 → 4.93 | 57% → 54% | 98% → 98% | 0% → 0% | tak → tak | 0–4 |
| Medium | 0 | 6 → 6 | 7.14 → 7.14 | 52% → 52% | 99% → 99% | 0% → 0% | tak → tak | 0–6 |
| Medium | 1 | 7 → 7 | 8.20 → 8.20 | 49% → 49% | 96% → 96% | 2% → 2% | nie → nie | 0–6 |
| Medium | 2 | 5 → 5 | 5.84 → 5.84 | 64% → 64% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 3 | 7 → 7 | 7.88 → 7.22 | 41% → 47% | 100% → 100% | 0% → 0% | nie → nie | 0–6 |
| Medium | 4 | 8 → 7 | 8.67 → 7.69 | 35% → 49% | 96% → 98% | 1% → 0% | nie → nie | 0–6 |
| Hard | 0 | 8 → 8 | 9.27 → 9.27 | 52% → 52% | 91% → 91% | 5% → 5% | tak → tak | 4–10 |
| Hard | 1 | 15 → 15 | 15.42 → 15.42 | 18% → 18% | 66% → 66% | 18% → 18% | nie → nie | 4–10 |
| Hard | 2 | 7 → 7 | 8.59 → 8.59 | 47% → 47% | 97% → 97% | 2% → 2% | tak → tak | 4–10 |
| Hard | 3 | 10 → 8 | 10.65 → 9.14 | 42% → 51% | 93% → 96% | 0% → 0% | tak → tak | 4–10 |
| Hard | 4 | 11 → 8 | 11.71 → 8.68 | 42% → 52% | 90% → 95% | 1% → 1% | nie → tak | 4–10 |

Jedyna zmiana werdyktu: Hard n=4 weszło w pasmo (mediana 11 → 8). Medium n=3 i n=4 z Toxic Cloud zostały poza pasmem, mediana n=4 spadła 8 → 7.

### Summoner (drabinka R1, Acolyte z Summon Mage od n≥3)

| Pas | n | p50 ran (clear) | średnia ran | % clearów w paśmie | wygrane | timeout | w paśmie | pasmo |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Easy | 0 | 4 → 4 | 4.92 → 4.92 | 52% → 52% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 1 | 4 → 4 | 4.07 → 4.07 | 57% → 57% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 2 | 1 → 1 | 1.69 → 1.69 | 94% → 94% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 3 | 2 → 2 | 2.47 → 2.47 | 87% → 87% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Easy | 4 | 0 → 0 | 0.64 → 0.64 | 100% → 100% | 100% → 100% | 0% → 0% | tak → tak | 0–4 |
| Medium | 0 | 3 → 3 | 3.16 → 3.16 | 96% → 96% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 1 | 3 → 3 | 2.94 → 2.94 | 92% → 92% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 2 | 0 → 0 | 0.75 → 0.75 | 100% → 100% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 3 | 1 → 1 | 1.63 → 1.63 | 100% → 100% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Medium | 4 | 1 → 1 | 1.03 → 1.03 | 99% → 99% | 100% → 100% | 0% → 0% | tak → tak | 0–6 |
| Hard | 0 | 4 → 4 | 4.68 → 4.68 | 54% → 54% | 100% → 100% | 0% → 0% | tak → tak | 4–10 |
| Hard | 1 | 5 → 5 | 6.05 → 6.05 | 59% → 59% | 98% → 98% | 1% → 1% | tak → tak | 4–10 |
| Hard | 2 | 1 → 1 | 1.20 → 1.20 | 10% → 10% | 100% → 100% | 0% → 0% | nie → nie | 4–10 |
| Hard | 3 | 1 → 1 | 2.41 → 2.41 | 22% → 22% | 100% → 100% | 0% → 0% | nie → nie | 4–10 |
| Hard | 4 | 1 → 1 | 1.23 → 1.23 | 8% → 8% | 100% → 100% | 0% → 0% | nie → nie | 4–10 |

Cała siatka Summoner jest bit-identyczna. Hard n=2..4 jest za łatwy (mediana 1, poniżej podłogi 4) i był taki przed poprawką. Powód braku delty Fireballa jest niżej: na drabince R1 AI nie wystawia Maga.

## Talenty: Entangle, Toxic Cloud, Fireball

Pokrycie 56 talentów, Medium, n=4, 40 riftów. Poza dwoma talentami poniżej wyniki się nie ruszyły.

| Talent | p50 clear | średnia | wygrane | w paśmie Medium 0–6 |
| --- | --- | --- | --- | --- |
| `primalist-entangle` | 3 → 6 | 4.30 → 6.05 | 100% → 100% | tak → tak (na suficie pasma) |
| `acolyte-toxic-cloud` | 5 → 9 | 6.80 → 9.05 | 100% → 97.5% | tak → nie |
| `acolyte-summon-mage` | 3 → 3 | 5.28 → 5.28 | 100% → 100% | tak → tak |

Paczka pokrycia Acolyte to Fighter / Brawler / Assassin / Acolyte z talentem wciśniętym w drabinkę n=4. To inna czwórka niż Casters. Dlatego Toxic Cloud na pokryciu wychodzi z pasma, a Medium Casters n=3 zostaje (5.33 → 5.32).

Osobna sonda użycia, 60 riftów, seed 1. Liczba rzutów jest z świeżych sal (trzy sale × 60 seedów, bez przeniesienia ran między salami). Mediana i średnia są z pełnego `playRift`.

| Sonda | Pas | linie logu z umiejętnością | p50 | średnia | w paśmie |
| --- | --- | --- | --- | --- | --- |
| Entangle, Frontline mix n=2 | Medium | 170 → 259 | 3 → 3 | 4.72 → 5.02 | tak → tak |
| Toxic Cloud, Casters mix n=3 | Medium | 44 → 44 | 5 → 5 | 5.08 → 5.07 | tak → tak |
| Fireball, drabinka R1 n=3 | Medium | 0 → 0 | 1 → 1 | 1.52 → 1.52 | tak → tak |
| Fireball, tylko Summon Mage, n=1 | Easy | 171 → 237 | 4 → 4 | 3.75 → 4.00 | tak → tak |
| Fireball, tylko Summon Mage, n=1 | Medium | 106 → 240 | 3 → 3 | 4.63 → 5.00 | tak → tak |
| Fireball, tylko Summon Mage, n=1 | Hard | 110 → 253 | 8 → 9 | 8.30 → 9.08 | tak → tak |

Entangle jest rzucane wyraźnie częściej (170 → 259 linii). Mediana schodów Frontline zostaje w paśmie. Na pokryciu mediana dochodzi do sufitu Medium (6) i nadal jest w paśmie.

Toxic Cloud na Casters Medium nie zmienia liczby rzutów. Różnica zasięgu to jeden krok (3 → 4), więc na tej party layout często nie dodaje drugiego celu. Pokrycie na czwórce Fighter / Brawler / Assassin / Acolyte jest tym układem, w którym ten krok podnosi medianę z 5 do 9 i wyprowadza komórkę z pasma. To sygnał na ten talent w tej paczce, nie na schody v0.3g. Schodów ani pasma pod to nie zmieniam.

Fireball na drabince R1 ma 0 rzutów, bo `chooseHeroAction` bierze pierwsze `type === "summon"`, a `legalActions` wpisuje Warrior przed Magiem (`engine/actions.js`, ok. 286–289; `engine/ai.js`, ok. 1355). Summon Warrior jest na drabince od n=2, Mage od n=3, więc Mage nie wchodzi na stół. Stąd identyczne 15 komórek Summoner i identyczne pokrycie `acolyte-summon-mage`.

Gdy w paczce jest tylko `acolyte-summon-mage` (party Fighter / Brawler / Scout / Acolyte, pad n=1), Mage wchodzi i Fireball jest rzucany mniej więcej dwa razy częściej na Medium i Hard (106 → 240, 110 → 253). Mediany zostają w pasmach: Easy 4 → 4, Medium 3 → 3, Hard 8 → 9. Wygrane Hard 98.3% → 100%, timeout 0.

## UI

Chrome 148 i `puppeteer-core` z `/tmp/puppeteer-run`, serwer `python3 serve.py` na `http://127.0.0.1:8765/sandbox.html`, sesja `riftersLabAuth=open`.

| Skrypt | Wynik |
| --- | --- |
| `scripts/lab-qa-ui.mjs` | **33 OK, 0 FAIL** |
| `scripts/help-minion-ui.mjs` | **71 OK, 131 N/A, 0 FAIL** na flow Help; miniony (archer, mage, warrior, elemental) **71/71** checków OK |

Oba skrypty zalogowały jeden błąd konsoli `404`. Żaden check nie spadł przez ten 404.

Pierwsze odpalenie Help padło na kliknięciu `#wizard-talents-lab`: przycisk jest poniżej viewportu 1440×900, a `puppeteer-core` 24 odrzuca hit-test. `lab-qa-ui.mjs` omija to przez `el.click()` w stronie. Ten sam `domClick` jest teraz w `bootClass` skryptu Help. Po tej poprawce harnessa przebieg przeszedł z zerem FAIL. To zmiana skryptu QA, nie silnika.

## Czego ten przebieg nie zmienia

Pasma Soft, schody v0.3g, próg porażki (rany ≥ 5 na każdym bohaterze) i Help (przerzut niższego d10) zostają. Hasło Pages nie było obracane. `sandbox/`, `engine/`, `mc/` i `cards/` nie były edytowane, więc `lab.enc` nie wymaga nowego seal.
