@echo off
title CLSP - Sistema Completo

echo Iniciando Backend Django...
start "CLSP Backend" cmd /k "cd /d %~dp0clsp_completo\01_backend && venv\Scripts\python.exe manage.py runserver 8000 --settings=core.settings.local"

timeout /t 3 /nobreak >nul

echo Iniciando Panel Admin...
start "CLSP Admin Panel" cmd /k "cd /d %~dp0clsp_completo\03_admin && npm run dev"

timeout /t 5 /nobreak >nul

echo Abriendo navegador...
start http://localhost:3000

echo.
echo ================================
echo  Sistema CLSP iniciado
echo ================================
echo  Panel Admin:  http://localhost:3000
echo  API Backend:  http://localhost:8000
echo  Swagger:      http://localhost:8000/api/docs/
echo.
echo ================================
