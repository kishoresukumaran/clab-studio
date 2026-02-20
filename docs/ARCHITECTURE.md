# Containerlab Studio - System Architecture

**Author**: Kishore Sukumaran
**Repository**: [clab-studio](https://github.com/kishoresukumaran/clab-studio)

---

## System Overview

Containerlab Studio is a web-based platform for designing, deploying, and managing containerlab network topologies. It uses a 3-tier architecture, fully containerized with Docker.

```
+---------------------------------------------------------------------+
|                    CONTAINERLAB STUDIO                               |
+---------------------------------------------------------------------+
|                                                                     |
|  +---------------------------------------------------------------+ |
|  |  FRONTEND (Port 80)                                            | |
|  |  Location: frontend/                                           | |
|  |                                                                | |
|  |  Nginx (Reverse Proxy)                                         | |
|  |  +-> Serve React SPA                                           | |
|  |  +-> Proxy /login -> Backend:8080                              | |
|  |  +-> Proxy /api/* -> Backend:8080                              | |
|  |                                                                | |
|  |  React Application                                             | |
|  |  +-> Topology Designer (ReactFlow)                             | |
|  |  +-> Dashboard (Server Management)                             | |
|  |  +-> Topology Viewer (Cytoscape.js)                            | |
|  |  +-> Web Terminal (XTerm.js + WebSocket)                       | |
|  |  +-> File Manager (SFTP via backend)                           | |
|  |  +-> YAML Editor                                               | |
|  |  +-> User Management (admin only)                              | |
|  +---------------------------------------------------------------+ |
|                          |                                          |
|                          | HTTP / WebSocket                         |
|                          v                                          |
|  +---------------------------------------------------------------+ |
|  |  BACKEND (Ports 3001, 8080)                                    | |
|  |  Location: backend/                                            | |
|  |                                                                | |
|  |  Express API Server (Port 3001)                                | |
|  |  +-> Containerlab deploy/destroy/inspect/save                  | |
|  |  +-> File operations via SSH (list, read, write, upload)       | |
|  |  +-> WebSocket terminal emulation (ws://host:3001/ws/ssh)      | |
|  |  +-> System metrics (CPU, memory, ports)                       | |
|  |  +-> Git clone operations                                      | |
|  |                                                                | |
|  |  Official Containerlab API (Port 8080)                         | |
|  |  +-> Native containerlab REST API                              | |
|  |  +-> Started via: containerlab tools api-server start          | |
|  |                                                                | |
|  |  Containerlab CLI (installed in container)                     | |
|  |  +-> clab deploy / destroy / inspect / save                    | |
|  +---------------------------------------------------------------+ |
|                          |                                          |
|                          | HTTP                                     |
|                          v                                          |
|  +---------------------------------------------------------------+ |
|  |  AUTHENTICATION (Ports 3000, 8081, 27017)                      | |
|  |  Location: auth/                                               | |
|  |                                                                | |
|  |  Auth API (Port 3000)                                          | |
|  |  +-> User authentication (verify-user)                        | |
|  |  +-> User CRUD management                                     | |
|  |  +-> Health check endpoint                                     | |
|  |                                                                | |
|  |  MongoDB (Port 27017)                                          | |
|  |  +-> User credentials storage                                  | |
|  |  +-> Persistent volume: mongodb_data                           | |
|  |                                                                | |
|  |  Mongo Express (Port 8081)                                     | |
|  |  +-> Web-based database admin UI                               | |
|  +---------------------------------------------------------------+ |
|                                                                     |
+---------------------------------------------------------------------+
```

---

## Port Allocation

| Port  | Service              | Component     | Protocol | Notes                                   |
|-------|----------------------|---------------|----------|-----------------------------------------|
| 80    | Nginx                | Frontend      | HTTP     | Main UI access point                    |
| 3000  | Auth API             | Auth          | HTTP     | User authentication                     |
| 3001  | Express API          | Backend       | HTTP/WS  | Containerlab ops, WebSocket terminal    |
| 8080  | Containerlab API     | Backend       | HTTP     | Official containerlab REST API          |
| 8081  | Mongo Express        | Auth          | HTTP     | Database management UI                  |
| 27017 | MongoDB              | Auth          | TCP      | User database                           |

---

## Docker Services

All services are defined in the root `docker-compose.yml`.

| Service               | Container Name         | Image / Build        | Network          | Notes                           |
|-----------------------|------------------------|----------------------|------------------|---------------------------------|
| mongo                 | auth-mongo             | mongo:latest         | clab-network     | Healthcheck, persistent volume  |
| mongo-express         | auth-mongo-express     | mongo-express:latest | clab-network     | depends_on mongo healthy        |
| auth-api              | auth-api               | ./auth/api           | clab-network     | depends_on mongo healthy        |
| containerlab-api      | containerlab-api       | ./backend            | host (privileged)| Docker socket, host networking  |
| containerlab-designer | containerlab-designer  | ./frontend           | clab-network     | Build args for REACT_APP_* vars |

The backend uses `network_mode: "host"` and `privileged: true` because it needs direct access to the Docker socket, SSH connections, and containerlab operations.

---

## Data Flows

### Authentication

```
Browser Login
  -> Frontend (:80) POST /api/auth/verify-user
  -> Auth API (:3000) verify credentials
  -> MongoDB (:27017) check username/password
  -> Auth API returns user object + role
  -> Frontend stores in localStorage
  -> Navigate to main app
```

### Topology Deployment

```
User designs topology visually (ReactFlow canvas)
  -> Generate YAML from visual design
  -> Click "Deploy"
  -> Frontend POST to http://<SERVER_IP>:3001/api/containerlab/deploy
  -> Backend receives YAML, SSHs to target server
  -> Executes: clab deploy --topo topology.yaml
  -> Containerlab CLI creates Docker containers for network nodes
  -> Backend streams deployment logs back via response
  -> Frontend displays in LogModal
```

### Dashboard Topology Fetching

```
User opens Dashboard tab
  -> Frontend: for each server in CLAB_SERVERS list:
     -> POST /login to get JWT token from Containerlab API (:8080)
     -> GET /api/v1/topologies with JWT
     -> Containerlab API runs: clab inspect --all --format json
     -> Returns topology list with node details
  -> Frontend displays all topologies across all servers
```

### SSH Terminal

```
User clicks SSH button on a node
  -> Navigate to /terminal/:serverIp/:nodeName/:nodeIp/:nodeKind
  -> WebTerminal component loads XTerm.js
  -> Establish WebSocket: ws://<SERVER_IP>:3001/ws/ssh
  -> Send connect message with node details
  -> Backend determines node type (Linux container / network device)
  -> Backend creates SSH connection or docker exec
  -> Backend spawns PTY (pseudo-terminal) via node-pty
  -> stdin/stdout relayed via WebSocket
  -> XTerm.js renders terminal output in browser
```

### Topology Viewer

```
User clicks "Topology" button on a deployed lab in Dashboard
  -> Frontend GET http://<SERVER_IP>:3001/api/files/read
     ?path=<labPath>&serverIp=<serverIp>&username=<username>
  -> Backend SSHs to server, reads YAML file content
  -> Returns YAML as string in response
  -> Frontend parses YAML client-side (js-yaml)
  -> Converts to Cytoscape.js format (nodes + edges)
     - Nodes: id, label, kind, mgmt_ip, config, container_name
     - Edges: source, target, source_interface, target_interface
  -> Opens fullscreen TopologyModal
  -> Cytoscape.js renders interactive graph (cose-bilkent layout)
  -> Click nodes/edges to inspect details in info panel
  -> Toolbar: Fit View, Reset Layout, Toggle Labels, Export PNG
```

### File Management

```
User opens File Manager
  -> Frontend GET /api/files/list?serverIp=...&path=...
  -> Backend SSHs to target server
  -> Executes: ls -la <path>
  -> Parses output, returns file list as JSON
  -> Frontend renders file browser UI
  -> Upload/download/edit operations follow similar SSH pattern
```

---

## Project Structure

```
clab-studio/
+-- clab-config.env.example      # Configuration template (committed)
+-- clab-config.env              # Actual config (git-ignored, has secrets)
+-- docker-compose.yml           # All 5 services in one file
+-- setup.sh                     # One-command setup script
+-- Makefile                     # Convenience targets
+-- README.md                    # Quick start guide
|
+-- auth/                        # Authentication service
|   +-- api/
|   |   +-- Dockerfile           # Node 18 Alpine
|   |   +-- index.js             # Express API (user auth + management)
|   |   +-- package.json
|   |   +-- public/index.html    # User management web UI
|   +-- init-mongo.js            # Seeds default users on first run
|
+-- backend/                     # Backend API service
|   +-- Dockerfile               # Node 18 + containerlab CLI
|   +-- server.js                # Express API (~1,300 lines)
|   +-- config.js                # Reads env vars (SERVER_IP, ports, paths)
|   +-- start.sh                 # Starts containerlab API + Express server
|   +-- package.json
|   +-- uploads/                 # Runtime upload directory (git-ignored)
|
+-- frontend/                    # Frontend React application
|   +-- Dockerfile               # Multi-stage: Node 20 build -> Nginx
|   +-- nginx.conf.template      # Nginx config template (committed)
|   +-- nginx.conf               # Generated at setup time (git-ignored)
|   +-- .env.template            # React env template (committed)
|   +-- .env                     # Generated at setup time (git-ignored)
|   +-- package.json
|   +-- src/
|   |   +-- App.js               # Main app with routing
|   |   +-- components/
|   |   |   +-- ContainerLab.js  # Topology designer (main component)
|   |   |   +-- ClabServers.js   # Dashboard with server list
|   |   |   +-- topology/
|   |   |   |   +-- TopologyModal.js    # Fullscreen Cytoscape.js viewer modal
|   |   |   |   +-- TopologyModal.css   # Viewer styles
|   |   |   |   +-- topologyParser.js   # YAML-to-Cytoscape parser
|   |   |   |   +-- topologyStyles.js   # Cytoscape node/edge styles & layout
|   |   |   +-- FileManagerModal.js
|   |   |   +-- WebTerminal.js   # SSH terminal via WebSocket
|   |   |   +-- Login.js
|   |   |   +-- UserManagement.js
|   |   +-- utils/
|   |   |   +-- config.js        # Centralized config (reads REACT_APP_*)
|   |   |   +-- auth.js          # Auth utilities
|   |   +-- contexts/
|   |       +-- TopologyContext.js
|   +-- public/
|   +-- server/                  # Server-side helpers
|
+-- docs/
    +-- ARCHITECTURE.md          # This file
```

---

## Configuration

All configuration is centralized in `clab-config.env` at the repo root.

| Parameter              | Description                                    | Default                                        |
|------------------------|------------------------------------------------|------------------------------------------------|
| `SERVER_IP`            | Server's IP address (REQUIRED)                 | -                                              |
| `AUTH_API_PORT`        | Auth API port                                  | 3000                                           |
| `BACKEND_API_PORT`     | Backend Express API port                       | 3001                                           |
| `CONTAINERLAB_API_PORT`| Containerlab API port                          | 8080                                           |
| `FRONTEND_PORT`        | Frontend / Nginx port                          | 80                                             |
| `CLAB_SERVERS`         | Comma-separated server list (name:ip)          | ul-clab-1:<SERVER_IP>                          |
| `SSH_PASSWORD`         | SSH password for backend operations            | (set in config)                                |
| `TOPOLOGY_PATH`        | Topology file storage directory                | /home/clab_nfs_share/containerlab_topologies   |
| `LAB_ADMIN_USER`       | Default admin username                         | labadmin                                       |
| `LAB_ADMIN_PASSWORD`   | Default admin password                         | (set in config)                                |

**Important**: The frontend bakes `REACT_APP_*` environment variables at Docker **build time**. Changing `SERVER_IP` requires a full rebuild (`sudo ./setup.sh`).

---

## Default Credentials

| Service            | Username   | Password   | Notes                          |
|--------------------|------------|------------|--------------------------------|
| Application login  | labadmin   | arastra    | Admin role                     |
| Application login  | kishore    | arastra    | User role                      |
| Mongo Express      | admin      | password   | Database admin UI              |
| MongoDB            | admin      | password   | Database root                  |
| SSH (backend ops)  | student    | (config)   | Set in clab-config.env         |

---

## Deployment

### New Server

```bash
git clone git@github.com:kishoresukumaran/clab-studio.git /opt/clab-studio
cd /opt/clab-studio
cp clab-config.env.example clab-config.env
nano clab-config.env    # Set SERVER_IP and passwords
sudo ./setup.sh
```

### What setup.sh Does

1. Validates `clab-config.env` (checks SERVER_IP is set)
2. Installs Docker and Docker Compose if not present
3. Installs containerlab on the host if not present
4. Creates SSH user with sudo for containerlab commands
5. Creates topology storage directory
6. Generates `frontend/nginx.conf` from template
7. Generates `frontend/.env` for React build
8. Builds all Docker images
9. Starts all containers
10. Waits for health checks (MongoDB, Auth API, Frontend, Backend)
11. Prints access summary with URLs

### Reconfiguration

```bash
nano clab-config.env    # Change SERVER_IP, ports, or CLAB_SERVERS
sudo ./setup.sh         # Regenerates configs, rebuilds, restarts
```

---

## Troubleshooting

### All Services Status

```bash
cd /opt/clab-studio
docker compose ps
# or
make status
```

### Service Won't Start

```bash
# Check logs for a specific service
docker compose logs auth-api
docker compose logs containerlab-api
docker compose logs containerlab-designer

# Check for port conflicts
ss -tulpn | grep -E "80|3000|3001|8080|8081|27017"

# Check Docker daemon
systemctl status docker

# Check resources
free -h && df -h
```

### Login Fails

```bash
# Verify auth API is healthy
curl http://localhost:3000/api/health

# Check MongoDB is reachable
docker exec auth-mongo mongosh --eval "db.adminCommand('ping')"

# Verify users exist
docker exec auth-mongo mongosh auth --quiet --eval "db.users.find().pretty()"

# Re-seed users (WARNING: deletes existing users)
docker compose down
docker volume rm clab-studio_mongodb_data
sudo ./setup.sh
```

### Dashboard Shows API Errors

```bash
# Test backend APIs
curl http://localhost:3001/health
curl http://localhost:8080/api/v1/version

# Check if SERVER_IP is correct in frontend build
docker exec containerlab-designer cat /usr/share/nginx/html/static/js/*.js | grep -o 'http://[0-9.]*:[0-9]*' | sort -u

# If IP is wrong, rebuild
sudo ./setup.sh
```

### WebSocket Terminal Not Connecting

```bash
# Check backend is listening
ss -tlnp | grep 3001

# Check backend logs for WebSocket errors
docker compose logs containerlab-api | grep -i websocket

# Test SSH connectivity from backend container
docker exec containerlab-api ssh -o StrictHostKeyChecking=no student@<SERVER_IP> echo "OK"
```

### Containerlab Operations Fail

```bash
# Verify containerlab inside the container
docker exec containerlab-api clab version

# Check privileged mode
docker inspect containerlab-api --format '{{.HostConfig.Privileged}}'
# Should return: true

# Check Docker socket access
docker exec containerlab-api docker ps

# Check topology directory permissions
ls -la /home/clab_nfs_share/containerlab_topologies/
```

---

## Security Checklist (Production)

- [ ] Change default application passwords (labadmin, kishore)
- [ ] Change MongoDB admin password
- [ ] Change Mongo Express login credentials
- [ ] Change SSH password in `clab-config.env`
- [ ] Implement HTTPS with SSL certificates (modify nginx.conf.template)
- [ ] Restrict firewall to only necessary ports
- [ ] Enable password hashing in auth service (bcrypt is installed but unused)
- [ ] Add API authentication to backend endpoints
- [ ] Restrict CORS in backend (currently allows all origins)
- [ ] Set up regular MongoDB backups
- [ ] Close Mongo Express port (8081) to external access

---

## Backup & Restore

### Backup

```bash
# Backup user database
docker exec auth-mongo mongodump --db auth --out /tmp/backup
docker cp auth-mongo:/tmp/backup ./auth-backup-$(date +%Y%m%d)

# Backup topologies
tar -czf topologies-backup-$(date +%Y%m%d).tar.gz /home/clab_nfs_share/containerlab_topologies

# Backup configuration
cp clab-config.env clab-config-backup-$(date +%Y%m%d).env
```

### Restore

```bash
# Restore user database
docker cp ./auth-backup-YYYYMMDD auth-mongo:/tmp/backup
docker exec auth-mongo mongorestore --db auth /tmp/backup/auth

# Restore topologies
tar -xzf topologies-backup-YYYYMMDD.tar.gz -C /

# Restore configuration
cp clab-config-backup-YYYYMMDD.env clab-config.env
sudo ./setup.sh
```

---

## Useful Commands

```bash
make status             # Check all services
make logs               # Follow all logs
make logs-auth-api      # Follow logs for one service
make restart            # Restart all services
make stop               # Stop all services
make clean              # Remove containers, volumes, images
sudo ./setup.sh         # Full rebuild with current config
```
