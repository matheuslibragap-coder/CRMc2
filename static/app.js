// MASTER - núcleo da interface: login, menu, páginas, perfil e utilidades

const estado = {
  usuario: null,
  admin: false,
  usuarios: [],   // [{nome, foto_versao}]
  config: {},     // colunas, produtos, origens, motivos...
  pagina: "kanban",
};

// Guia aberta pelo "↗ Nova guia" de um lead: o endereço vem com ?lead=ID
let leadNaGuia = Number(new URLSearchParams(location.search).get("lead")) || null;

const telaLogin = document.getElementById("tela-login");
const telaApp = document.getElementById("tela-app");

// ---------- utilidades ----------
async function api(metodo, url, corpo) {
  const resp = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resp.json().catch(() => ({}));
  if (resp.status === 401 && estado.usuario) mostrarLogin();
  if (!resp.ok) {
    const falha = new Error(dados.erro || "Erro ao falar com o servidor.");
    falha.status = resp.status;
    falha.dados = dados;
    throw falha;
  }
  return dados;
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined && texto !== null) e.textContent = texto;
  return e;
}

function mostrarErro(elemento, mensagem) {
  elemento.textContent = mensagem;
  elemento.hidden = !mensagem;
}

// Preferências guardadas no navegador (só conveniência; funciona sem elas)
function lerLocal(chave) {
  try { return localStorage.getItem(chave); } catch (e) { return null; }
}
function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch (e) { /* navegador bloqueou; sem problema */ }
}

const dois = (n) => String(n).padStart(2, "0");

// "2026-09-23T14:05:00" -> "23/09/2026 14:05"
function formatarDataHora(iso) {
  if (!iso) return "";
  const [d, h = ""] = iso.split("T");
  return `${formatarData(d)} ${h.slice(0, 5)}`.trim();
}

// "2026-09-23" -> "23/09/2026"
function formatarData(iso) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

