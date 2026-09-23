// MASTER - Chat Comercial 2, conversas 1:1, grupos e página de participantes

let conversas = [];
let conversaAberta = null; // id
let mensagensChat = [];
let timerAvisos = null;
let timerMensagens = null;
let ultimasVistas = {}; // conversa_id -> id da última mensagem já avisada

const listaConversas = document.getElementById("lista-conversas");
const areaMensagens = document.getElementById("chat-mensagens");
const caixaChat = document.querySelector(".chat");

// ---------- avisos (bolinha no botão do chat e popup) ----------
function iniciarAvisosChat() {
  pararAvisosChat();
  ultimasVistas = null; // primeira leitura não gera popup
  verificarConversas();
  timerAvisos = setInterval(verificarConversas, 8000);
}

function pararAvisosChat() {
  clearInterval(timerAvisos);
  clearInterval(timerMensagens);
  timerAvisos = timerMensagens = null;
  conversaAberta = null;
}

async function verificarConversas() {
  if (!estado.usuario) return;
  try {
    const dados = await api("GET", "/api/conversas");
    const anteriores = ultimasVistas;
    ultimasVistas = {};
    dados.conversas.forEach((c) => (ultimasVistas[c.id] = c.ultima ? c.ultima.id : 0));
    if (anteriores) {
      const nova = dados.conversas.find((c) => c.nao_lidas > 0 && c.ultima
        && c.ultima.id > (anteriores[c.id] || 0) && c.ultima.autor !== estado.usuario
        && !(estado.pagina === "chat" && conversaAberta === c.id));
      if (nova) mostrarPopup(nova);
    }
    conversas = dados.conversas;
    const badge = document.getElementById("badge-chat");
    badge.textContent = dados.nao_lidas > 99 ? "99+" : dados.nao_lidas;
    badge.hidden = dados.nao_lidas === 0;
    if (estado.pagina === "chat") desenharConversas();
  } catch (e) { /* tenta de novo no próximo ciclo */ }
}

let timerPopup;
function mostrarPopup(conversa) {
  const popup = document.getElementById("popup-chat");
  popup.innerHTML = "";
  popup.append(avatar(conversa.ultima.autor, "avatar-mini"));
  const texto = el("div", "popup-texto");
  const onde = conversa.tipo === "direta" ? "" : ` em ${conversa.nome}`;
  texto.append(el("b", "", `${conversa.ultima.autor}${onde}`), el("span", "", conversa.ultima.resumo));
  popup.append(texto);
  popup.onclick = () => { popup.hidden = true; irPara("chat"); abrirConversa(conversa.id); };
  popup.hidden = false;
  clearTimeout(timerPopup);
  timerPopup = setTimeout(() => (popup.hidden = true), 6000);
}

// ---------- lista de conversas ----------
function fotoConversa(c, classe = "") {
  if (c.tipo === "direta") return avatar(c.outro, classe);
  const caixa = el("span", `avatar avatar-grupo ${classe}`);
  if (c.tipo === "grupo" && c.foto_versao > 0) {
    const img = el("img");
    img.src = `/api/foto/conversa/${c.id}?v=${c.foto_versao}`;
    img.alt = c.nome;
    caixa.append(img);
  } else {
    caixa.innerHTML = c.tipo === "geral" ? ICONES.foguete : ICONES.ovni;
  }
  return caixa;
}

function desenharConversas() {
  listaConversas.innerHTML = "";
  conversas.forEach((c) => {
    const item = el("button", "conversa" + (c.id === conversaAberta ? " ativa" : ""));
    item.type = "button";
    item.append(fotoConversa(c));
    const meio = el("div", "conversa-meio");
    meio.append(el("b", "", c.nome));
    const resumo = c.ultima ? `${c.ultima.autor === estado.usuario ? "Você" : c.ultima.autor}: ${c.ultima.resumo}` : "Nenhuma mensagem ainda";
    meio.append(el("small", "", resumo));
    item.append(meio);
    const lado = el("div", "conversa-lado");
    if (c.ultima) lado.append(el("small", "", horaCurta(c.ultima.criado_em)));
    if (c.nao_lidas) lado.append(el("span", "nao-lidas", c.nao_lidas));
    item.append(lado);
    item.onclick = () => abrirConversa(c.id);
    listaConversas.append(item);
  });
}

