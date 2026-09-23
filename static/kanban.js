// MASTER - Kanban: quadro, cards, filtros, Carteira, janela do lead, venda, atividades, anotações e descarte

let visao = "meus"; // meus | geral | meus_descartados | descartados
let leads = [];
let visaoCarteira = "carteira"; // carteira | carteira_geral
let carteiraLeads = [];
let arrastandoLead = null;

const quadro = document.getElementById("quadro");
const modal = document.getElementById("modal");
const form = document.getElementById("form-lead");
const formErro = document.getElementById("form-erro");

const PROPOSTA = "Proposta enviada";
const ehDescartados = () => visao === "meus_descartados" || visao === "descartados";
const ehCarteira = (lead) => lead.coluna === estado.config.carteira;
const ehFechado = (coluna) => coluna === estado.config.fechado;

const AVISOS_VISAO = {
  geral: "Aqui você vê os leads de toda a equipe. Pode editar, mover e registrar atividades para ajudar um colega; só o dono pode excluir.",
  meus_descartados: "Seus leads descartados. Use “Restaurar” para devolver um lead à etapa em que estava.",
  descartados: "Leads descartados de todo o Comercial 2.",
};

// Vendedor pode escolher/transferir dono? (coordenador e administrador sempre podem)
const podeEscolherDono = () => estado.coordenador || estado.admin;
const vendedoresAtivos = () => estado.usuarios.filter((u) => u.ativo && u.papel === "vendedor");

// ---------- mensagem do dia ----------
const MENSAGENS_DO_DIA = [
  // domingo
  ["Domingo é dia de recarregar os propulsores. Amanhã a gente decola! 🛋️🚀",
   "Até astronauta tira folga. Mas se um lead ligar, a gente atende da Lua. 🌙",
   "Domingo: a órbita mais tranquila da semana. Aproveite a gravidade zero! 🧑‍🚀"],
  // segunda
  ["Segunda-feira: contagem regressiva iniciada. 3… 2… 1… prospecção! 🚀",
   "Houston, temos uma segunda-feira. E uma semana inteira para bater a meta! 📡",
   "Nova semana, nova órbita. Hoje o café é combustível de foguete. ☕🔥",
   "Segunda é o lançamento. O resto da semana é só ajustar a rota. 🛰️"],
  // terça
  ["Terça: já saímos da atmosfera. Agora é acelerar! 🌌",
   "Dica do comandante: follow-up feito hoje é proposta aceita amanhã. 📞✨",
   "Terça-feira, dia de mostrar para o lead que o universo tem solução: a nossa. 🪐",
   "Aliens dizem que terça é o melhor dia para fechar negócio. Quem somos nós para duvidar? 👽"],
  // quarta
  ["Quarta-feira: metade da missão cumprida. O foguete ainda tem muito combustível! ⛽🚀",
   "No meio da semana, no meio da galáxia, e com a meta na mira. 🎯🌠",
   "Quarta é dia de revisar as propostas enviadas. Nenhum lead fica perdido no espaço! 🛸",
   "Se a semana fosse um foguete, hoje a gente estaria soltando o primeiro estágio. 💥"],
  // quinta
  ["Quinta-feira: o planeta Meta já aparece na janela da nave! 🪐👀",
   "Quinta é quase sexta, e sexta é dia de comemorar fechamento. Bora garantir! 🥂",
   "Tripulação, ajustar trajetória: tem proposta esperando retorno. 📬",
   "Hoje até os meteoros estão caindo em forma de venda. Faça um pedido! 🌠"],
  // sexta
  ["Sextou na estação espacial! Que tal fechar a semana com um foguete no “Fechado”? 🚀🎉",
   "Sexta-feira: último abastecimento antes do fim de semana. Liga para aquele lead! ⛽",
   "Houston, a sexta chegou. Missão: deixar o Kanban mais leve para segunda. 🧹",
   "Sexta é dia de pouso suave: atividades concluídas e cards verdes. 🛬"],
  // sábado
  ["Sábado em órbita baixa: descanse, que o universo continua girando. 🌍",
   "Plantão de sábado? Respeito, comandante! Os aliens estão impressionados. 👽👏",
   "Sábado: dia de olhar as estrelas e sonhar com a meta batida. ✨"],
];

function mensagemDoDia() {
  const hoje = new Date();
  const lista = MENSAGENS_DO_DIA[hoje.getDay()];
  const semana = Math.floor((hoje - new Date(hoje.getFullYear(), 0, 1)) / (7 * 86400000));
  return lista[semana % lista.length];
}

// ---------- abas ----------
document.querySelectorAll("#pagina-kanban .aba").forEach((aba) => {
  aba.onclick = () => trocarVisao(aba.dataset.visao);
});

function prepararKanbanPorPapel() {
  // O coordenador não tem Kanban próprio: vê a equipe
  document.querySelectorAll('#pagina-kanban .aba[data-visao="meus"], #pagina-kanban .aba[data-visao="meus_descartados"]')
    .forEach((a) => (a.hidden = estado.coordenador));
  document.querySelector('#abas-carteira .aba[data-visao="carteira"]').hidden = estado.coordenador;
  visaoCarteira = estado.coordenador ? "carteira_geral" : "carteira";
  document.getElementById("mensagem-dia").textContent = mensagemDoDia();
}

