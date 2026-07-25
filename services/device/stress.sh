#!/data/data/com.termux/files/usr/bin/bash
set -u

SECONDS_TO_RUN="${1:-45}"
WORKERS="${2:-8}"

echo "verimesh: heating the phone for ${SECONDS_TO_RUN}s with ${WORKERS} workers"

if command -v stress-ng >/dev/null 2>&1; then
  timeout "${SECONDS_TO_RUN}" stress-ng --cpu "${WORKERS}" --cpu-method matrixprod --metrics-brief
  echo "verimesh: stress-ng burst finished"
  exit 0
fi

echo "verimesh: stress-ng not installed, falling back to shell workers"
pids=()
for _ in $(seq 1 "${WORKERS}"); do
  ( while :; do :; done ) &
  pids+=($!)
done

sleep "${SECONDS_TO_RUN}"

for pid in "${pids[@]}"; do
  kill "${pid}" 2>/dev/null || true
done
wait 2>/dev/null || true

echo "verimesh: fallback burst finished"
