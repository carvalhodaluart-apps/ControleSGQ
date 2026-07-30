@echo off
setlocal

cd /d "%~dp0"
set "APP_PORT=3000"
set "APP_URL=http://127.0.0.1:%APP_PORT%/"
if not defined QUALITY_PASSWORD (
  set /p "QUALITY_PASSWORD=Digite a senha da qualidade: "
  echo.
  if not defined QUALITY_PASSWORD (
    echo Nenhuma senha foi informada.
    pause
    exit /b 1
  )
)
if not defined DATABASE_URL (
  set "DATABASE_URL=postgresql://controle_sgq:controle_sgq_dev@127.0.0.1:5432/controle_sgq"
  echo Usando o PostgreSQL local do Docker: %DATABASE_URL%
  where docker >nul 2>nul
  if errorlevel 1 (
    echo Docker Desktop nao foi encontrado.
    echo Instale e abra o Docker Desktop antes de continuar.
    pause
    exit /b 1
  )
  docker compose up -d postgres
  if errorlevel 1 (
    echo Nao foi possivel iniciar o PostgreSQL no Docker.
    pause
    exit /b 1
  )
  echo Aguardando o PostgreSQL ficar pronto...
  for /L %%I in (1,1,30) do (
    docker compose exec -T postgres pg_isready -U controle_sgq -d controle_sgq >nul 2>nul
    if not errorlevel 1 goto database_ready
    timeout /t 1 /nobreak >nul
  )
  echo O PostgreSQL nao respondeu dentro do tempo esperado.
  docker compose ps
  pause
  exit /b 1
)

:database_ready
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js antes de iniciar o app.
  pause
  exit /b 1
)

if not exist "node_modules\express" (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )
)

echo PostgreSQL pronto. Atualizando a lista mestra...
call npm run import:master
if errorlevel 1 (
  echo Falha ao importar a lista mestra.
  pause
  exit /b 1
)

echo Iniciando backend em %APP_URL%
start "Backend - Procedimentos" cmd /k "cd /d ""%~dp0"" && set ""PORT=%APP_PORT%"" && set ""QUALITY_PASSWORD=%QUALITY_PASSWORD%"" && set ""DATABASE_URL=%DATABASE_URL%"" && npm start"

echo Aguardando o backend responder...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='http://127.0.0.1:%APP_PORT%/api/procedures/health'; for ($i=0; $i -lt 40; $i++) { try { $r=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; Start-Sleep -Milliseconds 500 }; exit 1"

if errorlevel 1 (
  echo Nao foi possivel confirmar que o backend iniciou.
  echo Verifique a janela "Backend - Procedimentos".
  pause
  exit /b 1
)

start "" "%APP_URL%"
echo App aberto no navegador.
endlocal
