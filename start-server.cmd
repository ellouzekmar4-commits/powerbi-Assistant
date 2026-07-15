@echo off
cd /d C:\Users\admin\powerbi-chatbot-server
:loop
echo [%date% %time%] Demarrage du serveur chatbot >> server.log
node server.js >> server.log 2>&1
echo [%date% %time%] Serveur arrete, relance dans 5s >> server.log
timeout /t 5 /nobreak >nul
goto loop
