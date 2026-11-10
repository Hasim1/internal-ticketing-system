# ---------- Stage 1: build the Vite/React app ----------
FROM node:20-alpine AS build

WORKDIR /app

# VITE_API_URL is baked in at build time (Vite inlines import.meta.env.*).
# Override with: docker build --build-arg VITE_API_URL=https://api.example.com/api
ARG VITE_API_URL=http://localhost:8000/api
ENV VITE_API_URL=$VITE_API_URL

# Install dependencies first to leverage Docker layer caching.
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and produce the static build.
COPY . .
RUN npm run build

# ---------- Stage 2: serve the static build with nginx ----------
FROM nginx:alpine AS runtime

# Custom SPA config (try_files fallback to index.html).
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the compiled assets from the build stage.
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
