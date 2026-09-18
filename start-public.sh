#!/data/data/com.termux/files/usr/bin/bash
# Jalankan server lokal lalu buka tunnel Cloudflare.
# Wajib set APP_PASSWORD supaya tidak terbuka untuk umum.
set -e
cd "$(dirname "$0")"

PORT="${PORT:-8790}"

if [ -z "$APP_PASSWORD" ]; then
  echo "ERROR: set dulu password aplikasi, contoh:"
  echo "  export APP_PASSWORD='rahasia-anda'"
  exit 1
fi

HOST=127.0.0.1 PORT="$PORT" node server.js > /tmp/sigizi-server.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null' EXIT INT TERM

echo "Server jalan (PID $SERVER_PID) di http://127.0.0.1:$PORT"
echo "Membuka Cloudflare Tunnel..."
cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate
