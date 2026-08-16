@echo off
setlocal

rem Read-only CodeRecall local-development status checker.
for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"

if not exist "%REPO_ROOT%\.git" goto :invalid_repo
if not exist "%REPO_ROOT%\package.json" goto :invalid_repo
if not exist "%REPO_ROOT%\firebase.json" goto :invalid_repo
if not exist "%REPO_ROOT%\vercel.json" goto :invalid_repo

echo [OK] Repository detected: %REPO_ROOT%
echo.

call :report_port 18080 "Firestore Emulator"
call :report_port 3000 "Vercel local server"

echo.
echo Expected local URLs:
echo   App:       http://localhost:3000
echo   Firestore: 127.0.0.1:18080

echo.
pause

exit /B 0

:report_port
call :port_listening %1
if errorlevel 1 (
  echo [NOT RUNNING] %~2 is not listening on 127.0.0.1:%1.
) else (
  echo [RUNNING]     %~2 is listening on 127.0.0.1:%1.
)
exit /B 0

:port_listening
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$client = [Net.Sockets.TcpClient]::new(); try { $task = $client.ConnectAsync('127.0.0.1', %1); if (-not $task.Wait(600)) { exit 1 }; exit 0 } catch { exit 1 } finally { $client.Dispose() }" >nul 2>&1
exit /B %ERRORLEVEL%

:invalid_repo
echo [ERROR] The CodeRecall repository could not be verified at:
echo   %REPO_ROOT%
echo Expected .git, package.json, firebase.json, and vercel.json.

echo.
pause

exit /B 1