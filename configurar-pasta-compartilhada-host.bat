@echo off
setlocal EnableExtensions
title Controle SGQ - Configurar computador host

fltmc >nul 2>&1
if errorlevel 1 (
  echo Solicitando permissao de administrador...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "SHARE_NAME=ControleSGQ"
set "DATA_DIR=C:\ControleSGQCompartilhado"
set "USER_NAME=sgq-rede"

echo.
echo ================================================
echo   Controle SGQ - Configuracao da pasta central
echo ================================================
echo.
echo Pasta: %DATA_DIR%
echo Compartilhamento: \\%COMPUTERNAME%\%SHARE_NAME%
echo Usuario de rede: %USER_NAME%
echo.

if not exist "%DATA_DIR%" mkdir "%DATA_DIR%"
if errorlevel 1 goto :error

net user "%USER_NAME%" >nul 2>&1
if errorlevel 1 (
  echo Criando o usuario local %USER_NAME%.
  echo Crie uma senha para esse usuario. Ela sera usada nos outros computadores.
  net user "%USER_NAME%" * /add
  if errorlevel 1 goto :error
) else (
  echo O usuario %USER_NAME% ja existe. Sera usada a senha atual dele.
)

echo.
echo Aplicando permissoes na pasta...
icacls "%DATA_DIR%" /inheritance:e >nul
icacls "%DATA_DIR%" /grant "%COMPUTERNAME%\%USER_NAME%:(OI)(CI)M" /T /C >nul
if errorlevel 1 goto :error

echo Criando o compartilhamento de rede...
net share "%SHARE_NAME%" /delete /y >nul 2>&1
net share "%SHARE_NAME%"="%DATA_DIR%" /grant:"%COMPUTERNAME%\%USER_NAME%",CHANGE >nul
if errorlevel 1 goto :error

echo Liberando o compartilhamento no Firewall do Windows...
netsh advfirewall firewall set rule group="File and Printer Sharing" new enable=Yes >nul

echo.
echo CONFIGURACAO CONCLUIDA.
echo.
echo No outro computador, execute conectar-pasta-compartilhada.bat
echo ou use este caminho no Explorador de Arquivos:
echo \\%COMPUTERNAME%\%SHARE_NAME%
echo.
echo Usuario: %COMPUTERNAME%\%USER_NAME%
echo Use a senha criada para o usuario %USER_NAME%.
echo.
pause
exit /b 0

:error
echo.
echo Nao foi possivel concluir a configuracao.
echo Verifique se este arquivo foi executado como administrador.
pause
exit /b 1
