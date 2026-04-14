#!/bin/sh
set -e

echo "🚀 Starting application..."

# Chạy migration (chỉ 1 lần khi container start)
echo "📦 Running migrations..."
node node_modules/typeorm/cli.js migration:run -d dist/common/config/database.config.js

# Nếu migration thành công, chạy app
echo "✅ Migrations completed. Starting app..."
exec node dist/main.js
