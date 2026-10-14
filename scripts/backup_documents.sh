#!/bin/bash
# ============================================================
#  backup_documents.sh — Sauvegarde des fichiers uploadés
#  Système de Gestion du Courrier Administratif
# ============================================================

# --- Chemin racine du projet ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
UPLOADS_DIR="$PROJECT_ROOT/back-end/uploads"
EXPORTS_DIR="$PROJECT_ROOT/back-end/exports"
BACKUP_DIR="$PROJECT_ROOT/backups/documents"

mkdir -p "$BACKUP_DIR"

# --- Horodatage ---
DATE_TAG=$(date +%Y%m%d)
TIME_TAG=$(date +%H%M%S)
ARCHIVE_NAME="documents_${DATE_TAG}_${TIME_TAG}"

echo ""
echo "============================================"
echo "Sauvegarde des documents et fichiers uploadés"
echo "============================================"
echo ""

# --- Sauvegarde uploads ---
if [ -d "$UPLOADS_DIR" ]; then
    echo "Copie du dossier uploads..."
    cp -r "$UPLOADS_DIR" "$BACKUP_DIR/$ARCHIVE_NAME/uploads"
    echo "[OK] uploads copié"
else
    echo "[INFO] Dossier uploads introuvable : $UPLOADS_DIR"
fi

# --- Sauvegarde exports PDF ---
if [ -d "$EXPORTS_DIR" ]; then
    echo "Copie du dossier exports..."
    cp -r "$EXPORTS_DIR" "$BACKUP_DIR/$ARCHIVE_NAME/exports"
    echo "[OK] exports copié"
else
    echo "[INFO] Dossier exports introuvable : $EXPORTS_DIR"
fi

# --- Compression optionnelle ---
# Pour compresser en tar.gz :
# cd "$BACKUP_DIR"
# tar -czf "${ARCHIVE_NAME}.tar.gz" "$ARCHIVE_NAME"
# rm -rf "$ARCHIVE_NAME"
# echo "[OK] Archive compressée : ${ARCHIVE_NAME}.tar.gz"

echo ""
echo "Sauvegarde terminée dans : $BACKUP_DIR/$ARCHIVE_NAME/"
echo ""