async function trocarVisao(nova) {
  if (estado.coordenador && (nova === "meus" || nova === "meus_descartados")) {
    nova = nova === "meus" ? "geral" : "descartados";
  }
  visao = nova;
  document.querySelectorAll("#pagina-kanban .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.visao === visao));
  const aviso = document.getElementById("aviso-visao");
  aviso.textContent = AVISOS_VISAO[visao] || "";
  aviso.hidden = !AVISOS_VISAO[visao];
  document.getElementById("filtro-dono").hidden = visao === "meus" || visao === "meus_descartados";
  await carregarLeads();
}

async function carregarLeads() {
  try {
    const dados = await api("GET", `/api/leads?visao=${visao}`);
    leads = dados.leads;
    desenhar();
  } catch (e) {
    if (estado.usuario) quadro.textContent = "Não foi possível carregar os leads. Tente recarregar a página.";
  }
}

// Atualiza o quadro a cada minuto (cores das atividades e mudanças dos colegas)
setInterval(() => {
  if (!estado.usuario || arrastandoLead || document.querySelector("dialog[open]")) return;
  if (estado.pagina === "kanban") carregarLeads();
  if (estado.pagina === "carteira") carregarCarteira();
}, 60000);

// ---------- filtros ----------
const filtroBusca = document.getElementById("filtro-busca");
const filtroProduto = document.getElementById("filtro-produto");
const filtroOrigem = document.getElementById("filtro-origem");
const filtroDono = document.getElementById("filtro-dono");

function prepararFiltros() {
  const preencher = (select, rotulo, opcoes) => {
    const atual = select.value;
    select.innerHTML = "";
    select.append(new Option(rotulo, ""));
    opcoes.forEach((o) => select.append(new Option(o, o)));
    select.value = atual;
  };
  preencher(filtroProduto, "Todos os produtos", estado.config.produtos);
  preencher(filtroOrigem, "Todas as origens", estado.config.origens);
  preencher(filtroDono, "Todos os donos", vendedoresAtivos().map((u) => u.nome));
}

const semAcento = (t) => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function combinaBusca(lead, busca) {
  if (!busca) return true;
  const termo = semAcento(busca.trim());
  const texto = semAcento([lead.nome, lead.email, lead.conta, lead.dono, lead.telefone].join(" "));
  if (texto.includes(termo)) return true;
  const digitos = busca.replace(/\D/g, "");
  return digitos.length >= 3 && (lead.telefone || "").replace(/\D/g, "").includes(digitos);
}

function passaFiltro(lead) {
  if (!combinaBusca(lead, filtroBusca.value)) return false;
  if (filtroProduto.value && !lead.produtos.includes(filtroProduto.value)) return false;
  if (filtroOrigem.value && lead.origem !== filtroOrigem.value) return false;
  if (!filtroDono.hidden && filtroDono.value && lead.dono !== filtroDono.value) return false;
  return true;
}

const filtrosAtivos = () => filtroBusca.value || filtroProduto.value || filtroOrigem.value || (!filtroDono.hidden && filtroDono.value);

[filtroBusca, filtroProduto, filtroOrigem, filtroDono].forEach((c) => c.addEventListener("input", desenhar));
document.getElementById("btn-limpar-filtros").onclick = () => {
  filtroBusca.value = filtroProduto.value = filtroOrigem.value = filtroDono.value = "";
  desenhar();
};

// ---------- situação das atividades ----------
function pendentes(lead) {
  return lead.atividades.filter((a) => !a.concluida);
}

// "atrasada" (vermelho), "hoje" (azul), "futura" (amarelo) ou null (sem atividades)
function situacaoAtividade(atividade, agora = new Date()) {
  if (new Date(atividade.quando) < agora) return "atrasada";
  if (atividade.quando.slice(0, 10) === hojeISO()) return "hoje";
  return "futura";
}

function situacaoLead(lead) {
  const agora = new Date();
  const situacoes = pendentes(lead).map((a) => situacaoAtividade(a, agora));
  if (situacoes.includes("atrasada")) return "atrasada";
  if (situacoes.includes("hoje")) return "hoje";
  if (situacoes.includes("futura")) return "futura";
  return null;
}

// ---------- desenho dos cards ----------
function iconeColuna(nomeColuna) {
  const s = el("span", "icone-coluna");
  s.innerHTML = ICONES[ICONE_COLUNA[nomeColuna]] || "";
  return s;
}

function etiquetaDono(nome) {
  const chip = el("span", "dono");
  chip.style.setProperty("--cor-dono", corUsuario(nome));
  chip.append(avatar(nome, "avatar-mini"), nome === estado.usuario ? `${nome} (você)` : nome);
  return chip;
}

// WhatsApp: no computador abre o WhatsApp Web; no celular, o aplicativo
function linkWhatsApp(telefone) {
  let numero = telefone.replace(/\D/g, "").replace(/^0+/, "");
  if (!(numero.startsWith("55") && numero.length >= 12)) numero = "55" + numero;
  const celular = window.matchMedia("(pointer: coarse)").matches;
  return celular ? `https://wa.me/${numero}` : `https://web.whatsapp.com/send?phone=${numero}`;
}

// Linha com um dado que pode ser selecionado e copiado (sem arrastar o card)
function linhaCopiavel(rotulo, valor, whatsapp = false) {
  const linha = el("div", "card-linha");
  linha.append(el("b", "", rotulo + ": "));
  const v = el("span", "copiavel", valor);
  v.title = "Selecione com o mouse ou clique no ícone para copiar";
  const b = el("button", "btn-copiar", "⧉");
  b.type = "button";
  b.title = `Copiar ${rotulo.toLowerCase()}`;
  b.onclick = (ev) => { ev.stopPropagation(); copiar(valor); };
  linha.append(v, b);
  if (whatsapp && valor.replace(/\D/g, "").length >= 8) {
    const w = el("a", "btn-whatsapp");
    w.href = linkWhatsApp(valor);
    w.target = "_blank";
    w.rel = "noopener";
    w.title = "Abrir conversa no WhatsApp";
    w.innerHTML = ICONES.whatsapp;
    linha.append(w);
  }
  return linha;
}

function valorFechado(lead) {
  return lead.valor_venda ?? lead.valor_proposta ?? 0;
}

function criarCard(lead, mostrarDono = visao !== "meus" && visao !== "meus_descartados") {
  const situacao = situacaoLead(lead);
  const card = el("div", "card" + (situacao ? ` st-${situacao}` : "") + (lead.descartado ? " card-descartado" : ""));
  card.dataset.id = lead.id;
  const podeArrastar = !lead.descartado && !ehCarteira(lead);
  card.draggable = podeArrastar;

  if (mostrarDono) card.append(etiquetaDono(lead.dono));
  if (lead.descartado) {
    const d = el("div", "motivo-descarte");
    d.append(el("b", "", "Descartado: "), lead.motivo_descarte);
    d.append(el("small", "", ` · ${formatarDataHora(lead.descartado_em)} por ${lead.descartado_por} · estava em “${lead.coluna}”`));
    card.append(d);
  }

  const nome = el("button", "card-nome", lead.nome);
  nome.type = "button";
  nome.title = "Abrir lead";
  nome.onclick = () => abrirFormulario(lead);
  card.append(nome);

  if (lead.telefone) card.append(linhaCopiavel("Tel", lead.telefone, true));
  if (lead.email) card.append(linhaCopiavel("E-mail", lead.email));
  if (lead.conta) card.append(linhaCopiavel("Conta", lead.conta));

  if (lead.produtos.length) {
    const tags = el("div", "tags");
    lead.produtos.forEach((p) => tags.append(el("span", `tag p-${estado.config.produtos.indexOf(p)}`, p)));
    card.append(tags);
  }
  if (lead.origem) {
    const origem = lead.origem + (lead.origem_detalhe ? ` (${lead.origem_detalhe})` : "");
    const linha = el("div", "card-linha card-origem");
    linha.append(el("b", "", "Origem: "), origem);
    card.append(linha);
  }
  if (ehFechado(lead.coluna) && lead.fechado_em) {
    const venda = el("div", "card-valor card-venda");
    venda.append(`💰 Vendido: ${formatarReais(valorFechado(lead))}`);
    if (lead.produtos_vendidos.length) venda.append(el("small", "", ` · ${lead.produtos_vendidos.join(", ")}`));
    card.append(venda);
    if (lead.comissao_dobrada) card.append(el("div", "selo-dobrada", "✨ Comissão dobrada (indicação)"));
  } else if (lead.valor_proposta !== null && lead.coluna === PROPOSTA) {
    card.append(el("div", "card-valor", `💰 ${formatarReais(lead.valor_proposta)}`));
  }

  const proxima = pendentes(lead)[0];
  if (proxima) {
    const s = situacaoAtividade(proxima);
    const texto = { atrasada: "Atrasada", hoje: "Hoje", futura: "Próxima" }[s];
    const linha = el("div", `card-atividade at-${s}`);
    linha.append(el("b", "", `⏰ ${texto}: `), `${formatarDataHora(proxima.quando)} · ${proxima.descricao}`);
    const extras = pendentes(lead).length - 1;
    if (extras > 0) linha.append(el("small", "", ` (+${extras})`));
    card.append(linha);
  }
  const ultima = lead.anotacoes[0];
  if (ultima) {
    const nota = el("div", "card-obs");
    nota.append(el("small", "", `📝 ${formatarDataHora(ultima.criado_em)} · ${ultima.autor}`), el("div", "", ultima.texto));
    card.append(nota);
  }

  const rodape = el("div", "card-rodape");
  rodape.append(el("span", "card-data", "Criado em " + formatarData(lead.data_criacao)));
  const botoes = el("div", "card-botoes");
  const botao = (rotulo, classe, acao) => {
    const b = el("button", classe, rotulo);
    b.type = "button";
    b.onclick = acao;
    botoes.append(b);
  };
  botao("Abrir", "", () => abrirFormulario(lead));
  if (lead.descartado) botao("Restaurar", "", () => restaurar(lead));
  else botao("Descartar", "descartar", () => abrirDescarte(lead));
  if (lead.dono === estado.usuario) botao("Excluir", "excluir", () => excluir(lead));
  rodape.append(botoes);
  card.append(rodape);

  // Arrastar pelo card; mas clicar em dados copiáveis e botões não inicia o arraste
  card.addEventListener("mousedown", (ev) => {
    card.draggable = podeArrastar && !ev.target.closest(".copiavel, button, a");
  });
  card.addEventListener("dragstart", (ev) => {
    arrastandoLead = lead;
    ev.dataTransfer.setData("text/plain", String(lead.id));
    ev.dataTransfer.effectAllowed = "move";
    card.classList.add("arrastando");
  });
  card.addEventListener("dragend", () => {
    arrastandoLead = null;
    card.classList.remove("arrastando");
    document.querySelectorAll(".coluna.alvo").forEach((c) => c.classList.remove("alvo"));
  });
  return card;
}

// ---------- quadro ----------
function desenhar() {
  if (estado.pagina === "carteira") return desenharCarteira();
  if (estado.pagina !== "kanban") return;
  document.getElementById("legenda").hidden = ehDescartados();
  document.getElementById("btn-limpar-filtros").hidden = !filtrosAtivos();
  quadro.innerHTML = "";
  quadro.classList.toggle("quadro-descartados", ehDescartados());
  const visiveis = leads.filter(passaFiltro);
  if (ehDescartados()) return desenharDescartados(visiveis);

  for (const nomeColuna of estado.config.colunas_funil) {
    const doColuna = visiveis.filter((l) => l.coluna === nomeColuna);

    const coluna = el("section", "coluna");
    coluna.dataset.coluna = nomeColuna;
    const topo = el("div", "coluna-topo");
    const titulo = el("span", "coluna-titulo");
    let nomeExibido = nomeColuna;
    if (nomeColuna === PROPOSTA) {
      const soma = doColuna.reduce((t, l) => t + (l.valor_proposta || 0), 0);
      nomeExibido = `${PROPOSTA} - Soma total de propostas: ${formatarReais(soma)}`;
    }
    if (ehFechado(nomeColuna)) {
      const soma = doColuna.reduce((t, l) => t + valorFechado(l), 0);
      nomeExibido = `${nomeColuna} - Soma total de vendas: ${formatarReais(soma)}`;
    }
    titulo.append(iconeColuna(nomeColuna), el("span", "", nomeExibido));
    topo.append(titulo, el("span", "contador", doColuna.length));
    coluna.append(topo);

    const cards = el("div", "cards");
    doColuna.forEach((l) => cards.append(criarCard(l)));
    coluna.append(cards);

    coluna.addEventListener("dragover", (ev) => {
      if (!arrastandoLead) return;
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
      if (arrastandoLead) moverLead(arrastandoLead.id, nomeColuna);
    });

    quadro.append(coluna);
  }
}

function desenharDescartados(visiveis) {
  if (!visiveis.length) {
    quadro.append(el("p", "vazio", filtrosAtivos() ? "Nenhum lead com esses filtros. 🔭" : "Nenhum lead descartado por aqui. 🌌"));
    return;
  }
  const ordenados = [...visiveis].sort((a, b) => b.descartado_em.localeCompare(a.descartado_em));
  ordenados.forEach((l) => quadro.append(criarCard(l)));
}

// ---------- Carteira ----------
document.getElementById("btn-carteira").onclick = () => irPara("carteira");
document.getElementById("btn-add-carteira").onclick = () => abrirFormulario(null, estado.config.carteira);
document.getElementById("busca-carteira").addEventListener("input", desenharCarteira);
document.querySelectorAll("#abas-carteira .aba").forEach((aba) => {
  aba.onclick = () => { visaoCarteira = aba.dataset.visao; carregarCarteira(); };
});

async function carregarCarteira() {
  document.querySelectorAll("#abas-carteira .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.visao === visaoCarteira));
  document.getElementById("btn-carteira").classList.add("ativo");
  try {
    carteiraLeads = (await api("GET", `/api/leads?visao=${visaoCarteira}`)).leads;
    desenharCarteira();
  } catch (e) {
    document.getElementById("lista-carteira").textContent = e.message;
  }
}

function desenharCarteira() {
  if (estado.pagina !== "carteira") return;
  const lista = document.getElementById("lista-carteira");
  lista.innerHTML = "";
  const busca = document.getElementById("busca-carteira").value;
  const visiveis = carteiraLeads.filter((l) => combinaBusca(l, busca));
  visiveis.forEach((l) => lista.append(criarCard(l, visaoCarteira === "carteira_geral")));
  if (!visiveis.length) {
    lista.append(el("p", "vazio", busca ? "Ninguém encontrado com essa busca. 🔭" : "Nenhum cliente na carteira ainda. Clique em “+ Adicionar cliente”. 💼"));
  }
}

// Qual lista (Kanban ou Carteira) o lead atualizado deve aparecer
function pertenceVisao(lead, v) {
  const meu = lead.dono === estado.usuario;
  const carteira = ehCarteira(lead);
  return {
    meus: meu && !lead.descartado && !carteira,
    geral: !lead.descartado && !carteira,
    meus_descartados: meu && lead.descartado,
    descartados: lead.descartado,
    carteira: meu && !lead.descartado && carteira,
    carteira_geral: !lead.descartado && carteira,
  }[v];
}

function atualizarLista(lista, v, atualizado) {
  const pertence = pertenceVisao(atualizado, v);
  const existe = lista.some((l) => l.id === atualizado.id);
  if (pertence && existe) return lista.map((l) => (l.id === atualizado.id ? atualizado : l));
  if (pertence) return [...lista, atualizado];
  return lista.filter((l) => l.id !== atualizado.id);
}

function substituirLead(atualizado) {
  leads = atualizarLista(leads, visao, atualizado);
  carteiraLeads = atualizarLista(carteiraLeads, visaoCarteira, atualizado);
  desenhar();
}

async function moverLead(id, novaColuna) {
  const lead = leads.find((l) => l.id === id);
  if (!lead || lead.coluna === novaColuna) return;
  const dados = { coluna: novaColuna };
  if (ehFechado(novaColuna)) {
    const venda = await pedirVenda(lead);
    if (!venda) return; // desistiu: o lead fica onde estava
    dados.venda = venda;
  }
  const anterior = lead.coluna;
  lead.coluna = novaColuna;
  desenhar();
  try {
    const atualizado = await api("PUT", `/api/leads/${id}`, dados);
    substituirLead(atualizado);
    if (dados.venda) comemorarVenda(atualizado);
    if (novaColuna === PROPOSTA && atualizado.valor_proposta === null) pedirValor(atualizado);
  } catch (e) {
    lead.coluna = anterior;
    desenhar();
    alert("Não foi possível mover o lead: " + e.message);
  }
}

// ---------- valor da proposta ao entrar em "Proposta enviada" ----------
const modalValor = document.getElementById("modal-valor");
const formValor = document.getElementById("form-valor");
let leadValor = null;

function pedirValor(lead) {
  leadValor = lead;
  formValor.reset();
  mostrarErro(document.getElementById("valor-erro"), "");
  document.getElementById("valor-nome").textContent = `Qual o valor da proposta enviada para “${lead.nome}”?`;
  modalValor.showModal();
  formValor.valor.focus();
}
document.getElementById("btn-valor-pular").onclick = () => modalValor.close();
formValor.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const valor = lerReais(formValor.valor.value);
  if (valor === null || Number.isNaN(valor)) {
    return mostrarErro(document.getElementById("valor-erro"), "Digite um valor válido. Ex.: 1.500,00");
  }
  try {
    substituirLead(await api("PUT", `/api/leads/${leadValor.id}`, { valor_proposta: valor }));
    modalValor.close();
  } catch (e) {
    mostrarErro(document.getElementById("valor-erro"), e.message);
  }
});

