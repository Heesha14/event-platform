apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: event-service
  namespace: events-platform
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: event-service
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: program-service
  namespace: events-platform
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: program-service
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: registration-service
  namespace: events-platform
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: registration-service
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: analytics-service
  namespace: events-platform
  labels:
    release: monitoring
spec:
  selector:
    matchLabels:
      app: analytics-service
  endpoints:
    - port: http
      path: /metrics
      interval: 30s
