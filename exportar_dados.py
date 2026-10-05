"""Exporta os dados do MASTER (dados/crm.db) para dados/exportacao.json, sem segredos.

Uso (na pasta do MASTER):  python3 exportar_dados.py

Ficam de fora: hashes de senha, sessões de login, tokens do Google, estados do OAuth,
e os arquivos binários (fotos de perfil e áudios do chat), que só aparecem como tamanho.
"""
import base64
import json
import sqlite3
from datetime import datetime
from pathlib import Path

BANCO = Path(__file__).resolve().parent / "dados" / "crm.db"
SAIDA = BANCO.with_name("exportacao.json")

FORA = {"sessoes", "google_estados", "sqlite_sequence"}
REMOVER = {
    ("usuarios", "senha_hash"): "<<CHAVE_REMOVIDA: hash PBKDF2 da senha de login>>",
    ("google_contas", "refresh_token"): "<<CHAVE_REMOVIDA: refresh token OAuth do Google Agenda>>",
    ("google_contas", "access_token"): "<<CHAVE_REMOVIDA: access token OAuth do Google Agenda>>",
}


def valor(tabela, coluna, v):
    if (tabela, coluna) in REMOVER and v:
        return REMOVER[(tabela, coluna)]
    if isinstance(v, bytes):
        return f"<binário omitido: {len(v)} bytes>"
    return v


def main():
    conn = sqlite3.connect(BANCO)
    conn.row_factory = sqlite3.Row
    saida = {
        "exportado_em": datetime.now().isoformat(timespec="seconds"),
        "versao_banco": conn.execute("PRAGMA user_version").fetchone()[0],
        "tabelas": {},
    }
    for (tabela,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
        if tabela in FORA:
            continue
        linhas = conn.execute(f'SELECT * FROM "{tabela}"').fetchall()
        saida["tabelas"][tabela] = [
            {k: valor(tabela, k, r[k]) for k in r.keys()} for r in linhas
        ]
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Pronto: {SAIDA} ({sum(len(v) for v in saida['tabelas'].values())} linhas)")


if __name__ == "__main__":
    main()
