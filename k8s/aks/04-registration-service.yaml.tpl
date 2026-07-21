apiVersion: v1
kind: ConfigMap
metadata:
  name: registration-service-config
  namespace: events-platform
data:
  PORT: "4003"
  DB_HOST: "${SQL_HOST}"
  DB_PORT: "1433"
  DB_NAME: "eventplatformdb"
  DB_ENCRYPT: "true"
  EVENT_SERVICE_URL: "http://event-service:4001"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: registration-service-${DEPLOY_COLOR}
  namespace: events-platform
  labels:
    app: registration-service
    color: ${DEPLOY_COLOR}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: registration-service
      color: ${DEPLOY_COLOR}
  template:
    metadata:
      labels:
        app: registration-service
        color: ${DEPLOY_COLOR}
    spec:
      containers:
        - name: registration-service
          image: ${ACR_LOGIN_SERVER}/registration-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 4003
          envFrom:
            - configMapRef:
                name: registration-service-config
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
              port: 4003
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 4003
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: registration-service
  namespace: events-platform
  labels:
    app: registration-service
spec:
  selector:
    app: registration-service
    color: ${DEPLOY_COLOR}
  ports:
    - name: http
      port: 4003
      targetPort: 4003
  type: ClusterIP
