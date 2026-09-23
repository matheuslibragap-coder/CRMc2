"""
Liga a integração do MASTER com o Google Agenda.

Rode no console Bash do PythonAnywhere:
    cd ~/master && python3 configurar_google.py

Ele pede o "ID do cliente" e a "Chave secreta do cliente" criados no Google Cloud
e grava em dados/google.json (esse arquivo nunca vai para o GitHub).
"""

import getpass
import json
import os
from pathlib import Path

PASTA_DADOS = Path(__file__).resolve().parent / "dados"
ARQUIVO = PASTA_DADOS / "google.json"


def endereco_padrao():
    usuario = os.environ.get("USER", "")
    if os.path.isdir("/var/www") and usuario:
        return f"https://{usuario.lower()}.pythonanywhere.com/api/google/retorno"
    return "http://localhost:8000/api/google/retorno"


def main():
    print()
    print("=== Integração MASTER + Google Agenda ===")
    print()
    client_id = input("Cole o ID do cliente (termina com .apps.googleusercontent.com): ").strip()
    if not client_id.endswith(".apps.googleusercontent.com"):
        print("Esse não parece um ID do cliente do Google. Confira e rode de novo.")
        return
    client_secret = getpass.getpass("Cole a Chave secreta do cliente (não aparece na tela): ").strip()
    if not client_secret:
        print("A chave secreta ficou vazia. Rode de novo.")
        return
    padrao = endereco_padrao()
    endereco = input(f"Endereço de retorno [{padrao}]: ").strip() or padrao

    PASTA_DADOS.mkdir(exist_ok=True)
    ARQUIVO.write_text(json.dumps({
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": endereco,
    }, indent=2))
    os.chmod(ARQUIVO, 0o600)
    print()
    print("Pronto! Integração configurada.")
    print(f"Confira se este endereço está em 'URIs de redirecionamento autorizados' no Google Cloud:")
    print(f"  {endereco}")
    print("Agora clique em Reload na aba Web do PythonAnywhere.")


if __name__ == "__main__":
    main()
