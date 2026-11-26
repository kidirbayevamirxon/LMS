FROM node:22-alpine AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/out /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  index index.html;\n  location /certificate/verify/ {\n    try_files $uri $uri/ /certificate/verify/index.html;\n  }\n  location / {\n    try_files $uri $uri/ $uri.html /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