// ---------- venda: perguntada ao fechar ----------
const modalVenda = document.getElementById("modal-venda");
const formVenda = document.getElementById("form-venda");
let resolverVenda = null;

function prepararVenda() {
  const caixa = document.getElementById("venda-produtos");
  caixa.innerHTML = "";
  estado.config.produtos.forEach((p, i) => {
    const opcao = el("label", `opcao-produto p-${i}`);
    const check = el("input");
    check.type = "checkbox";
    check.value = p;
    opcao.append(check, el("span", "", p));
    caixa.append(opcao);
  });
}

// Abre a janela da venda e devolve {valor, produtos, comissao_dobrada} (ou null se cancelar)
function pedirVenda(lead, origem = lead.origem) {
  formVenda.reset();
  mostrarErro(document.getElementById("venda-erro"), "");
  const editando = Boolean(lead.fechado_em);
  formVenda.querySelector("h2").textContent = editando ? "💰 Editar venda" : "🚀 Venda fechada!";
  document.getElementById("venda-nome").textContent = `Lead: ${lead.nome}${lead.conta ? " / " + lead.conta : ""}`;
  formVenda.valor.value = valorParaCampo(lead.valor_venda ?? lead.valor_proposta);
  const vendidos = lead.produtos_vendidos && lead.produtos_vendidos.length ? lead.produtos_vendidos : lead.produtos;
  document.querySelectorAll("#venda-produtos input").forEach((c) => (c.checked = vendidos.includes(c.value)));
  const indicacao = origem === estado.config.origem_indicacao;
  document.getElementById("venda-indicacao").hidden = !indicacao;
  if (indicacao && editando) {
    formVenda.querySelector(`input[name="dobrada"][value="${lead.comissao_dobrada ? "sim" : "nao"}"]`).checked = true;
  }
  modalVenda.showModal();
  formVenda.valor.focus();
  return new Promise((resolve) => (resolverVenda = resolve));
}

