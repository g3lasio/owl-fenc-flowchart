#!/bin/bash
# Script to stop all Owl-Fenc-Flowchart services

# Print header
echo "=========================================="
echo "Owl-Fenc-Flowchart Shutdown Script"
echo "=========================================="

# Stop Traefik if running
if [ -f "traefik/docker-compose.traefik.yml" ]; then
  echo "Stopping Traefik..."
  cd traefik && docker-compose -f docker-compose.traefik.yml down
  cd ..
fi

# Stop monitoring if running
if [ -f "docker-compose.monitoring.yml" ]; then
  echo "Stopping monitoring stack..."
  docker-compose -f docker-compose.monitoring.yml down
fi

# Stop main services
echo "Stopping all services..."
docker-compose down

echo "=========================================="
echo "All services stopped successfully!"
echo "=========================================="

# If requested, remove volumes
if [ "$1" == "--clean" ]; then
  echo "Removing volumes..."
  docker volume rm $(docker volume ls -q | grep owl-fenc) || true
  echo "Volumes removed."
fi
