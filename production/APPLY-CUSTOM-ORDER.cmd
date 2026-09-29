@echo off
setlocal
if not exist script.js (
  echo ERROR: script.js was not found in this folder.
  echo Put APPLY-CUSTOM-ORDER.cmd and custom-order-addon.js inside your FULL website folder, then run it again.
  pause
  exit /b 1
)
if not exist custom-order-addon.js (
  echo ERROR: custom-order-addon.js was not found.
  pause
  exit /b 1
)
findstr /C:"hog-custom-order-v1" script.js >nul 2>&1
if %errorlevel%==0 (
  echo Custom-order add-on is already installed. No changes made.
  pause
  exit /b 0
)
copy /Y script.js script.js.before-custom-order >nul
(echo.)>>script.js
type custom-order-addon.js >> script.js
echo.
echo DONE: Custom Jewelry request and contact options were added to script.js.
echo Backup created: script.js.before-custom-order
pause