function fecharVenda(resultado) {
  const resolver = resolverVenda;
  resolverVenda = null;
  modalVenda.close();
  if (resolver) resolver(resultado);
}
document.getElementById("btn-venda-cancelar").onclick = () => fecharVenda(null);
modalVenda.addEventListener("cancel", (ev) => { ev.preventDefault(); fecharVenda(null); });

formVenda.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const erroVenda = document.getElementById("venda-erro");
  const valor = lerReais(formVenda.valor.value);
  if (!valor || Number.isNaN(valor)) return mostrarErro(erroVenda, "Informe o valor da venda. Ex.: 1.500,00");
  const produtos = [...document.querySelectorAll("#venda-produtos input:checked")].map((c) => c.value);
  if (!produtos.length) return mostrarErro(erroVenda, "Marque qual(is) produto(s) foram vendidos.");
  const venda = { valor, produtos };
  if (!document.getElementById("venda-indicacao").hidden) {
    const resposta = formVenda.querySelector('input[name="dobrada"]:checked');
    if (!resposta) return mostrarErro(erroVenda, "Responda se a comissão é dobrada (SIM ou NÃO).");
    venda.comissao_dobrada = resposta.value === "sim";
  }
  fecharVenda(venda);
});

function comemorarVenda(lead) {
  const caixa = document.getElementById("comemoracao");
  caixa.innerHTML = "";
  caixa.append(el("div", "comemoracao-foguete", "🚀"),
    el("b", "", `Venda fechada: ${formatarReais(valorFechado(lead))}!`),
    el("span", "", `${lead.nome} decolou rumo à meta. ✨`));
  caixa.hidden = false;
  clearTimeout(caixa._timer);
  caixa._timer = setTimeout(() => (caixa.hidden = true), 3500);
}

