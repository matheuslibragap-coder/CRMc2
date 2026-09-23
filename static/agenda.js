// MASTER - Agenda Espacial: as atividades dos leads em visão de dia, semana e mês

const AGENDA_INICIO = new Date(2026, 0, 1);
const AGENDA_FIM = new Date(2027, 11, 31);
const ALTURA_HORA = 48; // pixels por hora nas visões de dia e semana
const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_SEMANA_LONGO = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

const agenda = {
  modo: "mes",           // dia | semana | mes
  data: new Date(),      // dia de referência
  escopo: "minha",       // minha | equipe
  atividades: [],
  timer: null,
};

const corpoAgenda = document.getElementById("agenda-corpo");
const isoDia = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const somarDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inicioDaSemana = (d) => somarDias(d, -d.getDay()); // domingo

// ---------- feriados nacionais ----------
function domingoDePascoa(ano) {
  // Algoritmo de Meeus/Jones/Butcher
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

const cacheFeriados = {};
function feriadosDoAno(ano) {
  if (cacheFeriados[ano]) return cacheFeriados[ano];
  const lista = {
    [`${ano}-01-01`]: "Confraternização Universal",
    [`${ano}-04-21`]: "Tiradentes",
    [`${ano}-05-01`]: "Dia do Trabalho",
    [`${ano}-09-07`]: "Independência do Brasil",
    [`${ano}-10-12`]: "Nossa Senhora Aparecida",
    [`${ano}-11-02`]: "Finados",
    [`${ano}-11-15`]: "Proclamação da República",
    [`${ano}-11-20`]: "Consciência Negra",
    [`${ano}-12-25`]: "Natal",
  };
  const pascoa = domingoDePascoa(ano);
  lista[isoDia(somarDias(pascoa, -48))] = "Carnaval (ponto facultativo)";
  lista[isoDia(somarDias(pascoa, -47))] = "Carnaval (ponto facultativo)";
  lista[isoDia(somarDias(pascoa, -2))] = "Sexta-feira Santa";
  lista[isoDia(pascoa)] = "Páscoa";
  lista[isoDia(somarDias(pascoa, 60))] = "Corpus Christi (ponto facultativo)";
  cacheFeriados[ano] = lista;
  return lista;
}
const feriado = (d) => feriadosDoAno(d.getFullYear())[isoDia(d)];

function classesDoDia(d, extra = "") {
  const lista = [extra];
  if (d.getDay() === 0 || d.getDay() === 6) lista.push("dia-fds");
  if (feriado(d)) lista.push("dia-feriado");
  if (isoDia(d) === hojeISO()) lista.push("dia-hoje");
  return lista.join(" ");
}

// ---------- período visível ----------
function periodoVisivel() {
  const d = agenda.data;
  if (agenda.modo === "dia") return { inicio: d, fim: d };
  if (agenda.modo === "semana") {
    const inicio = inicioDaSemana(d);
    return { inicio, fim: somarDias(inicio, 6) };
  }
  const primeiro = new Date(d.getFullYear(), d.getMonth(), 1);
  const inicio = inicioDaSemana(primeiro);
  return { inicio, fim: somarDias(inicio, 41) }; // 6 semanas
}

function tituloDoPeriodo() {
  const d = agenda.data;
  const mesAno = (x) => `${NOMES_MESES[x.getMonth()]} de ${x.getFullYear()}`;
  if (agenda.modo === "mes") return mesAno(d);
  if (agenda.modo === "dia") return `${DIAS_SEMANA_LONGO[d.getDay()]}, ${d.getDate()} de ${mesAno(d)}`;
  const { inicio, fim } = periodoVisivel();
  if (inicio.getMonth() === fim.getMonth()) return `${inicio.getDate()} – ${fim.getDate()} de ${mesAno(fim)}`;
  return `${inicio.getDate()} de ${NOMES_MESES[inicio.getMonth()].slice(0, 3)} – ${fim.getDate()} de ${NOMES_MESES[fim.getMonth()].slice(0, 3)} de ${fim.getFullYear()}`;
}

function limitarData(d) {
  if (d < AGENDA_INICIO) return new Date(AGENDA_INICIO);
  if (d > AGENDA_FIM) return new Date(AGENDA_FIM);
  return d;
}

function mover(direcao) {
  const d = agenda.data;
  if (agenda.modo === "dia") agenda.data = somarDias(d, direcao);
  if (agenda.modo === "semana") agenda.data = somarDias(d, 7 * direcao);
  if (agenda.modo === "mes") agenda.data = new Date(d.getFullYear(), d.getMonth() + direcao, 1);
  agenda.data = limitarData(agenda.data);
  carregarAgenda();
}

// ---------- controles ----------
document.getElementById("agenda-anterior").onclick = () => mover(-1);
document.getElementById("agenda-seguinte").onclick = () => mover(1);
document.getElementById("agenda-hoje").onclick = () => { agenda.data = limitarData(new Date()); carregarAgenda(); };
document.querySelectorAll("#agenda-modos .aba").forEach((aba) => {
  aba.onclick = () => trocarModoAgenda(aba.dataset.modo);
});
document.querySelectorAll("#agenda-escopo .aba").forEach((aba) => {
  aba.onclick = () => {
    agenda.escopo = aba.dataset.escopo;
    carregarAgenda();
  };
});

function trocarModoAgenda(modo, data) {
  agenda.modo = modo;
  if (data) agenda.data = data;
  gravarLocal("agenda-modo", modo);
  carregarAgenda();
}

function abrirAgenda() {
  agenda.modo = lerLocal("agenda-modo") || "mes";
  if (estado.coordenador) agenda.escopo = "equipe";
  document.querySelector('#agenda-escopo .aba[data-escopo="minha"]').hidden = estado.coordenador;
  carregarAgenda();
  clearInterval(agenda.timer);
  agenda.timer = setInterval(() => {
    if (estado.pagina !== "agenda") return clearInterval(agenda.timer);
    if (!document.querySelector("dialog[open]")) carregarAgenda(false);
  }, 60000);
}

// Quando o lead é salvo/fechado, a agenda se atualiza sozinha
document.getElementById("modal").addEventListener("close", () => {
  if (estado.pagina === "agenda") carregarAgenda(false);
});

async function carregarAgenda(rolarParaManha = true) {
  document.querySelectorAll("#agenda-modos .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.modo === agenda.modo));
  document.querySelectorAll("#agenda-escopo .aba").forEach((a) => a.classList.toggle("ativa", a.dataset.escopo === agenda.escopo));
  const titulo = tituloDoPeriodo();
  document.getElementById("agenda-titulo").textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);
  const { inicio, fim } = periodoVisivel();
  document.getElementById("agenda-anterior").disabled = inicio <= AGENDA_INICIO;
  document.getElementById("agenda-seguinte").disabled = fim >= AGENDA_FIM;
  try {
    const dados = await api("GET", `/api/agenda?inicio=${isoDia(inicio)}&fim=${isoDia(fim)}&escopo=${agenda.escopo}`);
    agenda.atividades = dados.atividades;
  } catch (e) {
    corpoAgenda.textContent = e.message;
    return;
  }
  const rolagem = corpoAgenda.querySelector(".agenda-grade-horas");
  const posicao = rolagem ? rolagem.scrollTop : null;
  if (agenda.modo === "mes") desenharMes();
  else desenharHoras(agenda.modo === "dia" ? [agenda.data] : [...Array(7)].map((_, i) => somarDias(inicioDaSemana(agenda.data), i)));
  const nova = corpoAgenda.querySelector(".agenda-grade-horas");
  if (nova) nova.scrollTop = rolarParaManha || posicao === null ? 7 * ALTURA_HORA : posicao;
}

// ---------- eventos ----------
function situacaoEvento(a) {
  return a.concluida ? "concluida" : situacaoAtividade(a);
}

function textoEvento(a) {
  const titulo = a.conta ? `${a.nome}/${a.conta}` : a.nome;
  return agenda.escopo === "equipe" && a.dono !== estado.usuario ? `${titulo} · ${a.dono}` : titulo;
}

function eventoBotao(a, classe = "") {
  const b = el("button", `evento ev-${situacaoEvento(a)} ${classe}`);
  b.type = "button";
  b.title = `${a.quando.slice(11, 16)} · ${a.descricao}\n${textoEvento(a)}${a.concluida ? "\n✅ Concluída" : ""}`;
  b.append(el("b", "", a.quando.slice(11, 16)), el("span", "", ` ${textoEvento(a)}`));
  b.onclick = (ev) => { ev.stopPropagation(); abrirLeadPorId(a.lead_id); };
  return b;
}

const atividadesDoDia = (d) => agenda.atividades.filter((a) => a.quando.slice(0, 10) === isoDia(d));

// ---------- visão de mês ----------
function desenharMes() {
  corpoAgenda.innerHTML = "";
  const grade = el("div", "agenda-mes");
  DIAS_SEMANA.forEach((nome, i) => grade.append(el("div", "agenda-cab" + (i === 0 || i === 6 ? " cab-fds" : ""), nome)));
  const { inicio } = periodoVisivel();
  const mesAtual = agenda.data.getMonth();
  const MAX_VISIVEIS = 3;
  for (let i = 0; i < 42; i++) {
    const d = somarDias(inicio, i);
    const celula = el("div", classesDoDia(d, "agenda-dia" + (d.getMonth() !== mesAtual ? " fora-do-mes" : "")));
    const numero = el("button", "dia-numero", d.getDate());
    numero.type = "button";
    numero.title = "Ver o dia";
    numero.onclick = () => trocarModoAgenda("dia", d);
    celula.append(numero);
    const nomeFeriado = feriado(d);
    if (nomeFeriado) celula.append(el("div", "feriado-nome", `🎉 ${nomeFeriado}`));
    const doDia = atividadesDoDia(d);
    doDia.slice(0, MAX_VISIVEIS).forEach((a) => celula.append(eventoBotao(a)));
    if (doDia.length > MAX_VISIVEIS) {
      const mais = el("button", "ver-mais", `+${doDia.length - MAX_VISIVEIS} mais`);
      mais.type = "button";
      mais.onclick = () => trocarModoAgenda("dia", d);
      celula.append(mais);
    }
    celula.ondblclick = () => trocarModoAgenda("dia", d);
    grade.append(celula);
  }
  corpoAgenda.append(grade);
}

// ---------- visões de dia e semana (com horas) ----------
function distribuirEmFaixas(eventos) {
  // Eventos no mesmo horário ficam lado a lado (30 minutos cada)
  const faixas = [];
  eventos.forEach((a) => {
    const inicio = Number(a.quando.slice(11, 13)) * 60 + Number(a.quando.slice(14, 16));
    let faixa = faixas.findIndex((fim) => fim <= inicio);
    if (faixa === -1) { faixa = faixas.length; faixas.push(0); }
    faixas[faixa] = inicio + 30;
    a._faixa = faixa;
    a._inicio = inicio;
  });
  eventos.forEach((a) => (a._faixas = faixas.length));
}

function desenharHoras(dias) {
  corpoAgenda.innerHTML = "";
  const colunas = `56px repeat(${dias.length}, minmax(0, 1fr))`;

  const cabecalho = el("div", "agenda-horas-cab");
  cabecalho.style.gridTemplateColumns = colunas;
  cabecalho.append(el("div"));
  dias.forEach((d) => {
    const cab = el("button", classesDoDia(d, "cab-dia"));
    cab.type = "button";
    cab.append(el("small", "", DIAS_SEMANA[d.getDay()]), el("b", "", d.getDate()));
    if (feriado(d)) cab.append(el("span", "feriado-nome", `🎉 ${feriado(d)}`));
    cab.onclick = () => trocarModoAgenda("dia", d);
    cabecalho.append(cab);
  });
  corpoAgenda.append(cabecalho);

  const rolagem = el("div", "agenda-grade-horas");
  const grade = el("div", "agenda-horas");
  grade.style.gridTemplateColumns = colunas;
  grade.style.height = `${24 * ALTURA_HORA}px`;
  const reguas = el("div", "coluna-horas");
  for (let h = 0; h < 24; h++) reguas.append(el("div", "rotulo-hora", h ? `${dois(h)}:00` : ""));
  grade.append(reguas);

  const agora = new Date();
  dias.forEach((d) => {
    const coluna = el("div", classesDoDia(d, "coluna-dia"));
    const eventos = atividadesDoDia(d);
    distribuirEmFaixas(eventos);
    eventos.forEach((a) => {
      const b = eventoBotao(a, "evento-hora");
      b.style.top = `${(a._inicio / 60) * ALTURA_HORA}px`;
      b.style.height = `${ALTURA_HORA / 2 - 2}px`;
      b.style.left = `${(a._faixa / a._faixas) * 100}%`;
      b.style.width = `calc(${100 / a._faixas}% - 4px)`;
      coluna.append(b);
    });
    if (isoDia(d) === hojeISO()) {
      const linha = el("div", "linha-agora");
      linha.style.top = `${((agora.getHours() * 60 + agora.getMinutes()) / 60) * ALTURA_HORA}px`;
      coluna.append(linha);
    }
    grade.append(coluna);
  });
  rolagem.append(grade);
  corpoAgenda.append(rolagem);
  if (!agenda.atividades.length) {
    corpoAgenda.append(el("p", "vazio-pequeno", "Nenhuma atividade neste período. Crie atividades dentro dos leads e elas aparecem aqui. 🛰️"));
  }
}
