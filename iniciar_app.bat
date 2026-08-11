@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"
if exist ".env.local" (
  echo Carregando configuracao local de .env.local...
  for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.local") do if not defined %%A set "%%A=%%B"
)
if not defined APP_PORT set "APP_PORT=3000"
if not defined APP_HOST set "APP_HOST=127.0.0.1"
set "APP_URL=http://%APP_HOST%:%APP_PORT%/"
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
  if not defined POSTGRES_PASSWORD (
    set /p "POSTGRES_PASSWORD=Digite a senha do PostgreSQL local: "
    echo.
    if not defined POSTGRES_PASSWORD (
      echo Nenhuma senha foi informada.
      pause
      exit /b 1
    )
  )
  set "DATABASE_URL=postgresql://controle_sgq:!POSTGRES_PASSWORD!@127.0.0.1:5432/controle_sgq"
  set "LOCAL_DATABASE_CONFIGURED=1"
)
if defined LOCAL_DATABASE_CONFIGURED goto start_local_database
echo %DATABASE_URL% | findstr /I /R "@127\.0\.0\.1:5432/" >nul
if not errorlevel 1 goto start_local_database
goto database_ready

:start_local_database
echo Usando o PostgreSQL local do Docker.
if not defined POSTGRES_PASSWORD (
  set /p "POSTGRES_PASSWORD=Digite a senha do PostgreSQL local: "
  echo.
  if not defined POSTGRES_PASSWORD (
    echo Nenhuma senha foi informada.
    pause
    exit /b 1
  )
)
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

:database_ready
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale o Node.js antes de iniciar o app.
  pause
  exit /b 1
)

if not exist "node_modules\express" goto install_dependencies
if not exist "node_modules\helmet" goto install_dependencies
if not exist "node_modules\express-rate-limit" goto install_dependencies
goto dependencies_ready

:install_dependencies
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar dependencias.
    pause
    exit /b 1
  )

:dependencies_ready

echo PostgreSQL pronto. Atualizando a lista mestra...
call npm run import:master
if errorlevel 1 (
  echo Falha ao importar a lista mestra.
  pause
  exit /b 1
)

echo Encerrando o backend anterior, se estiver aberto...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$processes = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'node[\\ ]+backend[\\/]server\.js' }; $processes | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"

echo Iniciando backend em %APP_URL%
start "Backend - Procedimentos" cmd /k "cd /d ""%~dp0"" && set ""PORT=%APP_PORT%"" && set ""APP_HOST=%APP_HOST%"" && set ""QUALITY_PASSWORD=%QUALITY_PASSWORD%"" && set ""SESSION_SECRET=%SESSION_SECRET%"" && set ""DATABASE_URL=%DATABASE_URL%"" && npm start"

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