// ---------- lead duplicado ----------
const modalDuplicado = document.getElementById("modal-duplicado");
let resolverDuplicado = null;

function confirmarDuplicado(duplicados) {
  const lista = document.getElementById("lista-duplicados");
  lista.innerHTML = "";
  duplicados.forEach((d) => {
    const item = el("div", "item-escolha");
    item.append(avatar(d.dono, "avatar-mini"));
    const meio = el("div");
    const situacao = d.descartado ? "descartado" : d.coluna;
    meio.append(el("b", "", d.nome), el("small", "", `Dono: ${d.dono} · ${situacao} · mesmo ${d.iguais.join(", ")}`));
    item.append(meio);
    lista.append(item);
  });
  modalDuplicado.showModal();
  return new Promise((resolve) => (resolverDuplicado = resolve));
}
function responderDuplicado(continuar) {
  modalDuplicado.close();
  if (resolverDuplicado) resolverDuplicado(continuar);
  resolverDuplicado = null;
}
document.getElementById("btn-duplicado-cancelar").onclick = () => responderDuplicado(false);
document.getElementById("btn-duplicado-continuar").onclick = () => responderDuplicado(true);
modalDuplicado.addEventListener("cancel", (ev) => { ev.preventDefault(); responderDuplicado(false); });

// ---------- janela do lead ----------
let leadAtual = null;         // lead aberto (null = novo)
let atividadesNovas = [];     // atividades de um lead ainda não salvo
let editandoAtividade = null; // id da atividade em edição

function prepararFormularioLead() {
  const cfg = estado.config;
  const caixa = document.getElementById("opcoes-produtos");
  caixa.innerHTML = "";
  cfg.produtos.forEach((p, i) => {
    const opcao = el("label", `opcao-produto p-${i}`);
    const check = el("input");
    check.type = "checkbox";
    check.name = "produtos";
    check.value = p;
    opcao.append(check, el("span", "", p));
    caixa.append(opcao);
  });
  form.origem.innerHTML = "";
  form.origem.append(new Option("Selecione...", ""));
  cfg.origens.forEach((o) => form.origem.append(new Option(o, o)));
  form.coluna.innerHTML = "";
  cfg.colunas_funil.forEach((c) => form.coluna.append(new Option(c, c)));

  const motivos = document.getElementById("opcoes-motivo");
  motivos.innerHTML = "";
  cfg.motivos_descarte.forEach((m) => {
    const opcao = el("label", "opcao-motivo");
    const radio = el("input");
    radio.type = "radio";
    radio.name = "motivo";
    radio.value = m;
    radio.required = true;
    opcao.append(radio, el("span", "", m));
    motivos.append(opcao);
  });
  prepararVenda();
  prepararFiltros();
  prepararKanbanPorPapel();
}

function atualizarCamposCondicionais() {
  const carteira = form.classList.contains("recorrente");
  document.getElementById("campo-campanha").hidden = form.origem.value !== estado.config.origem_campanha;
  document.getElementById("campo-etapa").hidden = carteira;
  document.getElementById("campo-valor").hidden = carteira || form.coluna.value !== PROPOSTA;
}
form.origem.addEventListener("change", atualizarCamposCondicionais);
form.coluna.addEventListener("change", atualizarCamposCondicionais);

// Quem pode ver/trocar o dono no formulário
function prepararCampoDono(lead) {
  const campo = document.getElementById("campo-dono");
  const pode = lead ? (lead.dono === estado.usuario || podeEscolherDono()) : podeEscolherDono();
  campo.hidden = !pode || (lead && lead.descartado);
  if (campo.hidden) return;
  form.dono.innerHTML = "";
  if (!lead && estado.coordenador) form.dono.append(new Option("Escolha o vendedor...", ""));
  vendedoresAtivos().forEach((u) => form.dono.append(new Option(u.nome, u.nome)));
  if (lead && !vendedoresAtivos().some((u) => u.nome === lead.dono)) form.dono.append(new Option(lead.dono, lead.dono));
  form.dono.value = lead ? lead.dono : estado.coordenador ? "" : estado.usuario;
  campo.firstChild.textContent = lead ? "Dono do lead (troque para transferir) " : "Dono do lead ";
}

function mostrarCaixaVenda(lead) {
  const caixa = document.getElementById("caixa-venda");
  caixa.innerHTML = "";
  caixa.hidden = !(lead && ehFechado(lead.coluna) && lead.fechado_em);
  if (caixa.hidden) return;
  const texto = el("div");
  texto.append(el("b", "", `💰 Vendido: ${formatarReais(valorFechado(lead))}`),
    el("small", "", ` em ${formatarData(lead.fechado_em)} por ${lead.vendedor || lead.dono}`));
  if (lead.produtos_vendidos.length) texto.append(el("div", "", `Produtos vendidos: ${lead.produtos_vendidos.join(", ")}`));
  if (lead.comissao_dobrada) texto.append(el("div", "", "✨ Comissão dobrada (indicação)"));
  const editar = el("button", "btn btn-pequeno", "Editar venda");
  editar.type = "button";
  editar.onclick = async () => {
    const venda = await pedirVenda(leadAtual, form.origem.value);
    if (!venda) return;
    try {
      receberLeadAtualizado(await api("PUT", `/api/leads/${leadAtual.id}`, { venda }));
    } catch (e) { mostrarErro(formErro, e.message); }
  };
  caixa.append(texto, editar);
}

