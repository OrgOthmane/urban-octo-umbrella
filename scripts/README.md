# Système de Sauvegarde et Restauration

Documentation complète du système de sauvegarde et restauration pour le Système de Gestion du Courrier Administratif.

## 📋 Vue d'ensemble

Le système de sauvegarde inclut :
- Sauvegarde de la base de données MySQL
- Sauvegarde des documents uploadés (uploads/)
- Sauvegarde des exports PDF générés (exports/)
- Scripts pour Windows (.bat) et Linux (.sh)
- Restauration complète de la base de données et des documents

## 🗂️ Structure des sauvegardes

```
backups/
├── database/                    # Sauvegardes de la base de données
│   └── sys_courrier_20260925_150000.sql
└── documents/                   # Sauvegardes des fichiers
    └── documents_20260925_150000/
        ├── uploads/            # Documents uploadés par les utilisateurs
        └── exports/            # PDF générés par le système
```

## 💾 Scripts de Sauvegarde

### Windows (.bat)

#### Sauvegarde de la base de données
```batch
scripts\backup_database.bat
```

- Demande le mot de passe MySQL
- Crée un fichier SQL horodaté dans `backups/database/`
- Inclut : structure, données, routines, triggers, events
- Utilise `--single-transaction` pour éviter les blocages

#### Sauvegarde des documents
```batch
scripts\backup_documents.bat
```

- Copie le dossier `back-end/uploads/`
- Copie le dossier `back-end/exports/`
- Crée une archive horodatée dans `backups/documents/`

### Linux/Mac (.sh)

#### Sauvegarde de la base de données
```bash
./scripts/backup_database.sh
```

- Demande le mot de passe MySQL
- Crée un fichier SQL horodaté dans `backups/database/`
- Même fonctionnalité que la version Windows

#### Sauvegarde des documents
```bash
./scripts/backup_documents.sh
```

- Copie les dossiers `back-end/uploads/` et `back-end/exports/`
- Crée une archive horodatée dans `backups/documents/`

## 🔄 Scripts de Restauration

### Windows (.bat)

#### Restauration de la base de données
```batch
scripts\restore_database.bat [chemin_fichier.sql]
```

- Demande confirmation avant restauration
- ÉCRASE toutes les données actuelles
- Utilise le fichier SQL spécifié ou demande le chemin

#### Restauration des documents
```batch
scripts\restore_documents.bat [chemin_dossier_backup]
```

- Demande confirmation avant restauration
- ÉCRASE tous les fichiers actuels
- Restaure uploads/ et exports/ depuis l'archive

### Linux/Mac (.sh)

#### Restauration de la base de données
```bash
./scripts/restore_database.sh [chemin_fichier.sql]
```

- Même fonctionnalité que la version Windows
- Demande confirmation et mot de passe

#### Restauration des documents
```bash
./scripts/restore_documents.sh [chemin_dossier_backup]
```

- Même fonctionnalité que la version Windows
- Demande confirmation avant restauration

## ⚙️ Configuration

### Configuration de la base de données

Les scripts utilisent les paramètres suivants (modifiables dans les scripts) :

```batch
DB_HOST=localhost
DB_PORT=3306
DB_USER=sys_courrier_app
DB_NAME=sys_courrier
```

Pour personnaliser ces paramètres, éditez les fichiers :
- `scripts/backup_database.bat` (ligne 13-16)
- `scripts/backup_database.sh` (ligne 8-11)
- `scripts/restore_database.bat` (ligne 13-16)
- `scripts/restore_database.sh` (ligne 8-11)

### Pré-requis

**Windows :**
- MySQL Server installé avec `mysqldump` dans le PATH
- Accès administrateur pour l'exécution des scripts

**Linux/Mac :**
- MySQL client installé (`mysqldump` et `mysql`)
- Permissions d'exécution sur les scripts (chmod +x)

## 📅 Automatisation des Sauvegardes

### Windows (Tâche planifiée)

1. Ouvrir "Planificateur de tâches"
2. Créer une tâche de base
3. Déclencheur : quotidien à une heure spécifique
4. Action : Démarrer un programme
   - Programme : `C:\chemin\vers\scripts\backup_database.bat`
   - Démarrer dans : `C:\chemin\vers\scripts\`

### Linux (Cron)

**Sauvegarde quotidienne à 2h du matin :**
```bash
# Éditer crontab
crontab -e

