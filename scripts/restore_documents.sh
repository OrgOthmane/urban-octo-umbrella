#!/bin/bash
# ============================================================
#  restore_documents.sh — Restauration des fichiers uploadés
#  Système de Gestion du Courrier Administratif
# ============================================================
#  Usage : ./restore_documents.sh [chemin_du_dossier_backup]
#  Exemple : ./restore_documents.sh ../backups/documents/documents_20260903_150000
# ============================================================

# --- Chemin racine du projet ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR/.."
UPLOADS_DIR="$PROJECT_ROOT/back-end/uploads"
EXPORTS_DIR="$PROJECT_ROOT/back-end/exports"

echo ""
echo "========================================="
echo "Restauration des documents et fichiers"
echo "========================================="
echo ""
echo "ATTENTION : Cette opération va ÉCRASER les fichiers actuels !"
echo ""

# --- Dossier de sauvegarde à restaurer ---
if [ -z "$1" ]; then
    read -p "Chemin du dossier de sauvegarde : " BACKUP_PATH
else
    BACKUP_PATH="$1"
fi

if [ ! -d "$BACKUP_PATH" ]; then
    echo "[ERREUR] Dossier introuvable : $BACKUP_PATH"
    echo ""
    exit 1
fi

echo "Dossier sélectionné : $BACKUP_PATH"
echo ""
read -p "Confirmer la restauration ? (oui/non) : " CONFIRM
if [ "$CONFIRM" != "oui" ]; then
    echo "Restauration annulée."
    exit 0
fi

# --- Restauration uploads ---
if [ -d "$BACKUP_PATH/uploads" ]; then
    echo "Restauration du dossier uploads..."
    if [ -d "$UPLOADS_DIR" ]; then
        rm -rf "$UPLOADS_DIR"
    fi
    cp -r "$BACKUP_PATH/uploads" "$UPLOADS_DIR"
    echo "[OK] uploads restauré"
else
    echo "[INFO] Dossier uploads introuvable dans la sauvegarde"
fi

# --- Restauration exports ---
if [ -d "$BACKUP_PATH/exports" ]; then
    echo "Restauration du dossier exports..."
    if [ -d "$EXPORTS_DIR" ]; then
        rm -rf "$EXPORTS_DIR"
    fi
    cp -r "$BACKUP_PATH/exports" "$EXPORTS_DIR"
    echo "[OK] exports restauré"
else
    echo "[INFO] Dossier exports introuvable dans la sauvegarde"
fi

echo ""
echo "Restauration terminée avec succès !"
echo ""