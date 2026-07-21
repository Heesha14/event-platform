apiVersion: v1
kind: ConfigMap
metadata:
  name: program-service-config
  namespace: events-platform
data:
  PORT: "4002"
  DB_HOST: "${SQL_HOST}"
  DB_PORT: "1433"
  DB_NAME: "eventplatformdb"
  DB_ENCRYPT: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: program-service
  namespace: events-platform
spec:
  replicas: 2
  selector:
    matchLabels:
      app: program-service
  template:
    metadata:
      labels:
        app: program-service
    spec:
      containers:
        - name: program-service
          image: ${ACR_LOGIN_SERVER}/program-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 4002
          envFrom:
            - configMapRef:
                name: program-service-config
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
              port: 4002
            initialDelaySeconds: 5
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /health
              port: 4002
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: program-service
  namespace: events-platform
spec:
  selector:
    app: program-service
  ports:
    - port: 4002
      targetPort: 4002
  type: ClusterIP
