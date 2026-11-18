# Stage 1: Build React + TypeScript + Three.js application
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Serve via Nginx (configured via 1:1 mounted docker_master/nginx/default.conf)
FROM nginx:1.25-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
