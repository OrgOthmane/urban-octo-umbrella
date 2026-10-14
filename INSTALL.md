# INSTALL.md — Guide d'installation et de livraison

**Application de Gestion du Courrier Administratif**
Backend Flask (Python) + Frontend React (Vite) + Base de données MySQL/MariaDB.

> Ce guide est basé sur la configuration **réelle** du projet. Toutes les commandes
> et tous les chemins indiqués correspondent aux fichiers présents dans le dépôt.

---

## 1. Prérequis

| Composant        | Version recommandée            | Vérification            |
|------------------|--------------------------------|-------------------------|
| **Python**       | 3.11 ou supérieur (testé 3.11.9)| `python --version`      |
| **Node.js**      | 20 LTS ou supérieur            | `node --version`        |
| **npm**          | fourni avec Node.js            | `npm --version`         |
| **MySQL/MariaDB**| MySQL 8.x / MariaDB 10.x (XAMPP convient) | `mysql --version` |

Dépendances Python principales (voir `back-end/requirements.txt`) :
Flask 3.0.0, Flask-CORS 6.0.2, Flask-JWT-Extended 4.7.4, Flask-Limiter 4.1.1,
mysql-connector-python 9.2.0, bcrypt 5.0.0, python-dotenv 1.0.0, fpdf2 2.8.7,
APScheduler 3.10.4.

Le frontend utilise Vite 6.4.2 et React 18.3.1 (voir `Front-end/package.json`).

---

## 2. Installation de MySQL

Option la plus simple sous Windows : installer **XAMPP** (ou **MariaDB** seul),
puis démarrer le service **MySQL** depuis le panneau de contrôle XAMPP.

Vérifier que le serveur répond :

```bash
mysql -u root -p
```

> Notez l'**hôte** (par défaut `127.0.0.1`), le **port** (par défaut `3306`),
> l'**utilisateur** et le **mot de passe** MySQL : ils serviront au fichier `.env` backend.

---

## 3. Création / import de la base de données

Le schéma complet se trouve dans **`database.sql`** à la racine du projet.
Ce script **crée la base `sys_courrier`** (jeu de caractères `utf8mb4`),
toutes les tables, puis les données initiales (types de courrier, tiers,
divisions/services et comptes par défaut).

> ⚠️ **AVERTISSEMENT** : `database.sql` commence par `DROP DATABASE IF EXISTS sys_courrier;`.
> Son import **supprime toute base `sys_courrier` existante** et ses données.
> Ne l'exécutez sur un serveur contenant déjà des données réelles qu'après sauvegarde
> (voir `scripts/README.md`).

**Méthode 1 — Ligne de commande :**

```bash
mysql -u root -p < database.sql
```

**Méthode 2 — phpMyAdmin (XAMPP) :**
1. Ouvrir http://localhost/phpmyadmin
2. Onglet **Importer**
3. Choisir le fichier `database.sql`
4. Cliquer sur **Exécuter**

Après l'import, la base **`sys_courrier`** existe et contient les tables
(`utilisateurs`, `courriers`, `documents`, `bo_courriers`, `bo_documents`, etc.).

---

## 4. Configuration du backend (`.env`)

1. Aller dans le dossier `back-end/`.
2. Copier le fichier modèle `.env.example` vers `.env` :

   ```bash
   cd back-end
   cp .env.example .env        # Linux/macOS
   copy .env.example .env      # Windows (cmd)
   ```

3. Éditer `back-end/.env` et renseigner les valeurs réelles :

   ```env
   # Connexion MySQL
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=votre_utilisateur_mysql
   DB_PASSWORD=votre_mot_de_passe_mysql
   DB_NAME=sys_courrier

   # Sécurité (OBLIGATOIRE — voir section 5)
   SECRET_KEY=<cle_genereree_64_caracteres_hex>

   # Jetons de session (durée en heures)
   JWT_ACCESS_TOKEN_EXPIRES_HOURS=9

   # Mode d'exécution — LAISSER false POUR LA LIVRAISON
   FLASK_DEBUG=false

   # Protection anti brute-force du /login (10 tentatives/minute)
   RATELIMIT_ENABLED=true

   # Origine frontend autorisée (CORS) — doit correspondre au port du frontend
   FRONTEND_URL=http://localhost:5174

   # Fichier de log rotatif (optionnel) — laisser commenté pour logger sur la console
   # LOG_FILE=logs/app.log
   ```

> L'application **refuse de démarrer** si `SECRET_KEY` est absente, générique
> (ex. `CHANGE_THIS`, `EXAMPLE`, `PLACEHOLDER`…) ou plus courte que 16 caractères.

4. Installer les dépendances Python (idéalement dans un environnement virtuel) :

   ```bash
   python -m venv venv
   venv\Scripts\activate          # Windows
   # source venv/bin/activate     # Linux/macOS
   pip install -r requirements.txt
   ```

