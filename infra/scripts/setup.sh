#!/usr/bin/env bash
set -euo pipefail

# PulseTerminal X — Full Setup Script
# Usage: ./infra/scripts/setup.sh [dev|prod]

MODE="${1:-dev}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      PulseTerminal X — Setup ($MODE)      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

cd "$ROOT_DIR"

# ─── Check prerequisites ──────────────────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ Required: $1 (not found)"
    exit 1
  fi
  echo "✅ $1 found"
}

echo "Checking prerequisites..."
check_cmd node
check_cmd npm
check_cmd python3
check_cmd pip3
check_cmd docker
check_cmd psql || echo "⚠️  psql not found — DB must be running in Docker"

# ─── Environment files ────────────────────────────────────────────────────────
echo ""
echo "Setting up environment files..."

for svc in backend intelligence frontend; do
  if [ ! -f "$ROOT_DIR/$svc/.env" ]; then
    cp "$ROOT_DIR/$svc/.env.example" "$ROOT_DIR/$svc/.env"
    echo "  ✅ Created $svc/.env from example"
    echo "  ⚠️  Edit $svc/.env with your API keys before running"
  else
    echo "  ⏭️  $svc/.env already exists — skipping"
  fi
done

if [ "$MODE" = "dev" ]; then
  # ─── Start Docker deps only ────────────────────────────────────────────────
  echo ""
  echo "Starting Docker services (postgres + redis)..."
  docker compose up -d postgres redis
  echo "Waiting for postgres to be ready..."
  until docker compose exec postgres pg_isready -U ptuser &>/dev/null; do
    sleep 1
  done
  echo "✅ PostgreSQL ready"

  # ─── Backend setup ────────────────────────────────────────────────────────
  echo ""
  echo "Setting up backend..."
  cd "$ROOT_DIR/backend"
  npm install
  npx prisma generate
  npx prisma migrate dev --name init
  npx ts-node prisma/seed.ts
  echo "✅ Backend ready"

  # ─── Python setup ─────────────────────────────────────────────────────────
  echo ""
  echo "Setting up intelligence service..."
  cd "$ROOT_DIR/intelligence"
  python3 -m venv .venv
  source .venv/bin/activate
  pip install -r requirements.txt
  echo "✅ Intelligence service ready"

  # ─── Frontend setup ───────────────────────────────────────────────────────
  echo ""
  echo "Setting up frontend..."
  cd "$ROOT_DIR/frontend"
  npm install
  echo "✅ Frontend ready"

  echo ""
  echo "╔══════════════════════════════════════════╗"
  echo "║            SETUP COMPLETE! 🚀            ║"
  echo "╚══════════════════════════════════════════╝"
  echo ""
  echo "Start services with:"
  echo "  npm run dev          (starts all services)"
  echo ""
  echo "Or individually:"
  echo "  cd backend    && npm run dev"
  echo "  cd intelligence && source .venv/bin/activate && uvicorn app.main:app --reload --port 8001"
  echo "  cd frontend   && npm run dev"
  echo ""
  echo "Access:"
  echo "  Frontend:     http://localhost:3000"
  echo "  Backend API:  http://localhost:3001/api"
  echo "  Intelligence: http://localhost:8001/docs"
  echo ""
  echo "Demo login:"
  echo "  elite@demo.com / Demo123!"

elif [ "$MODE" = "prod" ]; then
  echo ""
  echo "Building production Docker images..."
  docker compose build --no-cache
  docker compose up -d
  echo ""
  echo "Running migrations..."
  docker compose exec backend npx prisma migrate deploy
  docker compose exec backend npx ts-node prisma/seed.ts
  echo ""
  echo "✅ Production deployment complete"
  echo "   Services running at your configured domain"
fi
