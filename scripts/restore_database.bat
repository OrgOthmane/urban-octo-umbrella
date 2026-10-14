@echo off
REM ============================================================
REM  restore_database.bat — Restauration de la base de données
REM  Système de Gestion du Courrier Administratif
REM ============================================================
REM  Usage : restore_database.bat [chemin_du_fichier.sql]
REM  Exemple : restore_database.bat ..\backups\database\sys_courrier_20260903.sql
REM ============================================================

setlocal

REM --- Configuration ---
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=sys_courrier_app
set DB_NAME=sys_courrier

echo.
echo  ==========================================
echo   Restauration base de donnees sys_courrier
echo  ==========================================
echo.
echo  ATTENTION : Cette operation va ECRASER les donnees actuelles !
echo.

REM --- Fichier SQL à restaurer ---
if "%~1"=="" (
    set /p SQL_FILE=Chemin du fichier SQL a restaurer : 
) else (
    set SQL_FILE=%~1
)

if not exist "%SQL_FILE%" (
    echo  [ERREUR] Fichier introuvable : %SQL_FILE%
    echo.
    pause
    exit /b 1
)

echo  Fichier selectionne : %SQL_FILE%
echo.
set /p CONFIRM=Confirmer la restauration ? (oui/non) : 
if /i not "%CONFIRM%"=="oui" (
    echo  Restauration annulee.
    pause
    exit /b 0
)

set /p DB_PASSWORD=Entrez le mot de passe MySQL pour [%DB_USER%] : 

echo.
echo  Restauration en cours...
mysql --host=%DB_HOST% --port=%DB_PORT% --user=%DB_USER% --password=%DB_PASSWORD% ^
  %DB_NAME% < "%SQL_FILE%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  [OK] Restauration reussie !
    echo  La base de donnees %DB_NAME% a ete restauree depuis :
    echo  %SQL_FILE%
) else (
    echo.
    echo  [ERREUR] La restauration a echoue. Verifiez :
    echo  - Le mot de passe MySQL
    echo  - La connexion au serveur MySQL (%DB_HOST%:%DB_PORT%)
    echo  - L'integrite du fichier SQL
)

echo.
pause
endlocal