function abrirFormulario(lead, colunaInicial) {
  form.reset();
  mostrarErro(formErro, "");
  mostrarErro(document.getElementById("atv-erro"), "");
  leadAtual = lead;
  atividadesNovas = [];
  cancelarEdicaoAtividade();

  const coluna = lead ? lead.coluna : colunaInicial || estado.config.colunas_funil[0];
  const carteira = coluna === estado.config.carteira;
  form.classList.toggle("recorrente", carteira);

  let titulo = lead ? lead.nome : carteira ? "Novo cliente na Carteira" : "Novo lead";
  if (lead && lead.dono !== estado.usuario) titulo += ` (de ${lead.dono})`;
  document.getElementById("modal-titulo").textContent = titulo;

  const avisoDescartado = document.getElementById("aviso-descartado");
  avisoDescartado.hidden = !(lead && lead.descartado);
  if (lead && lead.descartado) {
    avisoDescartado.textContent = `Descartado em ${formatarDataHora(lead.descartado_em)} por ${lead.descartado_por}: ${lead.motivo_descarte}`;
  }

  if (lead) {
    form.nome.value = lead.nome;
    form.telefone.value = lead.telefone;
    form.email.value = lead.email;
    form.conta.value = lead.conta;
    form.origem.value = lead.origem;
    form.origem_detalhe.value = lead.origem_detalhe;
    form.querySelectorAll('input[name="produtos"]').forEach((c) => (c.checked = lead.produtos.includes(c.value)));
    if (!carteira) form.coluna.value = lead.coluna;
    form.valor.value = valorParaCampo(lead.valor_proposta);
  } else if (!carteira) {
    form.coluna.value = coluna;
  }
  prepararCampoDono(lead);
  mostrarCaixaVenda(lead);
  document.getElementById("btn-excluir").hidden = !lead || lead.dono !== estado.usuario;
  document.getElementById("btn-descartar").hidden = !lead || lead.descartado;
  document.getElementById("btn-restaurar").hidden = !lead || !lead.descartado;
  atualizarCamposCondicionais();
  desenharAtividades();
  desenharAnotacoes();
  desenharLinhaDoTempo();
  if (!modal.open) modal.showModal();
  form.nome.focus();
}

async function abrirLeadPorId(id) {
  try {
    abrirFormulario(await api("GET", `/api/leads/${id}`));
  } catch (e) {
    alert(e.message);
  }
}

// Atualiza o lead aberto depois de mexer em atividade/anotação/venda
function receberLeadAtualizado(atualizado) {
  leadAtual = atualizado;
  substituirLead(atualizado);
  desenharAtividades();
  desenharAnotacoes();
  desenharLinhaDoTempo();
  mostrarCaixaVenda(atualizado);
}

function dadosDoFormulario() {
  const carteira = form.classList.contains("recorrente");
  const dados = {
    nome: form.nome.value,
    telefone: form.telefone.value,
    email: form.email.value,
    conta: form.conta.value,
    origem: form.origem.value,
    origem_detalhe: form.origem_detalhe.value,
    produtos: [...form.querySelectorAll('input[name="produtos"]:checked')].map((c) => c.value),
    coluna: carteira ? estado.config.carteira : form.coluna.value,
  };
  if (!carteira) {
    const valor = lerReais(form.valor.value);
    if (Number.isNaN(valor)) throw new Error("Valor da proposta inválido. Ex.: 1.500,00");
    dados.valor_proposta = valor;
  }
  return dados;
}

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  mostrarErro(formErro, "");
  try {
    const dados = dadosDoFormulario();
    // Anotação/atividade digitadas mas não adicionadas também são salvas
    const notaPendente = document.getElementById("nova-anotacao").value.trim();
    const atvPendente = atividadeDigitada();
    const novoDono = document.getElementById("campo-dono").hidden ? null : form.dono.value;
    const fechandoAgora = ehFechado(dados.coluna) && (!leadAtual || !ehFechado(leadAtual.coluna));
    if (fechandoAgora) {
      const base = leadAtual ? { ...leadAtual, ...dados } : { ...dados, produtos_vendidos: [], valor_venda: null };
      const venda = await pedirVenda(base, dados.origem);
      if (!venda) return;
      dados.venda = venda;
    }
    if (leadAtual === null) {
      if (novoDono !== null) {
        if (!novoDono) throw new Error("Escolha o vendedor dono do lead.");
        dados.dono = novoDono;
      }
      if (atvPendente) atividadesNovas.push(atvPendente);
      dados.anotacao = notaPendente;
      dados.atividades = atividadesNovas;
      let novo;
      try {
        novo = await api("POST", "/api/leads", dados);
      } catch (e) {
        if (e.status !== 409 || !(await confirmarDuplicado(e.dados.duplicados))) throw e;
        novo = await api("POST", "/api/leads", { ...dados, ignorar_duplicado: true });
      }
      modal.close();
      if (ehDescartados() && !ehCarteira(novo)) await trocarVisao(estado.coordenador ? "geral" : "meus");
      substituirLead(novo);
      if (dados.venda) comemorarVenda(novo);
      if (novo.coluna === PROPOSTA && novo.valor_proposta === null) pedirValor(novo);
    } else {
      let atualizado = await api("PUT", `/api/leads/${leadAtual.id}`, dados);
      if (notaPendente) atualizado = await api("POST", `/api/leads/${leadAtual.id}/anotacoes`, { texto: notaPendente });
      if (atvPendente) {
        const rota = editandoAtividade ? ["PUT", `/api/atividades/${editandoAtividade}`] : ["POST", `/api/leads/${leadAtual.id}/atividades`];
        atualizado = await api(rota[0], rota[1], atvPendente);
      }
      if (novoDono && novoDono !== leadAtual.dono
          && confirm(`Transferir “${leadAtual.nome}” de ${leadAtual.dono} para ${novoDono}?`)) {
        atualizado = await api("POST", `/api/leads/${leadAtual.id}/transferir`, { dono: novoDono });
      }
      modal.close();
      substituirLead(atualizado);
      if (dados.venda) comemorarVenda(atualizado);
      if (atualizado.coluna === PROPOSTA && leadAtual.coluna !== PROPOSTA && atualizado.valor_proposta === null) {
        pedirValor(atualizado);
      }
    }
  } catch (e) {
    mostrarErro(formErro, e.message);
  }
});

