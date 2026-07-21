#!/usr/bin/env bash
# Deploys the event platform to Azure Kubernetes Service (AKS), building
# images in Azure Container Registry (ACR) and pointing the services at
# your real Azure SQL Database.
#
# Prerequisites: az CLI logged in (az login), kubectl, envsubst (gettext).
# Usage:
#   cp aks.env.example aks.env   # then fill in your values
#   ./deploy-aks.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
ENV_FILE="$SCRIPT_DIR/aks.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Copy aks.env.example to aks.env and fill in your values first."
  exit 1
fi
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

for cmd in az kubectl envsubst; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required tool: $cmd"; exit 1; }
done

NAMESPACE="events-platform"
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
export ACR_LOGIN_SERVER  # used by envsubst below

echo "==> Resource group: $RESOURCE_GROUP"
if ! az group show --name "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az group create --name "$RESOURCE_GROUP" --location "$LOCATION" --output none
else
  echo "  (already exists, reusing as-is; its own location may differ from LOCATION — that's fine, resources below are created with an explicit --location)"
fi

echo "==> Azure Container Registry: $ACR_NAME"
if ! az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az acr create --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --location "$LOCATION" --sku Basic --output none
fi

echo "==> AKS cluster: $AKS_CLUSTER_NAME (this can take several minutes on first run)"
if ! az aks show --name "$AKS_CLUSTER_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az aks create \
    --name "$AKS_CLUSTER_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --node-count 2 \
    --node-vm-size Standard_D2ls_v5 \
    --generate-ssh-keys \
    --attach-acr "$ACR_NAME" \
    --output none
else
  # Make sure an already-existing cluster can still pull from this ACR.
  az aks update --name "$AKS_CLUSTER_NAME" --resource-group "$RESOURCE_GROUP" --attach-acr "$ACR_NAME" --output none
fi

echo "==> Fetching AKS credentials into kubeconfig"
az aks get-credentials --name "$AKS_CLUSTER_NAME" --resource-group "$RESOURCE_GROUP" --overwrite-existing

echo "==> Building and pushing images to $ACR_LOGIN_SERVER (local Docker build+push — ACR Tasks/az acr build is blocked on this subscription)"
az acr login --name "$ACR_NAME"
for svc in event-service program-service registration-service analytics-service frontend; do
  docker build -t "$ACR_LOGIN_SERVER/$svc:${IMAGE_TAG}" -t "$ACR_LOGIN_SERVER/$svc:latest" "$ROOT_DIR/$svc"
  docker push "$ACR_LOGIN_SERVER/$svc:${IMAGE_TAG}"
  docker push "$ACR_LOGIN_SERVER/$svc:latest"
done

echo "==> Allowing Azure services (incl. this AKS cluster) through the Azure SQL firewall"
az sql server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --server "$SQL_SERVER_NAME" \
  --name AllowAllAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output none || echo "  (rule may already exist, continuing)"

echo "==> Creating namespace"
kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml"

echo "==> Creating/updating azure-sql-credentials Secret (not stored in any yaml file)"
kubectl create secret generic azure-sql-credentials \
  --namespace "$NAMESPACE" \
  --from-literal=DB_USER="$SQL_ADMIN_USER" \
  --from-literal=DB_PASSWORD="$SQL_ADMIN_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Creating/updating clickhouse-credentials Secret (not stored in any yaml file)"
kubectl create secret generic clickhouse-credentials \
  --namespace "$NAMESPACE" \
  --from-literal=CLICKHOUSE_USER="$CLICKHOUSE_USER" \
  --from-literal=CLICKHOUSE_PASSWORD="$CLICKHOUSE_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Rendering and applying service manifests"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
for tpl in "$SCRIPT_DIR"/*.yaml.tpl; do
  out="$TMP_DIR/$(basename "${tpl%.tpl}")"
  envsubst < "$tpl" > "$out"
  kubectl apply -f "$out"
done

echo "==> Waiting for deployments to be ready"
kubectl -n "$NAMESPACE" rollout status deployment/clickhouse --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/event-service --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/program-service --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/registration-service --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/analytics-service --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/frontend --timeout=180s

echo "==> Running database migrations"
kubectl -n "$NAMESPACE" delete job event-service-migrate program-service-migrate registration-service-migrate analytics-service-migrate --ignore-not-found
envsubst < "$SCRIPT_DIR/05-migration-jobs.yaml.tpl" | kubectl apply -f -
kubectl -n "$NAMESPACE" wait --for=condition=complete job/event-service-migrate --timeout=120s
kubectl -n "$NAMESPACE" wait --for=condition=complete job/program-service-migrate --timeout=120s
kubectl -n "$NAMESPACE" wait --for=condition=complete job/registration-service-migrate --timeout=120s
kubectl -n "$NAMESPACE" wait --for=condition=complete job/analytics-service-migrate --timeout=120s

echo ""
echo "==> Waiting for the frontend's public IP (LoadBalancer)..."
IP=""
for i in $(seq 1 60); do
  IP=$(kubectl -n "$NAMESPACE" get service frontend -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
  if [ -n "$IP" ]; then break; fi
  sleep 5
done

echo ""
if [ -n "${IP:-}" ]; then
  echo "==> Site is live at: http://$IP"
else
  echo "==> Still waiting on the public IP. Check with:"
  echo "    kubectl -n $NAMESPACE get service frontend"
fi
