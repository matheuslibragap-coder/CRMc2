// MASTER - lógica da interface

let COLUNAS = [];
let PRODUTOS = [];
let USUARIOS = [];
let usuario = null; // quem está logado
let visao = "meus"; // "meus" ou "geral"
let leads = [];
let leadEditando = null; // id do lead aberto no formulário (null = novo)

const telaLogin = document.getElementById("tela-login");
const telaApp = document.getElementById("tela-app");
const quadro = document.getElementById("quadro");
const modal = document.getElementById("modal");
const form = document.getElementById("form-lead");
const formErro = document.getElementById("form-erro");
const btnExcluir = document.getElementById("btn-excluir");

// ---------- comunicação com o servidor ----------
async function api(metodo, url, corpo) {
  const resp = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resp.json().catch(() => ({}));
  if (resp.status === 401 && usuario) {
    // Sessão expirou: volta para a tela de login
    mostrarLogin();
  }
  if (!resp.ok) throw new Error(dados.erro || "Erro ao falar com o servidor.");
  return dados;
}

// ---------- login ----------
function mostrarLogin() {
  usuario = null;
  modal.open && modal.close();
  telaApp.hidden = true;
  telaLogin.hidden = false;
  document.getElementById("form-login").senha.value = "";
}

async function iniciar() {
  try {
    const dados = await api("GET", "/api/eu");
    entrarNoSistema(dados);
  } catch (e) {
    mostrarLogin();
  }
}

function entrarNoSistema(dados) {
  usuario = dados.usuario;
  COLUNAS = dados.colunas;
  PRODUTOS = dados.produtos;
  USUARIOS = dados.usuarios;
  document.getElementById("nome-usuario").textContent = usuario;
  telaLogin.hidden = true;
  telaApp.hidden = false;
  preencherSelects();
  trocarVisao("meus");
}

document.getElementById("form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const erroLogin = document.getElementById("login-erro");
  erroLogin.hidden = true;
  try {
    await api("POST", "/api/login", { usuario: f.usuario.value, senha: f.senha.value });
    entrarNoSistema(await api("GET", "/api/eu"));
  } catch (e) {
    erroLogin.textContent = e.message;
    erroLogin.hidden = false;
  }
});

document.getElementById("btn-sair").onclick = async () => {
  await api("POST", "/api/logout").catch(() => {});
  mostrarLogin();
};

// ---------- abas ----------
document.querySelectorAll(".aba").forEach((aba) => {
  aba.onclick = () => trocarVisao(aba.dataset.visao);
});

async function trocarVisao(nova) {
  visao = nova;
  document.querySelectorAll(".aba").forEach((a) => a.classList.toggle("ativa", a.dataset.visao === visao));
  document.getElementById("aviso-visao").hidden = visao !== "geral";
  await carregarLeads();
}

async function carregarLeads() {
  try {
    const dados = await api("GET", `/api/leads?visao=${visao}`);
    leads = dados.leads;
    desenhar();
  } catch (e) {
    if (usuario) quadro.textContent = "Não foi possível carregar os leads. Tente recarregar a página.";
  }
}

// ---------- desenho do quadro ----------
function formatarData(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

// Ícone de planetinha no topo de cada coluna
const ICONE_COLUNA =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="7" fill="#fff" stroke="#1a1033" stroke-width="2"/>' +
  '<ellipse cx="12" cy="13" rx="11" ry="3.5" fill="none" stroke="#1a1033" stroke-width="2"/></svg>';

function tagProduto(produto) {
  return el("span", `tag p-${PRODUTOS.indexOf(produto)}`, produto);
}

function linhaInfo(rotulo, valor) {
  const linha = el("div", "card-linha");
  linha.append(el("b", "", rotulo + ": "), valor);
  return linha;
}

function criarCard(lead) {
  const card = el("div", "card");
  card.draggable = true;
  card.dataset.id = lead.id;

  if (visao === "geral") {
    const dono = el("div", `dono d-${USUARIOS.indexOf(lead.dono)}`, lead.dono);
    if (lead.dono === usuario) dono.textContent += " (você)";
    card.append(dono);
  }
  card.append(el("div", "card-nome", lead.nome));
  if (lead.telefone) card.append(linhaInfo("Tel", lead.telefone));
  if (lead.email) card.append(linhaInfo("E-mail", lead.email));
  if (lead.conta) card.append(linhaInfo("Conta", lead.conta));
  const tags = el("div", "tags");
  lead.produtos.forEach((p) => tags.append(tagProduto(p)));
  card.append(tags);
  if (lead.observacoes) card.append(el("div", "card-obs", lead.observacoes));

  const rodape = el("div", "card-rodape");
  rodape.append(el("span", "card-data", "Criado em " + formatarData(lead.data_criacao)));
  const botoes = el("div", "card-botoes");
  const bEditar = el("button", "", "Editar");
  bEditar.onclick = () => abrirFormulario(lead);
  botoes.append(bEditar);
  if (lead.dono === usuario) {
    const bExcluir = el("button", "excluir", "Excluir");
    bExcluir.onclick = () => excluir(lead);
    botoes.append(bExcluir);
  }
  rodape.append(botoes);
  card.append(rodape);

  card.addEventListener("dragstart", (ev) => {
    ev.dataTransfer.setData("text/plain", String(lead.id));
    ev.dataTransfer.effectAllowed = "move";
    card.classList.add("arrastando");
  });
  card.addEventListener("dragend", () => card.classList.remove("arrastando"));
  return card;
}

function desenhar() {
  quadro.innerHTML = "";
  for (const nomeColuna of COLUNAS) {
    const doColuna = leads.filter((l) => l.coluna === nomeColuna);

    const coluna = el("section", "coluna");
    const topo = el("div", "coluna-topo");
    const titulo = el("span", "coluna-titulo");
    titulo.innerHTML = ICONE_COLUNA;
    titulo.append(nomeColuna);
    topo.append(titulo, el("span", "contador", doColuna.length));
    const cards = el("div", "cards");
    doColuna.forEach((l) => cards.append(criarCard(l)));
    coluna.append(topo, cards);

    coluna.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      coluna.classList.add("alvo");
    });
    coluna.addEventListener("dragleave", (ev) => {
      if (!coluna.contains(ev.relatedTarget)) coluna.classList.remove("alvo");
    });
    coluna.addEventListener("drop", (ev) => {
      ev.preventDefault();
      coluna.classList.remove("alvo");
      moverLead(Number(ev.dataTransfer.getData("text/plain")), nomeColuna);
    });

    quadro.append(coluna);
  }
}

