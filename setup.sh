#!/bin/bash

# ============================================
# Containerlab Studio - Setup Script
# ============================================
# This script reads configuration from clab-config.env
# and sets up the entire Containerlab Studio application.
#
# Usage: sudo ./setup.sh
#
# Prerequisites: Run as root or with sudo
# ============================================

set -e

# Self-locate — all paths are relative to this script's directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/clab-config.env"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
BACKEND_DIR="$SCRIPT_DIR/backend"
AUTH_DIR="$SCRIPT_DIR/auth"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================${NC}"
echo -e "${BLUE} Containerlab Studio - Setup Script${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""

# ============================================
# Step 1: Validate configuration
# ============================================
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Configuration file not found: $CONFIG_FILE${NC}"
    echo ""
    echo "Create it from the template:"
    echo "  cp $SCRIPT_DIR/clab-config.env.example $CONFIG_FILE"
    echo "  nano $CONFIG_FILE"
    exit 1
fi

echo -e "${YELLOW}Loading configuration from $CONFIG_FILE...${NC}"
source "$CONFIG_FILE"

# Validate required variables
if [ -z "$SERVER_IP" ] || [ "$SERVER_IP" == "CHANGE_ME" ]; then
    echo -e "${RED}Error: SERVER_IP is not set (or still set to CHANGE_ME) in $CONFIG_FILE${NC}"
    echo "Please edit the file and set your server's IP address."
    exit 1
fi

# Set defaults
AUTH_API_PORT=${AUTH_API_PORT:-3000}
BACKEND_API_PORT=${BACKEND_API_PORT:-3001}
CONTAINERLAB_API_PORT=${CONTAINERLAB_API_PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-80}
CLAB_SERVERS=${CLAB_SERVERS:-"ul-clab-1:$SERVER_IP"}
TOPOLOGY_PATH=${TOPOLOGY_PATH:-"/home/clab_nfs_share/containerlab_topologies"}
SSH_USERNAME=${SSH_USERNAME:-"student"}
SSH_PASSWORD=${SSH_PASSWORD:-"ul678clab"}

echo -e "${GREEN}Configuration loaded:${NC}"
echo "  SERVER_IP:             $SERVER_IP"
echo "  AUTH_API_PORT:         $AUTH_API_PORT"
echo "  BACKEND_API_PORT:      $BACKEND_API_PORT"
echo "  CONTAINERLAB_API_PORT: $CONTAINERLAB_API_PORT"
echo "  FRONTEND_PORT:         $FRONTEND_PORT"
echo "  CLAB_SERVERS:          $CLAB_SERVERS"
echo "  TOPOLOGY_PATH:         $TOPOLOGY_PATH"
echo ""

# ============================================
# Step 2: Install Docker if not present
# ============================================
echo -e "${YELLOW}Checking Docker installation...${NC}"

if command -v docker &>/dev/null; then
    DOCKER_VERSION=$(docker --version 2>/dev/null | awk '{print $3}' | tr -d ',')
    echo -e "${GREEN}Docker is already installed (version: $DOCKER_VERSION).${NC}"
else
    echo -e "${YELLOW}Installing Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo -e "${GREEN}Docker installed successfully.${NC}"
fi

# Check Docker Compose
if docker compose version &>/dev/null; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null)
    echo -e "${GREEN}Docker Compose is available (version: $COMPOSE_VERSION).${NC}"
else
    echo -e "${YELLOW}Installing Docker Compose plugin...${NC}"
    apt-get update && apt-get install -y docker-compose-plugin
    echo -e "${GREEN}Docker Compose installed successfully.${NC}"
fi

echo ""

# ============================================
# Step 3: Install Containerlab if not present
# ============================================
echo -e "${YELLOW}Checking containerlab installation...${NC}"