document.getElementById("btn-excluir").onclick = async () => {
  if (leadAtual && (await excluir(leadAtual))) modal.close();
};
document.getElementById("btn-descartar").onclick = () => leadAtual && abrirDescarte(leadAtual);
document.getElementById("btn-restaurar").onclick = async () => {
  if (leadAtual && (await restaurar(leadAtual))) modal.close();
};
document.getElementById("btn-novo").onclick = () => abrirFormulario(null);

// ---------- linha do tempo ----------
const DESCRICAO_EVENTO = {
  criacao: ["🐣", (h) => `Criado em “${h.coluna}”`],
  etapa: ["➡️", (h) => `Foi para “${h.coluna}”`],
  venda: ["💰", (h) => h.detalhe],
  descarte: ["🗑️", (h) => `Descartado: ${h.detalhe}`],
  restauracao: ["♻️", () => "Restaurado"],
  transferencia: ["🔁", (h) => `Transferido ${h.detalhe}`],
};

function duracaoTexto(ms) {
  const dias = Math.floor(ms / 86400000);
  if (dias >= 1) return `${dias} dia${dias > 1 ? "s" : ""}`;
  const horas = Math.floor(ms / 3600000);
  return horas >= 1 ? `${horas} h` : "menos de 1 h";
}

function desenharLinhaDoTempo() {
  const caixa = document.getElementById("linha-tempo");
  document.getElementById("bloco-linha-tempo").hidden = !leadAtual;
  caixa.innerHTML = "";
  if (!leadAtual) return;
  const eventos = leadAtual.historico;
  // Tempo que o lead ficou em cada etapa: da entrada até a próxima mudança
  let entrada = null;
  const itens = eventos.map((h) => {
    const [icone, texto] = DESCRICAO_EVENTO[h.evento] || ["•", () => h.evento];
    let extra = "";
    if (h.evento === "etapa" && entrada) {
      extra = ` (ficou ${duracaoTexto(new Date(h.criado_em) - new Date(entrada.criado_em))} em “${entrada.coluna}”)`;
    }
    if (h.evento === "criacao" || h.evento === "etapa") entrada = h;
    return { icone, texto: texto(h) + extra, h };
  });
  itens.reverse().forEach(({ icone, texto, h }) => {
    const item = el("div", "evento-tempo");
    item.append(el("span", "evento-icone", icone));
    const meio = el("div");
    meio.append(el("div", "", texto), el("small", "", `${formatarDataHora(h.criado_em)}${h.usuario ? " · " + h.usuario : ""}`));
    item.append(meio);
    caixa.append(item);
  });
  if (entrada && !leadAtual.descartado) {
    caixa.prepend(el("p", "vazio-pequeno", `Está em “${leadAtual.coluna}” há ${duracaoTexto(new Date() - new Date(entrada.criado_em))}.`));
  }
}

