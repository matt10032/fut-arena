@echo off
chcp 65001 >nul
echo.
echo ╔══════════════════════════════════════════╗
echo ║     🏆 FUT ARENA - Installation          ║
echo ╚══════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js n'est pas installé !
    echo.
    echo 👉 Va sur https://nodejs.org
    echo 👉 Télécharge la version LTS (bouton vert)
    echo 👉 Installe-le (Suivant, Suivant, Terminer)
    echo 👉 Puis relance ce script
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js trouvé !
echo.
echo 📦 Installation des dépendances...
echo.
call npm install
echo.

if %errorlevel% neq 0 (
    echo ❌ Erreur d'installation. Vérifie ta connexion internet.
    pause
    exit /b 1
)

echo ✅ Installation terminée !
echo.
echo 🚀 Lancement du serveur...
echo.
node server.js
pause