if command -v containerlab &>/dev/null || command -v clab &>/dev/null; then
    CLAB_VERSION=$(containerlab version 2>/dev/null | grep "version:" | awk '{print $2}' || clab version 2>/dev/null | grep "version:" | awk '{print $2}')
    echo -e "${GREEN}Containerlab is already installed (version: $CLAB_VERSION).${NC}"
else
    echo -e "${YELLOW}Installing containerlab...${NC}"
    bash -c "$(curl -sL https://get.containerlab.dev)" 2>/dev/null
    if command -v containerlab &>/dev/null || command -v clab &>/dev/null; then
        echo -e "${GREEN}Containerlab installed successfully.${NC}"
    else
        echo -e "${RED}Warning: Failed to install containerlab. Please install manually.${NC}"
    fi
fi

echo ""

# ============================================
# Step 4: Create SSH user for backend operations
# ============================================
echo -e "${YELLOW}Setting up SSH user for backend operations...${NC}"

if [ -n "$SSH_USERNAME" ] && [ -n "$SSH_PASSWORD" ]; then
    if id "$SSH_USERNAME" &>/dev/null; then
        echo -e "${GREEN}User '$SSH_USERNAME' already exists.${NC}"
    else
        echo -e "${YELLOW}Creating user '$SSH_USERNAME'...${NC}"
        useradd -m -s /bin/bash "$SSH_USERNAME"
        echo -e "${GREEN}User '$SSH_USERNAME' created.${NC}"
    fi

    # Set/update password
    echo "$SSH_USERNAME:$SSH_PASSWORD" | chpasswd
    echo -e "${GREEN}Password set for '$SSH_USERNAME'.${NC}"

    # Add to docker group if it exists
    if getent group docker &>/dev/null; then
        usermod -aG docker "$SSH_USERNAME"
        echo -e "${GREEN}User '$SSH_USERNAME' added to docker group.${NC}"
    fi

    # Add to clab_admins group if it exists
    if getent group clab_admins &>/dev/null; then
        usermod -aG clab_admins "$SSH_USERNAME"
        echo -e "${GREEN}User '$SSH_USERNAME' added to clab_admins group.${NC}"
    fi

    # Add to sudo group for containerlab operations
    usermod -aG sudo "$SSH_USERNAME"
    echo -e "${GREEN}User '$SSH_USERNAME' added to sudo group.${NC}"

    # Configure passwordless sudo for containerlab commands
    SUDOERS_FILE="/etc/sudoers.d/$SSH_USERNAME-containerlab"
    echo "$SSH_USERNAME ALL=(ALL) NOPASSWD: /usr/bin/containerlab, /usr/bin/clab, /usr/bin/docker, /usr/local/bin/containerlab" > "$SUDOERS_FILE"
    chmod 440 "$SUDOERS_FILE"
    echo -e "${GREEN}Passwordless sudo configured for containerlab commands.${NC}"
fi

echo ""

# ============================================
# Step 5: Create topology storage directory
# ============================================
echo -e "${YELLOW}Setting up topology storage directory...${NC}"
mkdir -p "$TOPOLOGY_PATH"

# Ensure clab_admins group exists
if ! getent group clab_admins &>/dev/null; then
    groupadd clab_admins
    echo -e "${GREEN}Created 'clab_admins' group.${NC}"
fi

# Set group ownership and setgid so all users in clab_admins can create/modify labs
chgrp -R clab_admins "$TOPOLOGY_PATH"
chmod 2775 "$TOPOLOGY_PATH"
chmod -R g+rwX "$TOPOLOGY_PATH"
find "$TOPOLOGY_PATH" -type d -exec chmod g+s {} \;
echo -e "${GREEN}Topology directory ready: $TOPOLOGY_PATH (group: clab_admins, setgid enabled)${NC}"

echo ""

# ============================================
# Step 6: Generate nginx.conf from template
# ============================================
echo -e "${YELLOW}Generating nginx.conf...${NC}"

