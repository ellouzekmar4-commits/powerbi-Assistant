@echo off
cd /d C:\Users\admin\powerbi-chatbot-server
:loop
echo [%date% %time%] Demarrage du tunnel Cloudflare >> cloudflared.log
"C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:3000 >> cloudflared.log 2>&1
echo [%date% %time%] Tunnel arrete, relance dans 5s >> cloudflared.log
timeout /t 5 /nobreak >nul
goto loop
