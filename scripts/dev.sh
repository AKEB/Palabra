#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DB_PORT="${DB_PORT:-5433}"
export DATABASE_URL="${DATABASE_URL:-postgres://palabra:palabra@localhost:${DB_PORT}/palabra}"
export JWT_SECRET="${JWT_SECRET:-dev-secret-change-me}"

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

cleanup() {
  echo ""
  echo "Stopping API and Vite..."
  local pids
  pids="$(jobs -p)"
  if [[ -n "$pids" ]]; then
    kill $pids 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Starting Postgres on localhost:${DB_PORT}..."
DB_PORT="$DB_PORT" docker compose up -d db

echo "Waiting for Postgres..."
until docker compose exec -T db pg_isready -U palabra -d palabra >/dev/null 2>&1; do
  sleep 1
done

echo "Starting API on :8080..."
npm start &

echo "Starting Vite on :5173..."
npm run dev &

echo ""
echo "Dev ready: http://localhost:5173"
echo "API:       http://localhost:8080"
echo "Ctrl+C stops API/Vite (Postgres stays up)"
echo ""

wait
