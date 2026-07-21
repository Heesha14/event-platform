# Deploying to Azure Kubernetes Service (AKS)

This takes what you validated on minikube and deploys it for real: images
built and pushed to Azure Container Registry (ACR), services running on
AKS, and pointed at your actual Azure SQL Database instead of the
in-cluster SQL Server container used for local testing.

Nothing in the application code changes — only the ConfigMap values
(`DB_HOST`, `DB_ENCRYPT`) and image references differ from the minikube
manifests in `../`. ClickHouse (backing analytics-service) runs in-cluster
on AKS the same way it does on minikube — it isn't a stand-in for a managed
Azure resource, so there's no separate "real" version to switch to.

## What's different from the minikube setup

| | minikube (`k8s/`) | AKS (`k8s/aks/`) |
|---|---|---|
| Database | In-cluster throwaway SQL Server container | Your real Azure SQL Database |
| ClickHouse | In-cluster, dummy credentials | In-cluster, credentials from `aks.env` |
| Images | Built into minikube's local docker daemon, `imagePullPolicy: Never` | Built in Azure Container Registry, `imagePullPolicy: IfNotPresent` |
| Frontend exposure | `NodePort` / `minikube service` | `LoadBalancer` (gets a real public IP) |
| Secrets | Hardcoded local-only passwords in `01-mssql.yaml` / `07-clickhouse.yaml` | Created imperatively with `kubectl create secret`, never committed |
| Replicas | 1 per service | 2 per service (basic HA) |

## Prerequisites

- Azure CLI (`az`), logged in: `az login`
- `kubectl`
- `envsubst` (part of `gettext` — on macOS: `brew install gettext && brew link --force gettext`; on Debian/Ubuntu: `apt install gettext-base`)
- An Azure SQL Database logical server already created (see the root `README.md` step 1) with the shared `eventplatformdb` database already created on it

## 1. Configure

```bash
cd k8s/aks
cp aks.env.example aks.env
```

Edit `aks.env`:
- `RESOURCE_GROUP`, `LOCATION` — reuse the same resource group as your SQL server if you want everything together
- `AKS_CLUSTER_NAME` — anything you like
- `ACR_NAME` — must be globally unique (letters/numbers only)
- `SQL_SERVER_NAME` / `SQL_HOST` — your existing logical server's name and hostname
- `SQL_ADMIN_USER` / `SQL_ADMIN_PASSWORD` — your Azure SQL admin credentials
- `CLICKHOUSE_DB` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` — credentials for the in-cluster ClickHouse the script creates; pick your own password, there's no external server to match

`aks.env` is where secrets live locally — don't commit it (already covered by `.gitignore` if you're using git; if not, just don't check it in).

## 2. Deploy

```bash
./deploy-aks.sh
```

This one script:
1. Creates the resource group (if needed), ACR, and AKS cluster (2× `Standard_D2ls_v5` nodes — small and cheap; adjust `--node-vm-size`/`--node-count` in the script if you need more)
2. Attaches ACR to AKS so nodes can pull images without extra pull secrets
3. Fetches AKS credentials into your local `kubeconfig`
4. Builds all five images locally with Docker and pushes them to ACR (requires Docker running locally; `az acr build`/ACR Tasks is blocked on some subscriptions — see "Building locally" below)
5. Opens the Azure SQL firewall to Azure services (see the networking note below)
6. Creates the `azure-sql-credentials` and `clickhouse-credentials` Secrets directly with `kubectl create secret` (never written to a yaml file)
7. Renders the `*.yaml.tpl` files with `envsubst` and applies them
8. Runs the migration Jobs
9. Waits for and prints the frontend's public IP

First run takes ~10-15 minutes (mostly AKS cluster creation). Re-running the script is safe — it skips creating resources that already exist and just re-applies manifests/rebuilds images.

## 3. Seed data and visit the site

Same as local testing, just against the public IP the script prints:

```bash
curl -X POST http://<PUBLIC_IP>/api/events \
  -H "Content-Type: application/json" \
  -d '{"title":"CloudCon 2026","venue":"BMICH, Colombo","dateTime":"2026-09-15T09:00:00Z","ticketPrice":25.00,"capacity":100}'

curl -X POST http://<PUBLIC_IP>/api/programs \
  -H "Content-Type: application/json" \
  -d '{"eventId":1,"day":"2026-09-15","track":"Cloud Computing Track","session":"Intro to Kubernetes","speakerName":"Jane Doe","startTime":"09:30","endTime":"10:30"}'
```

Then open `http://<PUBLIC_IP>` in a browser.

## Networking note: AKS ↔ Azure SQL Database

The script opens the logical server's firewall with the **"Allow public
access from any Azure service"** rule (`0.0.0.0`-`0.0.0.0`), which is the
simplest way to let a freshly-created AKS cluster reach the database
without knowing its exact egress IP ahead of time. This is fine for
development/free-tier use, but it does mean *any* Azure resource
(anywhere, any subscription) could attempt to connect — the database
credentials are still required, but for production you'd want to
tighten this:

- **Narrower firewall rule**: find your AKS cluster's actual outbound IP
  (`az aks show --resource-group $RESOURCE_GROUP --name $AKS_CLUSTER_NAME --query "networkProfile.loadBalancerProfile.effectiveOutboundIPs"`)
  and create a firewall rule scoped to just that IP instead of `0.0.0.0-0.0.0.0`.
- **VNet integration**: put both AKS and the SQL server in the same
  (or peered) VNet with private endpoint access — no public firewall rule
  needed at all. This is the recommended production setup but is more
  involved to script generically here.

## Building locally instead of `az acr build`

If you'd rather build with your local Docker and push yourself:

```bash
az acr login --name $ACR_NAME
docker build -t $ACR_NAME.azurecr.io/event-service:v1 ../../event-service
docker push $ACR_NAME.azurecr.io/event-service:v1
# repeat for program-service, registration-service, analytics-service, frontend
```

Then run `deploy-aks.sh` — it will find the images already in ACR and skip
straight past the `az acr build` output (or just comment out the four
`az acr build` lines in the script and run the rest manually).

## Updating after a code change

```bash
az acr build --registry $ACR_NAME --image event-service:v1 ../../event-service
kubectl -n events-platform rollout restart deployment/event-service
```
(swap in the other service names as needed; bump `IMAGE_TAG` in `aks.env`
if you want distinct, non-overwritten tags per release)

## Cleaning up (to avoid ongoing charges)

```bash
az aks delete --name $AKS_CLUSTER_NAME --resource-group $RESOURCE_GROUP --yes
az acr delete --name $ACR_NAME --resource-group $RESOURCE_GROUP --yes
# Only if you're done with the database entirely:
# az sql server delete --resource-group $RESOURCE_GROUP --name $SQL_SERVER_NAME --yes
```

AKS node VMs (unlike the AKS control plane) are billed hourly — the two
`Standard_D2ls_v5` nodes are the main cost here. Delete the cluster (or scale
the node pool to 0 / stop it) when you're not actively using it:

```bash
az aks stop --name $AKS_CLUSTER_NAME --resource-group $RESOURCE_GROUP
az aks start --name $AKS_CLUSTER_NAME --resource-group $RESOURCE_GROUP
```
