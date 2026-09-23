// MASTER - Kanban: quadro, cards, janela do lead, atividades, anotações e descarte

let visao = "meus"; // meus | geral | meus_descartados | descartados
let leads = [];
let arrastandoLead = null;

const quadro = document.getElementById("quadro");
const modal = document.getElementById("modal");
const form = document.getElementById("form-lead");
const formErro = document.getElementById("form-erro");

const PROPOSTA = "Proposta enviada";
const ehDescartados = () => visao === "meus_descartados" || visao === "descartados";

const AVISOS_VISAO = {
  geral: "Aqui você vê os leads de toda a equipe. Pode editar, mover e registrar atividades para ajudar um colega; só o dono pode excluir.",
  meus_descartados: "Seus leads descartados. Use “Restaurar” para devolver um lead à etapa em que estava.",
  descartados: "Leads descartados de todo o Comercial 2.",
};

// ---------- abas ----------
document.querySelectorAll(".aba").forEach((aba) => {
  aba.onclick = () => trocarVisao(aba.dataset.visao);
});

async function trocarVisao(nova) {
  visao = nova;
  document.querySelectorAll(".aba").forEach((a) => a.classList.toggle("ativa", a.dataset.visao === visao));
  const aviso = document.getElementById("aviso-visao");
  aviso.textContent = AVISOS_VISAO[visao] || "";
  aviso.hidden = !AVISOS_VISAO[visao];
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
  if (estado.usuario && estado.pagina === "kanban" && !arrastandoLead
      && !document.querySelector("dialog[open]")) {
    carregarLeads();
  }
}, 60000);

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

// ---------- desenho do quadro ----------
function iconeColuna(nomeColuna) {
  const s = el("span", "icone-coluna");
  s.innerHTML = ICONES[ICONE_COLUNA[nomeColuna]] || "";
  return s;
}

function etiquetaDono(nome) {
  const chip = el("span", "dono");
  chip.style.setProperty("--cor-dono", CORES_USUARIO[nome] || "#e9ecef");
  chip.append(avatar(nome, "avatar-mini"), nome === estado.usuario ? `${nome} (você)` : nome);
  return chip;
}

// Linha com um dado que pode ser selecionado e copiado (sem arrastar o card)
function linhaCopiavel(rotulo, valor) {
  const linha = el("div", "card-linha");
  linha.append(el("b", "", rotulo + ": "));
  const v = el("span", "copiavel", valor);
  v.title = "Selecione com o mouse ou clique no ícone para copiar";
  const b = el("button", "btn-copiar", "⧉");
  b.type = "button";
  b.title = `Copiar ${rotulo.toLowerCase()}`;
  b.onclick = (ev) => { ev.stopPropagation(); copiar(valor); };
  linha.append(v, b);
  return linha;
}

