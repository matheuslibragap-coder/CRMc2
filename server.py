"""
MASTER - roda o CRM no seu computador.

Inicie com:  python3 server.py
Depois abra: http://localhost:8000
"""

import sys
from socketserver import ThreadingMixIn
from wsgiref.simple_server import WSGIRequestHandler, WSGIServer, make_server

from app import ARQUIVO_BANCO, application, usuarios_sem_senha

PORTA = 8000


class ServidorComThreads(ThreadingMixIn, WSGIServer):
    daemon_threads = True


class SemLog(WSGIRequestHandler):
    # Silencia o log de cada requisição no terminal
    def log_message(self, formato, *args):
        pass


def main():
    try:
        # 127.0.0.1: acessível apenas neste computador
        servidor = make_server("127.0.0.1", PORTA, application,
                               server_class=ServidorComThreads, handler_class=SemLog)
    except OSError:
        print(f"Não foi possível usar a porta {PORTA}. O MASTER já está aberto em outra janela?")
        sys.exit(1)
    print("=" * 50)
    print(" MASTER rodando!")
    print(f" Abra no navegador: http://localhost:{PORTA}")
    print(f" Dados salvos em:   {ARQUIVO_BANCO}")
    print(" Para encerrar, feche esta janela ou aperte Ctrl+C.")
    sem_senha = usuarios_sem_senha()
    if sem_senha:
        print()
        print(" ATENÇÃO: ainda sem senha: " + ", ".join(sem_senha))
        print(" Para criar as senhas, rode:  python3 definir_senhas.py")
    print("=" * 50)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nMASTER encerrado.")


if __name__ == "__main__":
    main()
