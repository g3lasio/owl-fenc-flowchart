#!/bin/bash
# Script to start all Owl-Fenc-Flowchart services

# Exit on error
set -e

# Print header
echo "=========================================="
echo "Owl-Fenc-Flowchart Startup Script"
echo "=========================================="

# Check if .env file exists
if [ ! -f ".env" ]; then
  echo "Error: .env file not found!"
  echo "Please create a .env file with the necessary environment variables."
  echo "See DOCKER_README.md for details."
  exit 1
fi

# Load environment variables
source .env

# Start RabbitMQ and MongoDB first
echo "Starting core infrastructure..."
docker-compose up -d rabbitmq mongodb
echo "Waiting for infrastructure to initialize..."
sleep 15

# Start microservices
echo "Starting microservices..."
docker-compose up -d deepsearch-engine unstructured-input error-handler adaptive-learning
echo "Waiting for microservices to initialize..."
sleep 10

# Start API Gateway last
echo "Starting API Gateway..."
docker-compose up -d api-gateway

# Start monitoring if requested
if [ "$1" == "--with-monitoring" ]; then
  echo "Starting monitoring stack..."
  docker-compose -f docker-compose.monitoring.yml up -d
fi

# Start Traefik if requested
if [ "$1" == "--with-traefik" ] || [ "$2" == "--with-traefik" ]; then
  echo "Starting Traefik load balancer..."
  cd traefik && docker-compose -f docker-compose.traefik.yml up -d
  cd ..
fi

# Show status
echo "=========================================="
echo "Services started successfully!"
echo "=========================================="
echo "Service status:"
docker-compose ps

echo "Access the API Gateway at: http://localhost:3000/api"
echo "Access RabbitMQ management at: http://localhost:15672/"
if [ "$1" == "--with-monitoring" ] || [ "$2" == "--with-monitoring" ]; then
  echo "Access Grafana at: http://localhost:3001/"
  echo "Access Prometheus at: http://localhost:9090/"
fi
if [ "$1" == "--with-traefik" ] || [ "$2" == "--with-traefik" ]; then
  echo "Access Traefik dashboard at: http://localhost:8080/"
fi
