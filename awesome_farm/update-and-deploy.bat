@echo off
rem Awesome Farm: get the newest code from GitHub, then put the newest server on Cloudflare (all three worlds).
rem Double-click this file. It lives in the awesome_farm folder of your Games repo.
cd /d "%~dp0"

echo Getting the newest code from GitHub...
git pull --ff-only origin main
if errorlevel 1 (
  echo.
  echo The pull did not work. If you have changed files here, save or undo them first, then run this again.
  goto :fail
)

echo.
echo Installing packages (quick when nothing changed)...
call npm install || goto :fail

echo.
echo Deploying to Cloudflare...
call npm run cf:deploy
if errorlevel 1 (
  echo.
  echo Deploy failed. If it asks you to log in, a browser window opens: approve it, then it tries again.
  call npx wrangler@4 login
  call npm run cf:deploy || goto :fail
)

echo.
choice /c YN /m "Also rebuild the server for your own PC (server-dist)"
if errorlevel 2 goto :done
call npm run server:build || goto :fail
echo Your PC server is rebuilt in the server-dist folder: restart it from there.

:done
echo.
echo Done. Meadow, Quarry and Snowcap are live.
echo Check: https://awesome-farm.danhieux-senjka.workers.dev/worlds
pause
exit /b 0

:fail
echo.
echo Something went wrong, see the message above.
pause
exit /b 1