function criarCard(lead) {
  const situacao = situacaoLead(lead);
  const card = el("div", "card" + (situacao ? ` st-${situacao}` : "") + (lead.descartado ? " card-descartado" : ""));
  card.dataset.id = lead.id;
  const podeArrastar = !lead.descartado && lead.coluna !== estado.config.recorrentes;
  card.draggable = podeArrastar;

  if (visao !== "meus" && visao !== "meus_descartados") card.append(etiquetaDono(lead.dono));
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

  if (lead.telefone) card.append(linhaCopiavel("Tel", lead.telefone));
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
  if (lead.valor_proposta !== null && (lead.coluna === PROPOSTA || lead.coluna === "Fechado")) {
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

function desenhar() {
  if (estado.pagina !== "kanban") return;
  document.getElementById("legenda").hidden = ehDescartados();
  quadro.innerHTML = "";
  quadro.classList.toggle("quadro-descartados", ehDescartados());
  if (ehDescartados()) return desenharDescartados();

  for (const nomeColuna of estado.config.colunas) {
    const doColuna = leads.filter((l) => l.coluna === nomeColuna);
    const recorrente = nomeColuna === estado.config.recorrentes;

    const coluna = el("section", "coluna" + (recorrente ? " coluna-recorrentes" : ""));
    coluna.dataset.coluna = nomeColuna;
    const topo = el("div", "coluna-topo");
    const titulo = el("span", "coluna-titulo");
    let nomeExibido = nomeColuna;
    if (nomeColuna === PROPOSTA) {
      const soma = doColuna.reduce((t, l) => t + (l.valor_proposta || 0), 0);
      nomeExibido = `${PROPOSTA} - Soma total de propostas: ${formatarReais(soma)}`;
    }
    titulo.append(iconeColuna(nomeColuna), el("span", "", nomeExibido));
    topo.append(titulo, el("span", "contador", doColuna.length));
    coluna.append(topo);

    if (recorrente) {
      coluna.append(el("p", "dica-recorrentes", "Clientes da sua carteira. Ficam fora do funil."));
      const add = el("button", "btn btn-pequeno btn-add-recorrente", "+ Adicionar contato");
      add.onclick = () => abrirFormulario(null, estado.config.recorrentes);
      coluna.append(add);
    }

    const cards = el("div", "cards");
    doColuna.forEach((l) => cards.append(criarCard(l)));
    coluna.append(cards);

    const aceita = () => arrastandoLead && !recorrente && arrastandoLead.coluna !== estado.config.recorrentes;
    coluna.addEventListener("dragover", (ev) => {
      if (!aceita()) return;
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
      if (aceita()) moverLead(arrastandoLead.id, nomeColuna);
    });

    quadro.append(coluna);
  }
}

function desenharDescartados() {
  if (!leads.length) {
    quadro.append(el("p", "vazio", "Nenhum lead descartado por aqui. 🌌"));
    return;
  }
  const ordenados = [...leads].sort((a, b) => b.descartado_em.localeCompare(a.descartado_em));
  ordenados.forEach((l) => quadro.append(criarCard(l)));
}

function substituirLead(atualizado) {
  const pertence = {
    meus: atualizado.dono === estado.usuario && !atualizado.descartado,
    geral: !atualizado.descartado,
    meus_descartados: atualizado.dono === estado.usuario && atualizado.descartado,
    descartados: atualizado.descartado,
  }[visao];
  const existe = leads.some((l) => l.id === atualizado.id);
  if (pertence && existe) leads = leads.map((l) => (l.id === atualizado.id ? atualizado : l));
  else if (pertence) leads.push(atualizado);
  else leads = leads.filter((l) => l.id !== atualizado.id);
  desenhar();
}

async function moverLead(id, novaColuna) {
  const lead = leads.find((l) => l.id === id);
  if (!lead || lead.coluna === novaColuna) return;
  const anterior = lead.coluna;
  lead.coluna = novaColuna;
  desenhar();
  try {
    const atualizado = await api("PUT", `/api/leads/${id}`, { coluna: novaColuna });
    substituirLead(atualizado);
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
  cfg.colunas.filter((c) => c !== cfg.recorrentes).forEach((c) => form.coluna.append(new Option(c, c)));

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
}

function atualizarCamposCondicionais() {
  const recorrente = form.classList.contains("recorrente");
  document.getElementById("campo-campanha").hidden = form.origem.value !== estado.config.origem_campanha;
  document.getElementById("campo-etapa").hidden = recorrente;
  document.getElementById("campo-valor").hidden = recorrente || form.coluna.value !== PROPOSTA;
}
form.origem.addEventListener("change", atualizarCamposCondicionais);
form.coluna.addEventListener("change", atualizarCamposCondicionais);

function abrirFormulario(lead, colunaInicial) {
  form.reset();
  mostrarErro(formErro, "");
  mostrarErro(document.getElementById("atv-erro"), "");
  leadAtual = lead;
  atividadesNovas = [];
  cancelarEdicaoAtividade();

  const coluna = lead ? lead.coluna : colunaInicial || estado.config.colunas[1];
  const recorrente = coluna === estado.config.recorrentes;
  form.classList.toggle("recorrente", recorrente);

  let titulo = lead ? lead.nome : recorrente ? "Novo contato recorrente" : "Novo lead";
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
    if (!recorrente) form.coluna.value = lead.coluna;
    form.valor.value = valorParaCampo(lead.valor_proposta);
  } else if (!recorrente) {
    form.coluna.value = coluna;
  }
  document.getElementById("btn-excluir").hidden = !lead || lead.dono !== estado.usuario;
  document.getElementById("btn-descartar").hidden = !lead || lead.descartado;
  document.getElementById("btn-restaurar").hidden = !lead || !lead.descartado;
  atualizarCamposCondicionais();
  desenharAtividades();
  desenharAnotacoes();
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

// Atualiza o lead aberto depois de mexer em atividade/anotação
function receberLeadAtualizado(atualizado) {
  leadAtual = atualizado;
  substituirLead(atualizado);
  desenharAtividades();
  desenharAnotacoes();
}

function dadosDoFormulario() {
  const recorrente = form.classList.contains("recorrente");
  const dados = {
    nome: form.nome.value,
    telefone: form.telefone.value,
    email: form.email.value,
    conta: form.conta.value,
    origem: form.origem.value,
    origem_detalhe: form.origem_detalhe.value,
    produtos: [...form.querySelectorAll('input[name="produtos"]:checked')].map((c) => c.value),
    coluna: recorrente ? estado.config.recorrentes : form.coluna.value,
  };
  if (!recorrente) {
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
    if (leadAtual === null) {
      if (atvPendente) atividadesNovas.push(atvPendente);
      dados.anotacao = notaPendente;
      dados.atividades = atividadesNovas;
      const novo = await api("POST", "/api/leads", dados);
      modal.close();
      if (ehDescartados()) await trocarVisao("meus");
      substituirLead(novo);
      if (novo.coluna === PROPOSTA && novo.valor_proposta === null) pedirValor(novo);
    } else {
      let atualizado = await api("PUT", `/api/leads/${leadAtual.id}`, dados);
      if (notaPendente) atualizado = await api("POST", `/api/leads/${leadAtual.id}/anotacoes`, { texto: notaPendente });
      if (atvPendente) {
        const rota = editandoAtividade ? ["PUT", `/api/atividades/${editandoAtividade}`] : ["POST", `/api/leads/${leadAtual.id}/atividades`];
        atualizado = await api(rota[0], rota[1], atvPendente);
      }
      modal.close();
      substituirLead(atualizado);
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