# Ajouter les lignes suivantes
0 2 * * * /chemin/vers/scripts/backup_database.sh >> /var/log/backup_courrier.log 2>&1
0 2 * * * /chemin/vers/scripts/backup_documents.sh >> /var/log/backup_courrier.log 2>&1
```

**Sauvegarde hebdomadaire le dimanche à 3h :**
```bash
0 3 * * 0 /chemin/vers/scripts/backup_database.sh >> /var/log/backup_courrier.log 2>&1
0 3 * * 0 /chemin/vers/scripts/backup_documents.sh >> /var/log/backup_courrier.log 2>&1
```

### Stockage des mots de passe (pour automatisation)

Pour éviter de demander le mot de passe à chaque exécution automatisée :

**Windows :**
Créer un fichier `.my.cnf` dans le répertoire utilisateur :
```ini
[client]
user=sys_courrier_app
password=votre_mot_de_passe
```

**Linux :**
Créer un fichier `~/.my.cnf` :
```ini
[client]
user=sys_courrier_app
password=votre_mot_de_passe
```

Modifier les scripts pour ne plus demander le mot de passe s'il est déjà configuré.

## 🗜️ Compression des Sauvegardes

### Windows (7-Zip)

Pour compresser les sauvegardes automatiquement :

**Dans `backup_database.bat` (lignes 60-64) :**
```batch
"C:\Program Files\7-Zip\7z.exe" a -tzip "%FILENAME%.zip" "%FILENAME%"
del "%FILENAME%"
echo  [OK] Fichier compresse : %FILENAME%.zip
```

**Dans `backup_documents.bat` (lignes 45-48) :**
```batch
"C:\Program Files\7-Zip\7z.exe" a -tzip "%BACKUP_DIR%\%ARCHIVE_NAME%.zip" "%BACKUP_DIR%\%ARCHIVE_NAME%\"
rmdir /s /q "%BACKUP_DIR%\%ARCHIVE_NAME%\"
echo  [OK] Archive compresse : %BACKUP_DIR%\%ARCHIVE_NAME%.zip
```

### Linux (gzip/tar)

**Dans `backup_database.sh` (lignes 55-57) :**
```bash
gzip "$FILENAME"
echo "[OK] Fichier compressé : $FILENAME.gz"
```

**Dans `backup_documents.sh` (lignes 48-52) :**
```bash
cd "$BACKUP_DIR"
tar -czf "${ARCHIVE_NAME}.tar.gz" "$ARCHIVE_NAME"
rm -rf "$ARCHIVE_NAME"
echo "[OK] Archive compressée : ${ARCHIVE_NAME}.tar.gz"
```

## 🔄 Rotation des Sauvegardes

Pour garder uniquement les N dernières sauvegardes :

### Windows (PowerShell)
```powershell
# Garder les 7 derniers fichiers SQL
Get-ChildItem "backups\database\*.sql" | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -Skip 7 | 
    Remove-Item
```

### Linux
```bash
# Garder les 7 derniers fichiers SQL
cd backups/database
ls -t sys_courrier_*.sql | tail -n +8 | xargs rm -f

# Garder les 7 dernières archives de documents
cd ../documents
ls -td documents_* | tail -n +8 | xargs rm -rf
```

## 🔍 Vérification des Sauvegardes

### Vérifier l'intégrité d'une sauvegarde SQL
```bash
# Vérifier que le fichier SQL est valide
mysql --check-only-error sys_courrier < backup_file.sql
```

### Tester une restauration sur une base de test
```bash
# Créer une base de test
mysql -u root -p -e "CREATE DATABASE sys_courrier_test;"

# Restaurer dans la base de test
mysql -u sys_courrier_app -p sys_courrier_test < backup_file.sql

# Vérifier les données
mysql -u sys_courrier_app -p sys_courrier_test -e "SELECT COUNT(*) FROM courriers;"
```

## 📊 Monitoring et Alertes

### Journaliser les opérations de sauvegarde

**Windows :**
```batch
>> "%BACKUP_DIR%\backup.log" echo [%DATE% %TIME%] Sauvegarde terminée
```

**Linux :**
```bash
echo "[$(date)] Sauvegarde terminée" >> /var/log/backup_courrier.log
```

### Alertes en cas d'échec

Utiliser des outils de monitoring comme :
- **Windows** : Task Scheduler avec envoi d'email en cas d'échec
- **Linux** : Cron avec envoi d'email ou intégration avec Nagios/Zabbix

## ⚠️ Bonnes Pratiques

1. **Fréquence des sauvegardes** : Quotidienne minimum
2. **Stockage** : Conserver les sauvegardes sur un serveur différent
3. **Test** : Tester régulièrement les restaurations
4. **Documentation** : Documenter la procédure de restauration
5. **Sécurité** : Chiffrer les sauvegardes contenant des données sensibles
6. **Espace disque** : Surveiller l'espace disponible et faire des rotations
7. **Rétention** : Définir une politique de rétention (ex: 30 jours)

## 🆘 Dépannage

### Erreur "mysqldump introuvable"
- **Windows** : Ajouter le chemin de MySQL au PATH système
- **Linux** : Installer `mysql-client` : `sudo apt-get install mysql-client`

### Erreur "Accès refusé"
- Vérifier les droits de l'utilisateur MySQL
- Vérifier que le mot de passe est correct

### Erreur "Espace disque insuffisant"
- Libérer de l'espace sur le disque
- Activer la compression des sauvegardes
- Configurer la rotation des sauvegardes

### Restauration échoue
- Vérifier l'intégrité du fichier SQL
- Vérifier que la base de données existe
- Vérifier les droits de l'utilisateur MySQL

## 📞 Support

Pour toute question ou problème avec le système de sauvegarde :
- Vérifier les logs dans `backups/backup.log`
- Consulter la documentation MySQL pour `mysqldump` et `mysql`
- Tester manuellement les commandes avant l'automatisation