async function excluir(lead) {
  if (!confirm(`Excluir o lead "${lead.nome}"? Esta ação não pode ser desfeita.\n\nDica: se o lead só não avançou, use “Descartar”.`)) return false;
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

async function restaurar(lead) {
  try {
    substituirLead(await api("POST", `/api/leads/${lead.id}/restaurar`));
    return true;
  } catch (e) {
    alert("Não foi possível restaurar: " + e.message);
    return false;
  }
}

// ---------- atividades ----------
const atvDescricao = document.getElementById("atv-descricao");
const atvData = document.getElementById("atv-data");
const atvHora = document.getElementById("atv-hora");
const btnAddAtividade = document.getElementById("btn-add-atividade");
mascaraData(atvData);
mascaraHora(atvHora);

document.querySelectorAll(".atalhos-data .chip").forEach((chip) => {
  chip.onclick = () => (atvData.value = formatarData(hojeISO(Number(chip.dataset.dias))));
});

// Devolve {descricao, data, hora} se os três campos estiverem preenchidos
function atividadeDigitada() {
  const descricao = atvDescricao.value.trim();
  if (!descricao && !atvData.value && !atvHora.value) return null;
  if (!descricao || !/^\d{2}\/\d{2}\/\d{4}$/.test(atvData.value) || !/^\d{2}:\d{2}$/.test(atvHora.value)) {
    throw new Error("Complete a atividade: descrição, data (DD/MM/AAAA) e hora (HH:MM).");
  }
  return { descricao, data: atvData.value, hora: atvHora.value };
}

function cancelarEdicaoAtividade() {
  editandoAtividade = null;
  atvDescricao.value = atvData.value = atvHora.value = "";
  btnAddAtividade.textContent = "Adicionar";
}

btnAddAtividade.onclick = async () => {
  const erroAtv = document.getElementById("atv-erro");
  mostrarErro(erroAtv, "");
  try {
    const atv = atividadeDigitada();
    if (!atv) throw new Error("Descreva a atividade e informe data e hora.");
    if (leadAtual === null) {
      atividadesNovas.push(atv);
      cancelarEdicaoAtividade();
      desenharAtividades();
      return;
    }
    const atualizado = editandoAtividade
      ? await api("PUT", `/api/atividades/${editandoAtividade}`, atv)
      : await api("POST", `/api/leads/${leadAtual.id}/atividades`, atv);
    cancelarEdicaoAtividade();
    receberLeadAtualizado(atualizado);
  } catch (e) {
    mostrarErro(erroAtv, e.message);
  }
};

function linhaAtividade(atv, acoes) {
  const s = atv.quando ? situacaoAtividade(atv) : "futura";
  const linha = el("div", `atividade at-${s}`);
  const quando = atv.quando ? formatarDataHora(atv.quando) : `${atv.data} ${atv.hora}`;
  const info = el("div", "atividade-info");
  info.append(el("b", "", quando), el("span", "", atv.descricao));
  const rotulo = { atrasada: "Atrasada", hoje: "Hoje", futura: "Futura" }[s];
  info.append(el("small", `selo selo-${s}`, rotulo));
  if (atv.google_link) {
    const g = el("a", "selo-google", "📅 No Google");
    g.href = atv.google_link;
    g.target = "_blank";
    g.rel = "noopener";
    g.title = `Evento na Google Agenda de ${atv.google_usuario}`;
    info.append(g);
  } else if (atv.google_erro && atv.id) {
    const g = el("button", "selo-google selo-google-erro", "⚠️ Reenviar ao Google");
    g.type = "button";
    g.title = atv.google_erro;
    g.onclick = async () => {
      try {
        const atualizado = await api("POST", `/api/atividades/${atv.id}/google`);
        receberLeadAtualizado(atualizado);
        const nova = atualizado.atividades.find((a) => a.id === atv.id);
        if (nova && nova.google_erro) alert(nova.google_erro);
      } catch (e) { alert(e.message); }
    };
    info.append(g);
  }
  linha.append(info);
  const botoes = el("div", "atividade-botoes");
  acoes.forEach(([texto, titulo, acao]) => {
    const b = el("button", "btn-mini", texto);
    b.type = "button";
    b.title = titulo;
    b.onclick = acao;
    botoes.append(b);
  });
  linha.append(botoes);
  return linha;
}

function desenharAtividades() {
  const g = estado.google || {};
  document.getElementById("aviso-google").hidden = !(g.configurado && !g.conectado);
  const lista = document.getElementById("lista-atividades");
  const concluidas = document.getElementById("lista-concluidas");
  lista.innerHTML = "";
  concluidas.innerHTML = "";

  if (leadAtual === null) {
    atividadesNovas.forEach((atv, i) => {
      lista.append(linhaAtividade(atv, [["✕", "Remover", () => { atividadesNovas.splice(i, 1); desenharAtividades(); }]]));
    });
    if (!atividadesNovas.length) lista.append(el("p", "vazio-pequeno", "Nenhuma atividade agendada."));
    concluidas.append(el("p", "vazio-pequeno", "As atividades concluídas aparecem aqui."));
    return;
  }

  const abertas = pendentes(leadAtual);
  abertas.forEach((atv) => {
    lista.append(linhaAtividade(atv, [
      ["✓", "Concluir", async () => receberLeadAtualizado(await api("POST", `/api/atividades/${atv.id}/concluir`))],
      ["✎", "Editar", () => {
        editandoAtividade = atv.id;
        atvDescricao.value = atv.descricao;
        atvData.value = formatarData(atv.quando);
        atvHora.value = atv.quando.slice(11, 16);
        btnAddAtividade.textContent = "Salvar alteração";
        atvDescricao.focus();
      }],
      ["🗑", "Excluir", async () => {
        if (confirm(`Excluir a atividade "${atv.descricao}"?`)) {
          receberLeadAtualizado(await api("DELETE", `/api/atividades/${atv.id}`));
        }
      }],
    ]));
  });
  if (!abertas.length) lista.append(el("p", "vazio-pequeno", "Nenhuma atividade agendada."));

  const feitas = leadAtual.atividades.filter((a) => a.concluida)
    .sort((a, b) => b.concluida_em.localeCompare(a.concluida_em));
  feitas.forEach((atv) => {
    const item = el("div", "registro");
    item.append(
      el("b", "", `✅ ${atv.descricao}`),
      el("small", "", `Agendada para ${formatarDataHora(atv.quando)} · concluída em ${formatarDataHora(atv.concluida_em)} por ${atv.concluida_por}`),
    );
    concluidas.append(item);
  });
  if (!feitas.length) concluidas.append(el("p", "vazio-pequeno", "Nenhuma atividade concluída ainda."));
}

// ---------- anotações ----------
document.getElementById("btn-add-anotacao").onclick = async () => {
  const campo = document.getElementById("nova-anotacao");
  const textoNota = campo.value.trim();
  if (!textoNota) return campo.focus();
  if (leadAtual === null) {
    mostrarErro(formErro, "A anotação será registrada quando você salvar o lead.");
    return;
  }
  try {
    receberLeadAtualizado(await api("POST", `/api/leads/${leadAtual.id}/anotacoes`, { texto: textoNota }));
    campo.value = "";
  } catch (e) {
    mostrarErro(formErro, e.message);
  }
};

function desenharAnotacoes() {
  const lista = document.getElementById("lista-anotacoes");
  lista.innerHTML = "";
  const notas = leadAtual ? leadAtual.anotacoes : [];
  notas.forEach((n) => {
    const item = el("div", "anotacao");
    const topo = el("div", "anotacao-topo");
    topo.append(avatar(n.autor, "avatar-mini"), el("b", "", n.autor), el("small", "", formatarDataHora(n.criado_em)));
    if (n.autor === estado.usuario) {
      const b = el("button", "btn-mini", "🗑");
      b.type = "button";
      b.title = "Excluir anotação";
      b.onclick = async () => {
        if (confirm("Excluir esta anotação?")) receberLeadAtualizado(await api("DELETE", `/api/anotacoes/${n.id}`));
      };
      topo.append(b);
    }
    item.append(topo, el("div", "anotacao-texto", n.texto));
    lista.append(item);
  });
  if (!notas.length) lista.append(el("p", "vazio-pequeno", "Nenhuma anotação ainda."));
}

// ---------- descarte ----------
const modalDescartar = document.getElementById("modal-descartar");
const formDescartar = document.getElementById("form-descartar");
let leadDescartar = null;

function abrirDescarte(lead) {
  leadDescartar = lead;
  formDescartar.reset();
  mostrarErro(document.getElementById("descartar-erro"), "");
  document.getElementById("descartar-nome").textContent = `Lead: ${lead.nome}. Ele vai para a aba “Meus descartados” do dono e pode ser restaurado depois.`;
  modalDescartar.showModal();
}

formDescartar.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const motivo = formDescartar.querySelector('input[name="motivo"]:checked');
  if (!motivo) return mostrarErro(document.getElementById("descartar-erro"), "Escolha o motivo.");
  try {
    substituirLead(await api("POST", `/api/leads/${leadDescartar.id}/descartar`, { motivo: motivo.value }));
    modalDescartar.close();
    if (modal.open) modal.close();
  } catch (e) {
    mostrarErro(document.getElementById("descartar-erro"), e.message);
  }
});

document.getElementById("link-perfil-google").onclick = () => {
  modal.close();
  abrirPerfil();
};
