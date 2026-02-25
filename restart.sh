#!/bin/bash

# ============================================
# Containerlab Studio - Restart Script
# ============================================
# Tears down all running containers, rebuilds
# images, and redeploys the entire application.
#
# Usage: sudo ./restart.sh
#        sudo ./restart.sh --no-cache   # force rebuild without Docker cache
# ============================================

set -e

# Self-locate — all paths are relative to this script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/clab-config.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
NO_CACHE=""
if [ "$1" == "--no-cache" ]; then
    NO_CACHE="--no-cache"
fi

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE} Containerlab Studio - Restart${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ============================================
# Step 1: Validate configuration
# ============================================
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Configuration file not found: $CONFIG_FILE${NC}"
    echo "Run setup.sh first or create it from the template:"
    echo "  cp $SCRIPT_DIR/clab-config.env.example $CONFIG_FILE"
    exit 1
fi

echo -e "${YELLOW}Loading configuration from $CONFIG_FILE...${NC}"
set -a
source "$CONFIG_FILE"
set +a

# Set defaults
AUTH_API_PORT=${AUTH_API_PORT:-3000}
BACKEND_API_PORT=${BACKEND_API_PORT:-3001}
CONTAINERLAB_API_PORT=${CONTAINERLAB_API_PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-80}

echo -e "${GREEN}Configuration loaded.${NC}"
echo ""

cd "$SCRIPT_DIR"

# ============================================
# Step 2: Stop and remove all containers
# ============================================
echo -e "${YELLOW}Stopping and removing all containers...${NC}"
docker compose down --remove-orphans 2>/dev/null || true
echo -e "${GREEN}All containers stopped and removed.${NC}"
echo ""

# ============================================
# Step 3: Rebuild all images
# ============================================
echo -e "${YELLOW}Rebuilding all Docker images${NO_CACHE:+ (no cache)}...${NC}"
docker compose build $NO_CACHE
echo -e "${GREEN}All images rebuilt.${NC}"
echo ""

# ============================================
# Step 4: Start all services
# ============================================
echo -e "${YELLOW}Starting all services...${NC}"
docker compose up -d
echo -e "${GREEN}All services started.${NC}"
echo ""

# ============================================
# Step 5: Wait for services and verify health
# ============================================
echo -e "${YELLOW}Waiting for services to be ready...${NC}"

# Wait for MongoDB
echo -n "  MongoDB: "
if timeout 60 bash -c 'until docker inspect --format="{{.State.Health.Status}}" auth-mongo 2>/dev/null | grep -q healthy; do sleep 2; done' 2>/dev/null; then
    echo -e "${GREEN}healthy${NC}"
else
    echo -e "${YELLOW}timeout (may still be starting)${NC}"
fi

# Wait for Auth API
echo -n "  Auth API: "
if timeout 30 bash -c "until curl -sf http://localhost:${AUTH_API_PORT}/api/health >/dev/null 2>&1; do sleep 2; done" 2>/dev/null; then
    echo -e "${GREEN}ready${NC}"
else
    echo -e "${YELLOW}timeout (may still be starting)${NC}"
fi

# Wait for Frontend
echo -n "  Frontend: "
if timeout 30 bash -c "until curl -sf http://localhost:${FRONTEND_PORT}/ >/dev/null 2>&1; do sleep 2; done" 2>/dev/null; then
    echo -e "${GREEN}ready${NC}"
else
    echo -e "${YELLOW}timeout (may still be starting)${NC}"
fi

# Wait for Backend API
echo -n "  Backend API: "
if timeout 30 bash -c "until curl -sf http://localhost:${BACKEND_API_PORT}/health >/dev/null 2>&1; do sleep 2; done" 2>/dev/null; then
    echo -e "${GREEN}ready${NC}"
else
    echo -e "${YELLOW}timeout (may still be starting)${NC}"
fi

echo ""

# ============================================
# Step 6: Show final status
# ============================================
echo -e "${YELLOW}Service status:${NC}"
docker compose ps
echo ""

echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN} Restart complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "  Web UI:         http://$SERVER_IP:$FRONTEND_PORT"
echo "  Auth API:       http://$SERVER_IP:$AUTH_API_PORT"
echo "  Backend API:    http://$SERVER_IP:$BACKEND_API_PORT"
echo "  Containerlab:   http://$SERVER_IP:$CONTAINERLAB_API_PORT"
echo "  Mongo Express:  http://$SERVER_IP:8081"
echo ""
