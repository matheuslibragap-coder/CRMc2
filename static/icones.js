// MASTER - desenhos em SVG no estilo cartoon (contorno escuro grosso)

const CONTORNO = "#1a1033";

// Cor de cada pessoa (definida na Administração): astronauta padrão e etiqueta de dono
function corUsuario(nome) {
  const u = (typeof estado !== "undefined" ? estado.usuarios : []).find((x) => x.nome === nome);
  return (u && u.cor) || "#adb5bd";
}

const ICONES = {
  foguete: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M22 44 L12 54 L14 42 Z" fill="#ff6b6b" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M42 44 L52 54 L50 42 Z" fill="#ff6b6b" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 4 C44 14 46 32 42 46 L22 46 C18 32 20 14 32 4 Z" fill="#f8f9fa" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="32" cy="24" r="6" fill="#74c0fc" stroke="${CONTORNO}" stroke-width="3"/>
    <path d="M26 48 Q32 62 38 48 Z" fill="#ffd43b" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
  </svg>`,

  terra: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="27" fill="#4dabf7" stroke="${CONTORNO}" stroke-width="3.5"/>
    <path d="M14 22 C18 14 28 12 30 18 C32 24 24 24 25 30 C26 36 18 38 14 33 C11 29 11 26 14 22 Z" fill="#69db7c" stroke="${CONTORNO}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M38 12 C46 14 54 22 53 30 C52 36 46 34 44 40 C42 46 36 48 34 42 C32 36 38 32 36 26 C34 20 34 13 38 12 Z" fill="#69db7c" stroke="${CONTORNO}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M20 46 C24 44 28 48 26 52 C24 55 19 53 20 46 Z" fill="#69db7c" stroke="${CONTORNO}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M17 16 Q22 10 30 9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>
  </svg>`,

  chat: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M10 14 Q10 8 16 8 L48 8 Q54 8 54 14 L54 38 Q54 44 48 44 L28 44 L16 55 L18 44 L16 44 Q10 44 10 38 Z" fill="#fff" stroke="${CONTORNO}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="22" cy="26" r="3.5" fill="${CONTORNO}"/>
    <circle cx="32" cy="26" r="3.5" fill="${CONTORNO}"/>
    <circle cx="42" cy="26" r="3.5" fill="${CONTORNO}"/>
  </svg>`,

  whatsapp: `<svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M16 3 C9 3 3.5 8.4 3.5 15.2 C3.5 17.6 4.2 19.9 5.4 21.8 L4 28 L10.4 26.5 C12.1 27.4 14 27.9 16 27.9 C23 27.9 28.5 22.4 28.5 15.5 C28.5 8.5 23 3 16 3 Z" fill="#25d366" stroke="${CONTORNO}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M11.6 9.6 C11.2 9.6 10.6 9.8 10.2 10.4 C9.7 11 9.3 12 9.6 13.4 C10.2 15.8 12.4 18.8 15.4 20.6 C17.6 21.9 19.3 22.2 20.4 21.8 C21.4 21.4 22 20.6 22.1 19.9 C22.2 19.4 22 19.2 21.6 19 L19.2 17.8 C18.8 17.6 18.5 17.7 18.3 18 L17.5 19 C17.3 19.2 17 19.3 16.7 19.1 C15.2 18.4 13.9 17.2 13.1 15.8 C12.9 15.5 13 15.2 13.2 15 L14 14.1 C14.2 13.9 14.3 13.6 14.1 13.3 L13 10.6 C12.8 10 12.4 9.6 11.6 9.6 Z" fill="#fff"/>
  </svg>`,

  // Colunas do Kanban
  satelite: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <rect x="4" y="24" width="16" height="16" rx="2" fill="#74c0fc" stroke="${CONTORNO}" stroke-width="3"/>
    <rect x="44" y="24" width="16" height="16" rx="2" fill="#74c0fc" stroke="${CONTORNO}" stroke-width="3"/>
    <path d="M12 24 V40 M52 24 V40" stroke="${CONTORNO}" stroke-width="2"/>
    <path d="M20 32 H24 M40 32 H44" stroke="${CONTORNO}" stroke-width="3"/>
    <rect x="24" y="22" width="16" height="20" rx="4" fill="#dee2e6" stroke="${CONTORNO}" stroke-width="3"/>
    <path d="M32 22 V12" stroke="${CONTORNO}" stroke-width="3"/>
    <circle cx="32" cy="10" r="4" fill="#ff6b6b" stroke="${CONTORNO}" stroke-width="2.5"/>
  </svg>`,

  alien: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M22 10 L16 2" stroke="${CONTORNO}" stroke-width="3" stroke-linecap="round"/>
    <path d="M42 10 L48 2" stroke="${CONTORNO}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="16" cy="3" r="3" fill="#8ce99a" stroke="${CONTORNO}" stroke-width="2"/>
    <circle cx="48" cy="3" r="3" fill="#8ce99a" stroke="${CONTORNO}" stroke-width="2"/>
    <path d="M32 8 C50 8 58 20 56 32 C54 46 42 60 32 60 C22 60 10 46 8 32 C6 20 14 8 32 8 Z" fill="#8ce99a" stroke="${CONTORNO}" stroke-width="3.5"/>
    <ellipse cx="21" cy="32" rx="8" ry="11" transform="rotate(-25 21 32)" fill="${CONTORNO}"/>
    <ellipse cx="43" cy="32" rx="8" ry="11" transform="rotate(25 43 32)" fill="${CONTORNO}"/>
    <circle cx="19" cy="28" r="2.5" fill="#fff"/>
    <circle cx="41" cy="28" r="2.5" fill="#fff"/>
    <path d="M27 49 Q32 52 37 49" fill="none" stroke="${CONTORNO}" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,

  ovni: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M20 46 L12 60 M44 46 L52 60" stroke="#ffe066" stroke-width="5" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="32" cy="24" rx="13" ry="12" fill="#a5f3fc" stroke="${CONTORNO}" stroke-width="3"/>
    <circle cx="32" cy="24" r="5" fill="#8ce99a" stroke="${CONTORNO}" stroke-width="2"/>
    <circle cx="30.5" cy="23" r="1.2" fill="${CONTORNO}"/>
    <circle cx="33.5" cy="23" r="1.2" fill="${CONTORNO}"/>
    <path d="M28 18 Q30 15 34 15" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="32" cy="36" rx="29" ry="10" fill="#9775fa" stroke="${CONTORNO}" stroke-width="3"/>
    <circle cx="16" cy="37" r="3" fill="#ffd43b" stroke="${CONTORNO}" stroke-width="2"/>
    <circle cx="32" cy="40" r="3" fill="#ffd43b" stroke="${CONTORNO}" stroke-width="2"/>
    <circle cx="48" cy="37" r="3" fill="#ffd43b" stroke="${CONTORNO}" stroke-width="2"/>
  </svg>`,

  planeta: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M4 36 A28 9 0 0 1 60 36" fill="none" stroke="${CONTORNO}" stroke-width="7"/>
    <path d="M4 36 A28 9 0 0 1 60 36" fill="none" stroke="#ffd43b" stroke-width="3"/>
    <circle cx="32" cy="32" r="19" fill="#ffa94d" stroke="${CONTORNO}" stroke-width="3.5"/>
    <path d="M16 26 Q32 21 48 26" fill="none" stroke="#e8590c" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M15 40 Q32 45 49 40" fill="none" stroke="#e8590c" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="25" cy="21" r="3" fill="#ffd8a8"/>
    <path d="M4 36 A28 9 0 0 0 60 36" fill="none" stroke="${CONTORNO}" stroke-width="7"/>
    <path d="M4 36 A28 9 0 0 0 60 36" fill="none" stroke="#ffd43b" stroke-width="3"/>
  </svg>`,

  fechado: `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M24 50 Q20 60 16 62 Q26 62 30 54 Z" fill="#ffa94d" stroke="${CONTORNO}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M40 50 Q44 60 48 62 Q38 62 34 54 Z" fill="#ffa94d" stroke="${CONTORNO}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M26 52 Q32 64 38 52 Z" fill="#ffd43b" stroke="${CONTORNO}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M22 42 L12 50 L14 38 Z" fill="#51cf66" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M42 42 L52 50 L50 38 Z" fill="#51cf66" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 2 C45 12 46 32 42 50 L22 50 C18 32 19 12 32 2 Z" fill="#fff" stroke="${CONTORNO}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M25 12 Q32 6 39 12" fill="#ff6b6b" stroke="${CONTORNO}" stroke-width="2.5"/>
    <circle cx="32" cy="26" r="6" fill="#74c0fc" stroke="${CONTORNO}" stroke-width="3"/>
    <path d="M29 24 Q31 22 33 22" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`,
};

