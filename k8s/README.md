# Testing locally with minikube

This spins up all four microservices — event, program, registration, and
analytics — **plus a throwaway in-cluster SQL Server container and
ClickHouse** (SQL Server with the same shared `eventsdb` database you'll
create on Azure) so you can test the whole system — including the Event ↔
Registration seat-reservation call — before touching the real Azure
database.

Nothing here changes application code: services connect using the same
`DB_HOST`/`DB_NAME`/etc. env vars either way. Locally they point at the
in-cluster `mssql` Service; on Azure they point at your Azure SQL Database
server. ClickHouse, unlike the SQL Server-backed services, runs in-cluster
on both minikube and AKS — analytics data is append-only/analytical, not a
candidate for the managed Azure database.

## Prerequisites

- [minikube](https://minikube.sigstone.dev/docs/start/) installed
- [kubectl](https://kubernetes.io/docs/tasks/tools/) installed
- Docker installed (minikube's default driver)

## Quick start

```bash
cd event-microservices/k8s
./setup-minikube.sh
```

This script:
1. Starts minikube if it isn't already running.
2. Points your local `docker` CLI at minikube's internal Docker daemon
   (so images are built directly into the cluster — no registry needed).
3. Builds the four service images (`event-service:local`,
   `program-service:local`, `registration-service:local`,
   `analytics-service:local`).
4. Applies the namespace, SQL Server, ClickHouse, and all four service
   manifests, then waits for the `mssql-init-db` Job to create the three
   application databases.
5. Runs one-shot Jobs that apply each service's `schema.sql`.
6. Prints `kubectl port-forward` commands so you can hit the services from
   `localhost`.

## Manual step-by-step (if you'd rather not use the script)

```bash
# 1. Start minikube
minikube start

# 2. Build images into minikube's docker daemon
eval $(minikube docker-env)
docker build -t event-service:local ../event-service
docker build -t program-service:local ../program-service
docker build -t registration-service:local ../registration-service
docker build -t analytics-service:local ../analytics-service

# 3. Create namespace + SQL Server + ClickHouse, wait for them to come up
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-mssql.yaml
kubectl apply -f 07-clickhouse.yaml
kubectl -n events-platform rollout status deployment/mssql
kubectl -n events-platform rollout status deployment/clickhouse
kubectl -n events-platform wait --for=condition=complete job/mssql-init-db

# 4. Deploy the four services
kubectl apply -f 02-event-service.yaml
kubectl apply -f 03-program-service.yaml
kubectl apply -f 04-registration-service.yaml
kubectl apply -f 08-analytics-service.yaml

# 5. Run migrations (creates tables/schema in each database)
kubectl apply -f 05-migration-jobs.yaml
kubectl -n events-platform get jobs   # wait until all show COMPLETIONS 1/1
```

## Viewing the website

The frontend (the templatemo event page, wired up to fetch live data) is
deployed as its own Deployment/Service and reverse-proxies `/api/*` to the
four backend services — no CORS setup needed, no backend URLs hardcoded
into the page. This includes `/api/analytics/track`, which the page calls
directly (fire-and-forget, via `sendBeacon`) to record event page views,
ticket-interest clicks, and registration funnel steps.

```bash
minikube service frontend -n events-platform
```

This opens the site in your browser. On load it calls the Event Service
for the soonest upcoming event, the Program Service for that event's
agenda, and populates the page. If no event exists yet (fresh cluster),
you'll see a red banner and the template's original placeholder content —
seed some data first:

```bash
kubectl -n events-platform port-forward svc/event-service 4001:4001 &
kubectl -n events-platform port-forward svc/program-service 4002:4002 &

curl -X POST http://localhost:4001/events \
  -H "Content-Type: application/json" \
  -d '{"title":"CloudCon 2026","venue":"BMICH, Colombo","dateTime":"2026-09-15T09:00:00Z","ticketPrice":25.00,"capacity":100}'
# note the returned "eventId", use it below

curl -X POST http://localhost:4002/programs \
  -H "Content-Type: application/json" \
  -d '{"eventId":1,"day":"2026-09-15","track":"Cloud Computing Track","session":"Intro to Kubernetes","speakerName":"Jane Doe","startTime":"09:30","endTime":"10:30"}'
```

Refresh the site and it'll show the event title, venue, date, ticket
price, live seat count, and the agenda tab for that day. To view a
specific event instead of the soonest upcoming one, append `?eventId=N` to
the site URL.

The register form on the page posts directly to the Registration Service
(through the same `/api` proxy) and will decrement the live seat count.

## Talking to the services

Open a port-forward per service (each in its own terminal):

```bash
kubectl -n events-platform port-forward svc/event-service 4001:4001
kubectl -n events-platform port-forward svc/program-service 4002:4002
kubectl -n events-platform port-forward svc/registration-service 4003:4003
kubectl -n events-platform port-forward svc/analytics-service 4004:4004
```

Then hit them like any local API:

```bash
# Health checks
curl http://localhost:4001/health
curl http://localhost:4002/health
curl http://localhost:4003/health
curl http://localhost:4004/health

# Create an event
curl -X POST http://localhost:4001/events \
  -H "Content-Type: application/json" \
  -d '{"title":"CloudCon 2026","venue":"BMICH, Colombo","dateTime":"2026-09-15T09:00:00Z","ticketPrice":25.00,"capacity":100}'

# Add a program/agenda item (use the eventId returned above)
curl -X POST http://localhost:4002/programs \
  -H "Content-Type: application/json" \
  -d '{"eventId":1,"day":"2026-09-15","track":"Cloud Computing Track","session":"Intro to Kubernetes","speakerName":"Jane Doe","startTime":"09:30","endTime":"10:30"}'

# Register an attendee — this internally calls event-service to reserve seats
curl -X POST http://localhost:4003/registrations \
  -H "Content-Type: application/json" \
  -d '{"eventId":1,"name":"John Smith","email":"john@example.com","ticketCount":2}'

# Confirm seatsAvailable dropped by 2
curl http://localhost:4001/events/1

# Record an analytics event, then check the per-event summary
curl -X POST http://localhost:4004/track \
  -H "Content-Type: application/json" \
  -d '{"eventType":"event_view","eventId":1,"sessionId":"manual-test"}'
curl http://localhost:4004/track/1/summary
```

Alternatively, skip port-forwarding for a single service with:

```bash
minikube service event-service -n events-platform --url
```

## Watching logs / debugging

```bash
kubectl -n events-platform get pods
kubectl -n events-platform logs -f deployment/registration-service
kubectl -n events-platform logs -f deployment/mssql
kubectl -n events-platform logs -f deployment/analytics-service
kubectl -n events-platform logs -f deployment/clickhouse
```

If a pod is stuck in `ImagePullBackOff`, you likely forgot to run
`eval $(minikube docker-env)` before `docker build` — the image has to be
built inside minikube's daemon since `imagePullPolicy: Never` is set (no
registry push needed for local testing).

## Rebuilding after a code change

```bash
eval $(minikube docker-env)
docker build -t event-service:local ../event-service
kubectl -n events-platform rollout restart deployment/event-service
```
(swap in `program-service` / `registration-service` as needed)

## Tearing down

```bash
kubectl delete namespace events-platform
# and, if you're done testing entirely:
minikube stop
```

## Switching to Azure SQL Database once you're happy with local testing

The only things that change are the ConfigMap/Secret values — the app code
and Docker images are identical:

- `DB_HOST` → your Azure SQL server hostname (`*.database.windows.net`)
- `DB_ENCRYPT` → `true`
- `DB_USER` / `DB_PASSWORD` → your Azure admin credentials (put these in a
  proper Secret, not committed to source control)
- `EVENT_SERVICE_URL` (registration-service only) → the Event Service's
  reachable address in whatever Azure compute you deploy to (AKS internal
  DNS, App Service URL, or Container Apps internal ingress)
