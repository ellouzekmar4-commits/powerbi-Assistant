@echo off
cd /d C:\Users\admin\powerbi-chatbot-server
:loop
rem Ne demarre le serveur que si le port 3000 n'ecoute pas deja
netstat -ano | findstr ":3000 " | findstr LISTENING >nul
if errorlevel 1 (
  echo [%date% %time%] Demarrage du serveur >> server.log
  "C:\Program Files\nodejs\node.exe" server.js >> server.log 2>&1
)
timeout /t 10 /nobreak >nul
goto loop
