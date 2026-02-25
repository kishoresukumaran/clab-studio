# Containerlab Studio

Web-based platform for designing, deploying, and managing containerlab network topologies.

## Features

- **Topology Designer** — Drag-and-drop visual topology builder with YAML generation
- **Dashboard** — Monitor and manage deployed topologies across multiple servers
- **Topology Viewer** — Interactive graph visualization of deployed labs (Cytoscape.js)
- **Web Terminal** — Browser-based SSH access to lab nodes (XTerm.js + WebSocket)
- **File Manager** — Browse, edit, upload, and download files on remote servers
- **User Management** — Role-based access control with admin user provisioning
- **Help Center** — Built-in documentation site accessible via the `?` icon or `/helpcenter`

## Prerequisites

- **OS:** Linux (Ubuntu/Debian) — the setup script uses `apt-get`
- **Access:** Root or sudo privileges
- **Tools:** `git` and `curl` must be installed
- **Ports:** The following ports must be available (not blocked by firewall):

| Port | Service |
|------|---------|
| 80 | Frontend (Web UI) |
| 3000 | Auth API |
| 3001 | Backend API |
| 8080 | Containerlab API |
| 8081 | Mongo Express (DB admin) |
| 27017 | MongoDB |

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/kishoresukumaran/clab-studio.git /opt/clab-studio
cd /opt/clab-studio

# 2. Create config from template
cp clab-config.env.example clab-config.env

# 3. Edit config — update the CHANGE_ME values (see Configuration below)
nano clab-config.env

# 4. Make setup script executable and run it
chmod +x setup.sh
sudo ./setup.sh
```

Access at `http://<your-server-ip>`. Login with the admin credentials you set in `clab-config.env`.

## Configuration

Edit `clab-config.env` before running setup. The following values **must** be changed (marked `CHANGE_ME` in the template):

| Variable | Description | Example |
|----------|-------------|---------|
| `SERVER_IP` | Your server's IP address | `10.0.0.50` |
| `CLAB_SERVERS` | Server list in `name:ip` format (use the same IP for single-server) | `my-server:10.0.0.50` |
| `SSH_PASSWORD` | Password for the SSH user created for backend operations | `mypassword` |
| `LAB_ADMIN_PASSWORD` | Web UI admin login password | `myadminpass` |

Optional variables (defaults are usually fine):

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_API_PORT` | `3000` | Auth service port |
| `BACKEND_API_PORT` | `3001` | Backend API port |
| `CONTAINERLAB_API_PORT` | `8080` | Containerlab API port |
| `FRONTEND_PORT` | `80` | Frontend port |
| `SSH_USERNAME` | `student` | System user created for backend SSH operations |
| `TOPOLOGY_PATH` | `/home/clab_nfs_share/containerlab_topologies` | Where topology files are stored |
| `LAB_ADMIN_USER` | `labadmin` | Web UI admin username |
| `MONGODB_URI` | *(empty)* | Only set if using an external MongoDB instead of the bundled Docker container |

`clab-config.env` is the **only** file you need to edit. The setup script generates all other config files automatically.

## Architecture

| Service | Port | Description |
|---------|------|-------------|
| Frontend (Nginx + React) | 80 | Web UI |
| Auth API (Express + MongoDB) | 3000 | User authentication |
| Backend API (Express) | 3001 | Containerlab operations, file management, WebSocket terminal |
| Containerlab API | 8080 | Official containerlab API server |
| Mongo Express | 8081 | MongoDB admin UI |
| MongoDB | 27017 | User database |
| Help Center (MkDocs) | — | Documentation site (proxied at /helpcenter) |

See `docs/ARCHITECTURE.md` for detailed architecture documentation, data flows, and security notes.

## Project Structure

```
clab-studio/
├── auth/           # Authentication service (Express + MongoDB)
├── backend/        # Backend API (Express + containerlab CLI)
├── frontend/       # React web UI (served via Nginx)
├── helpcenter/     # Help center documentation (MkDocs Material)
├── docs/           # Architecture documentation
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

This regenerates the nginx config, MongoDB init script, and frontend environment, rebuilds containers, and restarts everything.

## Troubleshooting

```bash
# Check if all services are running
make status

# View logs for a specific service
make logs-auth-api
make logs-containerlab-api
make logs-containerlab-designer

# Check for port conflicts
sudo lsof -i :80 -i :3000 -i :3001 -i :8080 -i :8081 -i :27017

# Restart everything from scratch
make clean
sudo ./setup.sh
```

For detailed troubleshooting steps, see `docs/ARCHITECTURE.md`.
