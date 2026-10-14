#!/bin/bash
# ============================================================
#  backup_database.sh — Sauvegarde de la base de données
#  Système de Gestion du Courrier Administratif
# ============================================================
#  Usage : ./backup_database.sh
#  Pré-requis : mysqldump doit être installé
# ============================================================

# --- Configuration ---
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="sys_courrier_app"
DB_NAME="sys_courrier"

# --- Dossier de destination des sauvegardes ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$SCRIPT_DIR/../backups/database"
mkdir -p "$BACKUP_DIR"

# --- Nom du fichier avec horodatage ---
DATE_TAG=$(date +%Y%m%d)
TIME_TAG=$(date +%H%M%S)
FILENAME="$BACKUP_DIR/sys_courrier_${DATE_TAG}_${TIME_TAG}.sql"

echo ""
echo "========================================"
echo "Sauvegarde base de données sys_courrier"
echo "========================================"
echo ""

# --- Demander le mot de passe ---
read -sp "Entrez le mot de passe MySQL pour [$DB_USER] : " DB_PASSWORD
echo ""

# --- Exécuter mysqldump ---
echo "Sauvegarde en cours..."
mysqldump --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASSWORD" \
  --single-transaction --routines --triggers --events \
  --add-drop-table --complete-insert \
  "$DB_NAME" > "$FILENAME"

if [ $? -eq 0 ]; then
    echo ""
    echo "[OK] Sauvegarde réussie !"
    echo "Fichier : $FILENAME"
    echo ""
    # Vérifier la taille du fichier
    FILE_SIZE=$(stat -f%z "$FILENAME" 2>/dev/null || stat -c%s "$FILENAME" 2>/dev/null)
    echo "Taille  : $FILE_SIZE octets"
    
    # --- Compression optionnelle ---
    # Pour compresser en gzip :
    # gzip "$FILENAME"
    # echo "[OK] Fichier compressé : $FILENAME.gz"
else
    echo ""
    echo "[ERREUR] La sauvegarde a échoué. Vérifiez :"
    echo "- Le mot de passe MySQL"
    echo "- La connexion au serveur MySQL ($DB_HOST:$DB_PORT)"
    echo "- Les droits de l'utilisateur $DB_USER"
    rm -f "$FILENAME"
fi

echo ""