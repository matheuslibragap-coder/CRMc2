"""
MASTER - CRM de leads da equipe Comercial 2.

Aplicação WSGI feita só com a biblioteca padrão do Python (nada para instalar).
- No seu computador: rode  python3 server.py
- No PythonAnywhere: o arquivo WSGI importa  application  daqui.
"""

import hashlib
import hmac
import json
import mimetypes
import secrets
import sqlite3
import time
from datetime import date, datetime, timedelta
from http.cookies import SimpleCookie
from pathlib import Path

PASTA_BASE = Path(__file__).resolve().parent
PASTA_STATIC = PASTA_BASE / "static"
PASTA_DADOS = PASTA_BASE / "dados"
ARQUIVO_BANCO = PASTA_DADOS / "crm.db"

USUARIOS = ["Libraga", "Paulinho", "Nico", "Dani"]
DONO_LEADS_ANTIGOS = "Libraga"  # leads criados antes de existir login
COLUNAS = ["Em contato", "Negociando", "Proposta enviada", "Fechado"]
PRODUTOS = ["eGestor (NC)", "eGestor (CI)", "ProntoPost", "Site", "Vitrine"]
CAMPOS_TEXTO = ("nome", "telefone", "email", "conta", "observacoes", "coluna")

# Conversão dos produtos da primeira versão do CRM
PRODUTOS_ANTIGOS = {"Site institucional": "Site", "Vitrine virtual": "Vitrine"}

COOKIE = "master_sessao"
DURACAO_SESSAO = timedelta(days=30)
ITERACOES_SENHA = 200_000
TAMANHO_MINIMO_SENHA = 8

# Proteção contra tentativas de adivinhar senha: após 5 erros, bloqueia 15 min
MAX_TENTATIVAS = 5
BLOQUEIO_SEGUNDOS = 15 * 60
_tentativas = {}  # usuario -> (quantidade de erros, horário do último erro)


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def conectar():
    conn = sqlite3.connect(ARQUIVO_BANCO, timeout=10)
    conn.row_factory = sqlite3.Row
    return conn


