"""
MASTER - CRM de leads da equipe Comercial 2.

Aplicação WSGI feita só com a biblioteca padrão do Python (nada para instalar).
- No seu computador: rode  python3 server.py
- No PythonAnywhere: o arquivo WSGI importa  application  daqui.
"""

import base64
import hashlib
import hmac
import json
import mimetypes
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from http.cookies import SimpleCookie
from pathlib import Path

PASTA_BASE = Path(__file__).resolve().parent
PASTA_STATIC = PASTA_BASE / "static"
PASTA_DADOS = PASTA_BASE / "dados"
ARQUIVO_BANCO = PASTA_DADOS / "crm.db"

USUARIOS = ["Libraga", "Paulinho", "Nico", "Dani", "Doug"]
ADMIN = "Libraga"  # pode trocar a foto de todos
DONO_LEADS_ANTIGOS = "Libraga"  # leads criados antes de existir login

RECORRENTES = "Contatos recorrentes"
COLUNAS_FUNIL = ["Em contato", "Negociando", "Proposta enviada", "Fechado"]
COLUNAS = [RECORRENTES] + COLUNAS_FUNIL
PRODUTOS = ["eGestor (NC)", "eGestor (CI)", "ProntoPost", "Site", "Vitrine"]
ORIGEM_CAMPANHA = "Campanha do WhatsApp"
ORIGENS = ["Banner ProntoPost", "Banner Vitrine", "Banner Site",
           ORIGEM_CAMPANHA, "Contato Ativo", "Indicação"]
MOTIVOS_DESCARTE = ["Lead fora do time de compra", "Lead não era o decisor",
                    "Lead perdeu o interesse", "Lead achou caro"]
TIPOS_FEEDBACK = ["Melhoria", "Sugestão", "Problema"]

# Conversão dos produtos da primeira versão do CRM
PRODUTOS_ANTIGOS = {"Site institucional": "Site", "Vitrine virtual": "Vitrine"}

# Horário de Brasília (o servidor do PythonAnywhere fica em outro fuso)
FUSO_BRASIL = timezone(timedelta(hours=-3))

COOKIE = "master_sessao"
DURACAO_SESSAO = timedelta(days=30)
ITERACOES_SENHA = 200_000
TAMANHO_MINIMO_SENHA = 8
MAX_FOTO_BYTES = 400 * 1024
MAX_AUDIO_BYTES = 5 * 1024 * 1024
MAX_TEXTO = 5000

# Proteção contra tentativas de adivinhar senha: após 5 erros, bloqueia 15 min
MAX_TENTATIVAS = 5
BLOQUEIO_SEGUNDOS = 15 * 60
_tentativas = {}  # usuario -> (quantidade de erros, horário do último erro)

VERSAO_BANCO = 4


