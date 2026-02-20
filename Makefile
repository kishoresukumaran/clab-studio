.PHONY: setup build start stop restart logs clean status

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

# Restart all services
restart: stop start

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