def criar_tabela_leads(conn, nome_tabela):
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {nome_tabela} (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            nome         TEXT NOT NULL,
            telefone     TEXT NOT NULL DEFAULT '',
            email        TEXT NOT NULL DEFAULT '',
            conta        TEXT NOT NULL DEFAULT '',
            produtos     TEXT NOT NULL DEFAULT '[]',
            data_criacao TEXT NOT NULL,
            observacoes  TEXT NOT NULL DEFAULT '',
            coluna       TEXT NOT NULL,
            dono         TEXT NOT NULL DEFAULT '{DONO_LEADS_ANTIGOS}'
        )
        """
    )


def migrar_primeira_versao(conn):
    """Converte leads salvos pela primeira versão (campos contato/produto)."""
    colunas = {linha["name"] for linha in conn.execute("PRAGMA table_info(leads)")}
    if "contato" not in colunas:
        return
    criar_tabela_leads(conn, "leads_novo")
    for l in conn.execute("SELECT * FROM leads").fetchall():
        contato = l["contato"]
        email, telefone = (contato, "") if "@" in contato else ("", contato)
        produto = PRODUTOS_ANTIGOS.get(l["produto"], l["produto"])
        conn.execute(
            """INSERT INTO leads_novo (id, nome, telefone, email, conta, produtos,
                                       data_criacao, observacoes, coluna)
               VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)""",
            (l["id"], l["nome"], telefone, email, json.dumps([produto]),
             l["data_criacao"], l["observacoes"], l["coluna"]),
        )
    conn.execute("DROP TABLE leads")
    conn.execute("ALTER TABLE leads_novo RENAME TO leads")


def migrar_dono(conn):
    """Leads da versão sem login passam a pertencer a DONO_LEADS_ANTIGOS."""
    colunas = {linha["name"] for linha in conn.execute("PRAGMA table_info(leads)")}
    if "dono" not in colunas:
        conn.execute(
            f"ALTER TABLE leads ADD COLUMN dono TEXT NOT NULL DEFAULT '{DONO_LEADS_ANTIGOS}'"
        )


def criar_banco():
    """Cria a pasta, o banco e os usuários na primeira execução."""
    PASTA_DADOS.mkdir(exist_ok=True)
    with conectar() as conn:
        criar_tabela_leads(conn, "leads")
        migrar_primeira_versao(conn)
        migrar_dono(conn)
        conn.execute(
            """CREATE TABLE IF NOT EXISTS usuarios (
                   nome       TEXT PRIMARY KEY,
                   senha_hash TEXT
               )"""
        )
        conn.execute(
            """CREATE TABLE IF NOT EXISTS sessoes (
                   token     TEXT PRIMARY KEY,
                   usuario   TEXT NOT NULL,
                   expira_em TEXT NOT NULL
               )"""
        )
        conn.executemany(
            "INSERT OR IGNORE INTO usuarios (nome) VALUES (?)",
            [(u,) for u in USUARIOS],
        )


def usuarios_sem_senha():
    with conectar() as conn:
        linhas = conn.execute("SELECT nome FROM usuarios WHERE senha_hash IS NULL").fetchall()
    return [l["nome"] for l in linhas]


# ---------------------------------------------------------------------------
# Senhas e sessões
# ---------------------------------------------------------------------------

def gerar_hash(senha):
    sal = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), ITERACOES_SENHA)
    return f"{sal}${h.hex()}"


def conferir_senha(senha, senha_hash):
    if not senha_hash:
        return False
    sal, esperado = senha_hash.split("$", 1)
    h = hashlib.pbkdf2_hmac("sha256", senha.encode(), bytes.fromhex(sal), ITERACOES_SENHA)
    return hmac.compare_digest(h.hex(), esperado)


def definir_senha(usuario, senha):
    with conectar() as conn:
        conn.execute("UPDATE usuarios SET senha_hash = ? WHERE nome = ?", (gerar_hash(senha), usuario))
        # Derruba sessões antigas desse usuário
        conn.execute("DELETE FROM sessoes WHERE usuario = ?", (usuario,))


def nome_oficial(usuario):
    """Aceita o nome em maiúsculas/minúsculas e devolve a grafia cadastrada."""
    for u in USUARIOS:
        if u.lower() == (usuario or "").strip().lower():
            return u
    return None


def bloqueado(usuario):
    erros, ultimo = _tentativas.get(usuario, (0, 0))
    if erros >= MAX_TENTATIVAS and time.time() - ultimo < BLOQUEIO_SEGUNDOS:
        return True
    if erros >= MAX_TENTATIVAS:
        _tentativas.pop(usuario, None)
    return False


def criar_sessao(usuario):
    token = secrets.token_urlsafe(32)
    expira = (datetime.now() + DURACAO_SESSAO).isoformat()
    with conectar() as conn:
        conn.execute("DELETE FROM sessoes WHERE expira_em < ?", (datetime.now().isoformat(),))
        conn.execute("INSERT INTO sessoes VALUES (?, ?, ?)", (token, usuario, expira))
    return token


def usuario_da_sessao(token):
    if not token:
        return None
    with conectar() as conn:
        linha = conn.execute(
            "SELECT usuario FROM sessoes WHERE token = ? AND expira_em > ?",
            (token, datetime.now().isoformat()),
        ).fetchone()
    return linha["usuario"] if linha else None


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------

def lead_para_dict(linha):
    lead = dict(linha)
    lead["produtos"] = json.loads(lead["produtos"])
    return lead


def validar_lead(dados, parcial=False):
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
            return None, "Informe o nome do lead."
    if not parcial or "produtos" in dados:
        produtos = dados.get("produtos")
        if (not isinstance(produtos, list) or not produtos
                or any(p not in PRODUTOS for p in produtos)):
            return None, "Selecione ao menos um produto de interesse."
        # Mantém a ordem padrão da lista de produtos, sem repetições
        lead["produtos"] = json.dumps([p for p in PRODUTOS if p in produtos])
    if not parcial or "coluna" in lead:
        lead.setdefault("coluna", COLUNAS[0])
        if lead["coluna"] not in COLUNAS:
            return None, "Coluna inválida."
    return lead, None


# ---------------------------------------------------------------------------
# Aplicação web (WSGI)
# ---------------------------------------------------------------------------

class Resposta(Exception):
    """Usada para encerrar uma rota devolvendo JSON."""

    def __init__(self, status, corpo, cabecalhos=None):
        self.status = status
        self.corpo = corpo
        self.cabecalhos = cabecalhos or []


STATUS = {200: "200 OK", 201: "201 Created", 400: "400 Bad Request",
          401: "401 Unauthorized", 403: "403 Forbidden", 404: "404 Not Found",
          405: "405 Method Not Allowed", 429: "429 Too Many Requests"}


def erro(status, mensagem):
    return Resposta(status, {"erro": mensagem})


class Requisicao:
    def __init__(self, environ):
        self.environ = environ
        self.metodo = environ["REQUEST_METHOD"]
        self.caminho = environ.get("PATH_INFO", "/") or "/"
        self.query = environ.get("QUERY_STRING", "")
        cookies = SimpleCookie(environ.get("HTTP_COOKIE", ""))
        self.token = cookies[COOKIE].value if COOKIE in cookies else None
        self.https = (environ.get("wsgi.url_scheme") == "https"
                      or environ.get("HTTP_X_FORWARDED_PROTO") == "https")

    def json(self):
        # Exigir JSON impede que outros sites enviem formulários em nome do usuário
        if not self.environ.get("CONTENT_TYPE", "").startswith("application/json"):
            raise erro(400, "Envie os dados em JSON.")
        try:
            tamanho = int(self.environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            tamanho = 0
        try:
            dados = json.loads(self.environ["wsgi.input"].read(tamanho) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise erro(400, "Dados inválidos.")
        if not isinstance(dados, dict):
            raise erro(400, "Dados inválidos.")
        return dados

    def cookie_sessao(self, token, max_age):
        valor = f"{COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"
        if self.https:
            valor += "; Secure"
        return ("Set-Cookie", valor)


def exigir_login(req):
    usuario = usuario_da_sessao(req.token)
    if not usuario:
        raise erro(401, "Faça login para continuar.")
    return usuario


# ---------- rotas da API ----------

def rota_login(req):
    dados = req.json()
    usuario = nome_oficial(dados.get("usuario"))
    senha = dados.get("senha") if isinstance(dados.get("senha"), str) else ""
    if usuario and bloqueado(usuario):
        raise erro(429, "Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.")
    with conectar() as conn:
        linha = conn.execute("SELECT senha_hash FROM usuarios WHERE nome = ?", (usuario,)).fetchone()
    if not linha or not conferir_senha(senha, linha["senha_hash"]):
        if usuario:
            erros, _ = _tentativas.get(usuario, (0, 0))
            _tentativas[usuario] = (erros + 1, time.time())
        time.sleep(1)
        raise erro(401, "Usuário ou senha incorretos.")
    _tentativas.pop(usuario, None)
    token = criar_sessao(usuario)
    raise Resposta(200, {"usuario": usuario},
                   [req.cookie_sessao(token, int(DURACAO_SESSAO.total_seconds()))])


def rota_logout(req):
    if req.token:
        with conectar() as conn:
            conn.execute("DELETE FROM sessoes WHERE token = ?", (req.token,))
    raise Resposta(200, {"ok": True}, [req.cookie_sessao("", 0)])


def rota_eu(req):
    usuario = exigir_login(req)
    raise Resposta(200, {
        "usuario": usuario,
        "colunas": COLUNAS,
        "produtos": PRODUTOS,
        "usuarios": USUARIOS,
    })


def rota_trocar_senha(req):
    usuario = exigir_login(req)
    dados = req.json()
    atual, nova = dados.get("atual"), dados.get("nova")
    if not isinstance(atual, str) or not isinstance(nova, str):
        raise erro(400, "Dados inválidos.")
    with conectar() as conn:
        linha = conn.execute("SELECT senha_hash FROM usuarios WHERE nome = ?", (usuario,)).fetchone()
    if not conferir_senha(atual, linha["senha_hash"]):
        raise erro(400, "A senha atual está incorreta.")
    if len(nova) < TAMANHO_MINIMO_SENHA:
        raise erro(400, f"A nova senha precisa ter pelo menos {TAMANHO_MINIMO_SENHA} caracteres.")
    definir_senha(usuario, nova)
    token = criar_sessao(usuario)  # mantém quem trocou a senha logado
    raise Resposta(200, {"ok": True},
                   [req.cookie_sessao(token, int(DURACAO_SESSAO.total_seconds()))])


def rota_listar_leads(req):
    usuario = exigir_login(req)
    with conectar() as conn:
        if "visao=geral" in req.query:
            linhas = conn.execute("SELECT * FROM leads ORDER BY id").fetchall()
        else:
            linhas = conn.execute(
                "SELECT * FROM leads WHERE dono = ? ORDER BY id", (usuario,)
            ).fetchall()
    raise Resposta(200, {"leads": [lead_para_dict(l) for l in linhas]})


def rota_criar_lead(req):
    usuario = exigir_login(req)
    lead, msg = validar_lead(req.json())
    if msg:
        raise erro(400, msg)
    with conectar() as conn:
        cur = conn.execute(
            """INSERT INTO leads (nome, telefone, email, conta, produtos,
                                  data_criacao, observacoes, coluna, dono)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (lead["nome"], lead.get("telefone", ""), lead.get("email", ""),
             lead.get("conta", ""), lead["produtos"], date.today().isoformat(),
             lead.get("observacoes", ""), lead["coluna"], usuario),
        )
        novo = conn.execute("SELECT * FROM leads WHERE id = ?", (cur.lastrowid,)).fetchone()
    raise Resposta(201, lead_para_dict(novo))


