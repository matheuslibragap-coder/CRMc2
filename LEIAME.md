# CRM de Leads

CRM simples em quadro Kanban para acompanhar leads de venda (ProntoPost, site institucional, vitrine virtual).
Roda no seu computador e não precisa de internet nem de instalar nenhuma biblioteca, só o Python.

## Pré-requisito

Ter o **Python 3.8 ou mais recente**. A maioria das distribuições Linux já vem com ele.
Para conferir, rode no terminal:

```
python3 --version
```

Se não aparecer uma versão, instale (Ubuntu/Debian/Mint): `sudo apt install python3`

## 1. Como iniciar (Linux)

No terminal, entre na pasta do projeto e rode:

```
./iniciar.sh
```

O navegador abre sozinho. Se preferir, o comando direto também funciona:

```
python3 server.py
```

Deixe o terminal aberto enquanto usa o CRM. Para encerrar, aperte `Ctrl+C` ou feche o terminal.

(No Windows: clique duas vezes em `iniciar.bat`.)

## 2. Endereço no navegador

http://localhost:8000

## 3. Onde ficam os dados e como fazer backup

Os leads ficam no arquivo **`dados/crm.db`**, dentro da pasta do projeto.
Ele é criado automaticamente na primeira vez que você inicia o CRM.

Backup manual:
1. Encerre o CRM (`Ctrl+C` no terminal).
2. Copie o arquivo para outro lugar, de preferência com a data no nome. Exemplo, de dentro da pasta do projeto:

   ```
   cp dados/crm.db ~/crm-backup-$(date +%F).db
   ```

   Ou copie pelo gerenciador de arquivos para um pendrive ou pasta sincronizada com a nuvem.

Para restaurar: com o CRM fechado, coloque a cópia de volta em `dados/` com o nome `crm.db`.