function horaCurta(iso) {
  return iso.slice(0, 10) === hojeISO() ? iso.slice(11, 16) : formatarData(iso).slice(0, 5);
}

// ---------- página do chat ----------
async function abrirChat() {
  await verificarConversas();
  desenharConversas();
  if (!conversaAberta && conversas.length && window.innerWidth > 760) abrirConversa(conversas[0].id);
  clearInterval(timerMensagens);
  timerMensagens = setInterval(() => {
    if (estado.pagina !== "chat") return clearInterval(timerMensagens);
    if (conversaAberta && document.visibilityState === "visible") buscarMensagens();
  }, 3000);
}

function redesenharChat() {
  desenharConversas();
  if (conversaAberta) desenharMensagens(true);
}

async function abrirConversa(id) {
  conversaAberta = id;
  mensagensChat = [];
  areaMensagens.innerHTML = "";
  const c = conversas.find((x) => x.id === id);
  if (!c) { await verificarConversas(); }
  preencherCabecalho();
  document.getElementById("chat-vazio").hidden = true;
  document.getElementById("chat-aberto").hidden = false;
  caixaChat.classList.add("conversa-aberta");
  desenharConversas();
  await buscarMensagens();
  document.getElementById("chat-texto").focus();
}

function preencherCabecalho() {
  const c = conversas.find((x) => x.id === conversaAberta);
  if (!c) return;
  const foto = document.getElementById("chat-foto");
  foto.innerHTML = "";
  foto.append(fotoConversa(c));
  document.getElementById("chat-nome").textContent = c.nome;
  document.getElementById("chat-membros").textContent =
    c.tipo === "direta" ? "Conversa privada" : c.membros.map((m) => (m === estado.usuario ? "Você" : m)).join(", ");
  document.getElementById("btn-editar-grupo").hidden = c.tipo !== "grupo";
  document.getElementById("btn-sair-grupo").hidden = c.tipo !== "grupo";
}

document.getElementById("btn-voltar-chat").onclick = () => {
  caixaChat.classList.remove("conversa-aberta");
  conversaAberta = null;
  desenharConversas();
};

async function buscarMensagens() {
  const id = conversaAberta;
  const ultimo = mensagensChat.length ? mensagensChat[mensagensChat.length - 1].id : 0;
  try {
    const dados = await api("GET", `/api/conversas/${id}/mensagens?depois=${ultimo}`);
    if (id !== conversaAberta || !dados.mensagens.length) return;
    mensagensChat.push(...dados.mensagens);
    desenharMensagens();
    verificarConversas();
  } catch (e) { /* tenta de novo */ }
}

function desenharMensagens(manterPosicao = false) {
  const noFim = areaMensagens.scrollHeight - areaMensagens.scrollTop - areaMensagens.clientHeight < 80;
  areaMensagens.innerHTML = "";
  let diaAnterior = "";
  mensagensChat.forEach((m) => {
    const dia = m.criado_em.slice(0, 10);
    if (dia !== diaAnterior) {
      diaAnterior = dia;
      const rotulo = dia === hojeISO() ? "Hoje" : dia === hojeISO(-1) ? "Ontem" : formatarData(dia);
      areaMensagens.append(el("div", "separador-dia", rotulo));
    }
    const minha = m.autor === estado.usuario;
    const linha = el("div", "msg-linha" + (minha ? " minha" : ""));
    const balao = el("div", "balao");
    if (!minha) {
      const autor = el("b", "balao-autor", m.autor);
      autor.style.color = "#5f3dc4";
      balao.append(autor);
    }
    if (m.tipo === "texto") balao.append(el("div", "balao-texto", m.texto));
    if (m.tipo === "audio") {
      const audio = el("audio");
      audio.controls = true;
      audio.preload = "none";
      audio.src = `/api/audio/${m.id}`;
      balao.append(audio);
    }
    if (m.tipo === "lead") balao.append(cartaoLeadChat(m.lead));
    balao.append(el("small", "balao-hora", m.criado_em.slice(11, 16)));
    linha.append(avatar(m.autor, "avatar-msg"), balao);
    areaMensagens.append(linha);
  });
  if (!mensagensChat.length) areaMensagens.append(el("p", "vazio", "Nenhuma mensagem ainda. Diga oi! 👋"));
  if (!manterPosicao || noFim) areaMensagens.scrollTop = areaMensagens.scrollHeight;
}