---

## 5. Génération du `SECRET_KEY`

Le `SECRET_KEY` signe les jetons JWT. Il doit être **unique, aléatoire et secret**.
Générez-le avec la commande suivante (déjà documentée dans `.env.example`) :

```bash
python -c "import secrets; print(secrets.token_hex(64))"
```

Copiez la valeur affichée (128 caractères hexadécimaux) dans `back-end/.env` :

```env
SECRET_KEY=collez_ici_la_valeur_generee
```

> Ne réutilisez jamais une clé provenant d'un autre environnement ou d'un exemple.

---

## 6. Configuration du frontend (`.env`)

1. Aller dans le dossier `Front-end/`.
2. Copier `.env.example` vers `.env` :

   ```bash
   cd Front-end
   cp .env.example .env          # Linux/macOS
   copy .env.example .env        # Windows (cmd)
   ```

3. Renseigner l'URL du backend dans `Front-end/.env` :

   ```env
   VITE_API_BASE_URL=http://127.0.0.1:5000
   ```

> ⚠️ **Important** : cette variable est lue par `Front-end/src/services/api.js`
> et est **intégrée au moment du build** (`npm run build`). Elle doit donc être
> correcte **avant** de générer le build de production.

---

## 7. Lancement du backend

**En développement / production locale :**

```bash
cd back-end
python app.py
```

Le serveur démarre sur **`http://0.0.0.0:5000`** (port **5000**).
Avec `FLASK_DEBUG=false`, le message `Démarrage en mode production` s'affiche.

**En production avec Gunicorn** (recommandé pour un serveur) :

```bash
cd back-end
gunicorn -c gunicorn_config.py app:app
```

`gunicorn_config.py` force déjà `FLASK_DEBUG=false` et écoute sur `0.0.0.0:5000`.
Un fichier `nginx.conf` est fourni à titre d'exemple pour un reverse proxy.

---

## 8. Lancement du frontend

**Mode développement (serveur Vite avec rechargement à chaud) :**

```bash
cd Front-end
npm install
npm run dev
```

L'application est accessible sur **`http://localhost:5174`** (port défini dans
`Front-end/vite.config.js`).

**Mode production (build statique) :**

```bash
cd Front-end
npm run build
```

Le build est généré dans **`Front-end/dist/`**. Servez ce dossier avec n'importe
quel serveur statique (Nginx, Apache, `serve`, etc.) en prévoyant un **fallback
SPA** (toutes les routes renvoient vers `index.html`).

> Vérifiez que `VITE_API_BASE_URL` pointe bien vers le backend accessible depuis
> le navigateur, et que `FRONTEND_URL` (CORS backend) correspond à l'origine
> réelle depuis laquelle le frontend est servi.

---

## 9. Comptes par défaut

L'import de `database.sql` crée **4 comptes par défaut** (table `utilisateurs`) :

| Identité (login) | Rôle                        | Division / Service          |
|------------------|-----------------------------|-----------------------------|
| `Oamartini`      | Chef de division            | Division 1                  |
| `Alhyani`        | Chef de service             | Division 1 / Service 1      |
| `Slimbarki`      | Agent                       | Division 1 / Service 1      |
| `Aelamrani`      | Agent du Bureau d'Ordre     | —                           |

Ces 4 comptes partagent **un même mot de passe initial** (défini lors de la
génération de la base). Le mot de passe en clair n'est **pas** stocké dans le
projet (seule son empreinte bcrypt est en base) : il est **communiqué séparément
par l'intégrateur** lors de la livraison.

### 🔒 OBLIGATION : changer les mots de passe après installation

> **Immédiatement après l'installation, le client DOIT changer le mot de passe de
> chacun des 4 comptes par défaut.** Conserver le mot de passe initial partagé
> constitue un **risque de sécurité majeur**.

