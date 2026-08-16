@echo off
setlocal

rem CodeRecall local-development launcher. This file never selects or deploys a project.
for %%I in ("%~dp0..") do set "REPO_ROOT=%%~fI"

if not exist "%REPO_ROOT%\.git" goto :invalid_repo
if not exist "%REPO_ROOT%\package.json" goto :invalid_repo
if not exist "%REPO_ROOT%\firebase.json" goto :invalid_repo
if not exist "%REPO_ROOT%\vercel.json" goto :invalid_repo

echo CodeRecall repository detected:
echo   %REPO_ROOT%
echo.

call :port_listening 18080
if not errorlevel 1 (
  echo WARNING: Port 18080 is already listening.
  echo The launcher will not start or stop another Firestore Emulator.
  echo Verify the existing listener belongs to your intended local session.
) else (
  echo Starting the Firestore Emulator in a dedicated window...
  start "CodeRecall - Firestore Emulator" cmd.exe /D /K "cd /D ""%REPO_ROOT%"" && npx.cmd firebase emulators:start --only firestore --project preview"
)

call :port_listening 3000
if not errorlevel 1 (
  echo WARNING: Port 3000 is already listening.
  echo The launcher will not start or stop another Vercel Development server.
  echo Verify the existing listener belongs to your intended local session.
) else (
  echo Starting Vercel Development in a dedicated window...
  start "CodeRecall - Vercel Dev" cmd.exe /D /K "cd /D ""%REPO_ROOT%"" && set ""FIRESTORE_EMULATOR_HOST=127.0.0.1:18080"" && npx.cmd vercel dev"
)

echo.
echo Local development targets:
echo   App:       http://localhost:3000
echo   Firestore: 127.0.0.1:18080
echo.
echo Run tools\check-coderecall-dev.bat to check listener status.
exit /B 0

:port_listening
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$client = [Net.Sockets.TcpClient]::new(); try { $task = $client.ConnectAsync('127.0.0.1', %1); if (-not $task.Wait(600)) { exit 1 }; exit 0 } catch { exit 1 } finally { $client.Dispose() }" >nul 2>&1
exit /B %ERRORLEVEL%

:invalid_repo
echo ERROR: The CodeRecall repository could not be verified at:
echo   %REPO_ROOT%
echo Expected .git, package.json, firebase.json, and vercel.json.
exit /B 1
