#!/bin/sh
# Inicia o CRM (Linux). Uso: ./iniciar.sh
cd "$(dirname "$0")"
if command -v xdg-open >/dev/null 2>&1; then
  (sleep 2 && xdg-open http://localhost:8000 >/dev/null 2>&1) &
fi
exec python3 server.py