**Méthode recommandée (dans l'application) :**
1. Se connecter avec le compte **Chef de division** (`Oamartini`).
2. Ouvrir le menu **Utilisateurs**.
3. Pour chaque compte, cliquer sur **Modifier** et saisir un **nouveau mot de passe**.
4. Enregistrer. (Le backend hache automatiquement le nouveau mot de passe avec bcrypt.)

> La modification des utilisateurs (dont le mot de passe) est **réservée au rôle
> Chef de division** (route `PUT /utilisateurs/<id>`).

**Méthode de secours (si le mot de passe initial est inconnu) — via SQL :**

```bash
# 1. Générer une nouvelle empreinte bcrypt
python -c "import bcrypt; print(bcrypt.hashpw(b'NouveauMotDePasseFort', bcrypt.gensalt()).decode())"

# 2. Mettre à jour le compte concerné (exemple pour Oamartini)
mysql -u root -p sys_courrier -e "UPDATE utilisateurs SET mot_de_passe='<empreinte_collee>' WHERE identite='Oamartini';"
```

Répéter l'opération pour chaque compte, avec un mot de passe **différent** et robuste.

---

## 10. Paramètres importants (rappel)

| Variable (backend `.env`)        | Valeur de livraison | Rôle                                             |
|----------------------------------|---------------------|--------------------------------------------------|
| `FLASK_DEBUG`                    | **`false`**         | Désactive le debugger Werkzeug. `true` = dev uniquement. |
| `RATELIMIT_ENABLED`              | **`true`**          | Limite `/login` à 10 tentatives/minute (anti brute-force). |
| `SECRET_KEY`                     | clé forte unique    | Signature des jetons JWT (obligatoire).          |
| `JWT_ACCESS_TOKEN_EXPIRES_HOURS` | `9`                 | Durée de validité d'une session connectée.       |
| `FRONTEND_URL`                   | origine du frontend | Origine autorisée par Flask-CORS.                |
| `DB_*`                           | selon votre MySQL   | Connexion à la base `sys_courrier`.              |

Côté frontend (`Front-end/.env`) : `VITE_API_BASE_URL` doit pointer vers le backend.

---

## 11. Fichiers / dossiers à NE PAS livrer

Les éléments suivants ne doivent **jamais** faire partie du package remis au client :

- **`back-end/.env`** et **`Front-end/.env`** — contiennent des secrets réels
  (`DB_PASSWORD`, `SECRET_KEY`, et `FLASK_DEBUG=true` en développement).
  → Le client recrée ses `.env` à partir des `.env.example`.
- **`Front-end/node_modules/`** — dépendances reinstallées via `npm install`.
- **`back-end/__pycache__/`** (et tout `__pycache__/`) — caches Python.
- **`back-end/venv/`** — environnement virtuel Python.
- **`.git/`** — historique du dépôt.
- Fichiers temporaires / de test éventuels dans `back-end/uploads/`,
  `back-end/uploads/bo/` et `back-end/exports/` **non liés à des données réelles**
  (à valider au cas par cas avant suppression — ne rien supprimer sans certitude).

**À inclure** : le code `back-end/` et `Front-end/src/`, les `.env.example`,
`requirements.txt`, `package.json`, `database.sql`, `gunicorn_config.py`,
`nginx.conf` (exemple), `logger_config.py`, `limiter_ext.py`, les scripts
(`scripts/`) et la documentation (`AGENTS.md`, `INSTALL.md`).
Le dossier `Front-end/dist/` peut être livré si vous fournissez un build prêt à servir.

> Le `.gitignore` du projet exclut déjà `.env`, `node_modules`, `__pycache__`,
> `back-end/uploads/` et `back-end/exports/`.

---

## 12. Vérification après installation

Effectuez ces contrôles dans l'ordre :

1. **Base de données** : la base `sys_courrier` existe et contient les tables
   (`SHOW TABLES;` dans MySQL). Les 4 comptes par défaut sont présents.
2. **Backend** : `python app.py` démarre **sans erreur** et affiche
   `Démarrage en mode production (FLASK_DEBUG=false)`,
   `Flask-Limiter ACTIVÉ ... /login limité à 10/min`, et `Connexion MySQL OK`
   (via `python db.py`).
3. **Frontend** : `npm run dev` démarre et la page se charge sur
   `http://localhost:5174` sans erreur dans la console du navigateur.
4. **Connexion** : se connecter avec un compte (après changement de mot de passe).
   Un jeton JWT est délivré et les données s'affichent.
5. **Rate limiting** : après 10 tentatives de connexion erronées en moins d'une
   minute, le backend renvoie **HTTP 429** (Trop de requêtes).
6. **Rôles** : vérifier que chaque rôle (Chef de division, Chef de service, Agent,
   Bureau d'Ordre) accède uniquement à son périmètre.
7. **Fonctionnalités clés** : création / modification / archivage d'un courrier,
   upload et téléchargement d'une pièce jointe (≤ 10 MB), export PDF, recherche,
   statistiques du tableau de bord, notifications.
8. **CORS** : aucune erreur CORS dans la console navigateur (le `FRONTEND_URL`
   backend correspond à l'origine du frontend).

Si toutes ces étapes passent, l'installation est opérationnelle.

---

*Document généré à partir de la configuration réelle du projet
(`back-end/.env.example`, `Front-end/.env.example`, `Front-end/vite.config.js`,
`Front-end/package.json`, `back-end/requirements.txt`, `back-end/gunicorn_config.py`,
`database.sql`, `back-end/routes/auth.py`, `back-end/routes/users.py`).*
