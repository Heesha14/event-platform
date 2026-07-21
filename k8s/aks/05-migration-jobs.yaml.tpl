apiVersion: batch/v1
kind: Job
metadata:
  name: event-service-migrate
  namespace: events-platform
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${ACR_LOGIN_SERVER}/event-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          command: ["node", "src/migrate.js"]
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
---
apiVersion: batch/v1
kind: Job
metadata:
  name: program-service-migrate
  namespace: events-platform
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${ACR_LOGIN_SERVER}/program-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          command: ["node", "src/migrate.js"]
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
---
apiVersion: batch/v1
kind: Job
metadata:
  name: analytics-service-migrate
  namespace: events-platform
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${ACR_LOGIN_SERVER}/analytics-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          command: ["node", "src/migrate.js"]
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
---
apiVersion: batch/v1
kind: Job
metadata:
  name: registration-service-migrate
  namespace: events-platform
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: ${ACR_LOGIN_SERVER}/registration-service:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          command: ["node", "src/migrate.js"]
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