const ICONE_COLUNA = {
  "Carteira": "satelite",
  "Em contato": "alien",
  "Negociando": "ovni",
  "Proposta enviada": "planeta",
  "Fechado": "fechado",
};

// Astronauta cartoon: traje na cor da pessoa, fundo preto, viseira cinza com reflexo branco
function svgAstronauta(cor) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill="#0b0b16"/>
    <circle cx="14" cy="18" r="1.6" fill="#fff"/><circle cx="84" cy="12" r="1.2" fill="#fff"/>
    <circle cx="90" cy="46" r="1.6" fill="#fff"/><circle cx="8" cy="58" r="1.2" fill="#fff"/>
    <path d="M14 104 Q14 74 50 72 Q86 74 86 104 Z" fill="${cor}" stroke="${CONTORNO}" stroke-width="3.5"/>
    <rect x="40" y="82" width="20" height="12" rx="3" fill="#f1f3f5" stroke="${CONTORNO}" stroke-width="2.5"/>
    <circle cx="45" cy="88" r="2" fill="#ff6b6b"/><circle cx="53" cy="88" r="2" fill="#51cf66"/>
    <rect x="19" y="34" width="8" height="16" rx="3" fill="${cor}" stroke="${CONTORNO}" stroke-width="3"/>
    <rect x="73" y="34" width="8" height="16" rx="3" fill="${cor}" stroke="${CONTORNO}" stroke-width="3"/>
    <circle cx="50" cy="42" r="27" fill="${cor}" stroke="${CONTORNO}" stroke-width="3.5"/>
    <ellipse cx="50" cy="44" rx="19" ry="15" fill="#868e96" stroke="${CONTORNO}" stroke-width="3"/>
    <path d="M37 40 Q40 32 50 31" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="61" cy="52" r="2.6" fill="#fff"/>
    <path d="M36 20 Q42 16 50 15" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".6"/>
  </svg>`;
}

// Troca todos os <span data-icone="..."> pelo desenho correspondente
function aplicarIcones(raiz = document) {
  raiz.querySelectorAll("[data-icone]").forEach((el) => {
    el.innerHTML = ICONES[el.dataset.icone] || "";
  });
}
