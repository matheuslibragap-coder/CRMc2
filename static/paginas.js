// MASTER - páginas do menu: Relatórios, Feedbacks e Ajuda

// ---------- relatórios ----------
const selPessoa = document.getElementById("rel-pessoa");
const selPeriodo = document.getElementById("rel-periodo");
let dadosRelatorio = [];

async function abrirRelatorios() {
  if (selPessoa.options.length === 0) {
    selPessoa.append(new Option("Comercial 2 (todos)", ""));
    estado.usuarios.filter((u) => u.ativo && u.papel === "vendedor")
      .forEach((u) => selPessoa.append(new Option(u.nome, u.nome)));
  }
  document.getElementById("relatorios").innerHTML = '<div class="painel">Carregando…</div>';
  try {
    dadosRelatorio = (await api("GET", "/api/leads?visao=tudo")).leads;
  } catch (e) {
    document.getElementById("relatorios").innerHTML = "";
    return alert(e.message);
  }
  desenharRelatorios();
}
selPessoa.onchange = desenharRelatorios;
selPeriodo.onchange = desenharRelatorios;

function painel(titulo, dica) {
  const p = el("div", "painel relatorio");
  p.append(el("h3", "", titulo));
  if (dica) p.append(el("p", "dica", dica));
  return p;
}

function bloco(rotulo, valor, detalhe, classe = "") {
  const b = el("div", `bloco-numero ${classe}`);
  b.append(el("small", "", rotulo), el("b", "", valor));
  if (detalhe) b.append(el("span", "", detalhe));
  return b;
}

// Barras horizontais de uma cor só; o número fica escrito ao lado de cada barra.
// Com maximoDoItem, cada barra mostra o progresso até o próprio máximo (ex.: meta).
function barras(itens, formatarDetalhe, maximoDoItem) {
  const caixa = el("div", "barras");
  const maximoGeral = Math.max(1, ...itens.map((i) => i.valor));
  itens.forEach((i) => {
    const maximo = maximoDoItem ? Math.max(1, maximoDoItem(i)) : maximoGeral;
    const linha = el("div", "barra-linha");
    const detalhe = formatarDetalhe ? formatarDetalhe(i) : String(i.valor);
    linha.title = `${i.rotulo}: ${detalhe}`;
    const trilho = el("div", "barra-trilho");
    const barra = el("div", "barra");
    barra.style.width = `${Math.min(100, (i.valor / maximo) * 100)}%`;
    if (i.valor === 0) barra.classList.add("barra-zero");
    trilho.append(barra);
    linha.append(el("span", "barra-rotulo", i.rotulo), trilho, el("span", "barra-valor", detalhe));
    caixa.append(linha);
  });
  if (!itens.length) caixa.append(el("p", "vazio-pequeno", "Sem dados no período."));
  return caixa;
}

function contar(lista, chave) {
  const mapa = new Map();
  lista.forEach((item) => {
    const valores = Array.isArray(chave(item)) ? chave(item) : [chave(item)];
    valores.forEach((v) => mapa.set(v, (mapa.get(v) || 0) + 1));
  });
  return mapa;
}

