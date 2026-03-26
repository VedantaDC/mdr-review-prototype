#!/bin/zsh

PROJECT_DIR="/Users/ps/Desktop/Coding Projects/MDR Project"
PID_FILE="${PROJECT_DIR}/.mdr-prototype.pid"

if [ ! -f "$PID_FILE" ]; then
  echo "No running prototype server found."
  exit 0
fi

PID=$(cat "$PID_FILE")

if kill -0 "$PID" >/dev/null 2>&1; then
  kill "$PID"
  echo "Stopped MDR prototype server (PID $PID)."
else
  echo "Prototype server was not running."
fi

rm -f "$PID_FILE"
