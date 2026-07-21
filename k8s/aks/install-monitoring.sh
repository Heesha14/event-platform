#!/usr/bin/env bash
# Installs kube-prometheus-stack (Prometheus + Grafana) into the AKS cluster
# via Helm, sized down for a small node pool. Run this after deploy-aks.sh
# has created the cluster (this script just needs kubeconfig credentials
# already fetched by that script).
#
# Usage:
#   ./install-monitoring.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="monitoring"
RELEASE="monitoring"

for cmd in helm kubectl; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Missing required tool: $cmd"; exit 1; }
done

echo "==> Adding/updating the prometheus-community Helm repo"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts >/dev/null 2>&1 || true
helm repo update prometheus-community >/dev/null

echo "==> Creating namespace: $NAMESPACE"
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

echo "==> Installing/upgrading kube-prometheus-stack (release: $RELEASE)"
helm upgrade --install "$RELEASE" prometheus-community/kube-prometheus-stack \
  --namespace "$NAMESPACE" \
  -f "$SCRIPT_DIR/monitoring-values.yaml" \
  --wait --timeout 10m

echo ""
echo "==> Done. Apply the ServiceMonitors (part of deploy-aks.sh's *.yaml.tpl loop, or standalone):"
echo "    envsubst < $SCRIPT_DIR/09-monitoring.yaml.tpl | kubectl apply -f -"
echo ""
echo "==> Reach Grafana:"
echo "    kubectl -n $NAMESPACE port-forward svc/$RELEASE-grafana 3000:80"
echo "    then open http://localhost:3000  (user: admin)"
echo "    kubectl -n $NAMESPACE get secret $RELEASE-grafana -o jsonpath='{.data.admin-password}' | base64 -d; echo"
