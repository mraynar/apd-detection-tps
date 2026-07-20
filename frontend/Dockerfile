# ==============================================================================
# frontend/Dockerfile — APD Detection Frontend (Production, Next.js Standalone)
#
# Multi-stage build:
#   Stage 1 (builder): Install deps + compile Next.js → output: standalone
#   Stage 2 (runner):  Copy minimal output hanya, tanpa node_modules penuh
#
# CATATAN PENTING — NEXT_PUBLIC_BACKEND_URL:
#   Variabel ini adalah client-side build arg (ter-embed ke dalam JS bundle saat build).
#   Harus berisi URL yang bisa dijangkau dari BROWSER pengguna (bukan dari dalam container).
#   Contoh: http://192.168.1.100:5001 jika backend jalan di server yang sama.
#
# BACKEND_URL_INTERNAL:
#   Server-side env untuk Next.js rewrites (/api/* → backend).
#   Di Docker, ini http://backend:5001 (nama service di docker-compose).
#   Di development lokal, tidak perlu di-set (default ke http://localhost:5001).
# ==============================================================================

# ---- Stage 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (leverage cache sebelum copy source)
COPY package.json package-lock.json ./
RUN npm ci

# Copy seluruh source frontend
COPY . .

# Build args: diteruskan ke ENV agar tersedia saat `npm run build`
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:5001
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

ARG BACKEND_URL_INTERNAL=http://backend:5001
ENV BACKEND_URL_INTERNAL=$BACKEND_URL_INTERNAL

# Build produksi Next.js (standalone output dikonfigurasi di next.config.ts)
RUN npm run build

# ---- Stage 2: Runner ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Salin output standalone (server.js + minified deps)
COPY --from=builder /app/.next/standalone ./
# Salin static assets dan public folder
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# Jalankan Next.js standalone server (bukan npm run dev)
CMD ["node", "server.js"]
