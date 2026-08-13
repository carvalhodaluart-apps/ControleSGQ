# Aplicativo desktop

O Electron inicia o mesmo backend Express usado pelo modo web e abre o frontend em uma janela independente.

Durante o desenvolvimento, o Electron usa o `.env.local` da raiz do projeto. Em uma instalação empacotada, a configuração fica em:

`%APPDATA%/Controle SGQ/.env.local`

No modo desktop, o Electron cria automaticamente um banco SQLite na pasta de dados do usuario. No primeiro acesso, o assistente permite configurar a senha inicial e importar um backup JSON exportado pelo sistema.

Arquivos gerados e de trabalho ficam em `%APPDATA%/Controle SGQ/arquivos`, separados da pasta de instalacao. O aplicativo organiza JSON, imagens, PDFs, pacotes, backups diarios, historico de versoes e snapshots de recuperacao nessa pasta.
