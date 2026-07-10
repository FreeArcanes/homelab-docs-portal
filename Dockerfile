FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app/backend
ENV NODE_ENV=production
ENV PORT=8110
RUN apk add --no-cache python3 make g++
COPY backend/package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --no-audit --no-fund; else npm install --omit=dev --no-audit --no-fund; fi
COPY backend/ ./

WORKDIR /app
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 8110
WORKDIR /app
CMD ["node", "backend/server.js"]
