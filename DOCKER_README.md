# Docker Deployment Guide for Owl-Fenc-Flowchart

This guide provides instructions for deploying the Owl-Fenc-Flowchart microservices architecture using Docker and Docker Compose.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Building Docker Images](#building-docker-images)
4. [Running the Services](#running-the-services)
5. [Scaling and Load Balancing](#scaling-and-load-balancing)
6. [Monitoring and Observability](#monitoring-and-observability)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- Docker (version 20.10 or later)
- Docker Compose (version 2.0 or later)
- Git
- Node.js (for local development only)

## Environment Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/owl-fenc-flowchart.git
   cd owl-fenc-flowchart
   ```

2. Create a `.env` file in the project root with the following variables:
   ```
   # RabbitMQ
   RABBITMQ_PASSWORD=your_secure_password

   # MongoDB
   MONGO_PASSWORD=your_mongo_password

   # API Keys
   OPENAI_API_KEY=your_openai_api_key
   ANTHROPIC_API_KEY=your_anthropic_api_key
   MISTRAL_API_KEY=your_mistral_api_key
   ```

## Building Docker Images

You can build all Docker images at once using the provided script:

```bash
./docker-build.sh
```

To build and push to a registry:

```bash
DOCKER_REGISTRY=your-registry PUSH=true ./docker-build.sh
```

## Running the Services

Start all services:

```bash
docker-compose up -d
```

Start individual services:

```bash
docker-compose up -d api-gateway deepsearch-engine
```

Check service status:

```bash
docker-compose ps
```

View logs:

```bash
docker-compose logs -f
```

## Scaling and Load Balancing

The Owl-Fenc-Flowchart architecture supports horizontal scaling for all microservices. Here's how to scale services:

### Using Docker Compose Scale

```bash
docker-compose up -d --scale deepsearch-engine=3 --scale unstructured-input=2
```

### Using Traefik for Load Balancing

We provide a Traefik configuration for load balancing in the `traefik` directory. To use it:

1. Start Traefik:
   ```bash
   cd traefik
   docker-compose -f docker-compose.traefik.yml up -d
   ```

2. Access the Traefik dashboard at `http://localhost:8080`

3. Services will be automatically discovered and load balanced

### Kubernetes Deployment

For production environments, we recommend deploying to Kubernetes. Basic Kubernetes manifests are available in the `k8s` directory.

## Monitoring and Observability

We provide basic monitoring using Prometheus and Grafana:

1. Start the monitoring stack:
   ```bash
   docker-compose -f docker-compose.monitoring.yml up -d
   ```

2. Access Grafana at `http://localhost:3000` (default credentials: admin/admin)

3. Preconfigured dashboards include:
   - Microservices Overview
   - RabbitMQ Metrics
   - MongoDB Metrics
   - Node.js Runtime Metrics

## Troubleshooting

### Common Issues

1. **Services can't connect to RabbitMQ**
   - Check if RabbitMQ is healthy: `docker-compose ps rabbitmq`
   - Verify credentials in `.env` file
   - Check the logs: `docker-compose logs rabbitmq`

2. **API Gateway returns 502 errors**
   - Verify that all services are running: `docker-compose ps`
   - Check if RabbitMQ connections are working
   - Look for errors in service logs: `docker-compose logs -f api-gateway`

3. **Container starts and immediately stops**
   - Check the logs: `docker-compose logs <service-name>`
   - Verify environment variables are set correctly
   - Ensure volumes have correct permissions

### Getting Support

If you encounter issues not covered in this guide, please:

1. Check the comprehensive logs: `docker-compose logs > logs.txt`
2. Open an issue on GitHub with the logs attached
3. Contact our support team at support@owlfenc.com