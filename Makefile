.PHONY: setup build start stop restart full-restart logs clean status

# Full setup (install deps + build + start)
setup:
	sudo ./setup.sh

# Build all containers (sources config automatically)
build:
	@set -a && source ./clab-config.env && set +a && docker compose build

# Start all services
start:
	@set -a && source ./clab-config.env && set +a && docker compose up -d

# Stop all services
stop:
	docker compose down

# Restart all services (quick — no rebuild)
restart: stop start

# Full restart — tear down, rebuild, and redeploy everything
full-restart:
	sudo ./restart.sh

# Full restart without Docker cache
full-restart-no-cache:
	sudo ./restart.sh --no-cache

# View logs (all services)
logs:
	docker compose logs -f

# View logs for a specific service (e.g., make logs-auth-api)
logs-%:
	docker compose logs -f $*

# Remove all containers, volumes, and images
clean:
	docker compose down -v --rmi local

# Show status of all services
status:
	docker compose ps
