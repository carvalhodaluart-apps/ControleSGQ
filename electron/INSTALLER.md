# Instalador do Controle SGQ

O instalador Windows e gerado por `npm run desktop:dist` e cria:

- atalho na area de trabalho;
- atalho no menu Iniciar;
- entrada de desinstalacao do Controle SGQ.

A instalacao e por usuario (`perMachine: false`) e usa `asInvoker`, portanto nao solicita elevacao quando o Windows permitir. Os dados ficam fora da pasta de instalacao, em `%APPDATA%/Controle SGQ`, e nao sao apagados pelo desinstalador.

## Verificacao de atualizacao

O aplicativo pode consultar um manifesto JSON HTTPS depois da abertura. Configure `UPDATE_MANIFEST_URL` no `.env.local`:

```text
UPDATE_MANIFEST_URL=https://exemplo.com/controle-sgq/latest.json
```

O manifesto precisa informar a versao e a pagina ou arquivo de download:

```json
{
  "version": "1.0.1",
  "url": "https://exemplo.com/Controle-SGQ-Setup-1.0.1.exe"
}
```

A verificacao e opcional, nao bloqueia a inicializacao e so oferece a abertura do link quando existe uma versao maior que a instalada.
