@echo off
setlocal

cd /d "%~dp0"

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
echo PostgreSQL pronto em 127.0.0.1:5432.
echo Banco: controle_sgq
echo Usuario: controle_sgq
endlocal