function cartaoLeadChat(lead) {
  const cartao = el("div", "lead-chat");
  if (!lead || !lead.existe) {
    cartao.append(el("b", "", "📇 Lead excluído"));
    return cartao;
  }
  cartao.append(el("b", "", `📇 ${lead.nome}`));
  const situacao = lead.descartado ? "Descartado" : lead.coluna;
  cartao.append(el("small", "", `Dono: ${lead.dono} · ${situacao}`));
  if (lead.telefone) cartao.append(el("small", "", `Tel: ${lead.telefone}`));
  const abrir = el("button", "btn btn-pequeno", "Abrir lead");
  abrir.type = "button";
  abrir.onclick = () => abrirLeadPorId(lead.id);
  cartao.append(abrir);
  return cartao;
}

// ---------- enviar texto ----------
document.getElementById("chat-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const campo = document.getElementById("chat-texto");
  const textoMsg = campo.value.trim();
  if (!textoMsg || !conversaAberta) return;
  campo.value = "";
  try {
    await api("POST", `/api/conversas/${conversaAberta}/mensagens`, { tipo: "texto", texto: textoMsg });
    await buscarMensagens();
  } catch (e) {
    campo.value = textoMsg;
    alert(e.message);
  }
});

// ---------- compartilhar lead ----------
const modalEscolherLead = document.getElementById("modal-escolher-lead");
let todosLeads = [];

document.getElementById("btn-anexar-lead").onclick = async () => {
  document.getElementById("busca-lead").value = "";
  try {
    todosLeads = (await api("GET", "/api/leads?visao=tudo")).leads;
  } catch (e) { return alert(e.message); }
  desenharEscolhaLead();
  modalEscolherLead.showModal();
  document.getElementById("busca-lead").focus();
};
document.getElementById("busca-lead").addEventListener("input", desenharEscolhaLead);

function desenharEscolhaLead() {
  const busca = document.getElementById("busca-lead").value.trim().toLowerCase();
  const lista = document.getElementById("lista-escolher-lead");
  lista.innerHTML = "";
  const filtrados = todosLeads
    .filter((l) => !busca || [l.nome, l.telefone, l.email, l.conta, l.dono].join(" ").toLowerCase().includes(busca))
    .sort((a, b) => (a.dono === estado.usuario ? -1 : 0) - (b.dono === estado.usuario ? -1 : 0));
  filtrados.slice(0, 80).forEach((l) => {
    const item = el("button", "item-escolha");
    item.type = "button";
    item.append(avatar(l.dono, "avatar-mini"));
    const meio = el("div");
    meio.append(el("b", "", l.nome), el("small", "", `${l.dono} · ${l.descartado ? "Descartado" : l.coluna}`));
    item.append(meio);
    item.onclick = async () => {
      modalEscolherLead.close();
      try {
        await api("POST", `/api/conversas/${conversaAberta}/mensagens`, { tipo: "lead", lead_id: l.id });
        await buscarMensagens();
      } catch (e) { alert(e.message); }
    };
    lista.append(item);
  });
  if (!filtrados.length) lista.append(el("p", "vazio-pequeno", "Nenhum lead encontrado."));
}

// ---------- gravar áudio ----------
let gravador = null;
let pedacosAudio = [];
let timerGravacao = null;
const MAX_SEGUNDOS_AUDIO = 120;

