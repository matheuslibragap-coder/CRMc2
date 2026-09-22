"""
Cria (ou recria) as senhas de acesso ao MASTER.

  python3 definir_senhas.py          -> gera senha para quem ainda não tem
  python3 definir_senhas.py Nico     -> gera uma senha nova só para o Nico
  python3 definir_senhas.py todos    -> gera senhas novas para todo mundo

As senhas aparecem uma única vez na tela: anote e repasse a cada pessoa.
Depois de entrar, cada um pode trocar a própria senha em "Trocar senha".
"""

import secrets
import sys

from app import USUARIOS, definir_senha, nome_oficial, usuarios_sem_senha

PALAVRAS = ["cometa", "foguete", "planeta", "estrela", "galaxia", "orbita",
            "saturno", "marte", "netuno", "nebulosa", "meteoro", "lua",
            "astro", "jupiter", "venus", "eclipse"]


def gerar_senha():
    return "-".join([secrets.choice(PALAVRAS), secrets.choice(PALAVRAS),
                     f"{secrets.randbelow(10000):04d}"])


def main():
    if len(sys.argv) < 2:
        alvos = usuarios_sem_senha()
        if not alvos:
            print("Todos já têm senha. Para recriar, use:")
            print("  python3 definir_senhas.py NOME    (ex.: python3 definir_senhas.py Nico)")
            print("  python3 definir_senhas.py todos")
            return
    elif sys.argv[1].lower() == "todos":
        alvos = USUARIOS
    else:
        usuario = nome_oficial(sys.argv[1])
        if not usuario:
            print(f"Usuário '{sys.argv[1]}' não existe. Usuários: {', '.join(USUARIOS)}")
            sys.exit(1)
        alvos = [usuario]

    print()
    print("Senhas do MASTER (anote agora, elas não aparecem de novo):")
    print("-" * 40)
    for usuario in alvos:
        senha = gerar_senha()
        definir_senha(usuario, senha)
        print(f"  {usuario:<10} {senha}")
    print("-" * 40)


if __name__ == "__main__":
    main()
