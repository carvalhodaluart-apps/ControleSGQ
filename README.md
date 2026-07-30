# Criador de Procedimentos

Webapp para criar procedimentos internos e exportar o resultado em PDF e JSON.

O PostgreSQL armazena a lista mestra e controla a numeracao automatica dos
documentos. O backend aplica as regras de negocio, normaliza o documento e
salva o conteudo completo como JSON em `backend/dados_procedimentos/rascunhos`.
Para editar depois, importe o arquivo JSON baixado anteriormente.

## Como Rodar

```bash
npm install
set QUALITY_PASSWORD=sua_senha_da_qualidade
set DATABASE_URL=postgresql://usuario:senha@servidor:5432/controle_sgq
npm start
```

Para usar o Docker Desktop no Windows, abra o Docker e execute
`iniciar_app.bat`; ele iniciara o container PostgreSQL automaticamente. O banco
usa PostgreSQL 16, a porta `5432` e um volume persistente chamado
`controle_sgq_pgdata`. O script separado `iniciar_banco_docker.bat` também pode
ser usado para iniciar somente o banco.

```text
postgresql://controle_sgq:controle_sgq_dev@127.0.0.1:5432/controle_sgq
```

Acesse:

```text
http://localhost:3000
```

O `iniciar_app.bat` tambem importa a lista mestra antes de iniciar o backend.
O arquivo `iniciar_banco_docker.bat` permanece disponivel para iniciar somente
o PostgreSQL quando necessario.

## Importar Lista Mestra

Os registros iniciais da planilha `Lista mestra.xlsx` foram convertidos para
`backend/database/master-list-import.json`. Com o PostgreSQL em funcionamento,
execute o importador sempre que precisar atualizar essa carga:

```bash
npm run import:master
```

O processo e idempotente, inclui os documentos do Almoxarifado e atualiza as
sequencias automaticas por tipo e setor sem duplicar os registros importados.
Na planilha, a coluna `Data última revisão` foi usada como data de aprovação
somente para documentos com status `Ativo`.
As colunas de localização da planilha alimentam os campos `Publicado` e
`Qualidade` editáveis na Lista Mestra.

## Estrutura

Frontend:

- `frontend/index.html`
- `frontend/script.js`
- `frontend/style.css`
- `frontend/procedimentos.html`
- `frontend/js/procedimentos/`
- `frontend/assets/`
- Renderiza telas, canvas, botoes, importacao visual de imagens e interacao do usuario.
- Consome a API com `fetch`.

Backend:

- `backend/server.js`
- `backend/routes/procedures.js`
- `backend/services/procedureRules.js`
- `backend/services/procedureAuth.js`
- `backend/services/procedureStorage.js`
- `backend/services/procedureDatabase.js`
- `backend/database/schema.sql`
- `backend/services/procedurePdf.js`
- Cria procedimentos, autentica a qualidade, normaliza dados, valida estrutura,
  salva arquivos, atualiza a lista mestra PostgreSQL e gera o PDF para download.

## Qualidade

```bash
npm run check
```

Esse comando valida:

- Nenhum arquivo verificado pode passar de 600 linhas.
- Os arquivos JavaScript precisam estar sem erro de sintaxe.

## Rotas Principais

- `GET /api/procedures/health`
- `POST /api/procedures/new`
- `POST /api/procedures/import`
- `POST /api/procedures/auth/quality`
- `GET /api/procedures/load`
- `POST /api/procedures/save` (token da qualidade)
- `POST /api/procedures/publish` (token da qualidade)
- `POST /api/procedures/export-json` (token da qualidade)
- `POST /api/procedures/export-pdf` (token da qualidade)
- `DELETE /api/procedures/delete` (token da qualidade)
