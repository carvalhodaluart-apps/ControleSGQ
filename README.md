# Criador de Procedimentos

Webapp para criar procedimentos internos e exportar o resultado em PDF e JSON.

O PostgreSQL armazena a lista mestra, controla a numeracao automatica e mantém
o conteudo completo dos rascunhos em JSONB. Os arquivos em
`backend/dados_procedimentos/rascunhos` continuam como fallback local e para
migracao. Para editar depois, importe o arquivo JSON baixado anteriormente.

## Como Rodar

```bash
npm install
set QUALITY_PASSWORD=sua_senha_da_qualidade
set DATABASE_URL=postgresql://usuario:senha@servidor:5432/controle_sgq
set APP_HOST=127.0.0.1
npm start
```

Para criar usuários individuais, cadastre-os pela tela `Configurações` com a
senha da qualidade. O usuário editor pode criar, editar, exportar e visualizar
a lista mestra. O gestor pode fazer tudo isso, além de publicar, excluir,
editar a lista mestra, consultar auditoria, restaurar backups e alterar
configurações.

O servidor escuta somente em `127.0.0.1` por padrao. Altere `APP_HOST` apenas
quando houver uma necessidade controlada de acesso pela rede.

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

## Backup e restauração

Na tela `Configurações`, a qualidade pode baixar um backup JSON completo e
restaurá-lo depois. Também existem os comandos:

```bash
npm run backup:db
npm run restore:db -- backups/arquivo-de-backup.json
```

A restauração substitui as tabelas do sistema dentro de uma transação. Mantenha
os arquivos de backup fora do repositório e faça uma cópia antes de restaurar.

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
- `frontend/planos-acao.html`
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
- `backend/routes/actionPlans.js`
- `backend/services/actionPlanRules.js`
- `backend/services/actionPlanDatabase.js`
- `backend/services/actionPlanPdf.js`
- `backend/routes/instruments.js`
- `backend/services/instrumentRules.js`
- `backend/services/instrumentDatabase.js`
- `backend/services/instrumentPdf.js`
- Cria procedimentos, autentica a qualidade, normaliza dados, valida estrutura,
  salva JSONB no PostgreSQL, mantém fallback local, atualiza a lista mestra e
  gera o PDF para download.

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
- `POST /api/procedures/auth/user`
- `GET /api/procedures/load`
- `POST /api/procedures/save` (token da qualidade)
- `POST /api/procedures/publish` (token da qualidade)
- `POST /api/procedures/export-json` (token da qualidade)
- `POST /api/procedures/export-pdf` (token da qualidade)
- `DELETE /api/procedures/delete` (token da qualidade)
- `GET|POST /api/action-plans` (editor ou gestor)
- `GET /api/action-plans/:id/pdf` (editor ou gestor)
- `PUT /api/action-plans/:id` (editor ou gestor)
- `DELETE /api/action-plans/:id` (gestor)
- `GET|POST /api/instruments` (editor ou gestor)
- `GET /api/instruments/:id/pdf` (editor ou gestor)
- `PUT /api/instruments/:id` (editor ou gestor)
- `DELETE /api/instruments/:id` (gestor)
- `GET /api/admin/backup` (token da qualidade)
- `POST /api/admin/restore` (token da qualidade)
- `GET /api/admin/audit` (token da qualidade)
- `GET|POST /api/admin/users` e `PATCH /api/admin/users/:id` (token da qualidade)
