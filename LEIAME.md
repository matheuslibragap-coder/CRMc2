# MASTER

CRM em quadro Kanban da equipe Comercial 2 (eGestor NC/CI, ProntoPost, Site, Vitrine).
Feito só com Python, sem nenhuma biblioteca para instalar.

- **Usuários:** Libraga, Paulinho, Nico e Dani.
- **Meus leads:** cada pessoa vê só os leads que ela cadastrou.
- **Visão Geral - Comercial 2:** todos veem os leads de todos, com o nome do dono em cada card.
  Qualquer pessoa pode editar ou mover um lead para ajudar um colega; só o dono pode excluir.
- Os leads criados antes de existir login pertencem ao Libraga.

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
Aparecem as 4 senhas **uma única vez**. Anote e passe cada uma para a pessoa certa, de forma privada.
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
