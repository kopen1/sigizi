#!/data/data/com.termux/files/usr/bin/bash
# Jalankan server + Cloudflare Tunnel di background (pakai pidfile).
cd "$(dirname "$0")"
mkdir -p .run

PORT="${PORT:-8790}"

stop() {
  [ -f .run/server.pid ] && kill "$(cat .run/server.pid)" 2>/dev/null
  [ -f .run/cf.pid ] && kill "$(cat .run/cf.pid)" 2>/dev/null
  rm -f .run/server.pid .run/cf.pid
}

if [ "$1" = "stop" ]; then
  stop
  echo "dihentikan"
  exit 0
fi

if [ -z "$APP_PASSWORD" ]; then
  echo "ERROR: set APP_PASSWORD dulu."
  exit 1
fi

stop
sleep 1

setsid env HOST=127.0.0.1 PORT="$PORT" APP_PASSWORD="$APP_PASSWORD" node server.js > ${TMPDIR:-/data/data/com.termux/files/usr/tmp}/sigizi-server.log 2>&1 &
echo $! > .run/server.pid

sleep 2

setsid cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate --protocol http2 > ${TMPDIR:-/data/data/com.termux/files/usr/tmp}/sigizi-cf.log 2>&1 &
echo $! > .run/cf.pid

echo "server pid $(cat .run/server.pid), cloudflared pid $(cat .run/cf.pid)"
