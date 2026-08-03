# Padrão de Módulos do Gestão da Qualidade Total

Este documento define o padrão mínimo para criar novos módulos no sistema. O
objetivo é manter uma experiência homogênea, previsível e fácil de manter para
procedimentos, não conformidades e futuros documentos da qualidade.

## 1. Princípios gerais

- Cada módulo deve ter uma finalidade clara e um nome direto.
- A interface deve seguir a mesma linguagem visual dos módulos existentes.
- A interface apresenta e coleta dados; regras de negócio ficam no backend.
- Toda alteração relevante deve ser validada, persistida e auditável.
- O módulo deve funcionar para editor e gestor conforme as permissões definidas.
- Nenhum arquivo deve ultrapassar 600 linhas.
- Textos em português devem permanecer em UTF-8, sem perda de acentos.
- O módulo deve prever estados vazio, carregando, erro, sucesso e sem permissão.

## 2. Card do módulo na tela inicial

Todo módulo deve aparecer na área inicial com a mesma estrutura:

1. Faixa lateral laranja da marca.
2. Identificação curta `Módulo`.
3. Nome do módulo em destaque.
4. Descrição de uma ou duas linhas.
5. Área de ações alinhada na parte inferior do card.
6. Botão principal azul com texto branco para criar um novo registro.
7. Botão secundário branco com texto escuro para editar ou continuar um registro.
8. Mesma largura e alinhamento vertical dos botões em todos os cards.
9. Mensagem de erro próxima aos botões, sem `alert()` do navegador.

O card deve usar bordas arredondadas, sombra suave, fundo claro e espaçamento
interno consistente. Cards de módulos diferentes não devem inventar novas
formas de botão, cores ou raios de borda.

## 3. Estrutura mínima de cada módulo

### 3.1 Tela de entrada

Deve conter:

- Título do módulo.
- Descrição curta da finalidade.
- Botão para criar novo documento.
- Botão para editar/importar documento existente, quando aplicável.
- Lista de rascunhos ou documentos em elaboração, quando o módulo exigir
  continuidade de trabalho.
- Proteção de acesso antes de abrir dados restritos.

### 3.2 Lista de registros

Quando o módulo possuir vários documentos, a lista deve ter:

- Título, código ou identificador único.
- Status visual com cor sem depender apenas de texto.
- Data de criação e última alteração.
- Responsável ou usuário da última alteração.
- Pesquisa simples por código, título e campos relevantes.
- Filtros somente quando houver volume que justifique seu uso.
- Paginação de 50 registros por página para listas extensas.
- Ações alinhadas: abrir, editar, visualizar PDF e excluir quando permitido.
- Mensagem de confirmação personalizada antes de excluir.
- Estado vazio com orientação objetiva para criar o primeiro registro.

### 3.3 Tela de edição

Deve conter:

- Cabeçalho fixo ou claramente visível com nome, código e status.
- Navegação lateral ou índice das seções quando o formulário for longo.
- Cards de seção com títulos numerados e descrições curtas.
- Campos com rótulos claros e placeholders explicando o preenchimento.
- Campos obrigatórios identificados visualmente.
- Salvamento explícito e mensagem de sucesso ou erro próxima ao cabeçalho.
- Aviso de alterações não salvas ao sair, voltar ou fechar a página.
- Botões destrutivos protegidos por confirmação e, quando necessário, senha.
- Botão de exportação coerente com o status do documento.

### 3.4 Visualização e PDF

Todo módulo que gerar documento deve oferecer:

- Visualização antes do download.
- PDF com a mesma capa configurada no sistema.
- Título, código, revisão, status e datas coerentes com o banco.
- Textos sem cortes, sobreposições ou perda de caracteres especiais.
- Imagens preservando proporção, transparência e posição configurada.
- Seções que não tenham conteúdo não devem criar espaços excessivos.
- Rodapé com código, página e data de geração quando aplicável.
- Download com nome de arquivo previsível e seguro.

## 4. Padrão visual

### Cores

- Fundo geral: azul muito claro ou cinza azulado suave.
- Superfície dos cards: branco.
- Texto principal: azul-marinho escuro.
- Texto secundário: azul acinzentado.
- Marca: laranja na faixa lateral dos cards.
- Ação principal: azul.
- Sucesso/publicado: verde.
- Em elaboração/atenção: amarelo ou laranja claro.
- Erro, exclusão e obsoleto: vermelho.

As cores devem manter contraste suficiente. Nenhum status pode ser indicado
somente pela cor; o texto do status também deve aparecer.

### Componentes

- Cards: cantos arredondados, borda fina e sombra discreta.
- Botão principal: fundo azul, texto branco.
- Botão secundário: fundo branco, texto escuro e borda clara.
- Botão destrutivo: borda ou fundo vermelho, com confirmação antes da ação.
- Campos: altura uniforme, bordas arredondadas e foco visível.
- Modais: fundo escurecido, conteúdo centralizado e ações no rodapé.
- Ícones: usados para reforçar a ação, sempre com `aria-label` ou tooltip.
- Menus recolhíveis: título clicável, indicador de abrir/fechar e conteúdo
  preservado ao recolher.

### Alinhamento

