apiVersion: v1
kind: ConfigMap
metadata:
  name: analytics-service-config
  namespace: events-platform
data:
  PORT: "4004"
  CLICKHOUSE_URL: "http://clickhouse:8123"
  CLICKHOUSE_DB: "${CLICKHOUSE_DB}"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics-service
  namespace: events-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: analytics-service
  template:
    metadata:
      labels:
        app: analytics-service
    spec:
      containers:
        - name: analytics-service
          image: ${ACR_LOGIN_SERVER}/analytics-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 4004
          envFrom:
            - configMapRef:
                name: analytics-service-config
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
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /health
              port: 4004
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 4004
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: analytics-service
  namespace: events-platform
spec:
  selector:
    app: analytics-service
  ports:
    - port: 4004
      targetPort: 4004
  type: ClusterIP
