# Rifters combat lab — odpalanie (designer)

Źródło prawdy to **ten katalog** (root repozytorium, to samo co GitHub Pages z `main` `/`). Nie ma tu drugiego drzewa `Rifters_*` ani `_inbox`.

Potrzebujesz **Pythona 3** albo Node (`npx serve`). Hasło jest to samo co na Pages (dostajesz je od Adriana, nie jest w tym pliku).

## 1. Wejdź do tego folderu

Tu są `sandbox.html`, `serve.py`, `lab.enc` i `index.html`.

## 2. Start serwera

Python (logi walki, tylko localhost):

```bash
python3 serve.py
```

Windows:

```bash
py -3 serve.py
```

Albo sam statyczny serwer, bez `/api/sandbox-log`:

```bash
npx --yes serve . -l 8765
```

Adres: `http://127.0.0.1:8765/`

Wpisz hasło na stronie wejścia. Sandbox ładuje się dopiero po odszyfrowaniu.

**Nie otwieraj `sandbox.html` jako pliku z dysku** — przeglądarka zablokuje moduły.

`serve.py` słucha na `127.0.0.1` (nie na `0.0.0.0`). CORS tylko dla `localhost` / `127.0.0.1`. POST do logów ma limit rozmiaru. Zapis do `logs/` z innego adresu jest odrzucany, dopóki nie ustawisz `LAB_TOKEN` i nagłówka `X-Lab-Token`.

## 3. Wspólna sieć (opcjonalnie)

```bash
set HOST=0.0.0.0
set LAB_TOKEN=twoj-token
py -3 serve.py
```

Potem na drugim komputerze: `http://<IP-tego-PC>:8765/`. Zapis logów z LAN wymaga nagłówka `X-Lab-Token`.

## 4. Soft-bandy (cel ran)

- Easy **0–4**
- Medium **0–6**
- Hard **4–10**

Schody Soft/BP zostają przy v0.3g. Help to przerzut niższego d10.

Kartki kampanii (`logs/campaign/`) **nie ma w tym repo**.

## 5. Testy i gaty

Do grania niepotrzebne:

```bash
node --test tests/*.test.mjs
node scripts/check-card-schema.mjs
node scripts/lab-qa-pass.mjs
node scripts/help-and-minions-check.mjs
```

## 6. Pieczęć po zmianie gry

Każda zmiana `sandbox.html`, `engine/`, `mc/` albo `cards/` ma iść w tym samym commicie co nowy `lab.enc`. Hasło jest to, które już znasz. Nie zapisuj go w repo i nie obracaj go przy pieczęci.

```bash
RIFTERS_LAB_PASSWORD='…' node scripts/seal-lab.mjs
```

Skrypt pisze `lab.enc` i `lab.manifest.json` (liczba plików i skróty, bez hasła). Test pieczęci porównuje manifest z drzewem bez odszyfrowania.

## Problemy

- Port zajęty → zamknij stary proces albo `PORT=8766 python3 serve.py`
- Pusta strona → wchodź przez `http://127.0.0.1:8765/`, nie z menedżera plików
- „Złe hasło” → to hasło designera; nie zostało obrócone w tej poprawce

Paczka labów, sync **2026-09-24**.
