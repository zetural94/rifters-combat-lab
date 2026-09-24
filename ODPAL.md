# Rifters combat lab — odpalanie (designer)

Potrzebujesz tylko **Pythona 3** (Windows / macOS / Linux). Node nie jest potrzebny do sandboxa.

## 1. Rozpakuj archiwum

Wejdź do tego folderu (tu jest `serve.py` i `sandbox.html`).

## 2. Start serwera

Windows (PowerShell / cmd):

```bash
py -3 serve.py
```

macOS / Linux:

```bash
python3 serve.py
```

W konsoli zobaczysz adres, zwykle:

`http://127.0.0.1:8765/sandbox.html`

Otwórz go w przeglądarce (Chrome / Edge / Firefox).

**Nie otwieraj `sandbox.html` jako pliku z dysku** — przeglądarka zablokuje karty i silnik.

## 3. Soft-bandy (cel ran)

- Easy **0–4**
- Medium **0–6**
- Hard **4–10**

Kartka MG (BP + Soft): `logs/campaign/MG-BP-budzet.html`

## 4. Wspólna sieć (opcjonalnie)

Jeśli jeden komputer serwuje, a drugi tylko klika:

```bash
set HOST=0.0.0.0
py -3 serve.py
```

Potem na drugim PC: `http://<IP-tego-PC>:8765/sandbox.html`.

## 5. Gaty Soft / coverage

To skrypty Node — do ręcznego grania niepotrzebne. Jak będą potrzebne, dopytaj Adriana.

## Problemy

- Port zajęty → zamknij stary proces albo `set PORT=8766`
- Pusta strona → wchodź przez `http://127.0.0.1:8765/...`, nie z Explorera

Paczka labów, sync **2026-09-24**.