def agora():
    """Data e hora de Brasília, no formato AAAA-MM-DDTHH:MM:SS."""
    return datetime.now(FUSO_BRASIL).replace(tzinfo=None).isoformat(timespec="seconds")


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def conectar():
    conn = sqlite3.connect(ARQUIVO_BANCO, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def banco():
    """Abre o banco; grava as mudanças se a rota terminou bem, desfaz se deu erro."""
    conn = conectar()
    try:
        yield conn
        conn.commit()
    except Resposta as r:
        if r.status < 400:
            conn.commit()
        else:
            conn.rollback()
        raise
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def colunas_da_tabela(conn, tabela):
    return {linha["name"] for linha in conn.execute(f"PRAGMA table_info({tabela})")}


def criar_tabela_leads_v3(conn, nome_tabela):
    """Formato das versões anteriores; as colunas novas são adicionadas em migrar_v4."""
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
    if "contato" not in colunas_da_tabela(conn, "leads"):
        return
    criar_tabela_leads_v3(conn, "leads_novo")
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
    if "dono" not in colunas_da_tabela(conn, "leads"):
        conn.execute(
            f"ALTER TABLE leads ADD COLUMN dono TEXT NOT NULL DEFAULT '{DONO_LEADS_ANTIGOS}'"
        )


def migrar_v4(conn):
    """Origem, proposta, descarte, anotações com data, atividades, chat e fotos."""
    existentes = colunas_da_tabela(conn, "leads")
    novas = {
        "origem": "TEXT NOT NULL DEFAULT ''",
        "origem_detalhe": "TEXT NOT NULL DEFAULT ''",
        "valor_proposta": "INTEGER",  # em centavos
        "descartado": "INTEGER NOT NULL DEFAULT 0",
        "motivo_descarte": "TEXT NOT NULL DEFAULT ''",
        "descartado_em": "TEXT NOT NULL DEFAULT ''",
        "descartado_por": "TEXT NOT NULL DEFAULT ''",
    }
    for nome, tipo in novas.items():
        if nome not in existentes:
            conn.execute(f"ALTER TABLE leads ADD COLUMN {nome} {tipo}")

    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS anotacoes (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id   INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
            texto     TEXT NOT NULL,
            autor     TEXT NOT NULL,
            criado_em TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS atividades (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id       INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
            descricao     TEXT NOT NULL,
            quando        TEXT NOT NULL,  -- AAAA-MM-DDTHH:MM (horário de Brasília)
            concluida     INTEGER NOT NULL DEFAULT 0,
            concluida_em  TEXT NOT NULL DEFAULT '',
            concluida_por TEXT NOT NULL DEFAULT '',
            criado_por    TEXT NOT NULL,
            criado_em     TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS conversas (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo        TEXT NOT NULL,          -- geral, direta ou grupo
            nome        TEXT NOT NULL DEFAULT '',
            chave       TEXT UNIQUE,            -- identifica a conversa direta/geral
            foto        BLOB,
            foto_versao INTEGER NOT NULL DEFAULT 0,
            criado_por  TEXT NOT NULL DEFAULT '',
            criado_em   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS membros (
            conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
            usuario     TEXT NOT NULL,
            lida_ate    INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (conversa_id, usuario)
        );
        CREATE TABLE IF NOT EXISTS mensagens (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
            autor       TEXT NOT NULL,
            tipo        TEXT NOT NULL,          -- texto, audio ou lead
            texto       TEXT NOT NULL DEFAULT '',
            lead_id     INTEGER,
            criado_em   TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audios (
            mensagem_id INTEGER PRIMARY KEY REFERENCES mensagens(id) ON DELETE CASCADE,
            mime        TEXT NOT NULL,
            dados       BLOB NOT NULL
        );
        CREATE TABLE IF NOT EXISTS feedbacks (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            autor     TEXT NOT NULL,
            tipo      TEXT NOT NULL,
            texto     TEXT NOT NULL,
            criado_em TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id, id);
        CREATE INDEX IF NOT EXISTS idx_atividades_lead ON atividades(lead_id);
        CREATE INDEX IF NOT EXISTS idx_anotacoes_lead ON anotacoes(lead_id);
        """
    )
    colunas_usuarios = colunas_da_tabela(conn, "usuarios")
    if "foto" not in colunas_usuarios:
        conn.execute("ALTER TABLE usuarios ADD COLUMN foto BLOB")
    if "foto_versao" not in colunas_usuarios:
        conn.execute("ALTER TABLE usuarios ADD COLUMN foto_versao INTEGER NOT NULL DEFAULT 0")

    # A observação antiga (texto único) vira a primeira anotação do lead
    for l in conn.execute("SELECT id, observacoes, dono, data_criacao FROM leads "
                          "WHERE observacoes != ''").fetchall():
        conn.execute(
            "INSERT INTO anotacoes (lead_id, texto, autor, criado_em) VALUES (?, ?, ?, ?)",
            (l["id"], l["observacoes"], l["dono"], l["data_criacao"] + "T00:00:00"),
        )
    conn.execute("UPDATE leads SET observacoes = ''")


def criar_banco():
    """Cria a pasta, o banco e os usuários na primeira execução."""
    PASTA_DADOS.mkdir(exist_ok=True)
    with banco() as conn:
        criar_tabela_leads_v3(conn, "leads")
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
        if conn.execute("PRAGMA user_version").fetchone()[0] < VERSAO_BANCO:
            migrar_v4(conn)
            conn.execute(f"PRAGMA user_version = {VERSAO_BANCO}")
        conn.executemany(
            "INSERT OR IGNORE INTO usuarios (nome) VALUES (?)",
            [(u,) for u in USUARIOS],
        )
        # Conversa geral "Comercial 2" com todos os usuários
        conn.execute(
            "INSERT OR IGNORE INTO conversas (tipo, nome, chave, criado_em) "
            "VALUES ('geral', 'Comercial 2', 'geral', ?)", (agora(),)
        )
        geral = conn.execute("SELECT id FROM conversas WHERE chave = 'geral'").fetchone()["id"]
        conn.executemany(
            "INSERT OR IGNORE INTO membros (conversa_id, usuario) VALUES (?, ?)",
            [(geral, u) for u in USUARIOS],
        )


def usuarios_sem_senha():
    with banco() as conn:
        linhas = conn.execute("SELECT nome FROM usuarios WHERE senha_hash IS NULL").fetchall()
    return [l["nome"] for l in linhas if l["nome"] in USUARIOS]


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
    with banco() as conn:
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
    with banco() as conn:
        conn.execute("DELETE FROM sessoes WHERE expira_em < ?", (datetime.now().isoformat(),))
        conn.execute("INSERT INTO sessoes VALUES (?, ?, ?)", (token, usuario, expira))
    return token


def usuario_da_sessao(token):
    if not token:
        return None
    with banco() as conn:
        linha = conn.execute(
            "SELECT usuario FROM sessoes WHERE token = ? AND expira_em > ?",
            (token, datetime.now().isoformat()),
        ).fetchone()
    if linha and linha["usuario"] in USUARIOS:
        return linha["usuario"]
    return None


# ---------------------------------------------------------------------------
# Aplicação web (WSGI) - infraestrutura
# ---------------------------------------------------------------------------

class Resposta(Exception):
    """Usada para encerrar uma rota devolvendo JSON (ou bytes, se tipo for dado)."""

    def __init__(self, status, corpo, cabecalhos=None, tipo=None):
        self.status = status
        self.corpo = corpo
        self.cabecalhos = cabecalhos or []
        self.tipo = tipo


STATUS = {200: "200 OK", 201: "201 Created", 400: "400 Bad Request",
          401: "401 Unauthorized", 403: "403 Forbidden", 404: "404 Not Found",
          405: "405 Method Not Allowed", 413: "413 Payload Too Large",
          429: "429 Too Many Requests"}


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

    def parametro(self, nome):
        for par in self.query.split("&"):
            chave, _, valor = par.partition("=")
            if chave == nome:
                return valor
        return ""

    def corpo(self, limite):
        try:
            tamanho = int(self.environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            tamanho = 0
        if tamanho > limite:
            raise erro(413, "Arquivo grande demais.")
        return self.environ["wsgi.input"].read(tamanho)

    def json(self):
        # Exigir JSON impede que outros sites enviem formulários em nome do usuário
        if not self.environ.get("CONTENT_TYPE", "").startswith("application/json"):
            raise erro(400, "Envie os dados em JSON.")
        try:
            dados = json.loads(self.corpo(MAX_FOTO_BYTES * 2) or b"{}")
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


def texto(dados, campo, obrigatorio=False, nome_amigavel=None, limite=MAX_TEXTO):
    valor = dados.get(campo, "")
    if valor is None:
        valor = ""
    if not isinstance(valor, str):
        raise erro(400, f"Campo '{campo}' inválido.")
    valor = valor.strip()[:limite]
    if obrigatorio and not valor:
        raise erro(400, f"Preencha {nome_amigavel or campo}.")
    return valor


def ler_imagem(data_url):
    """Converte 'data:image/jpeg;base64,...' em (bytes). None remove a foto."""
    if data_url is None:
        return None
    m = re.fullmatch(r"data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)", data_url or "")
    if not m:
        raise erro(400, "Imagem inválida.")
    dados = base64.b64decode(m.group(2))
    if len(dados) > MAX_FOTO_BYTES:
        raise erro(413, "Imagem grande demais.")
    return dados


def tipo_imagem(dados):
    if dados.startswith(b"\x89PNG"):
        return "image/png"
    if dados[8:12] == b"WEBP":
        return "image/webp"
    return "image/jpeg"


# ---------------------------------------------------------------------------
# Rotas: login, perfil e usuários
# ---------------------------------------------------------------------------

def rota_nomes(req):
    raise Resposta(200, {"usuarios": USUARIOS})


def rota_login(req):
    dados = req.json()
    usuario = nome_oficial(dados.get("usuario"))
    senha = dados.get("senha") if isinstance(dados.get("senha"), str) else ""
    if usuario and bloqueado(usuario):
        raise erro(429, "Muitas tentativas erradas. Aguarde 15 minutos e tente de novo.")
    with banco() as conn:
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
        with banco() as conn:
            conn.execute("DELETE FROM sessoes WHERE token = ?", (req.token,))
    raise Resposta(200, {"ok": True}, [req.cookie_sessao("", 0)])


def lista_usuarios(conn):
    linhas = conn.execute("SELECT nome, foto_versao FROM usuarios").fetchall()
    versoes = {l["nome"]: l["foto_versao"] for l in linhas}
    return [{"nome": u, "foto_versao": versoes.get(u, 0)} for u in USUARIOS]


def rota_eu(req):
    usuario = exigir_login(req)
    with banco() as conn:
        usuarios = lista_usuarios(conn)
    raise Resposta(200, {
        "usuario": usuario,
        "admin": usuario == ADMIN,
        "usuarios": usuarios,
        "colunas": COLUNAS,
        "recorrentes": RECORRENTES,
        "produtos": PRODUTOS,
        "origens": ORIGENS,
        "origem_campanha": ORIGEM_CAMPANHA,
        "motivos_descarte": MOTIVOS_DESCARTE,
        "tipos_feedback": TIPOS_FEEDBACK,
    })


def rota_usuarios(req):
    exigir_login(req)
    with banco() as conn:
        raise Resposta(200, {"usuarios": lista_usuarios(conn)})


def rota_trocar_senha(req):
    usuario = exigir_login(req)
    dados = req.json()
    atual, nova = dados.get("atual"), dados.get("nova")
    if not isinstance(atual, str) or not isinstance(nova, str):
        raise erro(400, "Dados inválidos.")
    with banco() as conn:
        linha = conn.execute("SELECT senha_hash FROM usuarios WHERE nome = ?", (usuario,)).fetchone()
    if not conferir_senha(atual, linha["senha_hash"]):
        raise erro(400, "A senha atual está incorreta.")
    if len(nova) < TAMANHO_MINIMO_SENHA:
        raise erro(400, f"A nova senha precisa ter pelo menos {TAMANHO_MINIMO_SENHA} caracteres.")
    definir_senha(usuario, nova)
    token = criar_sessao(usuario)  # mantém quem trocou a senha logado
    raise Resposta(200, {"ok": True},
                   [req.cookie_sessao(token, int(DURACAO_SESSAO.total_seconds()))])


def rota_trocar_foto(req, nome):
    usuario = exigir_login(req)
    alvo = nome_oficial(nome)
    if not alvo:
        raise erro(404, "Usuário não encontrado.")
    if alvo != usuario and usuario != ADMIN:
        raise erro(403, "Você só pode trocar a sua própria foto.")
    foto = ler_imagem(req.json().get("imagem"))
    with banco() as conn:
        if foto is None:
            conn.execute("UPDATE usuarios SET foto = NULL, foto_versao = 0 WHERE nome = ?", (alvo,))
        else:
            conn.execute("UPDATE usuarios SET foto = ?, foto_versao = foto_versao + 1 "
                         "WHERE nome = ?", (foto, alvo))
        raise Resposta(200, {"usuarios": lista_usuarios(conn)})


def rota_foto_usuario(req, nome):
    exigir_login(req)
    with banco() as conn:
        linha = conn.execute("SELECT foto FROM usuarios WHERE nome = ?", (nome,)).fetchone()
    if not linha or not linha["foto"]:
        raise erro(404, "Sem foto.")
    raise Resposta(200, linha["foto"], [("Cache-Control", "private, max-age=86400")],
                   tipo=tipo_imagem(linha["foto"]))


# ---------------------------------------------------------------------------
# Rotas: leads, anotações e atividades
# ---------------------------------------------------------------------------

def leads_completos(conn, where="", params=()):
    """Leads com suas anotações e atividades."""
    linhas = conn.execute(f"SELECT * FROM leads {where} ORDER BY id", params).fetchall()
    leads = []
    por_id = {}
    for l in linhas:
        lead = {
            "id": l["id"], "nome": l["nome"], "telefone": l["telefone"], "email": l["email"],
            "conta": l["conta"], "produtos": json.loads(l["produtos"]),
            "origem": l["origem"], "origem_detalhe": l["origem_detalhe"],
            "valor_proposta": l["valor_proposta"], "data_criacao": l["data_criacao"],
            "coluna": l["coluna"], "dono": l["dono"],
            "descartado": bool(l["descartado"]), "motivo_descarte": l["motivo_descarte"],
            "descartado_em": l["descartado_em"], "descartado_por": l["descartado_por"],
            "anotacoes": [], "atividades": [],
        }
        leads.append(lead)
        por_id[l["id"]] = lead
    if not por_id:
        return leads
    marcas = ",".join("?" * len(por_id))
    ids = tuple(por_id)
    for a in conn.execute(f"SELECT * FROM anotacoes WHERE lead_id IN ({marcas}) "
                          "ORDER BY criado_em DESC, id DESC", ids):
        por_id[a["lead_id"]]["anotacoes"].append(
            {"id": a["id"], "texto": a["texto"], "autor": a["autor"], "criado_em": a["criado_em"]})
    for a in conn.execute(f"SELECT * FROM atividades WHERE lead_id IN ({marcas}) "
                          "ORDER BY quando, id", ids):
        por_id[a["lead_id"]]["atividades"].append({
            "id": a["id"], "descricao": a["descricao"], "quando": a["quando"],
            "concluida": bool(a["concluida"]), "concluida_em": a["concluida_em"],
            "concluida_por": a["concluida_por"], "criado_por": a["criado_por"],
        })
    return leads


def lead_por_id(conn, lead_id):
    leads = leads_completos(conn, "WHERE id = ?", (lead_id,))
    if not leads:
        raise erro(404, "Lead não encontrado.")
    return leads[0]


def validar_lead(dados):
    """Recebe o lead completo (já mesclado) e devolve os campos limpos."""
    lead = {
        "nome": texto(dados, "nome", True, "o nome do lead", 200),
        "telefone": texto(dados, "telefone", limite=100),
        "email": texto(dados, "email", limite=200),
        "conta": texto(dados, "conta", limite=200),
        "origem": texto(dados, "origem", limite=100),
        "origem_detalhe": texto(dados, "origem_detalhe", limite=200),
        "coluna": texto(dados, "coluna") or COLUNAS_FUNIL[0],
    }
    if lead["coluna"] not in COLUNAS:
        raise erro(400, "Coluna inválida.")
    recorrente = lead["coluna"] == RECORRENTES

    produtos = dados.get("produtos") or []
    if not isinstance(produtos, list) or any(p not in PRODUTOS for p in produtos):
        raise erro(400, "Produto inválido.")
    if not produtos and not recorrente:
        raise erro(400, "Selecione ao menos um produto de interesse.")
    # Mantém a ordem padrão da lista de produtos, sem repetições
    lead["produtos"] = json.dumps([p for p in PRODUTOS if p in produtos])

    if lead["origem"] and lead["origem"] not in ORIGENS:
        raise erro(400, "Origem inválida.")
    if not lead["origem"] and not recorrente:
        raise erro(400, "Selecione a origem do lead.")
    if lead["origem"] != ORIGEM_CAMPANHA:
        lead["origem_detalhe"] = ""
    elif not lead["origem_detalhe"]:
        raise erro(400, "Informe qual foi a campanha do WhatsApp.")

    valor = dados.get("valor_proposta")
    if valor is not None and (not isinstance(valor, int) or isinstance(valor, bool)
                              or valor < 0 or valor > 10**12):
        raise erro(400, "Valor da proposta inválido.")
    lead["valor_proposta"] = valor
    return lead


def ler_atividade(dados):
    """Valida descrição, data (DD/MM/AAAA) e hora (HH:MM)."""
    descricao = texto(dados, "descricao", True, "a descrição da atividade", 500)
    data, hora = texto(dados, "data"), texto(dados, "hora")
    try:
        quando = datetime.strptime(f"{data} {hora}", "%d/%m/%Y %H:%M")
    except ValueError:
        raise erro(400, "Data ou hora inválida. Use DD/MM/AAAA e HH:MM.")
    return descricao, quando.strftime("%Y-%m-%dT%H:%M")


def rota_listar_leads(req):
    usuario = exigir_login(req)
    visao = req.parametro("visao")
    filtros = {
        "meus": ("WHERE dono = ? AND descartado = 0", (usuario,)),
        "geral": ("WHERE descartado = 0", ()),
        "meus_descartados": ("WHERE dono = ? AND descartado = 1", (usuario,)),
        "descartados": ("WHERE descartado = 1", ()),
        "tudo": ("", ()),
    }
    where, params = filtros.get(visao, filtros["meus"])
    with banco() as conn:
        raise Resposta(200, {"leads": leads_completos(conn, where, params)})


def rota_ver_lead(req, lead_id):
    exigir_login(req)
    with banco() as conn:
        raise Resposta(200, lead_por_id(conn, lead_id))


def rota_criar_lead(req):
    usuario = exigir_login(req)
    dados = req.json()
    lead = validar_lead(dados)
    anotacao = texto(dados, "anotacao")
    atividades = dados.get("atividades") or []
    if not isinstance(atividades, list):
        raise erro(400, "Atividades inválidas.")
    atividades = [ler_atividade(a) for a in atividades if isinstance(a, dict)]
    momento = agora()
    with banco() as conn:
        cur = conn.execute(
            """INSERT INTO leads (nome, telefone, email, conta, produtos, origem,
                                  origem_detalhe, valor_proposta, data_criacao, coluna, dono)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (lead["nome"], lead["telefone"], lead["email"], lead["conta"], lead["produtos"],
             lead["origem"], lead["origem_detalhe"], lead["valor_proposta"],
             momento[:10], lead["coluna"], usuario),
        )
        lead_id = cur.lastrowid
        if anotacao:
            conn.execute("INSERT INTO anotacoes (lead_id, texto, autor, criado_em) "
                         "VALUES (?, ?, ?, ?)", (lead_id, anotacao, usuario, momento))
        for descricao, quando in atividades:
            conn.execute("INSERT INTO atividades (lead_id, descricao, quando, criado_por, "
                         "criado_em) VALUES (?, ?, ?, ?, ?)",
                         (lead_id, descricao, quando, usuario, momento))
        raise Resposta(201, lead_por_id(conn, lead_id))


def rota_editar_lead(req, lead_id):
    # Qualquer pessoa da equipe pode editar/mover (para ajudar um colega);
    # o dono do lead nunca muda.
    exigir_login(req)
    dados = req.json()
    with banco() as conn:
        atual = lead_por_id(conn, lead_id)
        mesclado = {**atual, **dados}
        if (atual["coluna"] == RECORRENTES) != (mesclado.get("coluna") == RECORRENTES):
            raise erro(400, "Contatos recorrentes ficam fora do funil e não podem ser "
                            "movidos para as etapas (nem o contrário).")
        lead = validar_lead(mesclado)
        conn.execute(
            """UPDATE leads SET nome = ?, telefone = ?, email = ?, conta = ?, produtos = ?,
                   origem = ?, origem_detalhe = ?, valor_proposta = ?, coluna = ?
               WHERE id = ?""",
            (lead["nome"], lead["telefone"], lead["email"], lead["conta"], lead["produtos"],
             lead["origem"], lead["origem_detalhe"], lead["valor_proposta"], lead["coluna"],
             lead_id),
        )
        raise Resposta(200, lead_por_id(conn, lead_id))


def rota_descartar_lead(req, lead_id):
    usuario = exigir_login(req)
    motivo = texto(req.json(), "motivo")
    if motivo not in MOTIVOS_DESCARTE:
        raise erro(400, "Escolha o motivo do descarte.")
    with banco() as conn:
        lead_por_id(conn, lead_id)
        conn.execute("UPDATE leads SET descartado = 1, motivo_descarte = ?, descartado_em = ?, "
                     "descartado_por = ? WHERE id = ?", (motivo, agora(), usuario, lead_id))
        raise Resposta(200, lead_por_id(conn, lead_id))


def rota_restaurar_lead(req, lead_id):
    exigir_login(req)
    with banco() as conn:
        lead_por_id(conn, lead_id)
        conn.execute("UPDATE leads SET descartado = 0, motivo_descarte = '', descartado_em = '', "
                     "descartado_por = '' WHERE id = ?", (lead_id,))
        raise Resposta(200, lead_por_id(conn, lead_id))


def rota_excluir_lead(req, lead_id):
    usuario = exigir_login(req)
    with banco() as conn:
        lead = lead_por_id(conn, lead_id)
        if lead["dono"] != usuario:
            raise erro(403, f"Só {lead['dono']} pode excluir este lead.")
        conn.execute("DELETE FROM leads WHERE id = ?", (lead_id,))
    raise Resposta(200, {"ok": True})


def rota_criar_anotacao(req, lead_id):
    usuario = exigir_login(req)
    conteudo = texto(req.json(), "texto", True, "a anotação")
    with banco() as conn:
        lead_por_id(conn, lead_id)
        conn.execute("INSERT INTO anotacoes (lead_id, texto, autor, criado_em) VALUES (?, ?, ?, ?)",
                     (lead_id, conteudo, usuario, agora()))
        raise Resposta(201, lead_por_id(conn, lead_id))


def rota_excluir_anotacao(req, anotacao_id):
    usuario = exigir_login(req)
    with banco() as conn:
        linha = conn.execute("SELECT * FROM anotacoes WHERE id = ?", (anotacao_id,)).fetchone()
        if not linha:
            raise erro(404, "Anotação não encontrada.")
        if linha["autor"] != usuario:
            raise erro(403, f"Só {linha['autor']} pode excluir esta anotação.")
        conn.execute("DELETE FROM anotacoes WHERE id = ?", (anotacao_id,))
        raise Resposta(200, lead_por_id(conn, linha["lead_id"]))


def rota_criar_atividade(req, lead_id):
    usuario = exigir_login(req)
    descricao, quando = ler_atividade(req.json())
    with banco() as conn:
        lead_por_id(conn, lead_id)
        conn.execute("INSERT INTO atividades (lead_id, descricao, quando, criado_por, criado_em) "
                     "VALUES (?, ?, ?, ?, ?)", (lead_id, descricao, quando, usuario, agora()))
        raise Resposta(201, lead_por_id(conn, lead_id))


def atividade_por_id(conn, atividade_id):
    linha = conn.execute("SELECT * FROM atividades WHERE id = ?", (atividade_id,)).fetchone()
    if not linha:
        raise erro(404, "Atividade não encontrada.")
    return linha


def rota_editar_atividade(req, atividade_id):
    exigir_login(req)
    descricao, quando = ler_atividade(req.json())
    with banco() as conn:
        linha = atividade_por_id(conn, atividade_id)
        conn.execute("UPDATE atividades SET descricao = ?, quando = ? WHERE id = ?",
                     (descricao, quando, atividade_id))
        raise Resposta(200, lead_por_id(conn, linha["lead_id"]))


def rota_concluir_atividade(req, atividade_id):
    usuario = exigir_login(req)
    with banco() as conn:
        linha = atividade_por_id(conn, atividade_id)
        conn.execute("UPDATE atividades SET concluida = 1, concluida_em = ?, concluida_por = ? "
                     "WHERE id = ?", (agora(), usuario, atividade_id))
        raise Resposta(200, lead_por_id(conn, linha["lead_id"]))


def rota_excluir_atividade(req, atividade_id):
    exigir_login(req)
    with banco() as conn:
        linha = atividade_por_id(conn, atividade_id)
        conn.execute("DELETE FROM atividades WHERE id = ?", (atividade_id,))
        raise Resposta(200, lead_por_id(conn, linha["lead_id"]))


# ---------------------------------------------------------------------------
# Rotas: chat
# ---------------------------------------------------------------------------

def conversa_do_membro(conn, conversa_id, usuario):
    linha = conn.execute(
        "SELECT c.* FROM conversas c JOIN membros m ON m.conversa_id = c.id "
        "WHERE c.id = ? AND m.usuario = ?", (conversa_id, usuario)).fetchone()
    if not linha:
        raise erro(404, "Conversa não encontrada.")
    return linha


def resumo_mensagem(m):
    if m["tipo"] == "audio":
        return "🎤 Áudio"
    if m["tipo"] == "lead":
        return "📇 Lead compartilhado"
    return m["texto"][:80]


def rota_listar_conversas(req):
    usuario = exigir_login(req)
    with banco() as conn:
        linhas = conn.execute(
            "SELECT c.*, m.lida_ate FROM conversas c JOIN membros m ON m.conversa_id = c.id "
            "WHERE m.usuario = ?", (usuario,)).fetchall()
        conversas = []
        for c in linhas:
            membros = [r["usuario"] for r in conn.execute(
                "SELECT usuario FROM membros WHERE conversa_id = ?", (c["id"],))]
            ultima = conn.execute("SELECT * FROM mensagens WHERE conversa_id = ? "
                                  "ORDER BY id DESC LIMIT 1", (c["id"],)).fetchone()
            nao_lidas = conn.execute(
                "SELECT COUNT(*) FROM mensagens WHERE conversa_id = ? AND id > ? AND autor != ?",
                (c["id"], c["lida_ate"], usuario)).fetchone()[0]
            outro = next((m for m in membros if m != usuario), usuario) if c["tipo"] == "direta" else None
            conversas.append({
                "id": c["id"], "tipo": c["tipo"],
                "nome": outro if outro else c["nome"],
                "outro": outro, "membros": [u for u in USUARIOS if u in membros],
                "foto_versao": c["foto_versao"], "criado_por": c["criado_por"],
                "nao_lidas": nao_lidas,
                "ultima": {"autor": ultima["autor"], "resumo": resumo_mensagem(ultima),
                           "criado_em": ultima["criado_em"], "id": ultima["id"]} if ultima else None,
            })
    # Comercial 2 primeiro; depois as conversas com mensagem mais recente
    conversas.sort(key=lambda c: (c["tipo"] != "geral", -(c["ultima"]["id"] if c["ultima"] else 0)))
    raise Resposta(200, {"conversas": conversas,
                         "nao_lidas": sum(c["nao_lidas"] for c in conversas)})


def rota_mensagens(req, conversa_id):
    usuario = exigir_login(req)
    try:
        depois = int(req.parametro("depois") or 0)
    except ValueError:
        depois = 0
    with banco() as conn:
        conversa_do_membro(conn, conversa_id, usuario)
        linhas = conn.execute(
            "SELECT * FROM (SELECT m.*, l.nome AS lead_nome, l.dono AS lead_dono, "
            "l.coluna AS lead_coluna, l.telefone AS lead_telefone, l.descartado AS lead_descartado "
            "FROM mensagens m LEFT JOIN leads l ON l.id = m.lead_id "
            "WHERE m.conversa_id = ? AND m.id > ? ORDER BY m.id DESC LIMIT 300) ORDER BY id",
            (conversa_id, depois)).fetchall()
        mensagens = []
        for m in linhas:
            msg = {"id": m["id"], "autor": m["autor"], "tipo": m["tipo"], "texto": m["texto"],
                   "criado_em": m["criado_em"], "lead": None}
            if m["tipo"] == "lead":
                msg["lead"] = {"id": m["lead_id"], "nome": m["lead_nome"], "dono": m["lead_dono"],
                               "coluna": m["lead_coluna"], "telefone": m["lead_telefone"],
                               "descartado": bool(m["lead_descartado"]),
                               "existe": m["lead_nome"] is not None}
            mensagens.append(msg)
        if mensagens:
            conn.execute("UPDATE membros SET lida_ate = MAX(lida_ate, ?) "
                         "WHERE conversa_id = ? AND usuario = ?",
                         (mensagens[-1]["id"], conversa_id, usuario))
    raise Resposta(200, {"mensagens": mensagens})


def rota_enviar_mensagem(req, conversa_id):
    usuario = exigir_login(req)
    dados = req.json()
    tipo = dados.get("tipo")
    with banco() as conn:
        conversa_do_membro(conn, conversa_id, usuario)
        if tipo == "texto":
            conteudo, lead_id = texto(dados, "texto", True, "a mensagem"), None
        elif tipo == "lead":
            lead_id = dados.get("lead_id")
            if not isinstance(lead_id, int):
                raise erro(400, "Lead inválido.")
            lead_por_id(conn, lead_id)
            conteudo = ""
        else:
            raise erro(400, "Tipo de mensagem inválido.")
        conn.execute("INSERT INTO mensagens (conversa_id, autor, tipo, texto, lead_id, criado_em) "
                     "VALUES (?, ?, ?, ?, ?, ?)",
                     (conversa_id, usuario, tipo, conteudo, lead_id, agora()))
    raise Resposta(201, {"ok": True})


def rota_enviar_audio(req, conversa_id):
    usuario = exigir_login(req)
    # Cabeçalho próprio: impede que outro site envie áudio em nome do usuário
    if req.environ.get("HTTP_X_MASTER") != "1":
        raise erro(400, "Requisição inválida.")
    mime = req.environ.get("CONTENT_TYPE", "").split(";")[0].strip()
    if mime not in ("audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"):
        raise erro(400, "Formato de áudio não suportado.")
    dados = req.corpo(MAX_AUDIO_BYTES)
    if not dados:
        raise erro(400, "Áudio vazio.")
    with banco() as conn:
        conversa_do_membro(conn, conversa_id, usuario)
        cur = conn.execute("INSERT INTO mensagens (conversa_id, autor, tipo, criado_em) "
                           "VALUES (?, ?, 'audio', ?)", (conversa_id, usuario, agora()))
        conn.execute("INSERT INTO audios (mensagem_id, mime, dados) VALUES (?, ?, ?)",
                     (cur.lastrowid, mime, dados))
    raise Resposta(201, {"ok": True})


def rota_ouvir_audio(req, mensagem_id):
    usuario = exigir_login(req)
    with banco() as conn:
        linha = conn.execute(
            "SELECT a.mime, a.dados, m.conversa_id FROM audios a "
            "JOIN mensagens m ON m.id = a.mensagem_id WHERE a.mensagem_id = ?",
            (mensagem_id,)).fetchone()
        if not linha:
            raise erro(404, "Áudio não encontrado.")
        conversa_do_membro(conn, linha["conversa_id"], usuario)
    raise Resposta(200, linha["dados"], [("Cache-Control", "private, max-age=86400")],
                   tipo=linha["mime"])


def rota_conversa_direta(req):
    usuario = exigir_login(req)
    outro = nome_oficial(texto(req.json(), "usuario"))
    if not outro or outro == usuario:
        raise erro(400, "Escolha outra pessoa para conversar.")
    chave = "direta:" + "|".join(sorted([usuario, outro]))
    with banco() as conn:
        linha = conn.execute("SELECT id FROM conversas WHERE chave = ?", (chave,)).fetchone()
        if linha:
            conversa_id = linha["id"]
        else:
            conversa_id = conn.execute(
                "INSERT INTO conversas (tipo, chave, criado_por, criado_em) "
                "VALUES ('direta', ?, ?, ?)", (chave, usuario, agora())).lastrowid
            conn.executemany("INSERT INTO membros (conversa_id, usuario, lida_ate) "
                             "VALUES (?, ?, 0)", [(conversa_id, usuario), (conversa_id, outro)])
    raise Resposta(200, {"id": conversa_id})


def ler_grupo(dados, usuario):
    nome = texto(dados, "nome", True, "o nome do grupo", 80)
    membros = dados.get("membros") or []
    if not isinstance(membros, list):
        raise erro(400, "Participantes inválidos.")
    membros = {nome_oficial(m) for m in membros if isinstance(m, str)} - {None}
    membros.add(usuario)
    if len(membros) < 2:
        raise erro(400, "Escolha pelo menos uma pessoa para o grupo.")
    return nome, membros


def rota_criar_grupo(req):
    usuario = exigir_login(req)
    dados = req.json()
    nome, membros = ler_grupo(dados, usuario)
    foto = ler_imagem(dados.get("foto")) if dados.get("foto") else None
    with banco() as conn:
        conversa_id = conn.execute(
            "INSERT INTO conversas (tipo, nome, foto, foto_versao, criado_por, criado_em) "
            "VALUES ('grupo', ?, ?, ?, ?, ?)",
            (nome, foto, 1 if foto else 0, usuario, agora())).lastrowid
        conn.executemany("INSERT INTO membros (conversa_id, usuario) VALUES (?, ?)",
                         [(conversa_id, m) for m in membros])
    raise Resposta(201, {"id": conversa_id})


def rota_editar_grupo(req, conversa_id):
    usuario = exigir_login(req)
    dados = req.json()
    nome, membros = ler_grupo(dados, usuario)
    with banco() as conn:
        conversa = conversa_do_membro(conn, conversa_id, usuario)
        if conversa["tipo"] != "grupo":
            raise erro(400, "Só grupos podem ser editados.")
        conn.execute("UPDATE conversas SET nome = ? WHERE id = ?", (nome, conversa_id))
        if "foto" in dados:
            foto = ler_imagem(dados["foto"]) if dados["foto"] else None
            conn.execute("UPDATE conversas SET foto = ?, foto_versao = ? WHERE id = ?",
                         (foto, conversa["foto_versao"] + 1 if foto else 0, conversa_id))
        atuais = {r["usuario"] for r in conn.execute(
            "SELECT usuario FROM membros WHERE conversa_id = ?", (conversa_id,))}
        for m in membros - atuais:
            conn.execute("INSERT INTO membros (conversa_id, usuario) VALUES (?, ?)", (conversa_id, m))
        for m in atuais - membros:
            conn.execute("DELETE FROM membros WHERE conversa_id = ? AND usuario = ?", (conversa_id, m))
    raise Resposta(200, {"id": conversa_id})


def rota_sair_grupo(req, conversa_id):
    usuario = exigir_login(req)
    with banco() as conn:
        conversa = conversa_do_membro(conn, conversa_id, usuario)
        if conversa["tipo"] != "grupo":
            raise erro(400, "Só é possível sair de grupos.")
        conn.execute("DELETE FROM membros WHERE conversa_id = ? AND usuario = ?",
                     (conversa_id, usuario))
        restantes = conn.execute("SELECT COUNT(*) FROM membros WHERE conversa_id = ?",
                                 (conversa_id,)).fetchone()[0]
        if restantes == 0:
            conn.execute("DELETE FROM conversas WHERE id = ?", (conversa_id,))
    raise Resposta(200, {"ok": True})


def rota_foto_conversa(req, conversa_id):
    usuario = exigir_login(req)
    with banco() as conn:
        conversa = conversa_do_membro(conn, conversa_id, usuario)
    if not conversa["foto"]:
        raise erro(404, "Sem foto.")
    raise Resposta(200, conversa["foto"], [("Cache-Control", "private, max-age=86400")],
                   tipo=tipo_imagem(conversa["foto"]))


# ---------------------------------------------------------------------------
# Rotas: feedbacks
# ---------------------------------------------------------------------------

def rota_listar_feedbacks(req):
    exigir_login(req)
    with banco() as conn:
        linhas = conn.execute("SELECT * FROM feedbacks ORDER BY id DESC").fetchall()
    raise Resposta(200, {"feedbacks": [dict(l) for l in linhas]})


def rota_criar_feedback(req):
    usuario = exigir_login(req)
    dados = req.json()
    tipo = texto(dados, "tipo")
    if tipo not in TIPOS_FEEDBACK:
        raise erro(400, "Escolha o tipo do feedback.")
    conteudo = texto(dados, "texto", True, "o seu feedback")
    with banco() as conn:
        conn.execute("INSERT INTO feedbacks (autor, tipo, texto, criado_em) VALUES (?, ?, ?, ?)",
                     (usuario, tipo, conteudo, agora()))
    raise Resposta(201, {"ok": True})


# ---------------------------------------------------------------------------
# Roteamento
# ---------------------------------------------------------------------------

ROTAS = [
    ("GET", r"/api/nomes", rota_nomes),
    ("POST", r"/api/login", rota_login),
    ("POST", r"/api/logout", rota_logout),
    ("GET", r"/api/eu", rota_eu),
    ("POST", r"/api/senha", rota_trocar_senha),
    ("GET", r"/api/usuarios", rota_usuarios),
    ("PUT", r"/api/usuarios/([^/]+)/foto", rota_trocar_foto),
    ("GET", r"/api/foto/usuario/([^/]+)", rota_foto_usuario),
    ("GET", r"/api/leads", rota_listar_leads),
    ("POST", r"/api/leads", rota_criar_lead),
    ("GET", r"/api/leads/(\d+)", rota_ver_lead),
    ("PUT", r"/api/leads/(\d+)", rota_editar_lead),
    ("DELETE", r"/api/leads/(\d+)", rota_excluir_lead),
    ("POST", r"/api/leads/(\d+)/descartar", rota_descartar_lead),
    ("POST", r"/api/leads/(\d+)/restaurar", rota_restaurar_lead),
    ("POST", r"/api/leads/(\d+)/anotacoes", rota_criar_anotacao),
    ("DELETE", r"/api/anotacoes/(\d+)", rota_excluir_anotacao),
    ("POST", r"/api/leads/(\d+)/atividades", rota_criar_atividade),
    ("PUT", r"/api/atividades/(\d+)", rota_editar_atividade),
    ("POST", r"/api/atividades/(\d+)/concluir", rota_concluir_atividade),
    ("DELETE", r"/api/atividades/(\d+)", rota_excluir_atividade),
    ("GET", r"/api/conversas", rota_listar_conversas),
    ("POST", r"/api/conversas/direta", rota_conversa_direta),
    ("POST", r"/api/conversas/grupo", rota_criar_grupo),
    ("PUT", r"/api/conversas/(\d+)", rota_editar_grupo),
    ("POST", r"/api/conversas/(\d+)/sair", rota_sair_grupo),
    ("GET", r"/api/conversas/(\d+)/mensagens", rota_mensagens),
    ("POST", r"/api/conversas/(\d+)/mensagens", rota_enviar_mensagem),
    ("POST", r"/api/conversas/(\d+)/audio", rota_enviar_audio),
    ("GET", r"/api/audio/(\d+)", rota_ouvir_audio),
    ("GET", r"/api/foto/conversa/(\d+)", rota_foto_conversa),
    ("GET", r"/api/feedbacks", rota_listar_feedbacks),
    ("POST", r"/api/feedbacks", rota_criar_feedback),
]
ROTAS = [(m, re.compile(p + r"/?"), f) for m, p, f in ROTAS]


def despachar_api(req):
    for metodo, padrao, funcao in ROTAS:
        encontrado = padrao.fullmatch(req.caminho)
        if encontrado and metodo == req.metodo:
            args = [int(g) if g.isdigit() else g for g in encontrado.groups()]
            funcao(req, *args)
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
        if r.tipo:
            corpo, tipo = r.corpo, r.tipo
        else:
            corpo = json.dumps(r.corpo, ensure_ascii=False).encode("utf-8")
            tipo = "application/json; charset=utf-8"
        cabecalhos = [("Content-Type", tipo), ("Content-Length", str(len(corpo)))]
        if not any(c[0] == "Cache-Control" for c in r.cabecalhos):
            cabecalhos.append(("Cache-Control", "no-store"))
        start_response(STATUS[r.status], cabecalhos + r.cabecalhos)
        return [corpo]


criar_banco()
