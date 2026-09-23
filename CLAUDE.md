# MASTER - instruções para o Claude

CRM do Comercial 2. Backend em Python só com biblioteca padrão (`app.py`, WSGI), interface em
HTML/CSS/JS puro (`static/`). Roda no PythonAnywhere; o usuário é leigo e fala português.

## Regras obrigatórias

- **Página de Ajuda:** toda alteração visível para o usuário deve atualizar `static/ajuda.html`
  no mesmo commit: o passo a passo da funcionalidade na seção certa (ou uma seção nova + item no
  índice) e uma linha em "Novidades" com a data (DD/MM/AAAA). O usuário pediu isso explicitamente.
- Nada de bibliotecas externas: o PythonAnywhere roda o projeto com `git pull` + Reload.
- Mudanças no banco: migrar dentro de `criar_banco()` sem perder dados (usar `PRAGMA user_version`).
- Rotas que gravam devem usar `with banco() as conn:` (confirma a gravação mesmo quando a rota
  responde com `raise Resposta(...)`).
- O repositório é público: nunca versionar `dados/`, senhas ou dados de clientes.
- Textos da interface e mensagens de commit em português.
