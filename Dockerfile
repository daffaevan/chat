# Stage 1: Build
FROM node:20 AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install SEMUA dependencies untuk build (termasuk native modules)
RUN npm install

# Copy source code
COPY . .

# Build frontend dan backend
# Ini akan menghasilkan 'dist/' folder yang berisi:
# - Frontend assets (index.html, js, css)
# - Server bundle (server.cjs)
RUN npm run build

# Stage 2: Runtime
FROM node:20-slim

# Install library yang dibutuhkan untuk native modules di runtime (jika ada)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install hanya production dependencies
# Kita perlu rebuild native modules (seperti better-sqlite3) untuk architecture target (STB)
RUN npm install --omit=dev

# Copy hasil build dari stage builder
COPY --from=builder /app/dist ./dist

# Pastikan folder uploads ada
RUN mkdir -p uploads/avatars uploads/audio uploads/images uploads/stickers

EXPOSE 3000

# Set environment ke production
ENV NODE_ENV=production

# Jalankan server dari hasil build bundle
# Build script kita menghasilkan dist/server.cjs
CMD ["node", "dist/server.cjs"]
