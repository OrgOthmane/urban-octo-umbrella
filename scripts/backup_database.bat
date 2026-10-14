@echo off
REM ============================================================
REM  backup_database.bat — Sauvegarde de la base de données
REM  Système de Gestion du Courrier Administratif
REM ============================================================
REM  Usage : double-cliquer ou lancer depuis cmd
REM  Pré-requis : mysqldump doit être dans le PATH
REM               (fourni avec MySQL Server)
REM ============================================================

setlocal

REM --- Configuration (adapter selon votre installation) ---
set DB_HOST=localhost
set DB_PORT=3306
set DB_USER=sys_courrier_app
set DB_NAME=sys_courrier

REM --- Dossier de destination des sauvegardes ---
set BACKUP_DIR=%~dp0..\backups\database
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM --- Nom du fichier avec horodatage ---
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set DATE_TAG=%%c%%b%%a
for /f "tokens=1-2 delims=: " %%a in ("%time: =0%") do set TIME_TAG=%%a%%b
set FILENAME=%BACKUP_DIR%\sys_courrier_%DATE_TAG%_%TIME_TAG%.sql

REM --- Demander le mot de passe ---
echo.
echo  ========================================
echo   Sauvegarde base de donnees sys_courrier
echo  ========================================
echo.
set /p DB_PASSWORD=Entrez le mot de passe MySQL pour [%DB_USER%] :

REM --- Exécuter mysqldump ---
echo.
echo  Sauvegarde en cours...
mysqldump --host=%DB_HOST% --port=%DB_PORT% --user=%DB_USER% --password=%DB_PASSWORD% ^
  --single-transaction --routines --triggers --events ^
  --add-drop-table --complete-insert ^
  %DB_NAME% > "%FILENAME%"

if %ERRORLEVEL% EQU 0 (
    echo.
    echo  [OK] Sauvegarde reussie !
    echo  Fichier : %FILENAME%
    echo.
    REM Vérifier la taille du fichier
    for %%F in ("%FILENAME%") do echo  Taille  : %%~zF octets
    
    REM --- Compression optionnelle ---
    REM Pour compresser en ZIP (7-Zip doit être installé) :
    REM "C:\Program Files\7-Zip\7z.exe" a -tzip "%FILENAME%.zip" "%FILENAME%"
    REM del "%FILENAME%"
    REM echo  [OK] Fichier compresse : %FILENAME%.zip
) else (
    echo.
    echo  [ERREUR] La sauvegarde a echoue. Verifiez :
    echo  - Le mot de passe MySQL
    echo  - La connexion au serveur MySQL (%DB_HOST%:%DB_PORT%)
    echo  - Les droits de l'utilisateur %DB_USER%
    del "%FILENAME%" 2>nul
)

echo.
pause
endlocal