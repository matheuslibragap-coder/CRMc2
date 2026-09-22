#!/bin/bash
# Configura o MASTER no PythonAnywhere. Rode no console Bash de lá:
#   bash ~/master/pythonanywhere.sh
set -e
PASTA="$HOME/master"
DOMINIO="$(echo "$USER" | tr 'A-Z' 'a-z').pythonanywhere.com"
ARQUIVO_WSGI="/var/www/$(echo "$DOMINIO" | tr '.' '_')_wsgi.py"

if [ ! -f "$ARQUIVO_WSGI" ]; then
  echo "ERRO: não encontrei $ARQUIVO_WSGI"
  echo "Crie primeiro o Web app na aba 'Web' (Manual configuration) e rode de novo."
  exit 1
fi

cat > "$ARQUIVO_WSGI" <<WSGI
import sys
sys.path.insert(0, "$PASTA")
from app import application
WSGI

echo "Configuração feita!"
echo "Agora vá na aba 'Web' e clique no botão verde 'Reload'."
echo "Endereço do MASTER: https://$DOMINIO"
