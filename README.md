# Containerlab Studio

Web-based platform for designing, deploying, and managing containerlab network topologies.

## Quick Start

```bash
# 1. Clone the repo
git clone <repo-url> /opt/clab-studio
cd /opt/clab-studio

# 2. Create config from template
cp clab-config.env.example clab-config.env

# 3. Edit config — set your server IP and passwords
nano clab-config.env

# 4. Run setup (installs Docker, containerlab, builds and starts everything)
sudo ./setup.sh
```

Access at `http://<your-server-ip>`. Default login: `labadmin` / `arastra`.

## Architecture

| Service | Port | Description |
|---------|------|-------------|
| Frontend (Nginx + React) | 80 | Web UI |
| Auth API (Express + MongoDB) | 3000 | User authentication |
| Backend API (Express) | 3001 | Containerlab operations, file management, WebSocket terminal |
| Containerlab API | 8080 | Official containerlab API server |
| Mongo Express | 8081 | MongoDB admin UI |
| MongoDB | 27017 | User database |

## Project Structure

```
clab-studio/
├── auth/           # Authentication service (Express + MongoDB)
├── backend/        # Backend API (Express + containerlab CLI)
├── frontend/       # React web UI (served via Nginx)
├── docker-compose.yml
├── setup.sh
├── clab-config.env.example
└── Makefile
```

## Common Commands

```bash
make status         # Check service status
make logs           # View all logs
make logs-auth-api  # View logs for a specific service
make restart        # Restart all services
make stop           # Stop all services
make clean          # Remove containers, volumes, and images
```

## Reconfiguration

1. Edit `clab-config.env`
2. Run `sudo ./setup.sh`

This regenerates the nginx config and frontend environment, rebuilds containers, and restarts everything.