document.getElementById("btn-gravar").onclick = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    return alert("Este navegador não permite gravar áudio. Use o Chrome, Edge ou Firefox atualizados.");
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return alert("Não consegui acessar o microfone. Clique no cadeado ao lado do endereço do site e permita o microfone.");
  }
  const tipo = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"]
    .find((t) => MediaRecorder.isTypeSupported(t));
  gravador = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
  pedacosAudio = [];
  gravador.ondataavailable = (e) => e.data.size && pedacosAudio.push(e.data);
  gravador.start();
  const inicio = Date.now();
  document.getElementById("gravando").hidden = false;
  document.getElementById("chat-form").hidden = true;
  timerGravacao = setInterval(() => {
    const s = Math.floor((Date.now() - inicio) / 1000);
    document.getElementById("tempo-gravacao").textContent = `${Math.floor(s / 60)}:${dois(s % 60)}`;
    if (s >= MAX_SEGUNDOS_AUDIO) pararGravacao(true);
  }, 250);
};

function pararGravacao(enviar) {
  if (!gravador) return;
  const g = gravador;
  gravador = null;
  clearInterval(timerGravacao);
  document.getElementById("gravando").hidden = true;
  document.getElementById("chat-form").hidden = false;
  document.getElementById("tempo-gravacao").textContent = "0:00";
  g.onstop = async () => {
    g.stream.getTracks().forEach((t) => t.stop());
    if (!enviar || !pedacosAudio.length) return;
    const mime = (g.mimeType || "audio/webm").split(";")[0];
    const blob = new Blob(pedacosAudio, { type: mime });
    try {
      const resp = await fetch(`/api/conversas/${conversaAberta}/audio`, {
        method: "POST",
        headers: { "Content-Type": mime, "X-Master": "1" },
        body: blob,
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).erro || "Erro ao enviar o áudio.");
      await buscarMensagens();
    } catch (e) {
      alert(e.message);
    }
  };
  g.stop();
}
document.getElementById("btn-cancelar-audio").onclick = () => pararGravacao(false);
document.getElementById("btn-enviar-audio").onclick = () => pararGravacao(true);

// ---------- nova conversa ----------
const modalNovaConversa = document.getElementById("modal-nova-conversa");

document.getElementById("btn-nova-conversa").onclick = () => {
  const lista = document.getElementById("nova-conversa-lista");
  lista.innerHTML = "";
  estado.usuarios.filter((u) => u.ativo && u.nome !== estado.usuario).forEach((u) => {
    const item = el("button", "item-escolha");
    item.type = "button";
    item.append(avatar(u.nome, "avatar-mini"), el("b", "", u.nome));
    item.onclick = () => { modalNovaConversa.close(); conversarCom(u.nome); };
    lista.append(item);
  });
  modalNovaConversa.showModal();
};
document.getElementById("btn-nova-conversa-grupo").onclick = () => {
  modalNovaConversa.close();
  abrirGrupo(null);
};

async function conversarCom(nome) {
  try {
    const { id } = await api("POST", "/api/conversas/direta", { usuario: nome });
    irPara("chat");
    await verificarConversas();
    abrirConversa(id);
  } catch (e) { alert(e.message); }
}

// ---------- grupos ----------
const modalGrupo = document.getElementById("modal-grupo");
const formGrupo = document.getElementById("form-grupo");
let grupoEditando = null;   // conversa sendo editada (null = novo)
let grupoFoto;              // undefined = não mudou, null = sem foto, string = nova foto

function mostrarFotoGrupo() {
  const caixa = document.getElementById("grupo-foto");
  caixa.innerHTML = "";
  if (grupoFoto) {
    const s = el("span", "avatar avatar-grande avatar-grupo");
    const img = el("img");
    img.src = grupoFoto;
    s.append(img);
    caixa.append(s);
  } else if (grupoFoto === undefined && grupoEditando) {
    caixa.append(fotoConversa(grupoEditando, "avatar-grande"));
  } else {
    const s = el("span", "avatar avatar-grande avatar-grupo");
    s.innerHTML = ICONES.ovni;
    caixa.append(s);
  }
}

