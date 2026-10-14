#!/bin/bash
# ============================================================
#  restore_database.sh — Restauration de la base de données
#  Système de Gestion du Courrier Administratif
# ============================================================
#  Usage : ./restore_database.sh [chemin_du_fichier.sql]
#  Exemple : ./restore_database.sh ../backups/database/sys_courrier_20260903.sql
# ============================================================

# --- Configuration ---
DB_HOST="localhost"
DB_PORT="3306"
DB_USER="sys_courrier_app"
DB_NAME="sys_courrier"

echo ""
echo "========================================="
echo "Restauration base de données sys_courrier"
echo "========================================="
echo ""
echo "ATTENTION : Cette opération va ÉCRASER les données actuelles !"
echo ""

# --- Fichier SQL à restaurer ---
if [ -z "$1" ]; then
    read -p "Chemin du fichier SQL à restaurer : " SQL_FILE
else
    SQL_FILE="$1"
fi

if [ ! -f "$SQL_FILE" ]; then
    echo "[ERREUR] Fichier introuvable : $SQL_FILE"
    echo ""
    exit 1
fi

echo "Fichier sélectionné : $SQL_FILE"
echo ""
read -p "Confirmer la restauration ? (oui/non) : " CONFIRM
if [ "$CONFIRM" != "oui" ]; then
    echo "Restauration annulée."
    exit 0
fi

read -sp "Entrez le mot de passe MySQL pour [$DB_USER] : " DB_PASSWORD
echo ""

echo ""
echo "Restauration en cours..."
mysql --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" --password="$DB_PASSWORD" \
  "$DB_NAME" < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "[OK] Restauration réussie !"
    echo "La base de données $DB_NAME a été restaurée depuis :"
    echo "$SQL_FILE"
else
    echo ""
    echo "[ERREUR] La restauration a échoué. Vérifiez :"
    echo "- Le mot de passe MySQL"
    echo "- La connexion au serveur MySQL ($DB_HOST:$DB_PORT)"
    echo "- L'intégrité du fichier SQL"
fi

echo ""