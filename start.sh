#!/bin/sh
set -e

if mkdir -p /data 2>/dev/null; then
  : # persistent disk available; use DATABASE_URL as configured
else
  export DATABASE_URL="file:$(pwd)/data/dylan.db"
  mkdir -p "$(pwd)/data"
fi

npx prisma migrate deploy
exec react-router-serve ./build/server/index.js
