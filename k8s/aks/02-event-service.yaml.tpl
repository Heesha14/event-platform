apiVersion: v1
kind: ConfigMap
metadata:
  name: event-service-config
  namespace: events-platform
data:
  PORT: "4001"
  DB_HOST: "${SQL_HOST}"
  DB_PORT: "1433"
  DB_NAME: "eventplatformdb"
  DB_ENCRYPT: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: event-service
  namespace: events-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: event-service
  template:
    metadata:
      labels:
        app: event-service
    spec:
      containers:
        - name: event-service
          image: ${ACR_LOGIN_SERVER}/event-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 4001
          envFrom:
            - configMapRef:
                name: event-service-config
          env:
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: azure-sql-credentials
                  key: DB_USER
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: azure-sql-credentials
                  key: DB_PASSWORD
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
              port: 4001
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 4001
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: event-service
  namespace: events-platform
spec:
  selector:
    app: event-service
  ports:
    - port: 4001
      targetPort: 4001
  type: ClusterIP
