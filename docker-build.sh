#!/bin/bash
# Docker build script for Owl-Fenc-Flowchart microservices

# Exit on error
set -e

# Configuration
REGISTRY=${DOCKER_REGISTRY:-"owlfenc"}
TAG=${TAG:-"latest"}
PUSH=${PUSH:-"false"}

# Print header
echo "=========================================="
echo "Owl-Fenc-Flowchart Docker Build"
echo "=========================================="
echo "Registry: $REGISTRY"
echo "Tag: $TAG"
echo "Push images: $PUSH"
echo "=========================================="

# Build base image first
echo "Building base image..."
docker build -f backend/Dockerfile.base -t $REGISTRY/owl-fenc-base:$TAG ./backend

# Build microservice images
declare -a SERVICES=(
    "deepsearch-engine"
    "unstructured-input"
    "error-handler"
    "adaptive-learning"
)

for service in "${SERVICES[@]}"; do
    echo "Building $service service..."
    docker build -f backend/Dockerfile.$service -t $REGISTRY/owl-fenc-$service:$TAG ./backend
    
    # Tag with date for versioning
    DATE_TAG=$(date +%Y%m%d)
    docker tag $REGISTRY/owl-fenc-$service:$TAG $REGISTRY/owl-fenc-$service:$DATE_TAG
    
    if [ "$PUSH" = "true" ]; then
        echo "Pushing $service images..."
        docker push $REGISTRY/owl-fenc-$service:$TAG
        docker push $REGISTRY/owl-fenc-$service:$DATE_TAG
    fi
done

# Build API Gateway separately
echo "Building API Gateway..."
docker build -f backend/Dockerfile.base -t $REGISTRY/owl-fenc-api-gateway:$TAG ./backend --build-arg SERVICE_TYPE=api-gateway

if [ "$PUSH" = "true" ]; then
    echo "Pushing API Gateway images..."
    DATE_TAG=$(date +%Y%m%d)
    docker tag $REGISTRY/owl-fenc-api-gateway:$TAG $REGISTRY/owl-fenc-api-gateway:$DATE_TAG
    docker push $REGISTRY/owl-fenc-api-gateway:$TAG
    docker push $REGISTRY/owl-fenc-api-gateway:$DATE_TAG
fi

echo "=========================================="
echo "Build completed successfully!"
echo "=========================================="

# List all built images
echo "Built images:"
docker images | grep $REGISTRY/owl-fenc