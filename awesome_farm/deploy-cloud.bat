@echo off
rem Awesome Farm: put the newest server on Cloudflare (all three worlds in one go).
rem Double-click this file, or run it from the awesome_farm folder.
cd /d "%~dp0"

if not exist node_modules (
  echo Installing packages, one time only...
  call npm install || goto :fail
)

echo.
echo Deploying to Cloudflare...
call npm run cf:deploy
if errorlevel 1 (
  echo.
  echo Deploy failed. If it asks you to log in, a browser window opens: approve it, then run this file again.
  call npx wrangler@4 login
  call npm run cf:deploy || goto :fail
)

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
