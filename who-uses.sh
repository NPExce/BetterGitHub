#!/bin/bash
# Pokazuje, ilu użytkowników mają BetterGitHub i BetterJ oraz kto podał nick. Nicki czyta z bazy przez zalogowanego wranglera, bez klucza.
set -euo pipefail

echo "== Liczba użytkowników (dziś / 7 dni / 30 dni)"
curl -fsS https://adrros-telemetry.adrros.workers.dev/stats | python3 -c '
import json, sys
for product, s in json.load(sys.stdin).items():
    versions = ", ".join("%s: %s" % (v["version"], v["users"]) for v in s["versions"])
    print("%s: %s / %s / %s   wersje (7 dni): %s" % (product, s["today"], s["last7Days"], s["last30Days"], versions))
'

echo
echo "== Kto podał nick"
npx --yes wrangler d1 execute adrros-telemetry --remote --json \
  --command "SELECT product, nick, version, last_day FROM nicks ORDER BY last_day DESC" 2>/dev/null | python3 -c '
import json, sys
rows = json.load(sys.stdin)[0]["results"]
if not rows:
    print("nikt jeszcze nie podał nicku")
for r in rows:
    print("%s  %-13s %-40s %s" % (r["last_day"], r["product"], r["nick"], r["version"]))
'
