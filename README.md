# Event Platform Microservices

Three independent Node.js/Express microservices that share a single database
(`eventsdb`) on one Azure SQL Database logical server, to keep costs down for
local/dev use. Each service still owns its own tables and only reads/writes
them, so this is safe to split back into per-service databases later if
needed — just give each service its own `DB_NAME`.

| Service               | Port | Database | Responsibility                                  |
|------------------------|------|----------|--------------------------------------------------|
| event-service          | 4001 | eventsdb | Event ID, Title, Venue, Date/Time, Price, Capacity, Seats Available |
| program-service        | 4002 | eventsdb | Day, Track, Session, Speaker Name, Times          |
| registration-service   | 4003 | eventsdb | Registration ID, Event ID, Name, Email, Ticket Count, Timestamp |
| analytics-service      | 4004 | analytics (ClickHouse) | Event page views, ticket-interest clicks, registration funnel |

**analytics-service** is a fourth, independent service backed by ClickHouse
instead of Azure SQL Database, since the data it collects (raw frontend events) is
append-only and analytical rather than transactional. The frontend posts to
it via `/api/analytics/track`; it never touches `eventsdb`.

Each service owns its own tables (`events`, `programs`, `registrations` —
names don't collide) and never touches another service's tables directly.
**registration-service** calls **event-service** over HTTP
(`PATCH /events/:id/seats`) to atomically reserve/release seats when a
registration is created or cancelled — this keeps `seats_available`
consistent without services reaching into each other's tables.

## 1. Azure SQL Database setup

One logical server (Azure's free-tier-eligible General Purpose Serverless
tier works well here) hosts the single shared database:

```bash
# Create the logical server (one-time)
az sql server create \
  --resource-group <your-rg> \
  --name <your-server-name> \
  --location <your-region> \
  --admin-user <admin-user> \
  --admin-password <admin-password>

# Allow your IP / Azure services through the firewall
az sql server firewall-rule create \
  --resource-group <your-rg> \
  --server <your-server-name> \
  --name allow-my-ip \
  --start-ip-address <your-ip> \
  --end-ip-address <your-ip>

# Create the shared database (General Purpose Serverless, Gen5, 1 vCore)
az sql db create --resource-group <your-rg> --server <your-server-name> --name eventsdb --edition GeneralPurpose --compute-model Serverless --family Gen5 --capacity 1
```

## 2. Configure each service

Copy each service's `.env.example` to `.env` and fill in your server name,
admin user, and password:

```bash
cp event-service/.env.example event-service/.env
cp program-service/.env.example program-service/.env
cp registration-service/.env.example registration-service/.env
cp analytics-service/.env.example analytics-service/.env
```

`registration-service/.env` also needs `EVENT_SERVICE_URL` pointing at
wherever event-service is reachable (e.g. `http://localhost:4001` locally,
or its internal URL/App Service name in Azure).

`analytics-service/.env` points at a ClickHouse instance instead of Azure SQL Database
— the docker-compose file below runs one locally for you, so the defaults
in `.env.example` work as-is for local development.

## 3. Install dependencies and run migrations

From inside each service folder:

```bash
cd event-service && npm install && npm run migrate && cd ..
cd program-service && npm install && npm run migrate && cd ..
cd registration-service && npm install && npm run migrate && cd ..
cd analytics-service && npm install && npm run migrate && cd ..
```

`npm run migrate` applies that service's `schema.sql` to its database.
For analytics-service, ClickHouse must already be reachable (e.g. via
`docker compose up clickhouse` first) before running migrate.

## 4. Run locally

Either run each service directly:

```bash
cd event-service && npm start        # http://localhost:4001
cd program-service && npm start      # http://localhost:4002
cd registration-service && npm start # http://localhost:4003
cd analytics-service && npm start    # http://localhost:4004
```

...or with Docker Compose (set `DB_HOST`, `DB_USER`, `DB_PASSWORD` as env vars
or in a `.env` file next to `docker-compose.yml`):

```bash
docker compose up --build
```

## 5. API summary

**Event Service** (`/events`)
- `POST /events` — create `{ title, venue, dateTime, ticketPrice, capacity }`
- `GET /events` — list (`?upcoming=true` to filter)
- `GET /events/:id`
- `PUT /events/:id` — partial update
- `DELETE /events/:id`
- `PATCH /events/:id/seats` — internal: `{ delta }` (negative reserves, positive releases)

**Program Service** (`/programs`)
- `POST /programs` — create `{ eventId, day, track, session, speakerName, startTime, endTime }`
- `GET /programs` — list (`?eventId=`, `?day=`, `?track=` filters)
- `GET /programs/:id`
- `PUT /programs/:id` — partial update
- `DELETE /programs/:id`

**Registration Service** (`/registrations`)
- `POST /registrations` — create `{ eventId, name, email, ticketCount }` (reserves seats via Event Service first)
- `GET /registrations` — list (`?eventId=`, `?email=` filters)
- `GET /registrations/:id`
- `DELETE /registrations/:id` — cancels and releases seats back to the event

**Analytics Service** (`/track`)
- `POST /track` — record one event `{ eventType, eventId, sessionId, ticketCount?, referrer? }`
  where `eventType` is one of `event_view`, `ticket_interest`, `registration_started`, `registration_completed`
- `GET /track/:eventId/summary` — per-event-type counts for one event (quick sanity check, not a full dashboard)

Every service also exposes `GET /health` for load-balancer/App Service health checks.

## 6. Deploying to Azure

Each service is a standalone Docker image (`Dockerfile` included in each
folder), so any of these work well on the free/low tiers:

- **Azure App Service (Linux, container or Node runtime)** — one App Service
  per microservice; set the same env vars from `.env.example` in each app's
  Configuration blade.
- **Azure Container Apps** — good fit if you want services to scale to zero.

Whichever you choose, make sure the SQL server's firewall allows
"Allow public access from any Azure service" (or add the outbound IPs of
your specific compute) so the three services can reach the database.
