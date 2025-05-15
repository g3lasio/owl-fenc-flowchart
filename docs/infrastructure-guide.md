# Documentación de Infraestructura de Microservicios - Owl-Fenc

## Descripción General

Esta documentación describe la arquitectura de infraestructura implementada para el sistema Owl-Fenc, que incluye múltiples microservicios, Docker, Kubernetes, monitorización y herramientas de observabilidad.

## Componentes del Sistema

### Microservicios Core

1. **API Gateway**
   - Punto de entrada único al sistema
   - Gestión de autenticación y autorización
   - Enrutamiento de solicitudes a microservicios internos

2. **DeepSearch Engine**
   - Búsqueda semántica en la base de conocimientos
   - Análisis de especificaciones técnicas
   - Extracción automática de parámetros de proyectos
   - Recomendaciones de materiales

3. **Unstructured Input Service**
   - Procesamiento de texto libre
   - Análisis de imágenes y documentos
   - Extracción de datos estructurados de fuentes no estructuradas

4. **Error Handler Service**
   - Captura y clasificación centralizada de errores
   - Estrategias de recuperación automática
   - Análisis de errores con IA

5. **Adaptive Learning Service**
   - Mejora continua de modelos
   - Análisis de feedback de usuarios
   - Ajuste de parámetros de estimación

### Infraestructura

1. **Docker**
   - Imágenes base optimizadas
   - Dockerfiles específicos para cada servicio
   - Gestión de volúmenes para persistencia

2. **Kubernetes**
   - Despliegue automatizado
   - Escalado horizontal basado en métricas
   - Gestión de configuración y secretos
   - Ingress para enrutamiento externo

3. **Monitorización y Observabilidad**
   - Prometheus para recolección de métricas
   - Grafana para visualización
   - Jaeger para rastreo distribuido
   - Alertas configurables

4. **Base de Datos**
   - MongoDB para almacenamiento principal
   - Capa de abstracción de conexión con reintentos
   - Vector DB integrada para búsquedas semánticas

## Despliegue en Docker

Para desplegar el sistema completo usando Docker:

```bash
# Construir las imágenes
./docker-build.sh

# Iniciar los servicios
./start-services.sh
```

## Despliegue en Kubernetes

Para desplegar en Kubernetes:

```bash
# Aplicar configuraciones
cd k8s
./deploy-kubernetes.sh
```

## Monitorización

La monitorización está disponible en:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000
- Jaeger UI: http://localhost:16686

## Configuración

### Variables de Entorno

El sistema utiliza las siguientes variables de entorno principales:

```
OPENAI_API_KEY=sk-your-key
ANTHROPIC_API_KEY=sk-ant-your-key
MISTRAL_API_KEY=your-key
RABBITMQ_PASSWORD=custom-password
MONGO_PASSWORD=mongo-password
```

Una plantilla completa está disponible en `.env.example`

## Dependencias Externas

- RabbitMQ (Message Broker)
- MongoDB (Base de datos)
- Servicios de IA (OpenAI, Anthropic, Mistral)

## Buenas Prácticas

1. **Escalabilidad**
   - Los servicios críticos tienen autoscaling configurado
   - Los recursos están ajustados para optimizar costos

2. **Resiliencia**
   - Reintentos automatizados en conexiones
   - Health checks en todos los servicios
   - Circuit breakers para prevenir cascadas de fallos

3. **Seguridad**
   - Secretos gestionados con Kubernetes Secrets
   - Comunicación cifrada entre servicios
   - Política de privilegios mínimos

4. **Rendimiento**
   - Caché distribuida para reducir llamadas API costosas
   - Optimización de imágenes Docker
   - Recursos definidos por servicio según necesidades

## Diagrama de Arquitectura

```
┌────────────────┐     ┌───────────────┐     ┌───────────────┐
│  API Gateway   │────▶│   RabbitMQ    │◀───▶│ DeepSearch    │
└────────────────┘     └───────────────┘     └───────────────┘
        ▲                      ▲                     ▲
        │                      │                     │
        ▼                      ▼                     ▼
┌────────────────┐     ┌───────────────┐     ┌───────────────┐
│  Prometheus    │     │ Unstructured  │     │  MongoDB      │
└────────────────┘     │ Input Service │     └───────────────┘
        ▲               └───────────────┘            ▲
        │                      ▲                     │
        ▼                      │                     ▼
┌────────────────┐             │            ┌───────────────┐
│    Grafana     │             ▼            │ Error Handler │
└────────────────┘     ┌───────────────┐    └───────────────┘
                       │  Adaptive     │
                       │  Learning     │
                       └───────────────┘
```

## Solución de Problemas

### Troubleshooting común

1. **Servicio no disponible**
   - Verificar logs: `kubectl logs -n owl-fenc <pod-name>`
   - Comprobar health check: `kubectl describe pod -n owl-fenc <pod-name>`

2. **Problemas de conexión entre servicios**
   - Verificar DNS: `kubectl exec -it -n owl-fenc <pod-name> -- nslookup <service-name>`
   - Comprobar conectividad: `kubectl exec -it -n owl-fenc <pod-name> -- curl <service-name>:<port>/health`

3. **Errores en llamadas a API externas**
   - Verificar secretos: `kubectl describe secret -n owl-fenc owl-fenc-secrets`
   - Comprobar logs del servicio específico

## Referencias

- [Documentación de Kubernetes](https://kubernetes.io/docs/)
- [Docker Compose Reference](https://docs.docker.com/compose/)
- [Prometheus Documentation](https://prometheus.io/docs/introduction/overview/)
- [Grafana Documentation](https://grafana.com/docs/)
- [MongoDB Documentation](https://docs.mongodb.com/)
