@echo off
REM ============================================================
REM  backup_documents.bat — Sauvegarde des fichiers uploadés
REM  Système de Gestion du Courrier Administratif
REM ============================================================

setlocal

REM --- Chemin racine du projet (adapter si nécessaire) ---
set PROJECT_ROOT=%~dp0..
set UPLOADS_DIR=%PROJECT_ROOT%\back-end\uploads
set EXPORTS_DIR=%PROJECT_ROOT%\back-end\exports
set BACKUP_DIR=%PROJECT_ROOT%\backups\documents

if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM --- Horodatage ---
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set DATE_TAG=%%c%%b%%a
for /f "tokens=1-2 delims=: " %%a in ("%time: =0%") do set TIME_TAG=%%a%%b
set ARCHIVE_NAME=documents_%DATE_TAG%_%TIME_TAG%

echo.
echo  =============================================
echo   Sauvegarde des documents et fichiers uploader
echo  =============================================
echo.

REM --- Sauvegarde uploads ---
if exist "%UPLOADS_DIR%" (
    echo  Copie du dossier uploads...
    xcopy "%UPLOADS_DIR%" "%BACKUP_DIR%\%ARCHIVE_NAME%\uploads\" /E /I /Q /Y
    echo  [OK] uploads copie
) else (
    echo  [INFO] Dossier uploads introuvable : %UPLOADS_DIR%
)

REM --- Sauvegarde exports PDF ---
if exist "%EXPORTS_DIR%" (
    echo  Copie du dossier exports...
    xcopy "%EXPORTS_DIR%" "%BACKUP_DIR%\%ARCHIVE_NAME%\exports\" /E /I /Q /Y
    echo  [OK] exports copie
) else (
    echo  [INFO] Dossier exports introuvable : %EXPORTS_DIR%
)

REM --- Compression optionnelle ---
REM Pour compresser en ZIP (7-Zip doit être installé) :
REM "C:\Program Files\7-Zip\7z.exe" a -tzip "%BACKUP_DIR%\%ARCHIVE_NAME%.zip" "%BACKUP_DIR%\%ARCHIVE_NAME%\"
REM rmdir /s /q "%BACKUP_DIR%\%ARCHIVE_NAME%\"
REM echo  [OK] Archive compresse : %BACKUP_DIR%\%ARCHIVE_NAME%.zip

echo.
echo  Sauvegarde terminee dans : %BACKUP_DIR%\%ARCHIVE_NAME%\
echo.
pause
endlocal