- Ações equivalentes devem ter a mesma largura.
- Botões de cards de módulos devem ficar nivelados na mesma altura.
- Cabeçalhos devem manter título, descrição e ações alinhados.
- Grids devem usar colunas estáveis e quebrar corretamente em telas menores.
- Não criar rolagem horizontal para formulários ou tabelas sem necessidade.

## 5. Estados e comportamento

Todo módulo deve definir:

- `carregando`: indicar que os dados estão sendo buscados.
- `vazio`: explicar o que fazer a seguir.
- `erro`: mostrar mensagem útil e permitir tentar novamente.
- `sucesso`: confirmar a operação sem esconder o contexto.
- `sem permissão`: informar o acesso necessário sem revelar dados protegidos.
- `em elaboração`: permitir continuidade apenas com a proteção definida.
- `publicado`: impedir edição casual e mostrar a data de publicação.
- `obsoleto`: destacar em vermelho e preservar o histórico.

Ao excluir, o sistema deve pedir confirmação. Operações da qualidade, como
publicar, excluir documento, alterar configuração ou apagar revisão, devem
usar o modal de senha sem trocar a tela antes da validação.

## 6. Permissões

### Editor

- Criar documentos.
- Editar documentos autorizados.
- Importar JSON correspondente ao documento.
- Visualizar e baixar PDFs.
- Consultar a lista mestra.

### Gestor/Qualidade

- Tudo que o editor pode fazer.
- Publicar documentos.
- Excluir documentos e revisões.
- Editar a lista mestra.
- Consultar auditoria.
- Alterar configurações.
- Gerenciar usuários e backups.

O frontend pode ocultar ações para melhorar a experiência, mas a autorização
deve ser sempre repetida e validada no backend.

## 7. Dados e backend

Cada módulo deve possuir:

- Identificador único e estável.
- Código ou número gerado no backend quando houver nomenclatura controlada.
- Status centralizado em uma única fonte.
- Datas armazenadas em formato consistente.
- Usuário de criação e última alteração.
- Histórico/auditoria para operações relevantes.
- Validação de tamanho, formato e conteúdo dos campos.
- Rotas REST protegidas por perfil.
- Consultas parametrizadas para PostgreSQL.
- Migração SQL compatível com bancos já existentes.

O frontend não deve decidir sozinho numeração, status de publicação, permissões,
regras de exclusão ou validações de integridade.

## 8. Configurações do módulo

Quando um módulo tiver opções ajustáveis, ele deve possuir um card próprio na
tela de configurações com:

- Identificação visível do módulo ao qual pertence.
- Descrição do efeito de cada configuração.
- Listas de opções com ativação/desativação.
- Limites numéricos com mínimo e máximo.
- Pelo menos uma opção obrigatória quando o módulo não puder ficar sem ela.
- Confirmação para exclusões.
- Salvamento único e retorno para a tela anterior após sucesso.
- Aplicação da configuração no editor, na validação do backend e no PDF.

## 9. Organização dos arquivos

Preferir a seguinte separação:

```text
frontend/
  modulo.html
  modulo.js
  styles/modulo.css

backend/
  routes/modulo.js
  services/moduloRules.js
  services/moduloDatabase.js
  services/moduloPdf.js
```

O frontend deve cuidar de renderização, eventos, mensagens e chamadas `fetch`.
O backend deve cuidar de regras, autenticação, autorização, PostgreSQL,
auditoria, geração de arquivos e validação final.

## 10. Checklist antes de adicionar um módulo

- [ ] O nome e a finalidade do módulo estão claros?
- [ ] O card inicial segue o padrão visual existente?
- [ ] Os botões criar e editar estão alinhados e com as cores corretas?
- [ ] A lista possui pesquisa, estado vazio e paginação quando necessário?
- [ ] A edição possui seções, campos obrigatórios e aviso de alterações?
- [ ] Os estados de carregamento, erro e sucesso foram implementados?
- [ ] As permissões foram aplicadas no frontend e no backend?
- [ ] A exclusão possui confirmação e proteção adequada?
- [ ] Os dados têm identificador, status, datas e auditoria?
- [ ] O PDF foi visualizado e conferido antes do download?
- [ ] A configuração do módulo aparece claramente na tela de configurações?
- [ ] Os textos estão em UTF-8 e os acentos foram preservados?
- [ ] Nenhum arquivo ultrapassa 600 linhas?
- [ ] `npm run check` foi executado com sucesso?

## 11. Módulos atuais

- **Procedimentos:** criação, edição, etapas, canvas, revisões, PDF, JSON e
  lista mestra.
- **Não conformidades:** identificação, descrição, evidências, ações,
  eficácia, encerramento e PDF.
- **Planos de ação e CAPA:** correção imediata, análise de causa, ações
  corretivas/preventivas, verificação de eficácia e encerramento.
- **Calibração de instrumentos:** cadastro metrológico, planejamento,
  calibração, manutenção, vencimentos e análise de impacto quando reprovado.
- **Sistema:** usuários, permissões, configurações, auditoria e backup.

Novos módulos devem seguir este documento e acrescentar suas regras específicas
sem alterar o padrão visual global sem uma decisão registrada.
