# MASTER

CRM em quadro Kanban da equipe Comercial 2 (eGestor NC/CI, ProntoPost, Site, Vitrine).
Feito só com Python, sem nenhuma biblioteca para instalar.

- **Usuários:** Libraga, Paulinho, Nico, Dani e Doug.
- **Kanban:** Contatos recorrentes (fora do funil), Em contato, Negociando, Proposta enviada (com a soma
  das propostas) e Fechado. Abas: Meus leads, Visão Geral - Comercial 2, Meus descartados e Descartados geral.
- **Lead:** origem, produtos, valor da proposta, atividades com data e hora (o card fica vermelho, azul
  ou amarelo), anotações com data e hora, registro das atividades concluídas e descarte com motivo.
- **Menu (planeta Terra):** Kanban, Relatórios, Chat Comercial 2 (texto, áudio e leads; conversas 1:1 e
  grupos), Participantes, Feedbacks e Ajuda.
- O passo a passo de uso para a equipe fica na página **Ajuda**, dentro do sistema.

---

## Colocar online no PythonAnywhere (grátis)

### 1. Criar a conta
1. Acesse https://www.pythonanywhere.com e clique em **Pricing & signup**.
2. Escolha **Create a Beginner account** (grátis).
3. O nome de usuário escolhido vira o endereço do site:
   `https://SEUUSUARIO.pythonanywhere.com`

### 2. Baixar o MASTER para lá
1. No painel, clique em **Consoles** e depois em **Bash**.
2. Na tela preta, cole o comando e aperte Enter:
   ```
   git clone https://github.com/matheuslibragap-coder/CRMc2.git master
   ```

### 3. Criar o site
1. No menu do topo, clique em **Web** e depois em **Add a new web app**.
2. Clique em **Next**, escolha **Manual configuration** e a versão mais nova do **Python**. Clique em **Next** até terminar.
3. Volte ao console **Bash** e rode:
   ```
   bash ~/master/pythonanywhere.sh
   ```
4. Na aba **Web**, role até **Security** e ligue **Force HTTPS**.
5. Clique no botão verde **Reload** no topo da aba **Web**.

### 4. Criar as senhas
No console **Bash**, rode:
```
cd ~/master && python3 definir_senhas.py
```
Aparecem as senhas **uma única vez** (só de quem ainda não tem senha). Anote e passe cada uma para a pessoa certa, de forma privada.
Depois de entrar, cada um pode trocar a própria senha no botão **Trocar senha**.

Esqueceram a senha? Gere uma nova só para essa pessoa, por exemplo:
```
cd ~/master && python3 definir_senhas.py Nico
```

### 5. Manter ativo
No plano grátis, entre no PythonAnywhere **pelo menos 1 vez a cada 3 meses**,
vá na aba **Web** e clique em **Run until 3 months from today**. O site recebe um e-mail de aviso antes de expirar.

### Atualizar o MASTER depois de mudanças
No console **Bash**:
```
cd ~/master && git pull
```
Depois clique em **Reload** na aba **Web**.

---

## Ligar a integração com o Google Agenda (uma vez só)

Feito uma única vez pelo Libraga. Depois, cada pessoa só clica em **Conectar Google Agenda** no perfil.

1. Acesse https://console.cloud.google.com e entre com a sua conta do Google.
2. No topo, clique no seletor de projetos → **Novo projeto** → nome `MASTER` → **Criar**. Deixe o projeto selecionado.
3. Menu ☰ → **APIs e serviços** → **Biblioteca** → procure **Google Calendar API** → **Ativar**.
4. Menu ☰ → **APIs e serviços** → **Tela de permissão OAuth** (pode aparecer como **Google Auth Platform**) → **Começar**:
   nome do app `MASTER`, seu e-mail de suporte, público **Externo** (ou **Interno**, se a empresa usa Google Workspace
   e todos têm e-mail da empresa) e seu e-mail de contato → **Criar**.
5. Em **Público**, clique em **Publicar aplicativo** → **Confirmar**. (Sem isso, o Google desconecta todo mundo a cada 7 dias.
   Com público Interno, este passo não existe.)
6. Em **Clientes** (ou **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**):
   - Tipo: **Aplicativo da Web**, nome `MASTER`.
   - Em **URIs de redirecionamento autorizados**, adicione: `https://SEUUSUARIO.pythonanywhere.com/api/google/retorno`
   - Clique em **Criar** e copie o **ID do cliente** e a **Chave secreta do cliente**.
7. No console **Bash** do PythonAnywhere:
   ```
   cd ~/master && git pull && python3 configurar_google.py
   ```
   Cole o ID e a chave quando pedir (a chave não aparece enquanto você cola; é normal) e aperte Enter no endereço de retorno.
8. Clique em **Reload** na aba **Web**.

As credenciais ficam em `dados/google.json`, que não vai para o GitHub.

---

## Onde ficam os dados e como fazer backup

Os leads, usuários e senhas (criptografadas) ficam no arquivo **`dados/crm.db`**.

- **No PythonAnywhere:** aba **Files** → pasta `master` → pasta `dados` → clique em `crm.db` para baixar.
  Guarde a cópia com a data no nome, ex.: `crm-2026-09-22.db`.
- **Para levar seus leads atuais para o online:** na aba **Files**, entre em `master`, crie a pasta `dados`
  (se não existir) e use **Upload a file** para enviar o seu `crm.db`. Faça isso **antes** do passo 4
  e clique em **Reload** na aba **Web** depois.

Nunca coloque o arquivo `crm.db` no GitHub: o repositório é público.

---

## Rodar no próprio computador (opcional)

```
cd ~/crm
python3 definir_senhas.py     # só na primeira vez
python3 server.py
```
Abra http://localhost:8000. Para encerrar, aperte `Ctrl+C`.