async function moverLead(id, novaColuna) {
  const lead = leads.find((l) => l.id === id);
  if (!lead || lead.coluna === novaColuna) return;
  const anterior = lead.coluna;
  lead.coluna = novaColuna;
  desenhar();
  try {
    await api("PUT", `/api/leads/${id}`, { coluna: novaColuna });
  } catch (e) {
    lead.coluna = anterior;
    desenhar();
    alert("Não foi possível mover o lead: " + e.message);
  }
}

// ---------- formulário de lead ----------
function preencherSelects() {
  const caixa = document.getElementById("opcoes-produtos");
  caixa.innerHTML = "";
  PRODUTOS.forEach((p, i) => {
    const opcao = el("label", `opcao-produto p-${i}`);
    const check = document.createElement("input");
    check.type = "checkbox";
    check.name = "produtos";
    check.value = p;
    opcao.append(check, el("span", "", p));
    caixa.append(opcao);
  });
  form.coluna.innerHTML = "";
  COLUNAS.forEach((c) => form.coluna.append(new Option(c, c)));
}

function abrirFormulario(lead) {
  form.reset();
  formErro.hidden = true;
  leadEditando = lead ? lead.id : null;
  let titulo = lead ? "Editar lead" : "Novo lead";
  if (lead && lead.dono !== usuario) titulo += ` (de ${lead.dono})`;
  document.getElementById("modal-titulo").textContent = titulo;
  btnExcluir.hidden = !lead || lead.dono !== usuario;
  if (lead) {
    form.nome.value = lead.nome;
    form.telefone.value = lead.telefone;
    form.email.value = lead.email;
    form.conta.value = lead.conta;
    form.querySelectorAll('input[name="produtos"]').forEach((c) => {
      c.checked = lead.produtos.includes(c.value);
    });
    form.coluna.value = lead.coluna;
    form.observacoes.value = lead.observacoes;
  } else {
    form.coluna.value = COLUNAS[0];
  }
  modal.showModal();
  form.nome.focus();
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const dados = {
    nome: form.nome.value,
    telefone: form.telefone.value,
    email: form.email.value,
    conta: form.conta.value,
    produtos: [...form.querySelectorAll('input[name="produtos"]:checked')].map((c) => c.value),
    coluna: form.coluna.value,
    observacoes: form.observacoes.value,
  };
  try {
    if (leadEditando === null) {
      leads.push(await api("POST", "/api/leads", dados));
    } else {
      const atualizado = await api("PUT", `/api/leads/${leadEditando}`, dados);
      leads = leads.map((l) => (l.id === atualizado.id ? atualizado : l));
    }
    modal.close();
    desenhar();
  } catch (e) {
    formErro.textContent = e.message;
    formErro.hidden = false;
  }
});

async function excluir(lead) {
  if (!confirm(`Excluir o lead "${lead.nome}"? Esta ação não pode ser desfeita.`)) return false;
  try {
    await api("DELETE", `/api/leads/${lead.id}`);
    leads = leads.filter((l) => l.id !== lead.id);
    desenhar();
    return true;
  } catch (e) {
    alert("Não foi possível excluir: " + e.message);
    return false;
  }
}

btnExcluir.onclick = async () => {
  const lead = leads.find((l) => l.id === leadEditando);
  if (lead && (await excluir(lead))) modal.close();
};
document.getElementById("btn-cancelar").onclick = () => modal.close();
document.getElementById("btn-novo").onclick = () => abrirFormulario(null);

// ---------- trocar senha ----------
const modalSenha = document.getElementById("modal-senha");
const formSenha = document.getElementById("form-senha");
const senhaErro = document.getElementById("senha-erro");

document.getElementById("btn-senha").onclick = () => {
  formSenha.reset();
  senhaErro.hidden = true;
  modalSenha.showModal();
};
document.getElementById("btn-senha-cancelar").onclick = () => modalSenha.close();

formSenha.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  senhaErro.hidden = true;
  if (formSenha.nova.value !== formSenha.confirma.value) {
    senhaErro.textContent = "As duas novas senhas não são iguais.";
    senhaErro.hidden = false;
    return;
  }
  try {
    await api("POST", "/api/senha", { atual: formSenha.atual.value, nova: formSenha.nova.value });
    modalSenha.close();
    alert("Senha trocada com sucesso!");
  } catch (e) {
    senhaErro.textContent = e.message;
    senhaErro.hidden = false;
  }
});

iniciar();
