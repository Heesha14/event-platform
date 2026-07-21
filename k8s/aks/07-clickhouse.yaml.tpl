# ClickHouse runs in-cluster here too (not an Azure-managed service) -
# analytics data is append-only/analytical, unlike the transactional data
# which lives on the real Azure SQL Database server. Image is pulled
# straight from Docker Hub, no ACR build needed.
apiVersion: v1
kind: ConfigMap
metadata:
  name: clickhouse-config
  namespace: events-platform
data:
  CLICKHOUSE_DB: "${CLICKHOUSE_DB}"
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: clickhouse-pvc
  namespace: events-platform
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 5Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clickhouse
  namespace: events-platform
spec:
  replicas: 1
  selector:
    matchLabels:
      app: clickhouse
  strategy:
    type: Recreate
  template:
    metadata:
      labels:
        app: clickhouse
    spec:
      containers:
        - name: clickhouse
          image: clickhouse/clickhouse-server:24.8-alpine
          ports:
            - containerPort: 8123
            - containerPort: 9000
          envFrom:
            - configMapRef:
                name: clickhouse-config
          env:
            - name: CLICKHOUSE_USER
              valueFrom:
                secretKeyRef:
                  name: clickhouse-credentials
                  key: CLICKHOUSE_USER
            - name: CLICKHOUSE_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: clickhouse-credentials
                  key: CLICKHOUSE_PASSWORD
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 1Gi
          volumeMounts:
            - name: clickhouse-storage
              mountPath: /var/lib/clickhouse
          readinessProbe:
            httpGet:
              path: /ping
              port: 8123
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /ping
              port: 8123
            initialDelaySeconds: 15
            periodSeconds: 10
      volumes:
        - name: clickhouse-storage
          persistentVolumeClaim:
            claimName: clickhouse-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: clickhouse
  namespace: events-platform
spec:
  selector:
    app: clickhouse
  ports:
    - name: http
      port: 8123
      targetPort: 8123
    - name: native
      port: 9000
      targetPort: 9000
