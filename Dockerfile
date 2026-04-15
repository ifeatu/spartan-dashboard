# ── Stage 1: Build React app ──────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Serve with nginx ─────────────────────────
FROM nginx:alpine

# Remove default config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our nginx config
COPY nginx.conf /etc/nginx/conf.d/spartan-dashboard.conf

# Copy built static files
COPY --from=builder /app/dist /usr/share/nginx/html

# htpasswd will be mounted at runtime via volume
# Ensure nginx can read it
RUN mkdir -p /etc/nginx && chmod 755 /etc/nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
