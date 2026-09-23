"""
Cria (ou recria) as senhas de acesso ao MASTER.

  python3 definir_senhas.py          -> gera senha para quem ainda não tem
  python3 definir_senhas.py Nico     -> gera uma senha nova só para o Nico
  python3 definir_senhas.py todos    -> gera senhas novas para todo mundo

As senhas aparecem uma única vez na tela: anote e repasse a cada pessoa.
Depois de entrar, cada um pode trocar a própria senha em "Meu perfil".
O Libraga também pode gerar senhas pela tela de Administração do MASTER.
"""

import sys

from app import banco, definir_senha, gerar_senha, nome_oficial, nomes_ativos, usuarios_sem_senha


def main():
    if len(sys.argv) < 2:
        alvos = usuarios_sem_senha()
        if not alvos:
            print("Todos já têm senha. Para recriar, use:")
            print("  python3 definir_senhas.py NOME    (ex.: python3 definir_senhas.py Nico)")
            print("  python3 definir_senhas.py todos")
            return
    elif sys.argv[1].lower() == "todos":
        with banco() as conn:
            alvos = nomes_ativos(conn)
    else:
        usuario = nome_oficial(sys.argv[1])
        if not usuario:
            with banco() as conn:
                print(f"Usuário '{sys.argv[1]}' não existe. Usuários: {', '.join(nomes_ativos(conn))}")
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