def rota_editar_lead(req, lead_id):
    # Qualquer pessoa da equipe pode editar/mover (para ajudar um colega);
    # o dono do lead nunca muda.
    exigir_login(req)
    lead, msg = validar_lead(req.json(), parcial=True)
    if msg:
        raise erro(400, msg)
    if not lead:
        raise erro(400, "Nada para atualizar.")
    colunas_sql = ", ".join(f"{campo} = ?" for campo in lead)
    with conectar() as conn:
        cur = conn.execute(
            f"UPDATE leads SET {colunas_sql} WHERE id = ?", (*lead.values(), lead_id)
        )
        if cur.rowcount == 0:
            raise erro(404, "Lead não encontrado.")
        atualizado = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    raise Resposta(200, lead_para_dict(atualizado))


def rota_excluir_lead(req, lead_id):
    usuario = exigir_login(req)
    with conectar() as conn:
        linha = conn.execute("SELECT dono FROM leads WHERE id = ?", (lead_id,)).fetchone()
        if not linha:
            raise erro(404, "Lead não encontrado.")
        if linha["dono"] != usuario:
            raise erro(403, f"Só {linha['dono']} pode excluir este lead.")
        conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    raise Resposta(200, {"ok": True})


def despachar_api(req):
    partes = req.caminho.strip("/").split("/")  # ex.: ["api", "leads", "3"]
    rotas = {
        ("POST", "login"): rota_login,
        ("POST", "logout"): rota_logout,
        ("GET", "eu"): rota_eu,
        ("POST", "senha"): rota_trocar_senha,
        ("GET", "leads"): rota_listar_leads,
        ("POST", "leads"): rota_criar_lead,
    }
    if len(partes) == 2 and (req.metodo, partes[1]) in rotas:
        rotas[(req.metodo, partes[1])](req)
    if len(partes) == 3 and partes[1] == "leads" and partes[2].isdigit():
        if req.metodo == "PUT":
            rota_editar_lead(req, int(partes[2]))
        if req.metodo == "DELETE":
            rota_excluir_lead(req, int(partes[2]))
    raise erro(404, "Não encontrado.")


