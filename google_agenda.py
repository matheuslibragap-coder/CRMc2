"""
Conversa com o Google (login OAuth e Google Agenda) usando só a biblioteca padrão.

As credenciais do projeto no Google Cloud ficam em dados/google.json (criado por
configurar_google.py) e nunca vão para o GitHub.
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta

# Endereços do Google (podem ser trocados por variáveis de ambiente só para testes)
URL_AUTORIZACAO = os.environ.get("MASTER_GOOGLE_AUTH", "https://accounts.google.com/o/oauth2/v2/auth")
URL_TOKEN = os.environ.get("MASTER_GOOGLE_TOKEN", "https://oauth2.googleapis.com/token")
URL_REVOGAR = os.environ.get("MASTER_GOOGLE_REVOKE", "https://oauth2.googleapis.com/revoke")
URL_API = os.environ.get("MASTER_GOOGLE_API", "https://www.googleapis.com/calendar/v3")

ESCOPO = "https://www.googleapis.com/auth/calendar.events"
FUSO = "America/Sao_Paulo"
DURACAO_PADRAO = timedelta(minutes=30)
TEMPO_LIMITE = 15  # segundos


class GoogleErro(Exception):
    """Falha ao falar com o Google (a atividade continua salva no MASTER)."""


class GoogleDesconectado(GoogleErro):
    """A autorização foi revogada ou expirou: a pessoa precisa conectar de novo."""


def carregar_config(arquivo):
    """Devolve {'client_id', 'client_secret'} ou None se a integração não foi configurada."""
    try:
        dados = json.loads(arquivo.read_text())
    except (OSError, ValueError):
        return None
    if dados.get("client_id") and dados.get("client_secret"):
        return dados
    return None


def _requisicao(metodo, url, token=None, corpo_json=None, formulario=None):
    cabecalhos = {"Accept": "application/json"}
    dados = None
    if token:
        cabecalhos["Authorization"] = f"Bearer {token}"
    if corpo_json is not None:
        dados = json.dumps(corpo_json).encode()
        cabecalhos["Content-Type"] = "application/json"
    if formulario is not None:
        dados = urllib.parse.urlencode(formulario).encode()
        cabecalhos["Content-Type"] = "application/x-www-form-urlencoded"
    pedido = urllib.request.Request(url, data=dados, headers=cabecalhos, method=metodo)
    try:
        with urllib.request.urlopen(pedido, timeout=TEMPO_LIMITE) as resp:
            conteudo = resp.read()
            return resp.status, json.loads(conteudo) if conteudo else {}
    except urllib.error.HTTPError as e:
        try:
            detalhe = json.loads(e.read() or b"{}")
        except ValueError:
            detalhe = {}
        return e.code, detalhe
    except (urllib.error.URLError, TimeoutError, OSError):
        raise GoogleErro("Sem conexão com o Google agora. Tente reenviar em instantes.")


# ---------- login (OAuth) ----------

def url_autorizacao(config, redirecionamento, estado):
    parametros = {
        "client_id": config["client_id"],
        "redirect_uri": redirecionamento,
        "response_type": "code",
        "scope": ESCOPO,
        "access_type": "offline",   # para receber o refresh_token
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": estado,
    }
    return f"{URL_AUTORIZACAO}?{urllib.parse.urlencode(parametros)}"


def _ler_token(status, dados):
    if status == 400 and dados.get("error") == "invalid_grant":
        raise GoogleDesconectado("A autorização do Google expirou. Conecte a Google Agenda de novo.")
    if status != 200 or "access_token" not in dados:
        raise GoogleErro(f"O Google recusou o login ({dados.get('error', status)}).")
    expira = datetime.now() + timedelta(seconds=int(dados.get("expires_in", 3600)) - 60)
    return dados["access_token"], dados.get("refresh_token"), expira.isoformat()


def trocar_codigo(config, codigo, redirecionamento):
    """Troca o código recebido pelo retorno do Google por (access, refresh, expira_em)."""
    status, dados = _requisicao("POST", URL_TOKEN, formulario={
        "code": codigo,
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "redirect_uri": redirecionamento,
        "grant_type": "authorization_code",
    })
    return _ler_token(status, dados)


def renovar(config, refresh_token):
    status, dados = _requisicao("POST", URL_TOKEN, formulario={
        "refresh_token": refresh_token,
        "client_id": config["client_id"],
        "client_secret": config["client_secret"],
        "grant_type": "refresh_token",
    })
    access, _, expira = _ler_token(status, dados)
    return access, expira


def revogar(refresh_token):
    try:
        _requisicao("POST", URL_REVOGAR, formulario={"token": refresh_token})
    except GoogleErro:
        pass  # desconectar no MASTER funciona mesmo se o Google não responder


# ---------- Google Agenda ----------

def _verificar(status, dados, acao):
    if status == 401:
        raise GoogleDesconectado("A autorização do Google expirou. Conecte a Google Agenda de novo.")
    if status >= 300:
        mensagem = (dados.get("error") or {}).get("message") if isinstance(dados.get("error"), dict) else None
        raise GoogleErro(f"O Google não deixou {acao} ({mensagem or status}).")


def email_da_agenda(token):
    """O id da agenda principal é o e-mail da conta."""
    status, dados = _requisicao("GET", f"{URL_API}/calendars/primary", token)
    _verificar(status, dados, "ler a agenda")
    return dados.get("id", "")


def _horario(dt):
    return {"dateTime": dt.strftime("%Y-%m-%dT%H:%M:%S"), "timeZone": FUSO}


def criar_evento(token, titulo, descricao, inicio):
    """Cria o evento de 30 minutos e devolve (id, link)."""
    corpo = {
        "summary": titulo,
        "description": descricao,
        "start": _horario(inicio),
        "end": _horario(inicio + DURACAO_PADRAO),
    }
    status, dados = _requisicao("POST", f"{URL_API}/calendars/primary/events", token, corpo)
    _verificar(status, dados, "criar o evento")
    return dados["id"], dados.get("htmlLink", "")


def atualizar_evento(token, evento_id, titulo, descricao, inicio):
    """Muda título, descrição e horário, mantendo a duração que a pessoa deixou no Google."""
    caminho = f"{URL_API}/calendars/primary/events/{urllib.parse.quote(evento_id)}"
    status, atual = _requisicao("GET", caminho, token)
    if status in (404, 410):
        return criar_evento(token, titulo, descricao, inicio)
    _verificar(status, atual, "ler o evento")
    duracao = DURACAO_PADRAO
    try:
        comeco = datetime.fromisoformat(atual["start"]["dateTime"])
        fim = datetime.fromisoformat(atual["end"]["dateTime"])
        if fim > comeco:
            duracao = fim - comeco
    except (KeyError, ValueError, TypeError):
        pass
    corpo = {
        "summary": titulo,
        "description": descricao,
        "start": _horario(inicio),
        "end": _horario(inicio + duracao),
    }
    status, dados = _requisicao("PATCH", caminho, token, corpo)
    _verificar(status, dados, "alterar o evento")
    return dados.get("id", evento_id), dados.get("htmlLink", "")


def apagar_evento(token, evento_id):
    caminho = f"{URL_API}/calendars/primary/events/{urllib.parse.quote(evento_id)}"
    status, dados = _requisicao("DELETE", caminho, token)
    if status in (404, 410):
        return  # já não existe no Google
    _verificar(status, dados, "apagar o evento")