function hojeISO(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

const formatoReal = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function formatarReais(centavos) {
  return formatoReal.format((centavos || 0) / 100);
}

// Aceita "1.500", "1.500,50", "1500.50", "R$ 500" -> centavos (ou null se vazio)
function lerReais(textoValor) {
  let t = (textoValor || "").replace(/R\$|\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (!/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  if (!isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

function valorParaCampo(centavos) {
  if (centavos === null || centavos === undefined) return "";
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Máscaras dos campos de data (DD/MM/AAAA) e hora (HH:MM)
function mascaraData(input) {
  input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
  });
}
function mascaraHora(input) {
  input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").slice(0, 4);
    input.value = d.length > 2 ? `${d.slice(0, 2)}:${d.slice(2)}` : d;
  });
}

let timerCopiado;
async function copiar(textoCopia) {
  const aviso = document.getElementById("aviso-copiado");
  try {
    await navigator.clipboard.writeText(textoCopia);
    aviso.textContent = "Copiado!";
  } catch (e) {
    aviso.textContent = "Não foi possível copiar. Selecione o texto e use Ctrl+C.";
  }
  aviso.hidden = false;
  clearTimeout(timerCopiado);
  timerCopiado = setTimeout(() => (aviso.hidden = true), 1600);
}

// ---------- fotos / avatares ----------
function dadosUsuario(nome) {
  return estado.usuarios.find((u) => u.nome === nome) || { nome, foto_versao: 0 };
}

function avatar(nome, classeExtra = "") {
  const caixa = el("span", `avatar ${classeExtra}`);
  caixa.title = nome;
  const u = dadosUsuario(nome);
  if (u.foto_versao > 0) {
    const img = el("img");
    img.src = `/api/foto/usuario/${encodeURIComponent(nome)}?v=${u.foto_versao}`;
    img.alt = nome;
    // Se a foto não carregar, volta para o astronauta
    img.onerror = () => (caixa.innerHTML = svgAstronauta(corUsuario(nome)));
    caixa.append(img);
  } else {
    caixa.innerHTML = svgAstronauta(corUsuario(nome));
  }
  return caixa;
}

function preencherAvatar(caixa, nome, classeExtra) {
  caixa.innerHTML = "";
  caixa.append(avatar(nome, classeExtra));
}

// Abre o seletor de arquivos e devolve a imagem recortada em quadrado (256x256, JPEG)
function escolherImagem() {
  return new Promise((resolve) => {
    const input = document.getElementById("arquivo-foto");
    input.value = "";
    input.onchange = () => {
      const arquivo = input.files[0];
      if (!arquivo) return resolve(null);
      const img = new Image();
      const url = URL.createObjectURL(arquivo);
      img.onload = () => {
        const lado = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 256;
        canvas.getContext("2d").drawImage(
          img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, 256, 256);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        alert("Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.");
        resolve(null);
      };
      img.src = url;
    };
    input.click();
  });
}

async function trocarFotoDe(nome, imagem) {
  const dados = await api("PUT", `/api/usuarios/${encodeURIComponent(nome)}/foto`, { imagem });
  estado.usuarios = dados.usuarios;
  atualizarAvatares();
}

function atualizarAvatares() {
  preencherAvatar(document.getElementById("avatar-topo"), estado.usuario);
  preencherAvatar(document.getElementById("avatar-perfil"), estado.usuario, "avatar-grande");
  if (estado.pagina === "kanban") desenhar();
  if (estado.pagina === "participantes") desenharParticipantes();
  if (estado.pagina === "chat") redesenharChat();
}

// ---------- login ----------
async function carregarNomesLogin() {
  const select = document.querySelector("#form-login select[name=usuario]");
  try {
    const { usuarios } = await api("GET", "/api/nomes");
    select.length = 1;
    usuarios.forEach((u) => select.append(new Option(u, u)));
  } catch (e) { /* mantém a lista vazia; o erro aparece ao tentar entrar */ }
}

function mostrarLogin() {
  estado.usuario = null;
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  fecharMenu();
  telaApp.hidden = true;
  telaLogin.hidden = false;
  document.getElementById("form-login").senha.value = "";
  carregarNomesLogin();
}

async function iniciar() {
  aplicarIcones();
  try {
    entrarNoSistema(await api("GET", "/api/eu"));
  } catch (e) {
    mostrarLogin();
  }
}

function entrarNoSistema(dados) {
  estado.usuario = dados.usuario;
  estado.admin = dados.admin;
  estado.coordenador = dados.coordenador;
  estado.usuarios = dados.usuarios;
  estado.config = dados;
  estado.google = dados.google;
  document.getElementById("nome-usuario").textContent = estado.usuario;
  telaLogin.hidden = true;
  telaApp.hidden = false;
  preencherAvatar(document.getElementById("avatar-topo"), estado.usuario);
  document.getElementById("menu-admin").hidden = !estado.admin;
  prepararFormularioLead();
  prepararFeedbacks();
  irPara("kanban");
  trocarVisao(estado.coordenador ? "geral" : "meus");
  iniciarAvisosChat();
  iniciarLembretes(!leadNaGuia);
  avisoRetornoGoogle();
  if (leadNaGuia) abrirLeadNaGuia();
}

// Abre o lead do endereço; ao fechar a janela, a guia vira um MASTER normal
async function abrirLeadNaGuia() {
  await abrirLeadPorId(leadNaGuia);
  if (leadAtual && leadAtual.id === leadNaGuia) document.title = `${leadAtual.nome} · MASTER`;
  const voltarAoNormal = () => {
    leadNaGuia = null;
    document.title = "MASTER";
    history.replaceState(null, "", "/");
  };
  if (modal.open) modal.addEventListener("close", voltarAoNormal, { once: true });
  else voltarAoNormal();
}

// ---------- Google Agenda ----------
const MENSAGENS_GOOGLE = {
  ok: "✅ Google Agenda conectada! As novas atividades vão direto para a sua agenda.",
  cancelado: "A conexão com o Google Agenda foi cancelada.",
  erro: "Não foi possível conectar a Google Agenda. Tente de novo; se continuar, avise o Libraga.",
  "nao-configurado": "A integração com o Google Agenda ainda não foi configurada no servidor (veja a Ajuda).",
};

// Depois de voltar do Google, o endereço vem com ?google=ok (ou erro/cancelado)
function avisoRetornoGoogle() {
  const resultado = new URLSearchParams(location.search).get("google");
  if (!resultado) return;
  history.replaceState(null, "", "/");
  if (MENSAGENS_GOOGLE[resultado]) setTimeout(() => alert(MENSAGENS_GOOGLE[resultado]), 300);
}

function mostrarSituacaoGoogle() {
  const g = estado.google || {};
  const texto = document.getElementById("google-situacao");
  const conectar = document.getElementById("btn-google-conectar");
  const desconectar = document.getElementById("btn-google-desconectar");
  if (!g.configurado) {
    texto.textContent = "A integração ainda não foi configurada no servidor. Veja o passo a passo na Ajuda.";
    conectar.hidden = desconectar.hidden = true;
  } else if (g.conectado) {
    texto.textContent = `Conectada${g.email ? " em " + g.email : ""}. Cada atividade que você cria vira um evento “NOME/CONTA” de 30 minutos na sua agenda.`;
    conectar.hidden = true;
    desconectar.hidden = false;
  } else {
    texto.textContent = "Conecte para que cada atividade criada vá direto para a sua Google Agenda.";
    conectar.hidden = false;
    desconectar.hidden = true;
  }
}

document.getElementById("btn-google-desconectar").onclick = async () => {
  if (!confirm("Desconectar a Google Agenda? Os eventos já criados continuam na agenda.")) return;
  try {
    estado.google = (await api("POST", "/api/google/desconectar")).google;
    mostrarSituacaoGoogle();
  } catch (e) { alert(e.message); }
};

document.getElementById("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const erroLogin = document.getElementById("login-erro");
  mostrarErro(erroLogin, "");
  try {
    await api("POST", "/api/login", { usuario: f.usuario.value, senha: f.senha.value });
    entrarNoSistema(await api("GET", "/api/eu"));
  } catch (e) {
    mostrarErro(erroLogin, e.message);
  }
});

async function sair() {
  await api("POST", "/api/logout").catch(() => {});
  pararAvisosChat();
  pararLembretes();
  mostrarLogin();
}

// ---------- menu lateral e páginas ----------
const menu = document.getElementById("menu");
const menuFundo = document.getElementById("menu-fundo");

function abrirMenu() {
  menu.classList.add("aberto");
  menu.setAttribute("aria-hidden", "false");
  menuFundo.hidden = false;
}
function fecharMenu() {
  menu.classList.remove("aberto");
  menu.setAttribute("aria-hidden", "true");
  menuFundo.hidden = true;
}

document.getElementById("btn-menu").onclick = abrirMenu;
document.getElementById("btn-fechar-menu").onclick = fecharMenu;
menuFundo.onclick = fecharMenu;
document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") fecharMenu(); });

document.querySelectorAll(".menu-item[data-pagina]").forEach((item) => {
  item.onclick = () => { fecharMenu(); irPara(item.dataset.pagina); };
});
document.getElementById("menu-perfil").onclick = () => { fecharMenu(); abrirPerfil(); };
document.getElementById("menu-meu-dia").onclick = () => { fecharMenu(); abrirMeuDia(); };
document.getElementById("menu-sair").onclick = () => { fecharMenu(); sair(); };
document.getElementById("btn-chat").onclick = () => irPara("chat");

function irPara(pagina) {
  estado.pagina = pagina;
  document.querySelectorAll(".pagina").forEach((p) => (p.hidden = p.id !== `pagina-${pagina}`));
  document.querySelectorAll(".menu-item[data-pagina]").forEach((i) =>
    i.classList.toggle("ativo", i.dataset.pagina === pagina));
  document.getElementById("btn-chat").classList.toggle("ativo", pagina === "chat");
  document.getElementById("btn-carteira").classList.toggle("ativo", pagina === "carteira");
  document.getElementById("btn-agenda").classList.toggle("ativo", pagina === "agenda");
  document.getElementById("btn-novo").hidden = pagina !== "kanban";
  if (pagina === "kanban") carregarLeads();
  if (pagina === "carteira") carregarCarteira();
  if (pagina === "decolagem") abrirDecolagem();
  if (pagina === "agenda") abrirAgenda();
  if (pagina === "admin") abrirAdmin();
  if (pagina === "relatorios") abrirRelatorios();
  if (pagina === "chat") abrirChat();
  if (pagina === "participantes") abrirParticipantes();
  if (pagina === "feedbacks") carregarFeedbacks();
  if (pagina === "ajuda") abrirAjuda();
  window.scrollTo(0, 0);
}

// Botões "fechar/cancelar" de qualquer janela
document.querySelectorAll("[data-fechar]").forEach((b) => {
  b.addEventListener("click", () => document.getElementById(b.dataset.fechar).close());
});

// ---------- perfil ----------
const modalPerfil = document.getElementById("modal-perfil");
const formSenha = document.getElementById("form-senha");

function abrirPerfil() {
  formSenha.reset();
  mostrarErro(document.getElementById("senha-erro"), "");
  preencherAvatar(document.getElementById("avatar-perfil"), estado.usuario, "avatar-grande");
  mostrarSituacaoGoogle();
  modalPerfil.showModal();
}
document.getElementById("btn-perfil").onclick = abrirPerfil;
document.getElementById("btn-sair-perfil").onclick = () => { modalPerfil.close(); sair(); };

document.getElementById("btn-escolher-foto").onclick = async () => {
  const imagem = await escolherImagem();
  if (!imagem) return;
  try { await trocarFotoDe(estado.usuario, imagem); } catch (e) { alert(e.message); }
};
document.getElementById("btn-remover-foto").onclick = async () => {
  try { await trocarFotoDe(estado.usuario, null); } catch (e) { alert(e.message); }
};

formSenha.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const senhaErro = document.getElementById("senha-erro");
  mostrarErro(senhaErro, "");
  if (formSenha.nova.value !== formSenha.confirma.value) {
    return mostrarErro(senhaErro, "As duas novas senhas não são iguais.");
  }
  try {
    await api("POST", "/api/senha", { atual: formSenha.atual.value, nova: formSenha.nova.value });
    formSenha.reset();
    alert("Senha trocada com sucesso!");
  } catch (e) {
    mostrarErro(senhaErro, e.message);
  }
});

iniciar();