if [ -f "$FRONTEND_DIR/nginx.conf.template" ]; then
    sed -e "s|SERVER_IP_PLACEHOLDER|$SERVER_IP|g" \
        -e "s|CONTAINERLAB_API_PORT_PLACEHOLDER|$CONTAINERLAB_API_PORT|g" \
        "$FRONTEND_DIR/nginx.conf.template" > "$FRONTEND_DIR/nginx.conf"
    echo -e "${GREEN}Created: $FRONTEND_DIR/nginx.conf${NC}"
else
    echo -e "${YELLOW}Warning: nginx.conf.template not found, updating nginx.conf directly...${NC}"
    if [ -f "$FRONTEND_DIR/nginx.conf" ]; then
        sed -i "s|proxy_pass http://[0-9.]*:8080/|proxy_pass http://$SERVER_IP:$CONTAINERLAB_API_PORT/|g" "$FRONTEND_DIR/nginx.conf"
        echo -e "${GREEN}Updated: $FRONTEND_DIR/nginx.conf${NC}"
    fi
fi

# ============================================
# Step 7: Generate .env file for React
# ============================================
echo -e "${YELLOW}Generating React .env file...${NC}"

cat > "$FRONTEND_DIR/.env" << EOF
# Auto-generated by setup.sh
# Do not edit directly - modify clab-config.env in the repo root instead

REACT_APP_AUTH_API_URL=http://$SERVER_IP:$AUTH_API_PORT
REACT_APP_BACKEND_API_URL=http://$SERVER_IP:$BACKEND_API_PORT
REACT_APP_CONTAINERLAB_API_URL=http://$SERVER_IP:$CONTAINERLAB_API_PORT
REACT_APP_SERVER_IP=$SERVER_IP
REACT_APP_CLAB_SERVERS=$CLAB_SERVERS
EOF

echo -e "${GREEN}Created: $FRONTEND_DIR/.env${NC}"

echo ""

# ============================================
# Step 8: Create .env symlink for docker-compose
# ============================================
# Docker Compose auto-reads .env from the project directory
ln -sf clab-config.env "$SCRIPT_DIR/.env"

# Export variables for docker-compose
export SERVER_IP
export AUTH_API_PORT
export BACKEND_API_PORT
export CONTAINERLAB_API_PORT
export FRONTEND_PORT
export CLAB_SERVERS
export TOPOLOGY_PATH
export SSH_USERNAME
export SSH_PASSWORD

# ============================================
# Step 9: Build and start all containers
# ============================================
echo -e "${YELLOW}Building and starting all containers...${NC}"
echo ""

cd "$SCRIPT_DIR"

# Stop any existing containers from this compose file
docker compose down --remove-orphans 2>/dev/null || true

# Build all images
echo -e "${YELLOW}Building Docker images (this may take a few minutes on first run)...${NC}"
docker compose build --no-cache

# Start all services
echo -e "${YELLOW}Starting all services...${NC}"
docker compose up -d

echo ""

# ============================================
# Step 10: Wait for services and verify health
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
# Done!
# ============================================
echo -e "${BLUE}============================================${NC}"
echo -e "${GREEN} Setup complete!${NC}"
echo -e "${BLUE}============================================${NC}"
echo ""
echo "  Access the application:"
echo "    Web UI:         http://$SERVER_IP:$FRONTEND_PORT"
echo "    Auth API:       http://$SERVER_IP:$AUTH_API_PORT"
echo "    Backend API:    http://$SERVER_IP:$BACKEND_API_PORT"
echo "    Containerlab:   http://$SERVER_IP:$CONTAINERLAB_API_PORT"
echo "    Mongo Express:  http://$SERVER_IP:8081"
echo ""
echo "  Default login:    labadmin / arastra"
echo ""
echo "  Useful commands:"
echo "    docker compose ps          # Check service status"
echo "    docker compose logs -f     # View all logs"
echo "    docker compose down        # Stop all services"
echo ""
echo "  To reconfigure:"
echo "    1. Edit $CONFIG_FILE"
echo "    2. Run: sudo $0"
echo ""
