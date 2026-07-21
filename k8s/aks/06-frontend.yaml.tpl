apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend-${DEPLOY_COLOR}
  namespace: events-platform
  labels:
    app: frontend
    color: ${DEPLOY_COLOR}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
      color: ${DEPLOY_COLOR}
  template:
    metadata:
      labels:
        app: frontend
        color: ${DEPLOY_COLOR}
    spec:
      containers:
        - name: frontend
          image: ${ACR_LOGIN_SERVER}/frontend:${IMAGE_TAG}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 25m
              memory: 32Mi
            limits:
              cpu: 200m
              memory: 128Mi
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
          livenessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: events-platform
spec:
  selector:
    app: frontend
    color: ${DEPLOY_COLOR}
  ports:
    - port: 80
      targetPort: 80
  type: LoadBalancer
