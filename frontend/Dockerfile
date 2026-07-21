FROM nginx:1.27-alpine

# Replace the default server block with one that also reverse-proxies /api/*
# to the backend microservices (see nginx.conf for details).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static site content.
COPY . /usr/share/nginx/html
# Don't ship build/config files into the served directory.
RUN rm -f /usr/share/nginx/html/Dockerfile /usr/share/nginx/html/nginx.conf

EXPOSE 80
