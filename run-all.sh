#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ -x ".venv/Scripts/python.exe" ]]; then
  PYTHON=".venv/Scripts/python.exe"
elif [[ -x ".venv/bin/python" ]]; then
  PYTHON=".venv/bin/python"
else
  PYTHON="python3"
fi

if [[ ! -d "playground/node_modules" ]]; then
  echo "Falta playground/node_modules. Corré: (cd playground && npm install)"
  exit 1
fi

HOST_PORT="${HOST_PORT:-8000}"

pids=()
cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

HOST_PORT="$HOST_PORT" \
HOST_PUBLIC_URL="${HOST_PUBLIC_URL:-http://localhost:$HOST_PORT}" \
"$PYTHON" -m uvicorn agents.host.server:app --reload --reload-dir agents --host 127.0.0.1 --port "$HOST_PORT" &
pids+=($!)

VITE_HOST_URL="${VITE_HOST_URL:-http://localhost:$HOST_PORT}" \
npm --prefix playground run dev &
pids+=($!)

echo
echo "Agent Host: http://localhost:$HOST_PORT"
echo "Playground: http://localhost:5173"
echo "Ctrl+C para detener todo."
echo

wait
