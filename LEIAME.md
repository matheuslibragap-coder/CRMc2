# CRM de Leads

CRM simples em quadro Kanban para acompanhar leads de venda (ProntoPost, site institucional, vitrine virtual).
Roda no seu computador e não precisa de internet nem de instalar nenhuma biblioteca, só o Python.

## Pré-requisito (uma única vez)

Ter o **Python 3.8 ou mais recente** instalado.
- Windows: baixe em https://www.python.org/downloads/ e, na instalação, marque **"Add python.exe to PATH"**.
- Mac: rode `python3 --version` no Terminal. Se não aparecer uma versão, instale pelo mesmo site.

## 1. Como iniciar

**Windows:** clique duas vezes no arquivo `iniciar.bat`. O navegador abre sozinho.

**Ou pelo terminal (Windows, Mac ou Linux):** entre na pasta do projeto e rode:

```
python server.py
```

(no Mac/Linux use `python3 server.py`)

Deixe a janela do terminal aberta enquanto usa o CRM. Para encerrar, feche a janela ou aperte `Ctrl+C`.

## 2. Endereço no navegador

http://localhost:8000

## 3. Onde ficam os dados e como fazer backup

Os leads ficam no arquivo **`dados/crm.db`**, dentro da pasta do projeto.
Ele é criado automaticamente na primeira vez que você inicia o CRM.

Backup manual:
1. Encerre o CRM (feche a janela do terminal).
2. Copie o arquivo `dados/crm.db` para outro lugar (pendrive, Google Drive, OneDrive…),
   de preferência com a data no nome, ex.: `crm-2026-09-22.db`.

Para restaurar: com o CRM fechado, coloque a cópia de volta em `dados/` com o nome `crm.db`.
