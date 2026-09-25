# Nocny przegląd talentów

Każdy talent rangi 1 został porównany z biblią `Rifters_24_09_2026` (oś postępu, nie stary szkic). Wyjątki z tej sesji zostają tak, jak je zamknął Adrian. Stary szkic miał płaskie liczby. Oś postępu skaluje obrażenia statystyką. Przy INT 1 obie wersje Lightning Bolt drukują 8, 12 i 14, dlatego w labie wyglądało to na płaską kartę.

Przebieg w labie: silnik odpalił wszystkie 56 talentów na treningowym manekinie (0 problemów). Osobno w przeglądarce: Lightning Bolt przy INT 3 zadał 16 (wilk 18 → 2), Magic Shield w nadlewie zabrał 2 many, Barrage zapytał o ruch przed albo po strzałach, Living Bomb i Ice Wall przeszły 16 kontroli. Heavy 1/walkę zostaje tylko dla AI. Gracz w labie może rzucać ścianę ponownie.

Liczby w `docs/REBALANCE-V1.md` mierzą stan sprzed tej poprawki formuł. Ten dokument ich nie przelicza.

## Wyjątki sesji

Te karty nie wracają do tekstu biblii.

- Living Bomb: 2 many, 2 AP, zasięg 5. Śmierć zadaje 10 + INT ognia w zasięgu 3. Bramki podpalenia bez zmian. Nadlew 1 dokłada 2 × INT.
- Ice Wall: 3 many, 2 AP, zasięg 5, ściana z 4 pól, sąsiednie pole jest trudnym terenem, segment ma 3 + INT życia, zniszczenie zadaje 2 nieuchronne. Nadlew 1 daje +3 pola albo +2 obrażeń zniszczenia. Gracz może rzucać więcej niż raz. Limit raz na walkę dotyczy tylko AI.
- Grapple: WD + STR, WD + 2 × STR, WD + 3 × STR. Bramka T2 to STR ≤ twoja SIŁA + 1. Trwa do końca twojej następnej tury. T3 zostaje przy +1.
- Riposte: raz na rundę.
- Shadowplay bez zmian.
- Klasa bohatera Warrior jest zdjęta. Przywołanie Summon Warrior zostaje.

## Lightning Bolt

Było: płaskie 8 / 12 / 14, bez wstrząsu i bez nadlewu. Przy INT 1 nowy wzór daje te same liczby, więc lab wyglądał na płaski.

Jest: 4 × INT + 4, 6 × INT + 6, 7 × INT + 7 błyskawicy. Wstrząs, gdy ZRĘCZNOŚĆ ≤ twój INT − 1 (2 / 3 / 4). Nadlew 2: jeden dodatkowy cel w zasięgu 2 od głównego celu, za połowę obrażeń. W labie przy INT 3 pierwsza kość dała 16 i ścięła wilka z 18 do 2.

## Tabela

