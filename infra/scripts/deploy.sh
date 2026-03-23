#!/usr/bin/env bash
# ─── PulseTerminal X — Full deployment script ─────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC} $1"; }
err()  { echo -e "${RED}[error]${NC} $1"; exit 1; }

# ─── Pre-flight checks ────────────────────────────────────────────────────────
log "Running pre-flight checks..."
command -v docker  >/dev/null 2>&1 || err "Docker not found"
command -v docker-compose >/dev/null 2>&1 || err "Docker Compose not found"
[ -f "$ROOT_DIR/backend/.env" ]      || err "backend/.env missing. Copy .env.example and fill values."
[ -f "$ROOT_DIR/intelligence/.env" ] || err "intelligence/.env missing."
[ -f "$ROOT_DIR/frontend/.env.local" ] || warn "frontend/.env.local missing — using defaults"

ENV="${1:-production}"
log "Deploying environment: ${BOLD}$ENV${NC}"

cd "$ROOT_DIR"

# ─── Build and start ──────────────────────────────────────────────────────────
log "Pulling latest images..."
docker-compose pull postgres redis 2>/dev/null || true

log "Building application containers..."
docker-compose build --no-cache

log "Starting infrastructure (db + redis)..."
docker-compose up -d postgres redis

log "Waiting for database..."
until docker-compose exec -T postgres pg_isready -U ptuser >/dev/null 2>&1; do
  echo -n "."
  sleep 2
done
echo ""
log "Database ready."

log "Running database migrations..."
docker-compose run --rm backend sh -c "npx prisma migrate deploy"

log "Running database seed (first deploy)..."
if [ "${SEED:-false}" = "true" ]; then
  docker-compose run --rm backend sh -c "npx ts-node prisma/seed.ts" || warn "Seed failed (may already exist)"
fi

log "Starting all services..."
if [ "$ENV" = "production" ]; then
  docker-compose --profile production up -d
else
  docker-compose up -d
fi

log "Waiting for health checks..."
sleep 10

# ─── Health verification ──────────────────────────────────────────────────────
check_health() {
  local name=$1
  local url=$2
  if curl -sf "$url" >/dev/null 2>&1; then
    log "✅ $name healthy"
  else
    warn "⚠️  $name health check failed at $url"
  fi
}

check_health "Backend API"     "http://localhost:3001/api/health/live"
check_health "Intelligence"    "http://localhost:8001/health/live"
check_health "Frontend"        "http://localhost:3000/"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
log "${BOLD}Deployment complete!${NC}"
echo ""
echo "  Frontend:     http://localhost:3000"
echo "  Backend API:  http://localhost:3001/api"
echo "  Intelligence: http://localhost:8001"
echo "  API Docs:     http://localhost:8001/docs"
echo ""
echo "  Demo logins:"
echo "    demo@pulseterminal.io  / Demo1234!  (PRO)"
echo "    elite@pulseterminal.io / Demo1234!  (ELITE)"
echo ""
