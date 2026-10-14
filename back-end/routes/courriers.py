from flask import Blueprint, request, jsonify, send_file
from db import get_connection
import logging
import os
import time
import json
import hashlib
from werkzeug.utils import secure_filename
from routes.auth_helpers import (
    auth_required, get_current_user,
    refus_si_perimetre_manquant,
    ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT,
)
from logger_config import get_logger

courriers_bp = Blueprint('courriers', __name__)
logger = get_logger(__name__)

# Chemins robustes basés sur __file__ (et non os.getcwd()) : le backend peut être
# démarré depuis n'importe quel répertoire (gunicorn, service Windows, autre cwd)
# sans que les chemins d'upload/export ne deviennent invalides.
# BASE_DIR = dossier back-end/ (parent du package routes/).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads")
EXPORT_FOLDER = os.path.join(BASE_DIR, "exports")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(EXPORT_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png', 'txt'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB — cohérent avec le Bureau d'Ordre

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def _check_file_size(file):
    """Vérifie que la taille du fichier ne dépasse pas MAX_FILE_SIZE (10 MB).
    Même logique que bureau_ordre._check_file_size pour rester cohérent."""
    file.seek(0, 2)   # aller à la fin
    size = file.tell()
    file.seek(0)      # revenir au début
    return size <= MAX_FILE_SIZE


# Chemin réel (symlinks résolus) du dossier des pièces jointes. Sert au
# confinement des lectures : `documents.chemin_stockage` est une colonne libre
# en base, un enregistrement corrompu ou écrit à la main pourrait pointer hors
# de uploads/ et faire lire n'importe quel fichier du serveur (dont .env, qui
# contient SECRET_KEY → falsification de JWT → reprise de contrôle totale).
_UPLOAD_FOLDER_REAL = os.path.realpath(UPLOAD_FOLDER)


def _safe_upload_path(raw_path):
    """Retourne le chemin réel s'il est strictement contenu dans uploads/, sinon None.

    `os.path.realpath` neutralise les `..` et les liens symboliques ; la
    comparaison avec le séparateur (`os.sep`) évite la confusion de préfixe
    (`uploads` vs `uploads_evil`).
    """
    if not raw_path:
        return None
    try:
        candidate = os.path.realpath(str(raw_path))
    except (TypeError, ValueError, OSError):
        return None
    if candidate != _UPLOAD_FOLDER_REAL and not candidate.startswith(_UPLOAD_FOLDER_REAL + os.sep):
        return None
    return candidate


def _load_courrier_for_access(cursor, courrier_id):
    """Charge un courrier avec toutes les jointures nécessaires aux contrôles
    d'appartenance (service, division, rédacteur, statut BO, etc.).
    Compatible courrier entrant ET sortant."""
    cursor.execute(
        """SELECT c.id, c.sens, c.service_id, c.expediteur_division_id, c.destinataire_division_id,
                  c.saisi_par, c.bo_courrier_id, bc.statut AS bo_statut,
                  u.service_id AS redacteur_service_id,
                  rep.service_id AS reponse_courrier_service_id,
                  s.division_id AS service_division_id
           FROM courriers c
           LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
           LEFT JOIN utilisateurs u ON c.saisi_par = u.id
           LEFT JOIN courriers rep ON c.reponse_a_id = rep.id
           LEFT JOIN services s ON c.service_id = s.id
           WHERE c.id = %s""",
        (int(courrier_id),),
    )
    return cursor.fetchone()


def can_access_courrier(user, courrier, *, require_write=False):
    """Vérifie l'appartenance (ownership) d'un utilisateur à un courrier.

    Paramètres:
      user: dict avec role, service_id, division_id, id (get_current_user())
      courrier: dict avec champs issus de _load_courrier_for_access()
      require_write: ignoré (même logique lecture/écriture pour les contrôles
                     d'appartenance métier — la distinction se fait via
                     @roles_required pour les actions réservées)
    Retourne: True si accès autorisé, False sinon.
    """
    if not user or not courrier:
        return False
    role = user.get("role")
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    user_id = user.get("id")

    _bo_id = courrier.get('bo_courrier_id')
    _bo_statut = courrier.get('bo_statut')
    _bo_visible = (
        _bo_id is None
        or _bo_statut in ('Affecté au service', 'Traité')
    )

    # Bureau d'Ordre → accès global aux courriers liés aux BO (aucune restriction
    # d'appartenance au-delà de @roles_required)
    if role == "Agent du Bureau d'Ordre":
        return True

    if role in (ROLE_CHEF_SERVICE, ROLE_AGENT) and service_id:
        # Pour les sortants : même contrôle que archive_courrier_sortant (service du
        # courrier, service du rédacteur, service du courrier parent « réponse à »).
        # Pour les entrants : service du courrier SI visible par BO + auteur.
        _autorise_sortant = (
            courrier.get('service_id') == service_id
            or courrier.get('redacteur_service_id') == service_id
            or courrier.get('reponse_courrier_service_id') == service_id
        )
        _autorise_entrant = (
            (courrier.get('service_id') == service_id and _bo_visible)
            or courrier.get('saisi_par') == user_id
        )
        if courrier.get('sens') == 'sortant':
            if role == ROLE_AGENT:
                return _autorise_sortant or courrier.get('saisi_par') == user_id
            return _autorise_sortant
        else:  # entrant
            return _autorise_entrant

    if role == ROLE_CHEF_DIVISION and division_id:
        return (
            courrier.get('expediteur_division_id') == division_id
            or courrier.get('destinataire_division_id') == division_id
            or courrier.get('service_division_id') == division_id
            or courrier.get('saisi_par') == user_id
        )

    return False


@courriers_bp.route('/documents/upload', methods=['POST'])
@auth_required
def upload_document():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    if 'fichier' not in request.files:
        return jsonify({"error": "Aucun fichier fourni"}), 400

    file = request.files['fichier']
    raw_courrier_id = request.form.get('courrier_id')

    if not raw_courrier_id:
        return jsonify({"error": "courrier_id requis"}), 400
    try:
        courrier_id = int(raw_courrier_id)
    except (TypeError, ValueError):
        return jsonify({"error": "courrier_id invalide"}), 400
    if file.filename == '':
        return jsonify({"error": "Nom de fichier vide"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Type de fichier non autorisé"}), 400
    if not _check_file_size(file):
        return jsonify({"error": f"Fichier trop volumineux (max 10 MB) : {file.filename}"}), 413

    filename = secure_filename(file.filename)
    unique_filename = f"{courrier_id}_{filename}"
    filepath = os.path.join(UPLOAD_FOLDER, unique_filename)

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # === CONTRÔLE D'ACCÈS : user doit pouvoir modifier ce courrier ===
        courrier = _load_courrier_for_access(cursor, courrier_id)
        if not courrier:
            return jsonify({"error": "Courrier introuvable"}), 404
        if not can_access_courrier(user, courrier, require_write=True):
            return jsonify({"error": "Accès non autorisé : vous ne pouvez téléverser des pièces jointes que sur les courriers de votre périmètre."}), 403

        file.save(filepath)

        taille = os.path.getsize(filepath)
        mime = file.mimetype or 'application/octet-stream'

        cursor.execute(
            "SELECT id FROM documents WHERE courrier_id = %s AND is_export = 0",
            (courrier_id,)
        )
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                """UPDATE documents
                   SET nom_fichier = %s, chemin_stockage = %s, taille_octets = %s, mime_type = %s,
                       uploaded_at = CURRENT_TIMESTAMP
                   WHERE id = %s""",
                (unique_filename, filepath, taille, mime, existing['id'])
            )
        else:
            cursor.execute(
                """INSERT INTO documents (courrier_id, nom_fichier, chemin_stockage, taille_octets, mime_type, is_export)
                   VALUES (%s, %s, %s, %s, %s, 0)""",
                (courrier_id, unique_filename, filepath, taille, mime)
            )
        conn.commit()
        logger.info(f"Fichier uploadé : {unique_filename} pour courrier_id={courrier_id}")
        return jsonify({"message": "Fichier uploadé avec succès", "nom_fichier": unique_filename}), 201

    except Exception as e:
        logger.error(f"upload_document: {e}")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_bp.route('/documents/courrier/<int:courrier_id>', methods=['GET'])
@auth_required
def get_courrier_documents(courrier_id):
    """Retourne toutes les pièces jointes (non-export) d'un courrier.
    Optimisé avec limite et vérifications de fichiers réduites."""
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # === CONTRÔLE D'ACCÈS : user doit pouvoir voir ce courrier ===
        courrier = _load_courrier_for_access(cursor, courrier_id)
        if not courrier:
            return jsonify({"error": "Courrier introuvable"}), 404
        if not can_access_courrier(user, courrier):
            return jsonify({"error": "Accès non autorisé : vous ne pouvez consulter les pièces jointes que des courriers de votre périmètre."}), 403

        cursor.execute(
            """SELECT id, nom_fichier, chemin_stockage, taille_octets, mime_type, uploaded_at
               FROM documents
               WHERE courrier_id = %s AND is_export = 0
               ORDER BY uploaded_at DESC
               LIMIT 50""",  # Limite à 50 documents par courrier
            (courrier_id,)
        )
        docs = cursor.fetchall()

        result = []
        for d in docs:
            if d.get('uploaded_at'):
                d['uploaded_at'] = str(d['uploaded_at'])

            # Vérification simplifiée du fichier - seulement si chemin est manquant
            chemin = d.get('chemin_stockage')
            if not chemin:
                nom = d.get('nom_fichier') or ''
                candidate = os.path.join(UPLOAD_FOLDER, f"{courrier_id}_{nom}")
                if os.path.exists(candidate):
                    d['taille_octets'] = os.path.getsize(candidate)
                    # Mettre à jour la BDD de manière asynchrone si possible
                    try:
                        cursor.execute(
                            "UPDATE documents SET chemin_stockage=%s, taille_octets=%s WHERE id=%s",
                            (candidate, d['taille_octets'], d['id'])
                        )
                        conn.commit()
                    except Exception:
                        pass

            # Supprimer le chemin interne avant d'envoyer au client
            d.pop('chemin_stockage', None)
            result.append(d)

        return jsonify(result)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_bp.route('/documents/download/<path:nom_fichier>', methods=['GET'])
@auth_required
def download_document(nom_fichier):
    """Télécharge un fichier joint par son nom.

    Deux provenances possibles :
      1. `documents`  → pièce jointe « classique » du module Courrier
                        (physiquement uploads/<courrier_id>_<nom>) ;
      2. `bo_documents` → pièce jointe saisie au Bureau d'Ordre
                        (physiquement uploads/bo/bo_<bo_courrier_id>_<nom>).

    Les listes de courriers entrants exposent le nom de la pièce jointe quelle
    que soit sa provenance : sans le repli (2), un fichier BO renvoyait
    « Fichier introuvable » alors qu'il existe bien sur le disque.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, courrier_id, chemin_stockage, mime_type, nom_fichier FROM documents WHERE nom_fichier = %s AND is_export = 0",
            (nom_fichier,)
        )
        doc = cursor.fetchone()

        if not doc:
            # Fallback : chercher par nom sans préfixe courrier_id_
            cursor.execute(
                "SELECT id, courrier_id, chemin_stockage, mime_type, nom_fichier FROM documents WHERE nom_fichier LIKE %s AND is_export = 0",
                (f"%{nom_fichier}",)
            )
            doc = cursor.fetchone()

        if doc and not doc.get('courrier_id'):
            # FAIL-CLOSED : une pièce jointe orpheline (courrier_id NULL) ne peut
            # être rattachée à aucun périmètre → aucun contrôle d'accès possible.
            # Avant ce garde-fou, le contrôle ci-dessous était entièrement sauté.
            logger.warning(
                "documents.id=%s sans courrier_id : téléchargement refusé (user_id=%s)",
                doc.get('id'), user.get('id'),
            )
            return jsonify({"error": "Accès non autorisé."}), 403

        if doc:
            # === CONTRÔLE D'ACCÈS : cas table documents (classique) ===
            courrier = _load_courrier_for_access(cursor, doc['courrier_id'])
            if not courrier or not can_access_courrier(user, courrier):
                return jsonify({"error": "Accès non autorisé : vous ne pouvez télécharger que les pièces jointes des courriers de votre périmètre."}), 403

        if not doc:
            # ── Repli : pièce jointe du Bureau d'Ordre (bo_documents) ─────────
            # Import local pour éviter toute importation circulaire.
            from routes.bureau_ordre import (
                find_bo_document_by_name, can_access_bo_courrier_docs,
            )

            user_id = user.get("id")

            bo_doc, bo_path = find_bo_document_by_name(conn, cursor, nom_fichier)
            if bo_doc and bo_path:
                # Même contrôle d'accès que /bo/documents/download/<id> :
                # les règles métier de visibilité ne sont pas contournées.
                if not user_id or not can_access_bo_courrier_docs(
                        cursor, int(user_id), bo_doc["bo_courrier_id"]):
                    return jsonify({"error": "Accès refusé"}), 403

                return send_file(
                    bo_path,
                    as_attachment=True,
                    mimetype=bo_doc.get("mime_type") or 'application/octet-stream',
                    download_name=bo_doc.get("nom_fichier") or nom_fichier,
                )

            return jsonify({"error": "Fichier introuvable dans la base de données"}), 404

        filepath = doc['chemin_stockage']
        if not filepath or not os.path.exists(filepath):
            # Fallback 1 : reconstruire le chemin avec le format attendu {courrier_id}_{nom_fichier}
            courrier_id = doc.get('courrier_id')
            if courrier_id:
                # Essayer avec le nom exact depuis la base
                expected_filename = doc['nom_fichier']
                candidate = os.path.join(UPLOAD_FOLDER, expected_filename)
                if os.path.exists(candidate):
                    filepath = candidate
                    # Mettre à jour la base de données
                    cursor.execute(
                        "UPDATE documents SET chemin_stockage = %s WHERE id = %s",
                        (filepath, doc['id'])
                    )
                    conn.commit()
                else:
                    # Fallback 2 : chercher dans le dossier uploads avec le nom exact demandé
                    filepath = os.path.join(UPLOAD_FOLDER, nom_fichier)
                    if not os.path.exists(filepath):
                        # Fallback 3 : chercher un fichier se terminant par le nom demandé
                        found = None
                        if os.path.isdir(UPLOAD_FOLDER):
                            for f in os.listdir(UPLOAD_FOLDER):
                                if f.endswith(nom_fichier) and os.path.isfile(os.path.join(UPLOAD_FOLDER, f)):
                                    found = os.path.join(UPLOAD_FOLDER, f)
                                    break
                        if found:
                            filepath = found
                            # Mettre à jour la base de données
                            cursor.execute(
                                "UPDATE documents SET chemin_stockage = %s WHERE id = %s",
                                (filepath, doc['id'])
                            )
                            conn.commit()
                        else:
                            return jsonify({"error": "Fichier physique introuvable sur le serveur"}), 404
            else:
                return jsonify({"error": "Courrier ID manquant pour localiser le fichier"}), 404

        # Déterminer le nom de téléchargement (sans le préfixe courrier_id_ si présent)
        download_name = doc['nom_fichier']
        if download_name.startswith(f"{doc.get('courrier_id', '')}_"):
            download_name = download_name[len(f"{doc.get('courrier_id', '')}_"):]

        # === CONFINEMENT FINAL ===
        # Quel que soit le mode de résolution (chemin_stockage en base, replis
        # 1/2/3), le fichier servi doit rester dans uploads/. Sans ce contrôle,
        # une ligne `documents` au chemin corrompu (ex. ../../back-end/.env)
        # permettait de lire n'importe quel fichier du serveur — donc de voler
        # SECRET_KEY et de forger des JWT administrateur.
        filepath = _safe_upload_path(filepath)
        if not filepath or not os.path.exists(filepath):
            logger.warning(
                "download_document : chemin refusé ou absent (documents.id=%s, user_id=%s)",
                doc.get('id'), user.get('id'),
            )
            return jsonify({"error": "Fichier introuvable."}), 404

        return send_file(
            filepath,
            as_attachment=True,
            mimetype=doc['mime_type'] or 'application/octet-stream',
            download_name=download_name
        )

    except Exception as e:
        logger.error(f"download_document: {e}")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_bp.route('/dashboard/stats', methods=['GET'])
@auth_required
def get_dashboard_stats():
    """Statistiques du tableau de bord — filtrées selon le rôle réel de l'utilisateur JWT."""
    current_user = get_current_user()
    if not current_user:
        return jsonify({"error": "Utilisateur introuvable"}), 401

    role       = current_user.get("role", "")
    service_id = current_user.get("service_id")
    division_id = current_user.get("division_id")

    logger.debug("Dashboard Stats — user_id=%s role=%s service_id=%s division_id=%s",
                 current_user.get("id"), role, service_id, division_id)

    # FAIL-CLOSED : sans périmètre, `filter_sql` restait vide et le tableau de
    # bord affichait les statistiques de TOUTE l'administration.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, current_user.get("id"))
    if _refus:
        return _refus

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Supprimer le COUNT global non nécessaire
        # cursor.execute("SELECT COUNT(*) as total FROM courriers")
        # logger.debug("Dashboard — total courriers en table : %s", cursor.fetchone()['total'])

        filter_sql = ""
        params = []
        if (role == 'Chef de service' or role == 'Agent') and service_id:
            # Exclure les courriers BO non encore affectés au service par le Chef de Division
            filter_sql = """ AND c.service_id = %s
                             AND (c.bo_courrier_id IS NULL
                                  OR EXISTS (
                                      SELECT 1 FROM bo_courriers bc
                                      WHERE bc.id = c.bo_courrier_id
                                        AND bc.statut IN ('Affecté au service', 'Traité')
                                  ))"""
            params = [service_id]
        elif role == 'Chef de division' and division_id:
            filter_sql = " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            params = [division_id, division_id]

        logger.debug("Dashboard — filter_sql=%s params=%s", filter_sql, params)

        #Totaux Globaux - optimisé avec INDEX sur sens, statut, service_id
        query_global = f"""
        SELECT
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' THEN 1 ELSE 0 END), 0) as entrants,
            COALESCE(SUM(CASE WHEN c.sens = 'sortant' THEN 1 ELSE 0 END), 0) as sortants,
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' AND c.statut = 'EN_ATTENTE' THEN 1 ELSE 0 END), 0) as en_attente,
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' AND c.statut = 'TRAITE' THEN 1 ELSE 0 END), 0) as traites
        FROM courriers c
        WHERE 1=1 {filter_sql}
        """
        cursor.execute(query_global, params)
        stats_global = cursor.fetchone()

        logger.debug("Dashboard — stats_global=%s", stats_global)

        #Statistiques du mois en cours
        query_month = f"""
        SELECT 
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' THEN 1 ELSE 0 END), 0) as entrants,
            COALESCE(SUM(CASE WHEN c.sens = 'sortant' THEN 1 ELSE 0 END), 0) as sortants,
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' AND c.statut = 'EN_ATTENTE' THEN 1 ELSE 0 END), 0) as en_attente,
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' AND c.statut = 'TRAITE' THEN 1 ELSE 0 END), 0) as traites
        FROM courriers c
        WHERE MONTH(COALESCE(c.date_saisie, c.date_reception, c.date_envoi)) = MONTH(CURRENT_DATE())
          AND YEAR(COALESCE(c.date_saisie, c.date_reception, c.date_envoi)) = YEAR(CURRENT_DATE())
        {filter_sql}
        """
        cursor.execute(query_month, params)
        stats_mois = cursor.fetchone()

        # 3. Répartition par statut (seulement pour courriers entrants)
        query_repartition = f"""
        SELECT c.statut, COUNT(*) as count
        FROM courriers c WHERE c.sens = 'entrant' {filter_sql} GROUP BY c.statut
        """
        cursor.execute(query_repartition, params)
        repartition = cursor.fetchall()

        # Evolution mensuelle (Graphique)
        query_monthly = f"""
        SELECT 
            DATE_FORMAT(COALESCE(c.date_saisie, c.date_reception, c.date_envoi), '%b') as mois,
            COALESCE(SUM(CASE WHEN c.sens = 'entrant' THEN 1 ELSE 0 END), 0) as entrants,
            COALESCE(SUM(CASE WHEN c.sens = 'sortant' THEN 1 ELSE 0 END), 0) as sortants
        FROM courriers c
        WHERE 1=1 {filter_sql}
        GROUP BY MONTH(COALESCE(c.date_saisie, c.date_reception, c.date_envoi)), mois
        ORDER BY MONTH(COALESCE(c.date_saisie, c.date_reception, c.date_envoi))
        """
        cursor.execute(query_monthly, params)
        monthly_data = cursor.fetchall()

        def get_recent_courriers(sens, f_sql, f_params):
            query = f"""
            SELECT 
                c.*, 
                u.nom as agent_nom, u.prenom as agent_prenom,
                d_exp.nom as exp_div_nom, t_exp.nom as exp_tiers_nom,
                d_dest.nom as dest_div_nom, t_dest.nom as dest_tiers_nom,
                tc.libelle as type_libelle
            FROM courriers c
            LEFT JOIN utilisateurs u ON c.saisi_par = u.id
            LEFT JOIN divisions d_exp ON c.expediteur_division_id = d_exp.id
            LEFT JOIN tiers t_exp ON c.expediteur_tiers_id = t_exp.id
            LEFT JOIN divisions d_dest ON c.destinataire_division_id = d_dest.id
            LEFT JOIN tiers t_dest ON c.destinataire_tiers_id = t_dest.id
            LEFT JOIN types_courrier tc ON c.type_courrier_id = tc.id
            WHERE c.sens = %s {f_sql}
            ORDER BY c.id DESC
            LIMIT 5
            """
            cursor.execute(query, [sens] + f_params)
            rows = cursor.fetchall()
            formatted = []
            for r in rows:
                expediteur = r['exp_div_nom'] if r['exp_div_nom'] else r['exp_tiers_nom']
                destinataire = r['dest_div_nom'] if r['dest_div_nom'] else r['dest_tiers_nom']
                date_val = r['date_reception'] if r['sens'] == 'entrant' else r['date_envoi']
                formatted.append({
                    "id": r['id'],
                    "numero": r['numero'],
                    "reference": r['reference'],
                    "genre": r['sens'],
                    "expediteur": expediteur or "N/A",
                    "destinataire": destinataire or "N/A",
                    "objet": r['objet'],
                    "date": str(date_val) if date_val else "N/A",
                    "date_saisie": str(r['date_saisie']) if r.get('date_saisie') else None,
                    "statut": r['statut'],
                    "observation": r['observations'],
                    "agent": f"{r['agent_nom'] or ''} {r['agent_prenom'] or ''}".strip(),
                    "fichier": None,  # Sera chargé après
                    "bo_courrier_id": r.get('bo_courrier_id'),
                    "type": r.get('type_libelle') or None,
                })
            return formatted

        recent_entrants = get_recent_courriers('entrant', filter_sql, params)
        recent_sortants = get_recent_courriers('sortant', filter_sql, params)
        recent_all = sorted(recent_entrants + recent_sortants, key=lambda x: x['id'], reverse=True)
        
        # Charger les fichiers joints pour les courriers récents en une seule requête
        if recent_all:
            courrier_ids = [c['id'] for c in recent_all]
            placeholders = ','.join(['%s'] * len(courrier_ids))
            cursor.execute(
                f"SELECT courrier_id, nom_fichier FROM documents WHERE courrier_id IN ({placeholders}) AND is_export = 0",
                courrier_ids
            )
            file_names = {}
            for row in cursor.fetchall():
                if row['courrier_id'] not in file_names:
                    file_names[row['courrier_id']] = row['nom_fichier']
            
            # Ajouter les noms de fichiers aux courriers
            for c in recent_all:
                c['fichier'] = file_names.get(c['id'])

        if stats_global:
            for key in stats_global:
                if stats_global[key] is not None:
                    stats_global[key] = int(stats_global[key])
        
        if stats_mois:
            for key in stats_mois:
                if stats_mois[key] is not None:
                    stats_mois[key] = int(stats_mois[key])
        
        if monthly_data:
            for row in monthly_data:
                for key in ['entrants', 'sortants']:
                    if key in row and row[key] is not None:
                        row[key] = int(row[key])

        return jsonify({
            "stats_global": stats_global,
            "stats_mois": stats_mois,
            "repartition": repartition,
            "monthly": monthly_data,
            "recent": recent_all
        })


    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def _safe(text):
    """Encode une valeur en latin-1 pour FPDF."""
    if text is None:
        return "N/A"
    return str(text).encode('latin-1', 'replace').decode('latin-1')


def _draw_row(pdf, label, value, col1_w=60, col2_w=125, row_h=8, fill=False):
    """
    Dessine une ligne de tableau 2 colonnes avec wrap automatique.
    La hauteur s'adapte au contenu de la valeur (multi_cell).
    """
    label_str = _safe(label)
    value_str = _safe(value)
    chars_per_line = max(1, int(col2_w / 2.1))
    lines_needed = max(1, -(-len(value_str) // chars_per_line)) 
    cell_h = row_h * lines_needed

    x_start = pdf.get_x()
    y_start = pdf.get_y()
    pdf.set_font("Arial", 'B', 10)
    if fill:
        pdf.set_fill_color(235, 240, 248)  
    else:
        pdf.set_fill_color(248, 248, 248)   
    pdf.cell(col1_w, cell_h, label_str, border=1, ln=0, fill=True)

    pdf.set_font("Arial", '', 10)
    pdf.set_fill_color(255, 255, 255)
    pdf.multi_cell(col2_w, row_h, value_str, border=1, fill=True)

    pdf.set_xy(x_start, y_start + cell_h)


def _draw_section_header(pdf, title, total_w=185):
    """Bande colorée de titre de section."""
    pdf.set_font("Arial", 'B', 10)
    pdf.set_fill_color(30, 64, 115)    
    pdf.set_text_color(255, 255, 255)   
    pdf.cell(total_w, 7, f"  {_safe(title)}", border=0, ln=True, fill=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(1)

# ── Utilitaire : empreinte du contenu d'un courrier (invalidation du cache PDF) ──
# Champs réellement imprimés dans le PDF exporté. Dès que l'un d'eux change,
# l'empreinte change et le PDF en cache est régénéré.
EXPORT_FINGERPRINT_FIELDS = (
    'id', 'numero', 'reference', 'sens', 'objet',
    'date_envoi', 'date_reception',
    'exp_div_nom', 'exp_tiers_nom', 'dest_div_nom', 'dest_tiers_nom',
)


def _courrier_fingerprint(courrier):
    """Empreinte stable (sha256) des données imprimées dans le PDF."""
    parts = []
    for key in EXPORT_FINGERPRINT_FIELDS:
        val = courrier.get(key)
        parts.append(f"{key}={'' if val is None else str(val)}")
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()


def _read_export_meta(meta_path):
    try:
        with open(meta_path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return None


def _write_export_meta(meta_path, fingerprint):
    try:
        with open(meta_path, "w", encoding="utf-8") as fh:
            json.dump({
                "fingerprint": fingerprint,
                "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            }, fh)
    except Exception as e:
        logger.warning(f"Écriture meta export impossible : {e}")


def invalidate_export_cache(courrier_id):
    """
    Invalide le PDF en cache d'un courrier après modification.

    On supprime le fichier `.meta.json` (l'empreinte) mais on CONSERVE le PDF :
    `pdf_downloads.chemin_stockage` pointe dessus et la liste des
    téléchargements doit rester consultable. Sans empreinte valide, le prochain
    appel à /export/<id> régénère le PDF avec les données à jour.
    """
    try:
        meta_path = os.path.join(EXPORT_FOLDER, f"courrier_{int(courrier_id)}.meta.json")
        if os.path.exists(meta_path):
            os.remove(meta_path)
            logger.info(f"Cache export invalidé (meta supprimée) pour courrier_id={courrier_id}")
    except Exception as e:
        logger.warning(f"invalidate_export_cache({courrier_id}) : {e}")


# ── Utilitaire : enregistrement dans pdf_downloads ────────────────────────
def _record_pdf_download(cursor, conn, user_id, courrier, filename, filepath, taille_octets):
    """
    Insère ou met à jour un enregistrement dans pdf_downloads.
    Appelé juste après la génération du PDF, dans la même connexion.
    user_id peut être None (pas d'utilisateur identifié) — on n'insère rien dans ce cas.
    """
    if not user_id:
        return
    try:
        cursor.execute(
            """SELECT id FROM pdf_downloads
               WHERE user_id = %s AND nom_fichier = %s AND courrier_id <=> %s
               LIMIT 1""",
            (user_id, filename, courrier.get('id'))
        )
        existing = cursor.fetchone()
        if existing:
            # Les colonnes « snapshot » (numero, ref, sens, objet) doivent être
            # rafraîchies : sinon la liste des téléchargements continue
            # d'afficher les valeurs d'AVANT la modification du courrier.
            cursor.execute(
                """UPDATE pdf_downloads
                   SET generated_at = NOW(), taille_octets = %s, chemin_stockage = %s,
                       courrier_numero = %s, courrier_ref = %s,
                       courrier_sens = %s, courrier_objet = %s
                   WHERE id = %s""",
                (taille_octets, filepath,
                 courrier.get('numero'), courrier.get('reference'),
                 courrier.get('sens'), courrier.get('objet'),
                 existing['id'])
            )
        else:
            cursor.execute(
                """INSERT INTO pdf_downloads
                   (user_id, courrier_id, courrier_numero, courrier_ref,
                    courrier_sens, courrier_objet, nom_fichier,
                    chemin_stockage, taille_octets)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    user_id,
                    courrier.get('id'),
                    courrier.get('numero'),
                    courrier.get('reference'),
                    courrier.get('sens'),
                    courrier.get('objet'),
                    filename,
                    filepath,
                    taille_octets,
                )
            )
        conn.commit()
        logger.info(f"pdf_downloads enregistré pour user_id={user_id}, fichier={filename}")
    except Exception as e:
        logger.warning(f"_record_pdf_download : {e}")


# Route export PDF


@courriers_bp.route('/export/<path:courrier_id>', methods=['GET'])
@auth_required
def export_courrier_pdf(courrier_id):
    """
    Génère un PDF pour le courrier identifié par son ID interne unique.

    IMPORTANT : `numero` et `reference` ne sont PAS uniques (plusieurs courriers
    peuvent partager le même numero/reference). Seul l'ID interne (`courriers.id`)
    identifie un courrier de façon fiable : c'est donc lui qui est utilisé pour la
    recherche ET pour le nom de fichier, afin qu'un PDF en cache ne soit jamais
    partagé entre deux courriers homonymes.

    L'identité de l'utilisateur est extraite du token JWT (non du query string).

    OPTIMISATION: Cache des PDF générés — le PDF existant n'est resservi que si
    son empreinte (champs imprimés) correspond aux données ACTUELLES du courrier
    et qu'il a moins de 24 h. Toute modification du courrier invalide le cache.
    """
    from fpdf import FPDF
    import datetime
    from flask_jwt_extended import get_jwt_identity

    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    user_id = user.get("id")   # ← depuis le token JWT, pas la query string

    # L'identifiant reçu doit être l'ID interne unique (entier). Le `numero` et la
    # `reference` ne sont pas uniques : on refuse tout identifiant non numérique
    # plutôt que de risquer de renvoyer le PDF d'un autre courrier (404 propre,
    # comme l'ancien contrat d'erreur de cette route).
    try:
        courrier_id = int(courrier_id)
    except (TypeError, ValueError):
        return jsonify({"error": "Identifiant de courrier invalide : l'ID interne est requis."}), 404

    # ── Chemins du cache PDF (clé = ID interne unique) ─────────────────
    export_dir = EXPORT_FOLDER
    os.makedirs(export_dir, exist_ok=True)

    cached_filename = f"courrier_{courrier_id}.pdf"
    cached_filepath = os.path.join(export_dir, cached_filename)
    cached_metapath = os.path.join(export_dir, f"courrier_{courrier_id}.meta.json")

    conn   = None
    cursor = None
    try:
        conn   = get_connection()
        cursor = conn.cursor(dictionary=True)

        # === CONTRÔLE D'ACCÈS (ownership) ===
        courrier_access = _load_courrier_for_access(cursor, courrier_id)
        if not courrier_access:
            return jsonify({"error": "Courrier non trouvé"}), 404
        if not can_access_courrier(user, courrier_access):
            return jsonify({"error": "Accès non autorisé : vous ne pouvez exporter que les courriers de votre périmètre."}), 403

        # ── Données actuelles du courrier (toujours lues AVANT la décision
        #    de cache) ───────────────────────────────────────────────────
        cursor.execute("""
            SELECT
                c.id,
                c.numero,
                c.reference,
                c.sens,
                c.objet,
                c.date_envoi,
                c.date_reception,
                d_exp.nom   AS exp_div_nom,
                t_exp.nom   AS exp_tiers_nom,
                d_dest.nom  AS dest_div_nom,
                t_dest.nom  AS dest_tiers_nom
            FROM courriers c
            LEFT JOIN divisions d_exp  ON c.expediteur_division_id   = d_exp.id
            LEFT JOIN tiers     t_exp  ON c.expediteur_tiers_id      = t_exp.id
            LEFT JOIN divisions d_dest ON c.destinataire_division_id = d_dest.id
            LEFT JOIN tiers     t_dest ON c.destinataire_tiers_id    = t_dest.id
            WHERE c.id = %s
        """, (courrier_id,))
        c = cursor.fetchone()

        if not c:
            return jsonify({"error": "Courrier non trouvé"}), 404

        # ── Validation du cache par EMPREINTE, pas seulement par ancienneté ──
        # Avant cette correction, un PDF de moins de 24 h était resservi tel
        # quel : après modification du courrier par le Chef de Division,
        # l'export/impression affichait l'ANCIENNE version (expéditeur, type,
        # objet, numéro, référence…). On compare maintenant l'empreinte des
        # champs imprimés avec celle enregistrée lors de la génération.
        fingerprint = _courrier_fingerprint(c)
        use_cache = False
        if os.path.exists(cached_filepath):
            meta = _read_export_meta(cached_metapath)
            file_age = time.time() - os.path.getmtime(cached_filepath)
            if meta and meta.get("fingerprint") == fingerprint and file_age < 86400:
                use_cache = True
                logger.info(
                    f"Cache PDF utilisé pour courrier_id={courrier_id} "
                    f"(âge: {file_age/3600:.1f}h, empreinte identique)"
                )
            else:
                logger.info(
                    f"Cache PDF ignoré pour courrier_id={courrier_id} "
                    f"(empreinte modifiée ou absente) → régénération"
                )

        if use_cache:
            # Servir le PDF caché directement (données inchangées en base)
            taille_octets = os.path.getsize(cached_filepath)
            _record_pdf_download(cursor, conn, user_id, c, cached_filename, cached_filepath, taille_octets)

            return send_file(
                cached_filepath,
                as_attachment=True,
                mimetype='application/pdf',
                download_name=cached_filename
            )

        # ── Génération du PDF (cache miss ou données modifiées) ─────────
        is_entrant = c['sens'] == 'entrant'

        # ── 5 valeurs — toutes issues de la BDD ────────────────────────
        type_label = "Courrier entrant" if is_entrant else "Courrier sortant"

        if is_entrant:
            partie_label = "Expéditeur :"
            partie_val   = c['exp_tiers_nom'] or c['exp_div_nom'] or "—"
            date_label   = "Date de réception :"
            date_raw     = c['date_reception']
        else:
            partie_label = "Destinataire :"
            partie_val   = c['dest_tiers_nom'] or c['dest_div_nom'] or "—"
            date_label   = "Date d'envoi :"
            date_raw     = c['date_envoi']

        ref_val   = c['reference'] or "—"
        objet_val = c['objet']     or "—"
        numero_val = c['numero']   or "—"

        # ── Date en français (données DB) ──────────────────────────────
        MOIS_FR = {
            1:"janvier", 2:"février", 3:"mars", 4:"avril",
            5:"mai", 6:"juin", 7:"juillet", 8:"août",
            9:"septembre", 10:"octobre", 11:"novembre", 12:"décembre"
        }
        d_obj = None
        if date_raw:
            if hasattr(date_raw, 'day'):
                d_obj = date_raw
            else:
                try:
                    d_obj = datetime.datetime.strptime(str(date_raw), "%Y-%m-%d").date()
                except Exception:
                    pass
        date_val = (f"{d_obj.day} {MOIS_FR[d_obj.month]} {d_obj.year}"
                    if d_obj else (str(date_raw) if date_raw else "—"))

        # ══════════════════════════════════════════════════════════════
        # Mise en page — disposition lettre administrative
        # ══════════════════════════════════════════════════════════════
        pdf = FPDF(orientation='P', unit='mm', format='A4')
        pdf.set_margins(left=25, top=25, right=25)
        pdf.set_auto_page_break(auto=False)   # page unique — pied de page positionné manuellement
        pdf.add_page()

        PAGE_W    = 210
        ML        = 25           # marge gauche
        MR        = 25           # marge droite
        CW        = PAGE_W - ML - MR   # 160 mm largeur utile
        BLUE      = (30, 64, 175)
        DARK      = (20, 20, 20)
        GREY      = (110, 110, 110)

        # ── Filet supérieur bleu ───────────────────────────────────────
        pdf.set_draw_color(*BLUE)
        pdf.set_line_width(0.8)
        pdf.line(ML, pdf.get_y(), PAGE_W - MR, pdf.get_y())
        pdf.set_line_width(0.2)
        pdf.set_draw_color(0, 0, 0)
        pdf.ln(5)

        # ── ZONE HAUTE : deux colonnes côte à côte ─────────────────────
        #   Gauche  : Type de courrier  +  N° du courrier
        #   Droite  : Référence         +  Date
        # On utilise set_xy pour placer chaque colonne précisément.

        COL_G_W = CW * 0.50    # 80 mm — colonne gauche
        COL_D_W = CW * 0.50    # 80 mm — colonne droite
        y_haut  = pdf.get_y()

        # — Colonne gauche : Type + Numéro —
        pdf.set_xy(ML, y_haut)
        pdf.set_font("Arial", 'B', 13)
        pdf.set_text_color(*BLUE)
        pdf.cell(COL_G_W, 8, _safe(type_label), ln=True)

        pdf.set_x(ML)
        pdf.set_font("Arial", '', 9)
        pdf.set_text_color(*GREY)
        pdf.cell(COL_G_W, 6, _safe(f"N° {numero_val}"), ln=True)

        y_apres_gauche = pdf.get_y()

        # — Colonne droite : Référence + Date (alignées à droite) —
        pdf.set_xy(ML + COL_G_W, y_haut)
        pdf.set_font("Arial", '', 9)
        pdf.set_text_color(*GREY)
        pdf.cell(COL_D_W, 5, _safe("Réf. :"), ln=True, align='R')

        pdf.set_x(ML + COL_G_W)
        pdf.set_font("Arial", 'B', 10)
        pdf.set_text_color(*DARK)
        pdf.cell(COL_D_W, 6, _safe(ref_val), ln=True, align='R')

        pdf.set_x(ML + COL_G_W)
        pdf.ln(2)
        pdf.set_x(ML + COL_G_W)
        pdf.set_font("Arial", '', 9)
        pdf.set_text_color(*GREY)
        pdf.cell(COL_D_W, 5, _safe(date_label), ln=True, align='R')

        pdf.set_x(ML + COL_G_W)
        pdf.set_font("Arial", 'B', 10)
        pdf.set_text_color(*DARK)
        pdf.cell(COL_D_W, 6, _safe(date_val), ln=True, align='R')

        y_apres_droite = pdf.get_y()

        # Curseur sous le bloc le plus long des deux
        pdf.set_y(max(y_apres_gauche, y_apres_droite) + 8)

        # Filet séparateur léger
        pdf.set_draw_color(210, 210, 210)
        pdf.set_line_width(0.3)
        pdf.line(ML, pdf.get_y(), PAGE_W - MR, pdf.get_y())
        pdf.set_line_width(0.2)
        pdf.set_draw_color(0, 0, 0)
        pdf.ln(8)

        # ── EXPÉDITEUR ou DESTINATAIRE (gauche) ───────────────────────
        pdf.set_x(ML)
        pdf.set_font("Arial", '', 9)
        pdf.set_text_color(*GREY)
        pdf.cell(CW, 5, _safe(partie_label), ln=True)

        pdf.set_x(ML)
        pdf.set_font("Arial", 'B', 11)
        pdf.set_text_color(*DARK)
        pdf.cell(CW, 7, _safe(partie_val), ln=True)

        pdf.ln(8)

        # ── OBJET (centré, avec étiquette) ─────────────────────────────
        pdf.set_x(ML)
        pdf.set_font("Arial", 'B', 10)
        pdf.set_text_color(*GREY)
        pdf.cell(CW, 6, _safe("Objet :"), ln=True, align='C')

        pdf.set_x(ML)
        pdf.set_font("Arial", 'B', 11)
        pdf.set_text_color(*DARK)
        # Un objet long (plusieurs lignes) ne doit jamais etre coupe par le
        # bas de page : activer le saut de page uniquement pendant ce bloc,
        # puis revenir au mode page unique pour le pied de page manuel.
        pdf.set_auto_page_break(auto=True, margin=20)
        pdf.multi_cell(CW, 7, _safe(objet_val), align='C')
        pdf.set_auto_page_break(auto=False)

        # ── Filet inférieur bleu ───────────────────────────────────────
        pdf.set_y(-14)
        pdf.set_draw_color(*BLUE)
        pdf.set_line_width(0.5)
        pdf.line(ML, pdf.get_y(), PAGE_W - MR, pdf.get_y())
        pdf.set_line_width(0.2)
        pdf.set_draw_color(0, 0, 0)
        pdf.ln(2)
        pdf.set_font("Arial", 'I', 7)
        pdf.set_text_color(160, 160, 160)
        pdf.cell(CW, 4,
                 _safe(f"N° {numero_val}  —  Réf. {ref_val}"),
                 ln=True, align='C')

        # ══════════════════════════════════════════════════════════════
        # Sauvegarde + enregistrements BDD (inchangés)
        # ══════════════════════════════════════════════════════════════
        export_dir = EXPORT_FOLDER
        os.makedirs(export_dir, exist_ok=True)

        filename  = f"courrier_{courrier_id}.pdf"
        filepath  = os.path.join(export_dir, filename)
        pdf.output(filepath)
        taille_octets = os.path.getsize(filepath)

        # Empreinte des données imprimées : permet d'invalider ce PDF dès que le
        # courrier est modifié (voir /export/<id>).
        _write_export_meta(os.path.join(export_dir, f"courrier_{courrier_id}.meta.json"), fingerprint)

        try:
            cursor.execute(
                "SELECT id FROM documents WHERE courrier_id = %s AND nom_fichier = %s",
                (c['id'], filename)
            )
            existing = cursor.fetchone()
            if existing:
                cursor.execute(
                    """UPDATE documents
                       SET chemin_stockage = %s, taille_octets = %s,
                           uploaded_at = CURRENT_TIMESTAMP, is_export = 1
                       WHERE id = %s""",
                    (filepath, taille_octets, existing['id'])
                )
            else:
                cursor.execute(
                    """INSERT INTO documents
                       (courrier_id, nom_fichier, chemin_stockage, taille_octets, mime_type, is_export)
                       VALUES (%s, %s, %s, %s, %s, 1)""",
                    (c['id'], filename, filepath, taille_octets, 'application/pdf')
                )
            conn.commit()
        except Exception as db_err:
            logger.warning(f"Enregistrement document BDD : {db_err}")

        _record_pdf_download(cursor, conn, user_id, c, filename, filepath, taille_octets)

        return send_file(
            filepath,
            as_attachment=True,
            mimetype='application/pdf',
            download_name=filename
        )

    except Exception as e:
        logger.error(f"Erreur Export PDF: {e}")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()
