#!/bin/zsh

set -e

PROJECT_DIR="/Users/ps/Desktop/Coding Projects/MDR Project"
PORT=4173
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}/"
PID_FILE="${PROJECT_DIR}/.mdr-prototype.pid"
LOG_FILE="${PROJECT_DIR}/.mdr-prototype.log"

cd "$PROJECT_DIR"

if [ ! -d "node_modules" ]; then
  npm install
fi

if [ -f "$PID_FILE" ]; then
  EXISTING_PID=$(cat "$PID_FILE")
  if kill -0 "$EXISTING_PID" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

nohup npm run dev -- --host "$HOST" --port "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$PID_FILE"

for _ in {1..30}; do
  if curl -s "$URL" >/dev/null 2>&1; then
    open "$URL"
    exit 0
  fi
  sleep 1
done

echo "Prototype server started, but the browser did not open automatically."
echo "Try visiting: $URL"
exit 1