# ---------- arquivos da interface ----------

def servir_arquivo(req, start_response):
    nome = req.caminho.lstrip("/") or "index.html"
    arquivo = (PASTA_STATIC / nome).resolve()
    if PASTA_STATIC.resolve() not in arquivo.parents or not arquivo.is_file():
        start_response("404 Not Found", [("Content-Type", "text/plain; charset=utf-8")])
        return ["Página não encontrada.".encode()]
    tipo = mimetypes.guess_type(arquivo.name)[0] or "application/octet-stream"
    if tipo.startswith("text/") or tipo == "application/javascript":
        tipo += "; charset=utf-8"
    conteudo = arquivo.read_bytes()
    start_response("200 OK", [
        ("Content-Type", tipo),
        ("Content-Length", str(len(conteudo))),
        ("Cache-Control", "no-cache"),
    ])
    return [conteudo]


def application(environ, start_response):
    req = Requisicao(environ)
    if not req.caminho.startswith("/api/"):
        if req.metodo not in ("GET", "HEAD"):
            start_response("405 Method Not Allowed", [("Content-Type", "text/plain")])
            return [b""]
        return servir_arquivo(req, start_response)
    try:
        despachar_api(req)
    except Resposta as r:
        corpo = json.dumps(r.corpo, ensure_ascii=False).encode("utf-8")
        start_response(STATUS[r.status], [
            ("Content-Type", "application/json; charset=utf-8"),
            ("Content-Length", str(len(corpo))),
            ("Cache-Control", "no-store"),
            *r.cabecalhos,
        ])
        return [corpo]


criar_banco()