function mesAtualISO() {
  const d = new Date();
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}`;
}

// Tempo médio (em dias) que os leads ficaram em cada etapa, pela linha do tempo
function tempoMedioPorEtapa(lista) {
  const somas = {};
  lista.forEach((l) => {
    const entradas = l.historico.filter((h) => h.evento === "criacao" || h.evento === "etapa");
    for (let i = 0; i < entradas.length - 1; i++) {
      const etapa = entradas[i].coluna;
      const dias = (new Date(entradas[i + 1].criado_em) - new Date(entradas[i].criado_em)) / 86400000;
      somas[etapa] = somas[etapa] || { total: 0, n: 0 };
      somas[etapa].total += dias;
      somas[etapa].n += 1;
    }
  });
  return somas;
}

function desenharRelatorios() {
  const cfg = estado.config;
  const pessoa = selPessoa.value;
  const dias = Number(selPeriodo.value);
  const inicio = dias ? hojeISO(-dias) : "";
  const agora = new Date();
  const fechadoCol = cfg.fechado;

  const daPessoa = dadosRelatorio.filter((l) => !pessoa || l.dono === pessoa);
  const noPeriodo = daPessoa.filter((l) => l.data_criacao >= inicio);
  const funil = noPeriodo.filter((l) => l.coluna !== cfg.carteira);
  const ativos = funil.filter((l) => !l.descartado);
  const emAndamento = ativos.filter((l) => l.coluna !== fechadoCol);
  const propostas = ativos.filter((l) => l.coluna === "Proposta enviada");
  const fechados = ativos.filter((l) => l.coluna === fechadoCol);
  const descartados = funil.filter((l) => l.descartado);
  const somaPropostas = propostas.reduce((t, l) => t + (l.valor_proposta || 0), 0);
  const taxa = fechados.length + descartados.length
    ? Math.round((fechados.length / (fechados.length + descartados.length)) * 100) + "%"
    : "—";
  const carteira = daPessoa.filter((l) => l.coluna === cfg.carteira && !l.descartado);
  // Vendas contam pela data de fechamento (e pelo vendedor que fechou)
  const vendas = dadosRelatorio.filter((l) => l.coluna === fechadoCol && !l.descartado && l.fechado_em
    && l.fechado_em.slice(0, 10) >= inicio && (!pessoa || l.vendedor === pessoa));
  const somaVendas = vendas.reduce((t, l) => t + (l.valor_venda || 0), 0);
  const somaComissao = vendas.reduce((t, l) => t + (l.valor_venda || 0) * (l.comissao_dobrada ? 2 : 1), 0);

  const area = document.getElementById("relatorios");
  area.innerHTML = "";

  // Resumo em números
  const resumo = painel("Resumo", "Leads criados no período escolhido. Vendas contam pela data em que o lead foi fechado.");
  const grade = el("div", "grade-numeros");
  grade.append(
    bloco("Em andamento no funil", emAndamento.length),
    bloco("Propostas em aberto", formatarReais(somaPropostas), `${propostas.length} proposta(s)`),
    bloco("Vendido no período", formatarReais(somaVendas), `${vendas.length} venda(s)`),
    bloco("Comissão no período", formatarReais(somaComissao), "com as dobradas de indicação"),
    bloco("Descartados", descartados.length),
    bloco("Taxa de fechamento", taxa, "fechados ÷ (fechados + descartados)"),
    bloco("Clientes na Carteira", carteira.length, "todos, sem filtro de período"),
  );
  resumo.append(grade);
  area.append(resumo);

  // Metas do mês (por pessoa)
  const mes = mesAtualISO();
  const participantes = estado.usuarios.filter((u) => u.ativo && u.na_meta && (!pessoa || u.nome === pessoa));
  if (participantes.length) {
    const nomeMes = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const pMetas = painel(`🎯 Metas de ${nomeMes}`, "Quanto cada um já vendeu da própria meta mensal. A trilha completa está no menu → Decolagem do sucesso.");
    pMetas.append(barras(participantes.map((u) => {
      const vendido = dadosRelatorio.filter((l) => l.coluna === fechadoCol && !l.descartado
        && l.vendedor === u.nome && (l.fechado_em || "").slice(0, 7) === mes)
        .reduce((t, l) => t + (l.valor_venda || 0), 0);
      return { rotulo: u.nome, valor: vendido, meta: u.meta_mensal };
    }), (i) => `${formatarReais(i.valor)} de ${formatarReais(i.meta)} · ${i.meta ? Math.round((i.valor / i.meta) * 100) : 0}%`, (i) => i.meta));
    area.append(pMetas);
  }

  // Funil por etapa
  const pFunil = painel("Leads por etapa do funil");
  pFunil.append(barras(cfg.colunas_funil.map((c) => ({
    rotulo: c, valor: ativos.filter((l) => l.coluna === c).length,
  }))));
  area.append(pFunil);

  // Tempo médio em cada etapa
  const tempos = tempoMedioPorEtapa(daPessoa.filter((l) => l.coluna !== cfg.carteira));
  const pTempo = painel("Tempo médio em cada etapa", "Quantos dias, em média, os leads ficam em cada etapa antes de avançar (ou voltar).");
  pTempo.append(barras(cfg.colunas_funil.filter((c) => c !== fechadoCol).map((c) => ({
    rotulo: c, valor: tempos[c] ? tempos[c].total / tempos[c].n : 0, n: tempos[c] ? tempos[c].n : 0,
  })), (i) => i.n ? `${i.valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s) · ${i.n} passagem(ns)` : "sem dados ainda"));
  area.append(pTempo);

  // Por pessoa (só vendedores; o coordenador não tem leads próprios)
  if (!pessoa) {
    const pPessoas = painel("Por pessoa");
    const tabela = el("table", "tabela");
    const cab = el("tr");
    ["Pessoa", "Em andamento", "Propostas em aberto", "Vendido no período", "Comissão", "Descartados", "Ativ. atrasadas", "Ativ. hoje"]
      .forEach((t) => cab.append(el("th", "", t)));
    tabela.append(cab);
    estado.usuarios.filter((u) => u.ativo && u.papel === "vendedor").forEach((u) => {
      const deles = funil.filter((l) => l.dono === u.nome);
      const ativosDeles = deles.filter((l) => !l.descartado);
      const vendasDeles = vendas.filter((l) => l.vendedor === u.nome);
      const pend = dadosRelatorio.filter((l) => l.dono === u.nome && !l.descartado)
        .flatMap((l) => l.atividades.filter((a) => !a.concluida));
      const tr = el("tr");
      const nome = el("td", "td-pessoa");
      nome.append(avatar(u.nome, "avatar-mini"), u.nome);
      tr.append(
        nome,
        el("td", "", ativosDeles.filter((l) => l.coluna !== fechadoCol).length),
        el("td", "", formatarReais(ativosDeles.filter((l) => l.coluna === "Proposta enviada")
          .reduce((t, l) => t + (l.valor_proposta || 0), 0))),
        el("td", "", formatarReais(vendasDeles.reduce((t, l) => t + (l.valor_venda || 0), 0))),
        el("td", "", formatarReais(vendasDeles.reduce((t, l) => t + (l.valor_venda || 0) * (l.comissao_dobrada ? 2 : 1), 0))),
        el("td", "", deles.filter((l) => l.descartado).length),
        el("td", "", pend.filter((a) => situacaoAtividade(a, agora) === "atrasada").length),
        el("td", "", pend.filter((a) => situacaoAtividade(a, agora) === "hoje").length),
      );
      tabela.append(tr);
    });
    const rolagem = el("div", "tabela-rolagem");
    rolagem.append(tabela);
    pPessoas.append(rolagem);
    area.append(pPessoas);
  }

  // Produtos vendidos
  const pVendidos = painel("Produtos vendidos", "Informados no fechamento de cada venda do período.");
  const porVendido = contar(vendas, (l) => l.produtos_vendidos);
  pVendidos.append(barras(cfg.produtos.map((p) => ({ rotulo: p, valor: porVendido.get(p) || 0 }))));
  area.append(pVendidos);

  // Origem
  const pOrigem = painel("Origem dos leads", "Quantos leads vieram de cada origem e quantos deles fecharam.");
  const porOrigem = contar(funil, (l) => l.origem || "Sem origem informada");
  const fechadosOrigem = contar(fechados, (l) => l.origem || "Sem origem informada");
  const origens = [...cfg.origens, "Sem origem informada"]
    .filter((o) => porOrigem.has(o) || cfg.origens.includes(o))
    .map((o) => ({ rotulo: o, valor: porOrigem.get(o) || 0, fechados: fechadosOrigem.get(o) || 0 }));
  pOrigem.append(barras(origens, (i) => `${i.valor} · ${i.fechados} fechado(s)`));
  area.append(pOrigem);

  // Produtos de interesse
  const pProdutos = painel("Produtos de interesse", "Um lead pode ter mais de um produto.");
  const porProduto = contar(funil, (l) => l.produtos);
  pProdutos.append(barras(cfg.produtos.map((p) => ({ rotulo: p, valor: porProduto.get(p) || 0 }))));
  area.append(pProdutos);

  // Motivos de descarte
  const pMotivos = painel("Motivos de descarte");
  const porMotivo = contar(descartados, (l) => l.motivo_descarte);
  pMotivos.append(barras(cfg.motivos_descarte.map((m) => ({ rotulo: m, valor: porMotivo.get(m) || 0 }))));
  area.append(pMotivos);

  // Atividades
  const pAtv = painel("Atividades", "Pendentes: situação agora. Concluídas: dentro do período escolhido.");
  const pendentesTodas = daPessoa.filter((l) => !l.descartado).flatMap((l) => l.atividades.filter((a) => !a.concluida));
  const concluidas = daPessoa.flatMap((l) => l.atividades.filter((a) => a.concluida && a.concluida_em >= inicio));
  const gradeAtv = el("div", "grade-numeros");
  gradeAtv.append(
    bloco("Atrasadas", pendentesTodas.filter((a) => situacaoAtividade(a, agora) === "atrasada").length, "", "num-atrasada"),
    bloco("Para hoje", pendentesTodas.filter((a) => situacaoAtividade(a, agora) === "hoje").length, "", "num-hoje"),
    bloco("Futuras", pendentesTodas.filter((a) => situacaoAtividade(a, agora) === "futura").length, "", "num-futura"),
    bloco("Concluídas", concluidas.length),
  );
  pAtv.append(gradeAtv);
  area.append(pAtv);
}

// ---------- feedbacks ----------
const formFeedback = document.getElementById("form-feedback");

function prepararFeedbacks() {
  formFeedback.tipo.innerHTML = "";
  estado.config.tipos_feedback.forEach((t) => formFeedback.tipo.append(new Option(t, t)));
}

async function carregarFeedbacks() {
  const lista = document.getElementById("lista-feedbacks");
  try {
    const { feedbacks } = await api("GET", "/api/feedbacks");
    lista.innerHTML = "";
    feedbacks.forEach((f) => {
      const item = el("div", "painel feedback");
      const topo = el("div", "anotacao-topo");
      topo.append(avatar(f.autor, "avatar-mini"), el("b", "", f.autor),
        el("span", `chip chip-${f.tipo.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}`, f.tipo),
        el("small", "", formatarDataHora(f.criado_em)));
      item.append(topo, el("div", "anotacao-texto", f.texto));
      lista.append(item);
    });
    if (!feedbacks.length) lista.append(el("p", "vazio", "Nenhum feedback ainda. Seja o primeiro! ✨"));
  } catch (e) {
    lista.textContent = e.message;
  }
}

formFeedback.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const erroFb = document.getElementById("feedback-erro");
  mostrarErro(erroFb, "");
  try {
    await api("POST", "/api/feedbacks", { tipo: formFeedback.tipo.value, texto: formFeedback.texto.value });
    formFeedback.texto.value = "";
    carregarFeedbacks();
  } catch (e) {
    mostrarErro(erroFb, e.message);
  }
});

// ---------- ajuda ----------
let ajudaCarregada = false;
async function abrirAjuda() {
  if (ajudaCarregada) return;
  const caixa = document.getElementById("conteudo-ajuda");
  try {
    const resp = await fetch("/ajuda.html");
    caixa.innerHTML = await resp.text();
    aplicarIcones(caixa);
    ajudaCarregada = true;
  } catch (e) {
    caixa.textContent = "Não foi possível carregar a ajuda.";
  }
}


// ---------- Meu dia ----------
const modalMeuDia = document.getElementById("modal-meu-dia");

function saudacao() {
  const h = new Date().getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

async function abrirMeuDia(automatico = false) {
  let atividades;
  try {
    atividades = (await api("GET", "/api/minhas-atividades")).atividades;
  } catch (e) {
    if (!automatico) alert(e.message);
    return;
  }
  const agora = new Date();
  const atrasadas = atividades.filter((a) => situacaoAtividade(a, agora) === "atrasada");
  const hoje = atividades.filter((a) => situacaoAtividade(a, agora) === "hoje");
  if (automatico && !atrasadas.length && !hoje.length) return;

  const dataHoje = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("meu-dia-titulo").textContent = `☀️ ${saudacao()}, ${estado.usuario}!`;
  const caixa = document.getElementById("meu-dia-conteudo");
  caixa.innerHTML = "";
  caixa.append(el("p", "dica", `Hoje é ${dataHoje}. ${estado.coordenador ? "Estas são as atividades da equipe." : "Estas são as suas atividades."}`));

  const secao = (titulo, lista, classe) => {
    const bloco = el("section", `meu-dia-secao ${classe}`);
    bloco.append(el("h3", "", `${titulo} (${lista.length})`));
    lista.forEach((a) => {
      const item = el("button", "meu-dia-item");
      item.type = "button";
      const hora = a.quando.slice(0, 10) === hojeISO() ? a.quando.slice(11, 16) : formatarDataHora(a.quando);
      item.append(el("b", "", hora));
      const meio = el("div");
      meio.append(el("span", "", a.descricao), el("small", "", `${a.nome}${a.conta ? " / " + a.conta : ""}${a.dono !== estado.usuario ? " · de " + a.dono : ""}`));
      item.append(meio, el("span", "meu-dia-abrir", "Abrir →"));
      item.onclick = () => { modalMeuDia.close(); abrirLeadPorId(a.lead_id); };
      bloco.append(item);
    });
    if (!lista.length) bloco.append(el("p", "vazio-pequeno", "Nada por aqui. ✨"));
    caixa.append(bloco);
  };
  secao("🔴 Atrasadas", atrasadas, "secao-atrasada");
  secao("🔵 Para hoje", hoje, "secao-hoje");
  if (!atrasadas.length && !hoje.length) caixa.append(el("p", "vazio", "Céu limpo! Nenhuma atividade atrasada ou para hoje. 🌌"));

  const botaoAviso = document.getElementById("btn-notificacoes");
  botaoAviso.hidden = !("Notification" in window) || Notification.permission !== "default";
  modalMeuDia.showModal();
}

document.getElementById("btn-notificacoes").onclick = async () => {
  if (!("Notification" in window)) return;
  const resposta = await Notification.requestPermission();
  document.getElementById("btn-notificacoes").hidden = true;
  if (resposta === "granted") new Notification("MASTER", { body: "Pronto! Você vai receber os lembretes das atividades. 🚀" });
};

// ---------- lembretes: 15 minutos antes de cada atividade ----------
const MINUTOS_LEMBRETE = 15;
let timerLembretes = null;

function iniciarLembretes() {
  pararLembretes();
  verificarLembretes();
  timerLembretes = setInterval(verificarLembretes, 60000);
  // Abre o "Meu dia" sozinho na primeira entrada do dia
  const chave = `meu-dia-${estado.usuario}`;
  if (lerLocal(chave) !== hojeISO()) {
    gravarLocal(chave, hojeISO());
    setTimeout(() => abrirMeuDia(true), 600);
  }
}

function pararLembretes() {
  clearInterval(timerLembretes);
  timerLembretes = null;
  document.getElementById("lembretes").innerHTML = "";
}

async function verificarLembretes() {
  if (!estado.usuario) return;
  let atividades;
  try {
    atividades = (await api("GET", "/api/minhas-atividades")).atividades;
  } catch (e) { return; }
  const agora = Date.now();
  atividades
    .filter((a) => a.criado_por === estado.usuario || a.dono === estado.usuario)
    .forEach((a) => {
      const faltam = (new Date(a.quando) - agora) / 60000;
      const chave = `lembrete-${a.id}-${a.quando}`;
      if (faltam < 0 || faltam > MINUTOS_LEMBRETE || lerLocal(chave)) return;
      gravarLocal(chave, "1");
      mostrarLembrete(a, Math.max(0, Math.round(faltam)));
    });
}

function mostrarLembrete(a, minutos) {
  const titulo = minutos ? `⏰ Em ${minutos} min` : "⏰ Agora";
  const texto = `${a.descricao} · ${a.nome}${a.conta ? " / " + a.conta : ""}`;
  const cartao = el("div", "lembrete");
  const fechar = el("button", "btn-x", "✕");
  fechar.onclick = () => cartao.remove();
  const abrir = el("button", "btn btn-pequeno btn-primario", "Abrir lead");
  abrir.onclick = () => { cartao.remove(); abrirLeadPorId(a.lead_id); };
  const corpo = el("div");
  corpo.append(el("b", "", `${titulo} (${a.quando.slice(11, 16)})`), el("span", "", texto), abrir);
  cartao.append(corpo, fechar);
  document.getElementById("lembretes").append(cartao);
  if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
    new Notification(`MASTER ${titulo}`, { body: texto });
  }
}

// ---------- Decolagem do sucesso ----------
let tipoPeriodo = "mes";
let deslocamentoPeriodo = 0;
let timerDecolagem = null;
const NOMES_MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
  "agosto", "setembro", "outubro", "novembro", "dezembro"];

function periodoAtual() {
  const hoje = new Date();
  let inicio, fim, nome, meses;
  if (tipoPeriodo === "mes") {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth() + deslocamentoPeriodo, 1);
    fim = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0);
    nome = `${NOMES_MESES[inicio.getMonth()]} de ${inicio.getFullYear()}`;
    meses = 1;
  } else {
    const trimestre = Math.floor(hoje.getMonth() / 3) + deslocamentoPeriodo;
    inicio = new Date(hoje.getFullYear(), trimestre * 3, 1);
    fim = new Date(inicio.getFullYear(), inicio.getMonth() + 3, 0);
    const numero = Math.floor(inicio.getMonth() / 3) + 1;
    nome = `${numero}º trimestre de ${inicio.getFullYear()} (${NOMES_MESES[inicio.getMonth()].slice(0, 3)}–${NOMES_MESES[fim.getMonth()].slice(0, 3)})`;
    meses = 3;
  }
  const iso = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
  return { inicio: iso(inicio), fim: iso(fim), nome, meses, fimData: fim, atual: deslocamentoPeriodo === 0 };
}

document.querySelectorAll("#pagina-decolagem .aba").forEach((aba) => {
  aba.onclick = () => {
    tipoPeriodo = aba.dataset.tipo;
    deslocamentoPeriodo = 0;
    document.querySelectorAll("#pagina-decolagem .aba").forEach((a) => a.classList.toggle("ativa", a === aba));
    carregarDecolagem();
  };
});
document.getElementById("periodo-anterior").onclick = () => { deslocamentoPeriodo -= 1; carregarDecolagem(); };
document.getElementById("periodo-seguinte").onclick = () => {
  if (deslocamentoPeriodo < 0) { deslocamentoPeriodo += 1; carregarDecolagem(); }
};

function abrirDecolagem() {
  carregarDecolagem();
  clearInterval(timerDecolagem);
  // Ranking em tempo real: atualiza a cada 15 segundos enquanto a página está aberta
  timerDecolagem = setInterval(() => {
    if (estado.pagina !== "decolagem") return clearInterval(timerDecolagem);
    if (document.visibilityState === "visible") carregarDecolagem();
  }, 15000);
}

async function carregarDecolagem() {
  const p = periodoAtual();
  document.getElementById("periodo-nome").textContent = p.nome.charAt(0).toUpperCase() + p.nome.slice(1);
  document.getElementById("periodo-seguinte").disabled = p.atual;
  try {
    const dados = await api("GET", `/api/decolagem?inicio=${p.inicio}&fim=${p.fim}&meses=${p.meses}`);
    desenharDecolagem(dados, p);
  } catch (e) {
    document.getElementById("decolagem-conteudo").textContent = e.message;
  }
}

function porcentagem(valor, meta) {
  return meta ? (valor / meta) * 100 : 0;
}
const formatarPct = (pct) => `${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

// Trilha espacial: da Terra (0%) até o Planeta Meta (100%), com o foguete na posição atual
function desenharTrilha(dados, p) {
  const pct = porcentagem(dados.vendido_equipe, dados.meta_equipe);
  const caixa = document.getElementById("trilha");
  caixa.innerHTML = "";
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 1000 260");
  svg.setAttribute("class", "trilha-svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Meta: ${formatarPct(pct)} concluída`);
  const caminho = "M 90 200 C 330 260, 560 30, 900 80";
  svg.innerHTML = `
    <path d="${caminho}" fill="none" stroke="#e5dbff" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22" opacity=".7"/>
    <path id="trilha-feita" d="${caminho}" pathLength="100" fill="none" stroke="#ffd43b" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${Math.min(100, pct)} 100"/>
    <g transform="translate(40 150) scale(1.55)">${ICONES.terra.replace("<svg", "<svg width='64' height='64'")}</g>
    <g transform="translate(850 22) scale(1.7)">${ICONES.planeta.replace("<svg", "<svg width='64' height='64'")}</g>
    <text x="905" y="160" text-anchor="middle" class="trilha-texto">Planeta Meta</text>
    <text x="905" y="182" text-anchor="middle" class="trilha-texto-menor">${formatarReais(dados.meta_equipe)}</text>`;
  caixa.append(svg);
  const guia = svg.querySelector("#trilha-feita");
  const total = guia.getTotalLength();
  // Marcos de 25%, 50% e 75%
  [25, 50, 75].forEach((m) => {
    const ponto = guia.getPointAtLength((total * m) / 100);
    const g = document.createElementNS(svgNS, "g");
    const alcancado = pct >= m;
    g.innerHTML = `<circle cx="${ponto.x}" cy="${ponto.y}" r="13" fill="${alcancado ? "#ffd43b" : "#2e2170"}" stroke="#1a1033" stroke-width="3"/>
      <text x="${ponto.x}" y="${ponto.y + 38}" text-anchor="middle" class="trilha-texto-menor">${m}%</text>
      <text x="${ponto.x}" y="${ponto.y + 5}" text-anchor="middle" font-size="13">${alcancado ? "⭐" : ""}</text>`;
    svg.append(g);
  });
  // Foguete apontado na direção da trilha
  const posicao = Math.min(100, Math.max(0, pct));
  const ponto = guia.getPointAtLength((total * posicao) / 100);
  const adiante = guia.getPointAtLength(Math.min(total, (total * posicao) / 100 + 1));
  const antes = guia.getPointAtLength(Math.max(0, (total * posicao) / 100 - 1));
  const angulo = (Math.atan2(adiante.y - antes.y, adiante.x - antes.x) * 180) / Math.PI + 90;
  const foguete = document.createElementNS(svgNS, "g");
  foguete.setAttribute("class", "trilha-foguete");
  foguete.setAttribute("transform", `translate(${ponto.x} ${ponto.y}) rotate(${angulo}) translate(-32 -40)`);
  foguete.innerHTML = ICONES.fechado.replace("<svg", "<svg width='64' height='64'");
  svg.append(foguete);

  const resumo = el("div", "trilha-resumo");
  const falta = dados.meta_equipe - dados.vendido_equipe;
  resumo.append(
    el("div", "trilha-numero", formatarReais(dados.vendido_equipe)),
    el("div", "trilha-de", `de ${formatarReais(dados.meta_equipe)} · meta do Comercial 2`),
    el("div", "trilha-pct" + (pct >= 100 ? " batida" : ""), pct >= 100 ? `🎉 META BATIDA! ${formatarPct(pct)}` : formatarPct(pct)),
  );
  if (falta > 0) {
    let texto = `Faltam ${formatarReais(falta)}`;
    if (p.atual) {
      const dias = Math.max(0, Math.ceil((p.fimData - new Date()) / 86400000));
      texto += dias ? ` · ${dias} dia(s) até o fim do período` : " · último dia!";
    }
    resumo.append(el("div", "trilha-falta", texto));
  } else {
    resumo.append(el("div", "trilha-falta", `Passamos ${formatarReais(-falta)} da meta. Rumo a outra galáxia! 🌌`));
  }
  caixa.append(resumo);
}

function desenharDecolagem(dados, p) {
  desenharTrilha(dados, p);
  const area = document.getElementById("decolagem-conteudo");
  area.innerHTML = "";

  // Tripulação: foto, quanto vendeu, % da meta individual e comissão
  const pTripulacao = painel("👩‍🚀 Tripulação", "Para a meta conta o valor vendido. A comissão dobra nas vendas de indicação marcadas com SIM.");
  const grade = el("div", "tripulacao");
  dados.participantes.forEach((pessoa) => {
    const cartao = el("div", "tripulante");
    cartao.append(avatar(pessoa.nome, "avatar-grande"), el("b", "", pessoa.nome));
    const pct = porcentagem(pessoa.vendido, pessoa.meta);
    cartao.append(el("div", "tripulante-valor", formatarReais(pessoa.vendido)));
    const barra = el("div", "progresso");
    const cheio = el("div", "progresso-cheio");
    cheio.style.width = `${Math.min(100, pct)}%`;
    barra.append(cheio);
    cartao.append(barra, el("small", "", `${formatarPct(pct)} da meta de ${formatarReais(pessoa.meta)}`));
    cartao.append(el("div", "tripulante-comissao", `💸 Comissão: ${formatarReais(pessoa.comissao)}`));
    cartao.append(el("small", "", `${pessoa.vendas} venda(s) · ${formatarPct(porcentagem(pessoa.vendido, dados.meta_equipe))} da meta da equipe`));
    const produtos = el("div", "tags");
    Object.entries(pessoa.produtos).forEach(([nome, qtd]) =>
      produtos.append(el("span", `tag p-${estado.config.produtos.indexOf(nome)}`, `${nome} × ${qtd}`)));
    cartao.append(produtos);
    grade.append(cartao);
  });
  pTripulacao.append(grade);
  area.append(pTripulacao);

  // Ranking em tempo real
  const pRanking = painel("🏆 Ranking", "Atualiza sozinho a cada venda fechada (a página confere a cada 15 segundos).");
  const medalhas = ["🥇", "🥈", "🥉"];
  const maior = Math.max(1, ...dados.participantes.map((x) => x.vendido));
  const lista = el("ol", "ranking");
  dados.participantes.forEach((pessoa, i) => {
    const item = el("li", "ranking-item");
    item.append(el("span", "ranking-pos", pessoa.vendido > 0 ? (medalhas[i] || `${i + 1}º`) : `${i + 1}º`),
      avatar(pessoa.nome, "avatar-mini"), el("b", "ranking-nome", pessoa.nome));
    const trilho = el("div", "barra-trilho");
    const barra = el("div", "barra" + (pessoa.vendido === 0 ? " barra-zero" : ""));
    barra.style.width = `${(pessoa.vendido / maior) * 100}%`;
    trilho.append(barra);
    item.title = `${pessoa.nome}: ${formatarReais(pessoa.vendido)}`;
    item.append(trilho, el("span", "barra-valor", formatarReais(pessoa.vendido)));
    lista.append(item);
  });
  pRanking.append(lista);
  area.append(pRanking);

  // Produtos vendidos
  const pProdutos = painel("🛰️ Produtos vendidos no período");
  const contagem = {};
  dados.vendas.filter((v) => v.na_meta).forEach((v) => v.produtos.forEach((pr) => (contagem[pr] = (contagem[pr] || 0) + 1)));
  pProdutos.append(barras(estado.config.produtos.map((pr) => ({ rotulo: pr, valor: contagem[pr] || 0 }))));
  area.append(pProdutos);

  // Últimas vendas
  const pVendas = painel("🚀 Lançamentos do período");
  if (!dados.vendas.length) pVendas.append(el("p", "vazio-pequeno", "Nenhuma venda fechada neste período ainda. A primeira decolagem pode ser a sua!"));
  dados.vendas.slice(0, 20).forEach((v) => {
    const item = el("button", "item-escolha");
    item.type = "button";
    item.append(avatar(v.vendedor, "avatar-mini"));
    const meio = el("div");
    meio.append(el("b", "", `${formatarReais(v.valor)} · ${v.nome}${v.conta ? " / " + v.conta : ""}`),
      el("small", "", `${v.vendedor} · ${formatarDataHora(v.fechado_em)} · ${v.produtos.join(", ")}${v.dobrada ? " · ✨ comissão dobrada" : ""}`));
    item.append(meio);
    item.onclick = () => abrirLeadPorId(v.id);
    pVendas.append(item);
  });
  area.append(pVendas);
}

// ---------- Administração (só o Libraga) ----------
const formMeta = document.getElementById("form-meta-equipe");
const formNovoUsuario = document.getElementById("form-novo-usuario");
const erroAdmin = document.getElementById("admin-erro");

async function abrirAdmin() {
  try {
    desenharAdmin(await api("GET", "/api/admin"));
  } catch (e) {
    mostrarErro(erroAdmin, e.message);
  }
}

function receberAdmin(dados) {
  estado.usuarios = dados.usuarios;
  if (dados.meta_equipe_mensal !== undefined) estado.config.meta_equipe_mensal = dados.meta_equipe_mensal;
  desenharAdmin({ usuarios: dados.usuarios, meta_equipe_mensal: estado.config.meta_equipe_mensal });
  prepararFiltros();
}

async function salvarPessoa(nome, mudancas) {
  mostrarErro(erroAdmin, "");
  try {
    receberAdmin(await api("PUT", `/api/admin/usuarios/${encodeURIComponent(nome)}`, mudancas));
  } catch (e) {
    mostrarErro(erroAdmin, e.message);
    abrirAdmin();
  }
}

function mostrarSenhaGerada(nome, senha) {
  document.getElementById("senha-gerada-nome").textContent = nome;
  document.getElementById("senha-gerada").textContent = senha;
  document.getElementById("btn-copiar-senha").onclick = () => copiar(senha);
  document.getElementById("modal-senha-gerada").showModal();
}

function desenharAdmin(dados) {
  formMeta.meta.value = valorParaCampo(dados.meta_equipe_mensal);
  const tabela = document.getElementById("tabela-equipe");
  tabela.innerHTML = "";
  const cab = el("tr");
  ["Pessoa", "Papel", "Participa da meta", "Meta mensal (R$)", "Situação", "Ações"].forEach((t) => cab.append(el("th", "", t)));
  tabela.append(cab);
  dados.usuarios.forEach((u) => {
    const tr = el("tr", u.ativo ? "" : "linha-inativa");
    const nome = el("td", "td-pessoa");
    nome.append(avatar(u.nome, "avatar-mini"), u.nome + (u.nome === estado.usuario ? " (você)" : ""));

    const papel = el("select");
    [["vendedor", "Vendedor"], ["coordenador", "Coordenador"]].forEach(([v, t]) => papel.append(new Option(t, v)));
    papel.value = u.papel;
    papel.onchange = () => salvarPessoa(u.nome, { papel: papel.value });

    const meta = el("input");
    meta.type = "checkbox";
    meta.checked = u.na_meta;
    meta.setAttribute("aria-label", `${u.nome} participa da meta`);
    meta.onchange = () => salvarPessoa(u.nome, { na_meta: meta.checked });

    const valor = el("input");
    valor.type = "text";
    valor.inputMode = "decimal";
    valor.value = valorParaCampo(u.meta_mensal);
    valor.onchange = () => {
      const centavos = lerReais(valor.value);
      if (centavos === null || Number.isNaN(centavos)) return mostrarErro(erroAdmin, "Meta inválida. Ex.: 3.000,00");
      salvarPessoa(u.nome, { meta_mensal: centavos });
    };

    const acoes = el("td", "acoes-tabela");
    if (u.ativo) {
      const senha = el("button", "btn btn-pequeno", "🔑 Nova senha");
      senha.onclick = async () => {
        if (!confirm(`Gerar uma nova senha para ${u.nome}? A senha atual deixa de funcionar.`)) return;
        try {
          const r = await api("POST", `/api/admin/usuarios/${encodeURIComponent(u.nome)}/senha`);
          mostrarSenhaGerada(r.nome, r.senha);
        } catch (e) { mostrarErro(erroAdmin, e.message); }
      };
      acoes.append(senha);
    }
    if (u.nome !== estado.usuario) {
      const ativar = el("button", "btn btn-pequeno" + (u.ativo ? " btn-perigo" : ""), u.ativo ? "Desativar" : "Reativar");
      ativar.onclick = () => {
        if (u.ativo && !confirm(`Desativar ${u.nome}? A pessoa não consegue mais entrar. Os leads dela continuam no sistema (transfira-os pela Visão Geral).`)) return;
        salvarPessoa(u.nome, { ativo: !u.ativo });
      };
      acoes.append(ativar);
    }
    const celula = (conteudo) => { const td = el("td"); td.append(conteudo); return td; };
    tr.append(nome, celula(papel), celula(meta), celula(valor), el("td", "", u.ativo ? "Ativo" : "Desativado"), acoes);
    tabela.append(tr);
  });
}

formMeta.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  mostrarErro(erroAdmin, "");
  const centavos = lerReais(formMeta.meta.value);
  if (!centavos || Number.isNaN(centavos)) return mostrarErro(erroAdmin, "Meta inválida. Ex.: 12.000,00");
  try {
    receberAdmin(await api("PUT", "/api/admin/config", { meta_equipe_mensal: centavos }));
    alert("Meta do Comercial 2 atualizada! 🎯");
  } catch (e) { mostrarErro(erroAdmin, e.message); }
});

formNovoUsuario.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  mostrarErro(erroAdmin, "");
  try {
    const r = await api("POST", "/api/admin/usuarios", { nome: formNovoUsuario.nome.value, papel: formNovoUsuario.papel.value });
    formNovoUsuario.reset();
    receberAdmin(r);
    mostrarSenhaGerada(r.nome, r.senha);
  } catch (e) { mostrarErro(erroAdmin, e.message); }
});
