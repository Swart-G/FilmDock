#!/usr/bin/env bash
set -euo pipefail

bench_base_url="${1:-http://127.0.0.1:8080}"
bench_query="${2:-The Last of Us}"
bench_runs="${RUNS:-3}"
bench_min_results="${MIN_RESULTS:-1}"
bench_expected_providers="${EXPECTED_PROVIDERS:-knaben,torrents-csv}"

if ! [[ "$bench_runs" =~ ^[1-9][0-9]*$ ]]; then
  echo "RUNS must be a positive integer" >&2
  exit 2
fi

bench_tmp_file="$(mktemp)"
trap 'rm -f -- "$bench_tmp_file"' EXIT

for ((bench_run = 1; bench_run <= bench_runs; bench_run++)); do
  curl \
    --fail \
    --silent \
    --show-error \
    --max-time 30 \
    --get \
    --data-urlencode "q=$bench_query" \
    --data-urlencode "min_seeders=1" \
    "$bench_base_url/api/torrent/search" \
    --output "$bench_tmp_file"

  python3 - "$bench_tmp_file" "$bench_min_results" "$bench_expected_providers" "$bench_run" <<'PY'
from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
import sys

response_path = Path(sys.argv[1])
minimum_results = int(sys.argv[2])
expected_providers = {value for value in sys.argv[3].split(",") if value}
run_number = int(sys.argv[4])

payload = json.loads(response_path.read_text(encoding="utf-8"))
results = payload.get("results")
if not isinstance(results, list):
    raise SystemExit(f"run {run_number}: response has no results array")
if len(results) < minimum_results:
    raise SystemExit(
        f"run {run_number}: got {len(results)} results, expected at least {minimum_results}"
    )

provider_counts = Counter(str(item.get("provider") or "unknown") for item in results)
missing = expected_providers.difference(provider_counts)
if missing:
    raise SystemExit(
        f"run {run_number}: expected providers are missing: {', '.join(sorted(missing))}"
    )

print(
    f"run {run_number}: count={len(results)} "
    f"providers={dict(sorted(provider_counts.items()))}"
)
PY
done

echo "torrent search stability check passed: $bench_runs/$bench_runs runs"
