"""
CRM de Leads - servidor local.

Usa apenas a biblioteca padrão do Python (nada para instalar).
Inicie com:  python server.py
Depois abra: http://localhost:8000
"""

import json
import sqlite3
import sys
from datetime import date
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PORTA = 8000
PASTA_BASE = Path(__file__).resolve().parent
PASTA_STATIC = PASTA_BASE / "static"
PASTA_DADOS = PASTA_BASE / "dados"
ARQUIVO_BANCO = PASTA_DADOS / "crm.db"

COLUNAS = ["Em contato", "Negociando", "Proposta enviada", "Fechado"]
PRODUTOS = ["ProntoPost", "Site institucional", "Vitrine virtual"]
CAMPOS_TEXTO = ("nome", "contato", "produto", "observacoes", "coluna")


def conectar():
    conn = sqlite3.connect(ARQUIVO_BANCO)
    conn.row_factory = sqlite3.Row
    return conn


def criar_banco():
    """Cria a pasta e o banco de dados na primeira execução."""
    PASTA_DADOS.mkdir(exist_ok=True)
    with conectar() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS leads (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                nome         TEXT NOT NULL,
                contato      TEXT NOT NULL DEFAULT '',
                produto      TEXT NOT NULL,
                data_criacao TEXT NOT NULL,
                observacoes  TEXT NOT NULL DEFAULT '',
                coluna       TEXT NOT NULL
            )
            """
        )


def validar(dados, parcial=False):
    """Retorna (lead_limpo, erro)."""
    lead = {}
    for campo in CAMPOS_TEXTO:
        if campo in dados:
            valor = dados[campo]
            if not isinstance(valor, str):
                return None, f"Campo '{campo}' inválido."
            lead[campo] = valor.strip()

    if not parcial or "nome" in lead:
        if not lead.get("nome"):
            return None, "Informe o nome do lead/empresa."
    if not parcial or "produto" in lead:
        if lead.get("produto") not in PRODUTOS:
            return None, "Escolha um produto de interesse válido."
    if not parcial or "coluna" in lead:
        lead.setdefault("coluna", COLUNAS[0])
        if lead["coluna"] not in COLUNAS:
            return None, "Coluna inválida."
    return lead, None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PASTA_STATIC), **kwargs)

    # Silencia o log de cada requisição no terminal
    def log_message(self, formato, *args):
        pass

    # ---------- utilitários ----------
    def responder_json(self, status, corpo=None):
        dados = json.dumps(corpo if corpo is not None else {}, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)

    def ler_json(self):
        tamanho = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(tamanho) or b"{}")
        except json.JSONDecodeError:
            return None

    def id_da_url(self):
        partes = self.path.rstrip("/").split("/")
        if len(partes) == 4 and partes[1] == "api" and partes[2] == "leads" and partes[3].isdigit():
            return int(partes[3])
        return None

    # ---------- rotas ----------
    def do_GET(self):
        if self.path.rstrip("/") == "/api/leads":
            with conectar() as conn:
                linhas = conn.execute(
                    "SELECT * FROM leads ORDER BY id"
                ).fetchall()
            return self.responder_json(200, {
                "colunas": COLUNAS,
                "produtos": PRODUTOS,
                "leads": [dict(l) for l in linhas],
            })
        if self.path.startswith("/api/"):
            return self.responder_json(404, {"erro": "Não encontrado."})
        return super().do_GET()

    def do_POST(self):
        if self.path.rstrip("/") != "/api/leads":
            return self.responder_json(404, {"erro": "Não encontrado."})
        dados = self.ler_json()
        if not isinstance(dados, dict):
            return self.responder_json(400, {"erro": "Dados inválidos."})
        lead, erro = validar(dados)
        if erro:
            return self.responder_json(400, {"erro": erro})
        with conectar() as conn:
            cur = conn.execute(
                """INSERT INTO leads (nome, contato, produto, data_criacao, observacoes, coluna)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (lead["nome"], lead.get("contato", ""), lead["produto"],
                 date.today().isoformat(), lead.get("observacoes", ""),
                 lead["coluna"]),
            )
            novo = conn.execute("SELECT * FROM leads WHERE id = ?", (cur.lastrowid,)).fetchone()
        return self.responder_json(201, dict(novo))

    def do_PUT(self):
        lead_id = self.id_da_url()
        if lead_id is None:
            return self.responder_json(404, {"erro": "Não encontrado."})
        dados = self.ler_json()
        if not isinstance(dados, dict):
            return self.responder_json(400, {"erro": "Dados inválidos."})
        lead, erro = validar(dados, parcial=True)
        if erro:
            return self.responder_json(400, {"erro": erro})
        if not lead:
            return self.responder_json(400, {"erro": "Nada para atualizar."})
        colunas_sql = ", ".join(f"{campo} = ?" for campo in lead)
        with conectar() as conn:
            cur = conn.execute(
                f"UPDATE leads SET {colunas_sql} WHERE id = ?",
                (*lead.values(), lead_id),
            )
            if cur.rowcount == 0:
                return self.responder_json(404, {"erro": "Lead não encontrado."})
            atualizado = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
        return self.responder_json(200, dict(atualizado))

    def do_DELETE(self):
        lead_id = self.id_da_url()
        if lead_id is None:
            return self.responder_json(404, {"erro": "Não encontrado."})
        with conectar() as conn:
            cur = conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
        if cur.rowcount == 0:
            return self.responder_json(404, {"erro": "Lead não encontrado."})
        return self.responder_json(200, {"ok": True})


def main():
    criar_banco()
    try:
        # 127.0.0.1: acessível apenas neste computador
        servidor = ThreadingHTTPServer(("127.0.0.1", PORTA), Handler)
    except OSError:
        print(f"Não foi possível usar a porta {PORTA}. O CRM já está aberto em outra janela?")
        sys.exit(1)
    print("=" * 50)
    print(" CRM de Leads rodando!")
    print(f" Abra no navegador: http://localhost:{PORTA}")
    print(f" Dados salvos em:   {ARQUIVO_BANCO}")
    print(" Para encerrar, feche esta janela ou aperte Ctrl+C.")
    print("=" * 50)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nCRM encerrado.")


if __name__ == "__main__":
    main()
