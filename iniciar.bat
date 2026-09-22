@echo off
REM Clique duas vezes neste arquivo para abrir o CRM (Windows).
cd /d "%~dp0"
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8000"
where py >nul 2>nul
if %errorlevel%==0 (
  py server.py
) else (
  python server.py
)
pause
