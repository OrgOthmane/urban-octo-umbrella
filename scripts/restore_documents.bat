@echo off
REM ============================================================
REM  restore_documents.bat — Restauration des fichiers uploadés
REM  Système de Gestion du Courrier Administratif
REM ============================================================
REM  Usage : restore_documents.bat [chemin_du_dossier_backup]
REM  Exemple : restore_documents.bat ..\backups\documents\documents_20260903_150000
REM ============================================================

setlocal

REM --- Chemin racine du projet ---
set PROJECT_ROOT=%~dp0..
set UPLOADS_DIR=%PROJECT_ROOT%\back-end\uploads
set EXPORTS_DIR=%PROJECT_ROOT%\back-end\exports

echo.
echo  ==========================================
echo   Restauration des documents et fichiers
echo  ==========================================
echo.
echo  ATTENTION : Cette operation va ECRASER les fichiers actuels !
echo.

REM --- Dossier de sauvegarde à restaurer ---
if "%~1"=="" (
    set /p BACKUP_PATH=Chemin du dossier de sauvegarde : 
) else (
    set BACKUP_PATH=%~1
)

if not exist "%BACKUP_PATH%" (
    echo  [ERREUR] Dossier introuvable : %BACKUP_PATH%
    echo.
    pause
    exit /b 1
)

echo  Dossier selectionne : %BACKUP_PATH%
echo.
set /p CONFIRM=Confirmer la restauration ? (oui/non) : 
if /i not "%CONFIRM%"=="oui" (
    echo  Restauration annulee.
    pause
    exit /b 0
)

REM --- Restauration uploads ---
if exist "%BACKUP_PATH%\uploads" (
    echo  Restauration du dossier uploads...
    if exist "%UPLOADS_DIR%" (
        rmdir /s /q "%UPLOADS_DIR%"
    )
    xcopy "%BACKUP_PATH%\uploads" "%UPLOADS_DIR%\" /E /I /Q /Y
    echo  [OK] uploads restaure
) else (
    echo  [INFO] Dossier uploads introuvable dans la sauvegarde
)

REM --- Restauration exports ---
if exist "%BACKUP_PATH%\exports" (
    echo  Restauration du dossier exports...
    if exist "%EXPORTS_DIR%" (
        rmdir /s /q "%EXPORTS_DIR%"
    )
    xcopy "%BACKUP_PATH%\exports" "%EXPORTS_DIR%\" /E /I /Q /Y
    echo  [OK] exports restaure
) else (
    echo  [INFO] Dossier exports introuvable dans la sauvegarde
)

echo.
echo  Restauration terminee avec succes !
echo.
pause
endlocal