function abrirGrupo(conversa) {
  grupoEditando = conversa;
  grupoFoto = undefined;
  formGrupo.reset();
  mostrarErro(document.getElementById("grupo-erro"), "");
  document.getElementById("grupo-titulo").textContent = conversa ? "Editar grupo" : "Criar grupo";
  formGrupo.nome.value = conversa ? conversa.nome : "";
  const membros = document.getElementById("grupo-membros");
  membros.innerHTML = "";
  estado.usuarios.filter((u) => u.ativo && u.nome !== estado.usuario).forEach((u, i) => {
    const opcao = el("label", `opcao-produto p-${i % 5}`);
    const check = el("input");
    check.type = "checkbox";
    check.value = u.nome;
    check.checked = conversa ? conversa.membros.includes(u.nome) : false;
    opcao.append(check, el("span", "", u.nome));
    membros.append(opcao);
  });
  mostrarFotoGrupo();
  modalGrupo.showModal();
}

document.getElementById("btn-grupo-foto").onclick = async () => {
  const imagem = await escolherImagem();
  if (imagem) { grupoFoto = imagem; mostrarFotoGrupo(); }
};
document.getElementById("btn-grupo-sem-foto").onclick = () => { grupoFoto = null; mostrarFotoGrupo(); };
document.getElementById("btn-criar-grupo").onclick = () => abrirGrupo(null);
document.getElementById("btn-editar-grupo").onclick = () => {
  const c = conversas.find((x) => x.id === conversaAberta);
  if (c) abrirGrupo(c);
};
document.getElementById("btn-sair-grupo").onclick = async () => {
  const c = conversas.find((x) => x.id === conversaAberta);
  if (!c || !confirm(`Sair do grupo "${c.nome}"?`)) return;
  try {
    await api("POST", `/api/conversas/${c.id}/sair`);
    conversaAberta = null;
    document.getElementById("chat-aberto").hidden = true;
    document.getElementById("chat-vazio").hidden = false;
    caixaChat.classList.remove("conversa-aberta");
    await verificarConversas();
    desenharConversas();
  } catch (e) { alert(e.message); }
};

formGrupo.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const dados = {
    nome: formGrupo.nome.value,
    membros: [...document.querySelectorAll("#grupo-membros input:checked")].map((c) => c.value),
  };
  if (grupoFoto !== undefined) dados.foto = grupoFoto;
  try {
    const { id } = grupoEditando
      ? await api("PUT", `/api/conversas/${grupoEditando.id}`, dados)
      : await api("POST", "/api/conversas/grupo", dados);
    modalGrupo.close();
    irPara("chat");
    await verificarConversas();
    abrirConversa(id);
  } catch (e) {
    mostrarErro(document.getElementById("grupo-erro"), e.message);
  }
});

// ---------- página de participantes ----------
async function abrirParticipantes() {
  try {
    estado.usuarios = (await api("GET", "/api/usuarios")).usuarios;
  } catch (e) { /* usa a lista que já temos */ }
  desenharParticipantes();
}

function desenharParticipantes() {
  const lista = document.getElementById("lista-participantes");
  lista.innerHTML = "";
  estado.usuarios.filter((u) => u.ativo).forEach((u) => {
    const cartao = el("div", "participante");
    cartao.append(avatar(u.nome, "avatar-grande"));
    cartao.append(el("b", "", u.nome + (u.nome === estado.usuario ? " (você)" : "")));
    if (u.papel === "coordenador") cartao.append(el("span", "chip", "🧭 Coordenador"));
    const botoes = el("div", "participante-botoes");
    if (u.nome !== estado.usuario) {
      const b = el("button", "btn btn-pequeno btn-primario", "💬 Conversar");
      b.onclick = () => conversarCom(u.nome);
      botoes.append(b);
    }
    if (u.nome === estado.usuario || estado.admin) {
      const trocar = el("button", "btn btn-pequeno", "📷 Trocar foto");
      trocar.onclick = async () => {
        const imagem = await escolherImagem();
        if (imagem) {
          try { await trocarFotoDe(u.nome, imagem); } catch (e) { alert(e.message); }
        }
      };
      botoes.append(trocar);
      if (u.foto_versao > 0) {
        const remover = el("button", "btn btn-pequeno", "Remover foto");
        remover.onclick = async () => {
          try { await trocarFotoDe(u.nome, null); } catch (e) { alert(e.message); }
        };
        botoes.append(remover);
      }
    }
    cartao.append(botoes);
    lista.append(cartao);
  });
}
