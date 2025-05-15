#!/bin/bash
# Deploy Kubernetes resources for owl-fenc microservices

# Colores para salida
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Iniciando despliegue de microservicios Owl-Fenc en Kubernetes...${NC}\n"

# Verificar que kubectl está disponible
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}❌ kubectl no está instalado. Por favor, instala kubectl para continuar.${NC}"
    exit 1
fi

# Crear namespace si no existe
echo -e "${YELLOW}Creando namespace...${NC}"
kubectl create namespace owl-fenc --dry-run=client -o yaml | kubectl apply -f -
echo -e "${GREEN}✅ Namespace configurado${NC}\n"

# Aplicar ConfigMaps y Secrets
echo -e "${YELLOW}Aplicando ConfigMaps y Secrets...${NC}"
kubectl apply -f k8s/config/configmap.yaml
kubectl apply -f k8s/config/secrets.yaml
echo -e "${GREEN}✅ ConfigMaps y Secrets aplicados${NC}\n"

# Crear PVCs (Persistent Volume Claims)
echo -e "${YELLOW}Creando Persistent Volume Claims...${NC}"
kubectl apply -f k8s/storage/deepsearch-cache-pvc.yaml
kubectl apply -f k8s/storage/error-logs-pvc.yaml
echo -e "${GREEN}✅ PVCs creados${NC}\n"

# Desplegar servicios
echo -e "${YELLOW}Desplegando servicios...${NC}"
declare -a services=(
    "deepsearch-engine-service.yaml"
    "unstructured-input-service.yaml"
    "error-handler-service.yaml"
)

for service in "${services[@]}"; do
    echo -e "  - Desplegando $service..."
    kubectl apply -f "k8s/services/$service"
done
echo -e "${GREEN}✅ Servicios desplegados${NC}\n"

# Desplegar deployments
echo -e "${YELLOW}Desplegando deployments...${NC}"
declare -a deployments=(
    "deepsearch-engine-deployment.yaml"
    "unstructured-input-deployment.yaml"
    "error-handler-deployment.yaml"
)

for deployment in "${deployments[@]}"; do
    echo -e "  - Desplegando $deployment..."
    kubectl apply -f "k8s/services/$deployment"
done
echo -e "${GREEN}✅ Deployments desplegados${NC}\n"

# Configurar autoscaling
echo -e "${YELLOW}Configurando autoscaling...${NC}"
declare -a hpas=(
    "deepsearch-hpa.yaml"
    "unstructured-input-hpa.yaml"
    "error-handler-hpa.yaml"
)

for hpa in "${hpas[@]}"; do
    echo -e "  - Aplicando $hpa..."
    kubectl apply -f "k8s/autoscaling/$hpa"
done
echo -e "${GREEN}✅ Autoscaling configurado${NC}\n"

# Aplicar Ingress
echo -e "${YELLOW}Configurando Ingress...${NC}"
kubectl apply -f k8s/ingress/ingress.yaml
echo -e "${GREEN}✅ Ingress configurado${NC}\n"

# Mostrar estado de los recursos
echo -e "${BLUE}📊 Estado de los recursos desplegados:${NC}\n"
echo -e "${YELLOW}Pods:${NC}"
kubectl get pods -n owl-fenc

echo -e "\n${YELLOW}Servicios:${NC}"
kubectl get services -n owl-fenc

echo -e "\n${YELLOW}Deployments:${NC}"
kubectl get deployments -n owl-fenc

echo -e "\n${YELLOW}HPAs:${NC}"
kubectl get hpa -n owl-fenc

echo -e "\n${YELLOW}Ingress:${NC}"
kubectl get ingress -n owl-fenc

echo -e "\n${GREEN}🎉 Despliegue completado!${NC}"
echo -e "${BLUE}Para acceder a los servicios, utiliza la URL definida en el Ingress: owl-fenc.local${NC}"
echo -e "${YELLOW}Nota: Asegúrate de que el dominio 'owl-fenc.local' esté configurado en tu archivo hosts para pruebas locales.${NC}"
