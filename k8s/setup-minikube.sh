#!/usr/bin/env bash
# Spins up the full event platform on a local minikube cluster for testing
# before deploying to Azure. Safe to re-run.
set -euo pipefail

NAMESPACE="events-platform"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Checking minikube status"
if ! minikube status >/dev/null 2>&1; then
  echo "==> Starting minikube"
  minikube start --cpus=4 --memory=6g
fi

echo "==> Pointing local docker CLI at minikube's docker daemon"
eval "$(minikube -p minikube docker-env)"

echo "==> Building service images inside minikube"
docker build -t event-service:local "$ROOT_DIR/event-service"
docker build -t program-service:local "$ROOT_DIR/program-service"
docker build -t registration-service:local "$ROOT_DIR/registration-service"
docker build -t analytics-service:local "$ROOT_DIR/analytics-service"
docker build -t frontend:local "$ROOT_DIR/frontend"

echo "==> Applying Kubernetes manifests"
kubectl apply -f "$SCRIPT_DIR/00-namespace.yaml"
kubectl apply -f "$SCRIPT_DIR/01-mssql.yaml"
kubectl apply -f "$SCRIPT_DIR/07-clickhouse.yaml"

echo "==> Waiting for SQL Server and ClickHouse to be ready"
kubectl -n "$NAMESPACE" rollout status deployment/mssql --timeout=120s
kubectl -n "$NAMESPACE" rollout status deployment/clickhouse --timeout=120s

echo "==> Waiting for the eventsdb database to be created"
kubectl -n "$NAMESPACE" wait --for=condition=complete job/mssql-init-db --timeout=120s

kubectl apply -f "$SCRIPT_DIR/02-event-service.yaml"
kubectl apply -f "$SCRIPT_DIR/03-program-service.yaml"
kubectl apply -f "$SCRIPT_DIR/04-registration-service.yaml"
kubectl apply -f "$SCRIPT_DIR/08-analytics-service.yaml"
kubectl apply -f "$SCRIPT_DIR/06-frontend.yaml"

echo "==> Waiting for services to be ready"
kubectl -n "$NAMESPACE" rollout status deployment/event-service --timeout=120s
kubectl -n "$NAMESPACE" rollout status deployment/program-service --timeout=120s
kubectl -n "$NAMESPACE" rollout status deployment/registration-service --timeout=120s
kubectl -n "$NAMESPACE" rollout status deployment/analytics-service --timeout=120s
kubectl -n "$NAMESPACE" rollout status deployment/frontend --timeout=120s

echo "==> Running database migrations"
kubectl -n "$NAMESPACE" delete job event-service-migrate program-service-migrate registration-service-migrate analytics-service-migrate --ignore-not-found
kubectl apply -f "$SCRIPT_DIR/05-migration-jobs.yaml"
kubectl -n "$NAMESPACE" wait --for=condition=complete job/event-service-migrate --timeout=60s
kubectl -n "$NAMESPACE" wait --for=condition=complete job/program-service-migrate --timeout=60s
kubectl -n "$NAMESPACE" wait --for=condition=complete job/registration-service-migrate --timeout=60s
kubectl -n "$NAMESPACE" wait --for=condition=complete job/analytics-service-migrate --timeout=60s

echo ""
echo "==> All set. Pods in $NAMESPACE:"
kubectl -n "$NAMESPACE" get pods

echo ""
echo "==> Open the website:"
echo "  minikube service frontend -n $NAMESPACE"
echo ""
echo "==> To reach the raw APIs directly from your machine, run in separate terminals:"
echo "  kubectl -n $NAMESPACE port-forward svc/event-service 4001:4001"
echo "  kubectl -n $NAMESPACE port-forward svc/program-service 4002:4002"
echo "  kubectl -n $NAMESPACE port-forward svc/registration-service 4003:4003"
echo "  kubectl -n $NAMESPACE port-forward svc/analytics-service 4004:4004"
