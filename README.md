# BetterGitHub

Userscript do Violentmonkey, który dokłada na GitHubie informacje o pull requestach: approvale, wątki review, kto komentuje i co czeka na Ciebie.

## Instalacja

1. Zainstaluj w przeglądarce rozszerzenie **Violentmonkey** (Chrome, Firefox, Zen, Edge).
2. Otwórz link: [BetterGitHub.user.js](https://raw.githubusercontent.com/NPExce/BetterGitHub/main/BetterGitHub.user.js).
3. Violentmonkey pokaże okno instalacji. Kliknij **Install**.
4. Wejdź na listę PR dowolnego repo (np. `/pulls`). W wierszu PR pojawi się przycisk **Zaloguj przez GitHub**.
5. Kliknij go, potem **Otwórz GitHub**, wklej kod i zatwierdź dostęp.
   - Sprawdź w prawym górnym rogu GitHuba, że jesteś na **swoim** koncie. Skrypt działa jako konto, które zatwierdzi kod.

Aktualizacje przychodzą same: Violentmonkey sprawdza nowe wersje w tym repo. Ręcznie: panel Violentmonkey → **Check for updates**.

Najnowszą wersję można też skopiować do schowka (macOS) i wkleić ręcznie w edycji skryptu w Violentmonkey:

```bash
~/IdeaProjects/BetterGitHub/copy-latest.sh
```

Bez logowania przez aplikację można wkleić własny token: menu Violentmonkey → **Ustaw token ręcznie (PAT)**. Token fine-grained z uprawnieniem **Pull requests: Read and write**.

## Co robi

**Lista PR**
- Approvale z awatarami: kto zatwierdził (kolorowe), kto jest przypisany do review i nie dał approvala (szare).
- Prośby o zmiany.
- Wątki review: rozwiązane / wszystkie (np. `3/8`) i awatary osób, które komentują.
- Konflikt z gałęzią bazową, gałąź „za base”, draft.
- Liczba zmienionych linii.
- Czas od ostatniej aktywności, także reakcji emotkami.
- Fioletowy pasek z lewej strony wiersza: coś w tym PR czeka na Ciebie.
- Po wejściu na listę plakietka w lewym dolnym rogu pokazuje synchronizację z GitHubem.

**Strona PR**
- Przycisk **Review**: Comment, Approve albo Request changes bez wchodzenia w „Files changed”.
- Ochrona przed złym kontem: gdy skrypt jest zalogowany na inne konto niż strona GitHuba, wysyłanie jest zablokowane.
- Ikonka kopiowania przy pliku w wątku review: kopiuje `ścieżka:linia`. W IntelliJ: ⌘⇧O, wklej, otworzy plik w tej linii.

## Kolory

**Wątki review (💬)**
- **Niebieski ↩** – wątek zacząłeś Ty, ostatnia aktywność (komentarz albo emotka) jest cudza. Twoja kolej.
- **Fioletowy ↩** – wątek zaczął ktoś inny, Ty w nim piszesz albo to Twój PR, ostatnia aktywność jest cudza. Twoja kolej.
- **Żółty** – są otwarte wątki, ale nic nie czeka na Ciebie.
- **Zielony** – wszystkie wątki rozwiązane.
- **Szary** – brak wątków.
- Awatar kolorowy: osoba ma otwarty wątek. Szary: jej wątki są rozwiązane.

**Pozostałe**
- Approvale **zielone** – komplet approvali.
- Approvale z **fioletową ramką** – jesteś poproszony o review.
- Szary awatar przy approvalach – osoba przypisana do review, która nie dała approvala (jeszcze nie zrobiła review albo tylko skomentowała).
- **Czerwony** – prośba o zmiany albo konflikt.
- **Żółty** – gałąź za base albo brak aktywności od 5 dni.

## Menu Violentmonkey

- Zaloguj przez GitHub / Wyloguj
- Ustaw token ręcznie (PAT)
- Wymagana liczba approvali (np. `2` pokazuje `1/2`)
- Odśwież dane PR

## Ograniczenia

- Reakcje emotkami liczą się tylko na ostatni komentarz w wątku i na 10 ostatnich komentarzy rozmowy.
- Logowanie przez GitHub działa w repo, gdzie zainstalowana jest aplikacja „ZT PR badges”. W innych repo użyj tokenu (PAT).
