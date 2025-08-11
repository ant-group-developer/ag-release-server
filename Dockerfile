# --------- Stage 1: build ứng dụng ---------
    FROM node:20-alpine AS builder
    WORKDIR /app
    
    # 1. Copy manifest và cài toàn bộ (bao gồm devDeps)
    COPY package.json yarn.lock ./
    RUN yarn install --frozen-lockfile
    
    # 2. Copy toàn bộ source (bao gồm folder keys)
    COPY . .
    
    # 3. Build production
    RUN yarn build
    
    # --------- Stage 2: chỉ chứa runtime ---------
    FROM node:20-alpine
    WORKDIR /app
    
    # 1. Chỉ cài production dependencies
    COPY package.json yarn.lock ./
    RUN yarn install --production --frozen-lockfile
    
    # 2. Lấy dist và keys từ stage build
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/keys ./keys
    
    ENV NODE_ENV=production
    EXPOSE 3000
    
    # 3. Chạy ứng dụng
    CMD ["node", "dist/main.js"]
    