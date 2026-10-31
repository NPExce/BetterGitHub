#!/bin/bash
# Kopiuje do schowka najnowszą wersję BetterGitHub z gałęzi main na GitHubie.
set -euo pipefail

REPO="NPExce/BetterGitHub"
FILE="BetterGitHub.user.js"

if command -v gh >/dev/null && code=$(gh api "repos/$REPO/contents/$FILE" -H "Accept: application/vnd.github.raw" 2>/dev/null); then
  :
else
  code=$(curl -fsSL "https://raw.githubusercontent.com/$REPO/main/$FILE?nocache=$(date +%s)")
fi

printf '%s\n' "$code" | pbcopy
version=$(printf '%s\n' "$code" | sed -n 's|^// @version *||p' | head -1)
echo "Skopiowano BetterGitHub $version do schowka. Wklej w Violentmonkey: edycja skryptu, ⌘A, ⌘V, ⌘S."
