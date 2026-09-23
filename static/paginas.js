// MASTER - páginas do menu: Relatórios, Feedbacks e Ajuda

// ---------- relatórios ----------
const selPessoa = document.getElementById("rel-pessoa");
const selPeriodo = document.getElementById("rel-periodo");
let dadosRelatorio = [];

async function abrirRelatorios() {
  if (selPessoa.options.length === 0) {
    selPessoa.append(new Option("Comercial 2 (todos)", ""));
    estado.usuarios.forEach((u) => selPessoa.append(new Option(u.nome, u.nome)));
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

// Barras horizontais de uma cor só; o número fica escrito ao lado de cada barra
function barras(itens, formatarDetalhe) {
  const caixa = el("div", "barras");
  const maximo = Math.max(1, ...itens.map((i) => i.valor));
  itens.forEach((i) => {
    const linha = el("div", "barra-linha");
    const detalhe = formatarDetalhe ? formatarDetalhe(i) : String(i.valor);
    linha.title = `${i.rotulo}: ${detalhe}`;
    const trilho = el("div", "barra-trilho");
    const barra = el("div", "barra");
    barra.style.width = `${(i.valor / maximo) * 100}%`;
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

function desenharRelatorios() {
  const cfg = estado.config;
  const pessoa = selPessoa.value;
  const dias = Number(selPeriodo.value);
  const inicio = dias ? hojeISO(-dias) : "";
  const agora = new Date();

  const daPessoa = dadosRelatorio.filter((l) => !pessoa || l.dono === pessoa);
  const noPeriodo = daPessoa.filter((l) => l.data_criacao >= inicio);
  const funil = noPeriodo.filter((l) => l.coluna !== cfg.recorrentes);
  const ativos = funil.filter((l) => !l.descartado);
  const emAndamento = ativos.filter((l) => l.coluna !== "Fechado");
  const propostas = ativos.filter((l) => l.coluna === "Proposta enviada");
  const fechados = ativos.filter((l) => l.coluna === "Fechado");
  const descartados = funil.filter((l) => l.descartado);
  const somaPropostas = propostas.reduce((t, l) => t + (l.valor_proposta || 0), 0);
  const somaFechados = fechados.reduce((t, l) => t + (l.valor_proposta || 0), 0);
  const taxa = fechados.length + descartados.length
    ? Math.round((fechados.length / (fechados.length + descartados.length)) * 100) + "%"
    : "—";
  const recorrentes = daPessoa.filter((l) => l.coluna === cfg.recorrentes && !l.descartado);

  const area = document.getElementById("relatorios");
  area.innerHTML = "";

  // Resumo em números
  const resumo = painel("Resumo", "Leads criados no período escolhido.");
  const grade = el("div", "grade-numeros");
  grade.append(
    bloco("Em andamento no funil", emAndamento.length),
    bloco("Propostas em aberto", formatarReais(somaPropostas), `${propostas.length} proposta(s)`),
    bloco("Fechados", fechados.length, somaFechados ? `${formatarReais(somaFechados)} em propostas` : ""),
    bloco("Descartados", descartados.length),
    bloco("Taxa de fechamento", taxa, "fechados ÷ (fechados + descartados)"),
    bloco("Contatos recorrentes", recorrentes.length, "todos, sem filtro de período"),
  );
  resumo.append(grade);
  area.append(resumo);

  // Funil por etapa
  const pFunil = painel("Leads por etapa do funil");
  pFunil.append(barras(cfg.colunas.filter((c) => c !== cfg.recorrentes).map((c) => ({
    rotulo: c, valor: ativos.filter((l) => l.coluna === c).length,
  }))));
  area.append(pFunil);

  // Por pessoa
  if (!pessoa) {
    const pPessoas = painel("Por pessoa");
    const tabela = el("table", "tabela");
    const cab = el("tr");
    ["Pessoa", "Em andamento", "Propostas em aberto", "Fechados", "Descartados", "Ativ. atrasadas", "Ativ. hoje"]
      .forEach((t) => cab.append(el("th", "", t)));
    tabela.append(cab);
    estado.usuarios.forEach((u) => {
      const deles = funil.filter((l) => l.dono === u.nome);
      const ativosDeles = deles.filter((l) => !l.descartado);
      const pend = dadosRelatorio.filter((l) => l.dono === u.nome && !l.descartado)
        .flatMap((l) => l.atividades.filter((a) => !a.concluida));
      const tr = el("tr");
      const nome = el("td", "td-pessoa");
      nome.append(avatar(u.nome, "avatar-mini"), u.nome);
      tr.append(
        nome,
        el("td", "", ativosDeles.filter((l) => l.coluna !== "Fechado").length),
        el("td", "", formatarReais(ativosDeles.filter((l) => l.coluna === "Proposta enviada")
          .reduce((t, l) => t + (l.valor_proposta || 0), 0))),
        el("td", "", ativosDeles.filter((l) => l.coluna === "Fechado").length),
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

  // Origem
  const pOrigem = painel("Origem dos leads", "Quantos leads vieram de cada origem e quantos deles fecharam.");
  const porOrigem = contar(funil, (l) => l.origem || "Sem origem informada");
  const fechadosOrigem = contar(fechados, (l) => l.origem || "Sem origem informada");
  const origens = [...cfg.origens, "Sem origem informada"]
    .filter((o) => porOrigem.has(o) || cfg.origens.includes(o))
    .map((o) => ({ rotulo: o, valor: porOrigem.get(o) || 0, fechados: fechadosOrigem.get(o) || 0 }));
  pOrigem.append(barras(origens, (i) => `${i.valor} · ${i.fechados} fechado(s)`));
  area.append(pOrigem);

  // Produtos
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