| Klasa | Talent | Zgodność z kanonem? | Zachowanie w labie | Poprawka | Status |
| --- | --- | --- | --- | --- | --- |
| Fighter | Forceful Push | Tak. WD, pchnięcie 2+SIŁA / 3+SIŁA / 4+SIŁA, powalenie gdy SIŁA ≤ twoja SIŁA. | Oba kity strzelają. Ciężki miecz 6/13/18. | Brak. | OK |
| Fighter | Intimidating Shout | Tak. Zastraszenie 1+SIŁA / 2+SIŁA / 4+SIŁA, promień 1/2/2. | Przycisk jest. Obrażenia 0, status schodzi. | Brak. | OK |
| Fighter | Weaponmaster | Tak. Raz na turę, trafienie wrażliwego zdejmuje 1 stres. | Flaga pasywna jest na bohaterze. | Brak. | OK |
| Fighter | Frontliner | Tak. +5 HP. Następna tura po tym, jak wejdziesz w Bloodied, daje +1 AP. | HP rośnie przy nadaniu talentu. | Brak. | OK |
| Fighter | Heavy Swing | Tak. WD+SIŁA / WD+2×SIŁA / 2WD. Opcjonalny stres daje przewagę 1. | Oba kity. Ciężki miecz 7/12/26. | Brak. | OK |
| Fighter | Eye for an eye | Tak. Po ciosie T3 wroga wolna okazja. | Okno reakcji oferuje wolne OA. | Brak. | OK |
| Fighter | Precise Strike | Tak. Przewaga 1, Krytyk 3, WD, potem Break 2+SIŁA i 4+SIŁA. | Oba kity. Ciężki miecz 6/10/13. | Brak. | OK |
| Fighter | Courage | Tak. +1 obrony Ciemności albo Światła. Sojusznicy w zasięgu 1 ignorują strach. | Pasywna flaga i obrona są na karcie. | Brak. | OK |
| Brawler | Pugilist | Tak. +1 obrony fizycznej, +1 stabilności, przewaga przy ustawianiu ciosu. | Flagi pasywne wchodzą. | Brak. | OK |
| Brawler | Full contact | Tak. +1 do pchnięć. Pchnięcie może być zślizgiem. | Flaga pasywna jest na bohaterze. | Brak. | OK |
| Brawler | Uppercut | Tak. Przewaga 1, opcjonalny stres daje drugą przewagę. Break 2 i Break 5. | Rękawice 6/8/11. | Brak. | OK |
| Brawler | Guard | Tak. 1 stres, +1 obrony do początku twojej następnej tury. | Przycisk Guard schodzi. | Brak. | OK |
| Brawler | Grapple | Wyjątek sesji, nie tekst biblii. WD+SIŁA / +2×SIŁA / +3×SIŁA. Bramka T2 i T3 to SIŁA ≤ twoja SIŁA + 1. Trwa do końca twojej następnej tury. | Rękawice 7/10/14 przy SIŁA 1. | Zostawione jak w zamkniętej sesji. | OK |
| Brawler | Martial artist | Tak. +1 szybkości, ruch 2 po ataku, raz na walkę bez kary pośpiechu. | Ruch 2 uzbraja się po ataku, nie na starcie tury. | Brak. | OK |
| Brawler | Tough | Tak. +5 HP i +1 odzyskania. | HP i odzyskania rosną. | Brak. | OK |
| Brawler | Flurry of Blows | Tak. 2WD+SIŁA / 2WD+2×SIŁA / 3WD. Za 1 stres drugi cel w zasięgu 1 dostaje połowę. | Rękawice 13/18/33. Lab pyta o drugi cel, gdy starczy stresu. | Dopisany wybór drugiego celu w labie. Silnik połowy obrażeń już był. | OK |
| Mystic | Magic Shield | Tak. Tarcza 2 + INT. Nadlew dokłada INT i drugi cel. | Przycisk bazowy i nadlew. Nadlew przy INT 3 zabrał 2 many. | Było 3+INT i brak drugiego celu. Jest 2+INT, a nadlew to 2+2×INT i drugi sojusznik. | OK |
| Mystic | Living Bomb | Wyjątek sesji. 2 many, 2 AP, zasięg 5. Śmierć: 10+INT ognia, zasięg 3. Nadlew +2×INT. | W przeglądarce śmierć bazowa to 11, nadlew 13. Bramki podpalenia zgodne. | Zostawione. Biblia ma 8+INT. Sesja wygrywa. | OK |
| Mystic | Ice Wall | Wyjątek sesji. 2 AP i 3 many, 4 pola, HP 3+INT, zniszczenie 2. Nadlew +3 pola albo +2 zniszczenia. | Gracz postawił drugą ścianę. AI rzuciło raz i drugi raz odmówiło. Przycisk gracza został. | Limit raz na walkę tylko na ścieżce AI. | OK |
| Mystic | Enhance Weapon | Tak. Broń zadaje INT+1 swojej typu. Nadlew zamienia cały typ broni. | Przycisk bazowy i nadlew są na liście. | Dopisany przycisk nadlewu. Sam efekt już był. | OK |
| Mystic | Lightning Bolt | Tak. 4×INT+4 / 6×INT+6 / 7×INT+7. Wstrząs przy ZRĘCZNOŚĆ ≤ INT−1. Nadlew 2: połowa na cel w zasięgu 2 od głównego. | Przy INT 1 karta pokazuje 8/12/14. Przy INT 3 w labie cios T1 zabrał 16. | Zdjęte płaskie 8/12/14. Dopisany wstrząs i nadlew z połową obrażeń. | OK |
| Mystic | Shadowplay | Wyjątek sesji. Strach, gdy INT ≤ twój INT. Nadlew zastrasza 2×INT. | Przycisk jest. Test sojusznika jako źródła strachu przechodzi. | Bez zmian w tej sesji. | OK |
| Mystic | Blink | Tak. Połowa szybkości i tarcza 3×INT. Nadlew: pełna szybkość i +INT tarczy. | Przycisk bazowy i nadlew. | Brak. | OK |
| Mystic | Game Knowledge | Tak. Przewaga przy rzutach o system. To meta poza walką. | Brak akcji w walce. Flaga jest. | Brak. | OK |
| Acolyte | Enfeeble | Tak. Zastraszenie 2×INT. Obszar 2, zasięg 4. Nadlew: obszar 3, zasięg 5. | Obrażenia 0. Przy INT 2 zastraszenie ma 4. | Było płaskie 3 na obszarze 4. | OK |
| Acolyte | Summon Warrior | Tak. 14×INT HP, atak 4×INT, Living Shield 4/5/6×INT. | Przywołanie wstaje z 14 HP przy INT 1 i strzela. | Brak. Klasa bohatera Warrior dalej zdjęta. | OK |
| Acolyte | Summon Mage | Tak. 8×INT HP, pocisk 5×INT ciemności, Fireball 5/7/9×INT. | Przywołanie wstaje z 8 HP. | Brak. | OK |
| Acolyte | Summon Archer | Tak. 10×INT HP, strzał 7×INT, Bone Arrow 6/8/10×INT. | Przywołanie wstaje z 10 HP. Strzał T1 to 7. | Brak. | OK |
| Acolyte | Bless | Tak. Odzyskanie + INT. Nadlew zamienia to na +2×INT, nie dokłada trzeciego INT. | Przycisk bazowy i nadlew. | Nadlew dawał 3×INT. Teraz daje 2×INT. | OK |
| Acolyte | System's Bargain | Tak. Progi −1. T1 zadaje 3 × ranga nieuchronne. | Przycisk jest. Test progu przechodzi. | Brak. | OK |
| Acolyte | Purge the Wicked | Tak. 6×INT / 10×INT + zastraszenie 3 / 12×INT + zastraszenie 5. Nadlew: wrażliwość na światło 2+INT. | Przy INT 1 liczby to 6/10/12. Przy INT 2 T1 zadaje 12 i kładzie wrażliwość 4. | Było 6/10/14 bez nadlewu. | OK |
| Acolyte | Toxic Cloud | Tak. 4×INT trucizny, trucizna 2 gdy INT ≤ twój INT. Nadlew rusza chmurę o 2. | Chmura zostaje do końca walki. | Brak. | OK |
| Primalist | Entangle | Tak. 5×INT spowolnienie 2 / 8×INT pętanie / 10×INT pętanie. Bramki SIŁA wobec INT. Nadlew: trucizna 2+INT gdy INT ≤ twój INT. | Przy INT 1 obrażenia to 5/8/10. | Było 4/8/10 i spowolnienie 1, bez nadlewu. | OK |
| Primalist | Frost Shock | Tak. 5×INT / 8×INT spowolnienie 2 / 10×INT spowolnienie 3. Nadlew: zastraszenie 3+INT. | Przy INT 1 obrażenia to 5/8/10. | Były płaskie liczby bez nadlewu. | OK |
| Primalist | Healing Water | Tak. Oczyszczenie 2+INT, odzyskanie +INT, przewaga 1. Nadlew zamienia odzyskanie na +2×INT. | Przycisk bazowy i nadlew. | Nadlew dawał 3×INT. Teraz daje 2×INT. | OK |
| Primalist | Wind Gale | Tak. Prostokąt 3×2 od klikniętego celu, w stronę od ciebie. 5×INT pchnięcie 2+INT / 8×INT pchnięcie 3+INT / 10×INT pchnięcie 4+INT. Bramka SIŁA wobec INT. Nadlew 3 powtarza czar za darmo na starcie twojej następnej tury. | Przy INT 1 obrażenia to 5/8/10. Pchnięcie omija cel powyżej bramki. | Było płaskie 4/6/8 i pchnięcie bez bramki. | OK |
| Primalist | Barkskin | Tak. Tarcza 4+INT i odporność na krwawienie. Nadlew daje +INT stabilności. | Przycisk bazowy i nadlew. | Brak. | OK |
| Primalist | Primal Instinct | Tak. +1 stabilności, +1 obrony fizycznej, przewaga gdy Bloodied. | Flagi pasywne wchodzą. | Brak. | OK |
| Primalist | Feral Invocation | Tak. +1 szybkości. Aktywacja: Break równy SIŁA+1, a T3 broni dokłada strach. | Przycisk aktywacji jest. | Brak. | OK |
| Primalist | Summon Elemental | Tak. 10×INT HP, atak 4×INT, tarcza żywiołu +INT obrony. | Przywołanie wstaje z 10 HP. | Brak. | OK |
| Assassin | Expose Weakness | Tak. 2WD−2 / 2WD i wrażliwość 1+ZRĘCZNOŚĆ / 2WD i wrażliwość 3+ZRĘCZNOŚĆ. | Oba kity strzelają. | Brak. | OK |
| Assassin | Cold Blooded | Tak. +2 maksymalnego stresu. Krytyk zdejmuje 1 stres więcej. | Flaga i wyższy stres wchodzą. | Brak. | OK |
| Assassin | Shadow Dash | Tak. 1 AP i 1 stres, skok 3, przewaga na następny atak wręcz w tej turze. | Przycisk wyboru pola jest. | Brak. | OK |
| Assassin | Riposte | Wyjątek sesji. Raz na rundę. Redukcja 5×ZRĘCZNOŚĆ. Zero obrażeń daje OA. Tylko zasięg 1. | Okno reakcji oferuje Riposte na cios wręcz. Dystans jest odmowny. | Zostawione. | OK |
| Assassin | Perfectionist | Tak. INT razy na walkę, za 1 stres, szkodliwy status dostaje +INT. | Flaga jest. Wydanie stresu i limit są w silniku statusów. | Było bez limitu i bez kosztu stresu. | OK |
| Assassin | Flurry of Daggers | Tak. 2+ZRĘCZNOŚĆ celów, zasięg 4. Krwawienie gdy SIŁA ≤ twoja ZRĘCZNOŚĆ, a na T3 +1. | Oba kity strzelają. Sztylet T1 to 4. | Bramka porównywała SIŁĘ do twojej SIŁY. Teraz do twojej ZRĘCZNOŚCI. | OK |
| Assassin | Stealth | Tak. Raz na rundę, 0 AP, 1 stres. Poza zasięgiem 2 nie da się cię wybrać. Pierwszy atak wręcz ze skradania to Krytyk 1. | Przycisk Stealth jest. | Brak. | OK |
| Assassin | Dirty Trick | Tak. Krytyk 1. Rozbrojenie gdy ZRĘCZNOŚĆ ≤ twoja ZRĘCZNOŚĆ − 1, a na T3 bez tej jedynki i zwrot 1 stresu. | Oba kity strzelają. | Brak. | OK |
| Scout | Ranger | Tak. +1 maksymalnego stresu. Przewaga na rzutach zwiadu. Dwa darmowe Help. | Flagi wchodzą. Help za 0 AP jest w kontroli sojusznika. | Brak. | OK |
| Scout | Pin Shot | Tak. Każdy próg ma bramkę ZRĘCZNOŚĆ ≤ twoja ZRĘCZNOŚĆ. Spowolnienie 1, spowolnienie 2, powalenie. Opcjonalny stres daje przewagę 1. | Krótki łuk 6/9/11. Przycisk jest w labie. | T2 i T3 znowu mają bramkę. Szkic je zdejmował. | OK |
| Scout | Spotter | Tak. Znak do końca walki. Następny atak sojusznika w tej rundzie ma Break 2+INT. Twój dystans ma Krytyk 1. | Przycisk znaku jest. Test przy INT 3 daje Break 5. | Break był płaskim 2. | OK |
| Scout | Barrage | Tak. Maksymalnie 1+ZRĘCZNOŚĆ celów. WD+ZRĘCZNOŚĆ / +2× / +3×. Za 1 stres ruch przed albo po, bez kosztu AP. | Krótki łuk 7/11/14. Lab pyta: ruch przed, ruch po, albo bez ruchu. | Ruch za stres był w notce jako brakujący. Jest w labie. | OK |
| Scout | Survival Tactics | Tak. +1 odzyskania i +1 obrony dwóm żywiołom. | Odzyskania i obrona rosną. | Brak. | OK |
| Scout | Hunter's Knowledge | Tak. Przewaga przy pytaniu. Pytanie o wroga daje przewagę przeciw niemu. | Flaga pasywna jest. | Brak. | OK |
| Scout | Hidden Bola | Tak. 1 AP i 1 stres, zasięg 3, redukcja 5×ZRĘCZNOŚĆ, powalenie gdy SIŁA ≤ twoja ZRĘCZNOŚĆ. | Okno reakcji oferuje bolę w zasięgu 3. Poza zasięgiem odmawia. | Brak. | OK |
| Scout | Vigilant | Tak. +1 stabilności. OA ma przewagę 1 i można ruszyć się o 1 bezpiecznie. | Ruch uzbraja się po twoim OA. | Brak. | OK |

## Kontrole

W tabeli nie ma statusu FAIL. Testy jednostkowe kart i silnika przechodzą razem z pieczęcią `lab.manifest.json`, odświeżoną po tym dokumencie. Schemat kart: 78/78. Kontrola labu i przywołań: zielona. Manekin: 56/56. Przeglądarka Lightning Bolt, Magic Shield i Barrage: 8/8. Przeglądarka Living Bomb i Ice Wall: 16/16.
