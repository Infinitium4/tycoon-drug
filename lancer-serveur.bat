@echo off
title Tycoon Drug - serveur multijoueur
cd /d "%~dp0server"
where node >nul 2>nul || (echo Node.js n est pas installe. Telecharge-le sur https://nodejs.org puis relance ce fichier. & pause & exit /b)
if not exist node_modules (echo Installation du serveur, une seule fois... & call npm install --omit=dev)
start "" http://localhost:2567
node server.js
pause
