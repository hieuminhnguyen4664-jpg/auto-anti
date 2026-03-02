@echo off
echo ========================================
echo  Building Antigravity Auto Accept v0.3.0
echo ========================================
echo.

cd /d "%~dp0"

echo [1/2] Installing vsce...
call npx -y @vscode/vsce --version

echo.
echo [2/2] Packaging extension...
call npx -y @vscode/vsce package --allow-missing-repository --no-dependencies

echo.
echo ========================================
echo  Build complete! Install the .vsix file:
echo  code --install-extension antigravity-auto-accept-0.3.0.vsix
echo ========================================
pause
