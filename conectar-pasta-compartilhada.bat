@echo off
setlocal EnableExtensions
title Controle SGQ - Conectar pasta compartilhada

set "SHARE_NAME=ControleSGQ"
set /p "HOST=Digite o nome do computador host: "
if not defined HOST (
  echo Nome do host nao informado.
  pause
  exit /b 1
)

echo.
echo Limpando credenciais antigas...
net use "\\%HOST%\%SHARE_NAME%" /delete /y >nul 2>&1
cmdkey /delete:%HOST% >nul 2>&1

echo.
echo Digite a senha do usuario sgq-rede quando solicitado.
net use "\\%HOST%\%SHARE_NAME%" /user:"%HOST%\sgq-rede" * /persistent:no
if errorlevel 1 (
  echo.
  echo Nao foi possivel conectar.
  echo Confirme o nome do host, a rede e a senha do usuario sgq-rede.
  pause
  exit /b 1
)

echo.
echo Conexao realizada. Abrindo a pasta...
start "" "\\%HOST%\%SHARE_NAME%"
echo.
echo No Controle SGQ, selecione exatamente o mesmo caminho:
echo \\%HOST%\%SHARE_NAME%
pause
exit /b 0
