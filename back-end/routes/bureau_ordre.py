import logging
import os
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from flask_jwt_extended import get_jwt_identity
from db import get_connection
from routes.auth_helpers import (
    auth_required, roles_required, get_current_user,
    ROLE_BUREAU_ORDRE, ROLE_CHEF_DIVISION,
)
from logger_config import get_logger

bureau_ordre_bp = Blueprint("bureau_ordre", __name__, url_prefix="/bo")
logger = get_logger(__name__)

from routes.notifications import create_notification, notify_users

# Chemin robuste basé sur __file__ (et non os.getcwd()) : voir commentaire dans
# resolve_bo_document_path. BASE_DIR = dossier back-end/ (parent du package routes/).
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "uploads", "bo")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {"pdf", "doc", "docx", "jpg", "jpeg", "png"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


def allowed_file(filename: str) -> bool:
    return "." in filename and \
           filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _check_file_size(file) -> bool:
    """Vérifie que la taille du fichier ne dépasse pas MAX_FILE_SIZE."""
    file.seek(0, 2)          # aller à la fin
    size = file.tell()
    file.seek(0)             # revenir au début
    return size <= MAX_FILE_SIZE


def _jwt_user_id() -> int:
    """Retourne l'identifiant de l'utilisateur authentifié depuis le token JWT.
    Lève ValueError si le token est absent ou invalide."""
    uid = get_jwt_identity()
    if not uid:
        raise ValueError("Identité JWT manquante")
    return int(uid)


def can_access_bo_courrier_docs(cursor, user_id: int, bo_courrier_id: int) -> bool:
    cursor.execute(
        "SELECT role, division_id, service_id FROM utilisateurs WHERE id = %s AND actif = 1",
        (user_id,),
    )
    user = cursor.fetchone()
    if not user:
        return False

    if user["role"] == "Agent du Bureau d'Ordre":
        return True

    cursor.execute(
        "SELECT destinataire_division_id, statut FROM bo_courriers WHERE id = %s",
        (bo_courrier_id,),
    )
    bo = cursor.fetchone()
    if not bo:
        return False

    if user["role"] == "Chef de division":
        return (
            user["division_id"] is not None
            and int(user["division_id"]) == int(bo["destinataire_division_id"])
        )

    if user["role"] in ("Chef de service", "Agent"):
        if not user["service_id"]:
            return False
        if bo["statut"] not in ("Affecté au service", "Traité"):
            return False
        cursor.execute(
            """SELECT 1 FROM courriers
               WHERE bo_courrier_id = %s AND service_id = %s AND sens = 'entrant'""",
            (bo_courrier_id, user["service_id"]),
        )
        return cursor.fetchone() is not None

    return False


def resolve_bo_document_path(conn, cursor, doc):
    """
    Résout le chemin physique réel d'une pièce jointe du Bureau d'Ordre.

    Pourquoi cette fonction existe :
    `bo_documents.chemin_stockage` est un chemin ABSOLU calculé avec
    `os.getcwd()` au moment de l'upload. Si le backend est démarré depuis un
    autre répertoire, ou si le projet est déplacé/copié, ce chemin devient
    invalide et le téléchargement renvoie « Fichier introuvable » alors que le
    fichier est bien présent sur le disque.

    Stratégie : on tente le chemin enregistré, puis on reconstruit le nom
    physique attendu (`bo_<bo_courrier_id>_<nom>`), puis le nom brut, puis on
    balaie le dossier `uploads/bo`. Dès qu'un candidat existe, on répare la base
    (UPDATE chemin_stockage) pour que les prochains accès soient directs.

    Retourne le chemin absolu valide, ou None si le fichier est réellement absent.
    """
    if not doc:
        return None

    nom = doc.get("nom_fichier") or ""
    chemin = doc.get("chemin_stockage") or ""

    # 1) Chemin enregistré en base
    if chemin and os.path.isfile(chemin):
        return chemin

    candidates = []
    if chemin:
        # 2) Même nom de fichier, mais dans le dossier courant du backend
        candidates.append(os.path.join(UPLOAD_FOLDER, os.path.basename(chemin)))
    if doc.get("bo_courrier_id") and nom:
        # 3) Nom physique tel que produit à l'upload
        candidates.append(os.path.join(UPLOAD_FOLDER, f"bo_{doc['bo_courrier_id']}_{nom}"))
    if nom:
        # 4) Nom brut (upload antérieur à l'ajout du préfixe)
        candidates.append(os.path.join(UPLOAD_FOLDER, nom))

    found = None
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            found = candidate
            break

    # 5) Dernier recours : balayage du dossier sur le suffixe du nom
    if not found and nom and os.path.isdir(UPLOAD_FOLDER):
        for entry in os.listdir(UPLOAD_FOLDER):
            full = os.path.join(UPLOAD_FOLDER, entry)
            if os.path.isfile(full) and entry.endswith(nom):
                found = full
                break

    if found and found != chemin:
        try:
            cursor.execute(
                "UPDATE bo_documents SET chemin_stockage = %s WHERE id = %s",
                (found, doc.get("id")),
            )
            conn.commit()
            logger.info(
                "bo_documents.chemin_stockage réparé : id=%s -> %s",
                doc.get("id"), found,
            )
        except Exception as e:  # la réparation ne doit jamais casser le téléchargement
            logger.warning("resolve_bo_document_path (auto-réparation) : %s", e)
            try:
                conn.rollback()
            except Exception:
                pass

    return found


def find_bo_document_by_name(conn, cursor, nom_fichier):
    """
    Recherche une pièce jointe du Bureau d'Ordre par son nom affiché et en
    vérifie la présence physique.

    Utilisé par `/documents/download/<nom>` : la table `documents` ne contient
    PAS les pièces saisies au Bureau d'Ordre, alors que le nom exposé par les
    listes de courriers entrants peut provenir de `bo_documents`. Sans ce repli,
    le téléchargement échoue avec « Fichier introuvable ».

    Retourne (ligne bo_documents, chemin physique) ou (None, None).
    """
    if not nom_fichier:
        return None, None

    select = """SELECT id, bo_courrier_id, nom_fichier, chemin_stockage, mime_type
                FROM bo_documents WHERE """

    cursor.execute(select + "nom_fichier = %s ORDER BY id ASC", (nom_fichier,))
    rows = cursor.fetchall()
    if not rows:
        cursor.execute(select + "nom_fichier LIKE %s ORDER BY id ASC", (f"%{nom_fichier}",))
        rows = cursor.fetchall()

    for doc in rows or []:
        path = resolve_bo_document_path(conn, cursor, doc)
        if path:
            return doc, path

    return None, None


def log_action(cursor, bo_courrier_id: int, action: str,
               details: str, user_id: int, ip: str = None):
    """Insère une entrée dans bo_historique."""
    cursor.execute(
        """INSERT INTO bo_historique
               (bo_courrier_id, action, details, effectue_par, adresse_ip)
           VALUES (%s, %s, %s, %s, %s)""",
        (bo_courrier_id, action, details, user_id, ip),
    )


def get_client_ip() -> str:
    return (request.headers.get("X-Forwarded-For") or
            request.remote_addr or "")

# ── GET /bo/courriers ───────────────────────────────────────────────────────

@bureau_ordre_bp.route("/courriers", methods=["GET"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def list_courriers():
    """Liste les courriers du BO créés par l'agent connecté."""
    user_id = _jwt_user_id()

    search  = request.args.get("search", "").strip()
    statut  = request.args.get("statut", "").strip()
    page    = max(1, int(request.args.get("page", 1)))
    per_page = int(request.args.get("per_page", 10))
    offset  = (page - 1) * per_page

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        base = """
        FROM bo_courriers bc
        LEFT JOIN tiers t          ON bc.expediteur_tiers_id      = t.id
        LEFT JOIN divisions d_exp  ON bc.expediteur_division_id   = d_exp.id
        LEFT JOIN divisions d_dest ON bc.destinataire_division_id = d_dest.id
        LEFT JOIN types_courrier tc ON bc.type_courrier_id        = tc.id
        LEFT JOIN utilisateurs u    ON bc.saisi_par               = u.id
        WHERE bc.saisi_par = %s
        """
        params = [user_id]

        if search:
            base += " AND (bc.numero LIKE %s OR bc.objet LIKE %s OR bc.reference LIKE %s)"
            like = f"%{search}%"
            params += [like, like, like]

        if statut:
            base += " AND bc.statut = %s"
            params.append(statut)

        cursor.execute(f"SELECT COUNT(*) AS total {base}", params)
        total = cursor.fetchone()["total"]

        cursor.execute(
            f"""SELECT bc.id, bc.numero, bc.reference,
                       bc.type_expediteur,
                       COALESCE(t.nom, d_exp.nom) AS expediteur,
                       d_dest.nom                 AS destinataire_division,
                       tc.libelle                 AS type_courrier,
                       bc.date_reception,
                       bc.objet, bc.observations, bc.statut,
                       bc.date_saisie
                {base}
                ORDER BY bc.id DESC
                LIMIT %s OFFSET %s""",
            params + [per_page, offset],
        )
        rows = cursor.fetchall()
        for r in rows:
            r["date_reception"] = str(r["date_reception"]) if r["date_reception"] else None
            r["date_saisie"]    = str(r["date_saisie"])    if r["date_saisie"]    else None

        return jsonify({"total": total, "page": page, "per_page": per_page, "data": rows})
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()

# ── GET /bo/courriers/<id> ──────────────────────────────────────────────────

@bureau_ordre_bp.route("/courriers/<int:courrier_id>", methods=["GET"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def get_courrier(courrier_id):
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT bc.*,
                      COALESCE(t.nom, d_exp.nom) AS expediteur_nom,
                      d_dest.nom                 AS destinataire_division_nom,
                      tc.libelle AS type_courrier,
                      u.nom AS agent_nom, u.prenom AS agent_prenom
               FROM bo_courriers bc
               LEFT JOIN tiers t          ON bc.expediteur_tiers_id      = t.id
               LEFT JOIN divisions d_exp  ON bc.expediteur_division_id   = d_exp.id
               LEFT JOIN divisions d_dest ON bc.destinataire_division_id = d_dest.id
               LEFT JOIN types_courrier tc ON bc.type_courrier_id        = tc.id
               LEFT JOIN utilisateurs u    ON bc.saisi_par               = u.id
               WHERE bc.id = %s AND bc.saisi_par = %s""",
            (courrier_id, user_id),
        )
        courrier = cursor.fetchone()
        if not courrier:
            return jsonify({"error": "Courrier introuvable"}), 404

        # Pièces jointes
        cursor.execute(
            "SELECT id, nom_fichier, taille_octets, mime_type, uploaded_at "
            "FROM bo_documents WHERE bo_courrier_id = %s",
            (courrier_id,),
        )
        courrier["documents"] = cursor.fetchall()

        # Historique
        cursor.execute(
            """SELECT bh.action, bh.details, bh.adresse_ip, bh.created_at,
                      u.nom, u.prenom
               FROM bo_historique bh
               JOIN utilisateurs u ON bh.effectue_par = u.id
               WHERE bh.bo_courrier_id = %s
               ORDER BY bh.created_at DESC""",
            (courrier_id,),
        )
        courrier["historique"] = cursor.fetchall()

        for key in ("date_reception", "date_saisie", "date_affectation"):
            if courrier.get(key):
                courrier[key] = str(courrier[key])
        for h in courrier["historique"]:
            if h.get("created_at"):
                h["created_at"] = str(h["created_at"])
        for doc in courrier["documents"]:
            if doc.get("uploaded_at"):
                doc["uploaded_at"] = str(doc["uploaded_at"])

        return jsonify(courrier)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()

# ── POST /bo/courriers ──────────────────────────────────────────────────────

@bureau_ordre_bp.route("/courriers", methods=["POST"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def create_courrier():
    user_id = _jwt_user_id()

    # Accepter JSON ou multipart
    if request.is_json:
        data  = request.get_json()
        files = []
    else:
        data  = request.form.to_dict()
        files = request.files.getlist("fichiers")

    # Validation
    required = ["numero", "type_courrier_id", "date_reception", "objet"]
    errors = {}
    for f in required:
        if not data.get(f, "").strip() if isinstance(data.get(f), str) else not data.get(f):
            errors[f] = "Ce champ est obligatoire"

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if errors:
            return jsonify({"errors": errors}), 422

        # Résoudre expéditeur
        exp_tiers_id    = None
        exp_division_id = None
        type_exp = data.get("type_expediteur", "tiers")
        if type_exp == "tiers" and data.get("expediteur_id"):
            exp_tiers_id = int(data["expediteur_id"])
        elif type_exp == "division" and data.get("expediteur_id"):
            exp_division_id = int(data["expediteur_id"])

        cursor.execute(
            """INSERT INTO bo_courriers
               (numero, reference, type_expediteur,
                expediteur_tiers_id, expediteur_division_id,
                destinataire_division_id,
                type_courrier_id, date_reception, objet,
                observations, statut, saisi_par)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                       'Non affecté',%s)""",
            (
                data["numero"].strip(),
                (data.get("reference") or "").strip(),
                type_exp,
                exp_tiers_id,
                exp_division_id,
                int(data["destinataire_division_id"]) if data.get("destinataire_division_id") else None,
                int(data["type_courrier_id"]),
                data["date_reception"],
                (data.get("objet") or "").strip(),
                (data.get("observations") or "").strip(),
                int(user_id),
            ),
        )
        new_id = cursor.lastrowid

        # Sauvegarder fichiers
        saved_files = []
        for file in files:
            if file and file.filename and allowed_file(file.filename):
                if not _check_file_size(file):
                    return jsonify({"error": f"Fichier trop volumineux (max 10 MB) : {file.filename}"}), 413
                raw_name   = secure_filename(file.filename)
                unique_name = f"bo_{new_id}_{raw_name}"
                filepath   = os.path.join(UPLOAD_FOLDER, unique_name)
                file.save(filepath)
                size = os.path.getsize(filepath)
                cursor.execute(
                    """INSERT INTO bo_documents
                       (bo_courrier_id, nom_fichier, chemin_stockage, taille_octets, mime_type)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (new_id, raw_name, filepath, size, file.mimetype),
                )
                saved_files.append(raw_name)

        log_action(cursor, new_id, "Création",
                   f"Courrier N° {data['numero']} créé", int(user_id), get_client_ip())
        conn.commit()
        return jsonify({"message": "Courrier enregistré", "id": new_id,
                        "fichiers": saved_files}), 201
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()

# ── PUT /bo/courriers/<id> ──────────────────────────────────────────────────

@bureau_ordre_bp.route("/courriers/<int:courrier_id>", methods=["PUT"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def update_courrier(courrier_id):
    user_id = _jwt_user_id()

    data  = request.form.to_dict() if not request.is_json else request.get_json()
    files = request.files.getlist("fichiers") if not request.is_json else []

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, statut, saisi_par FROM bo_courriers WHERE id = %s", (courrier_id,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Courrier introuvable"}), 404
        if row["saisi_par"] != int(user_id):
            return jsonify({"error": "Accès refusé"}), 403
        if row["statut"] != "Non affecté":
            return jsonify({"error": "Modification impossible après affectation"}), 409

        # Validation
        errors = {}
        for f in ("numero", "type_courrier_id", "date_reception", "objet"):
            if not data.get(f):
                errors[f] = "Ce champ est obligatoire"
        if errors:
            return jsonify({"errors": errors}), 422

        # Unicité numéro désactivée (plusieurs courriers peuvent avoir le même numéro)

        exp_tiers_id    = None
        exp_division_id = None
        type_exp = data.get("type_expediteur", "tiers")
        if type_exp == "tiers" and data.get("expediteur_id"):
            exp_tiers_id = int(data["expediteur_id"])
        elif type_exp == "division" and data.get("expediteur_id"):
            exp_division_id = int(data["expediteur_id"])

        cursor.execute(
            """UPDATE bo_courriers SET
               numero=%s, reference=%s, type_expediteur=%s,
               expediteur_tiers_id=%s, expediteur_division_id=%s,
               type_courrier_id=%s, date_reception=%s,
               objet=%s, observations=%s
               WHERE id=%s""",
            (
                data["numero"].strip(), (data.get("reference") or "").strip(),
                type_exp, exp_tiers_id, exp_division_id,
                int(data["type_courrier_id"]), data["date_reception"],
                (data.get("objet") or "").strip(),
                (data.get("observations") or "").strip(),
                courrier_id,
            ),
        )

        for file in files:
            if file and file.filename and allowed_file(file.filename):
                if not _check_file_size(file):
                    return jsonify({"error": f"Fichier trop volumineux (max 10 MB) : {file.filename}"}), 413
                raw_name    = secure_filename(file.filename)
                unique_name = f"bo_{courrier_id}_{raw_name}"
                filepath    = os.path.join(UPLOAD_FOLDER, unique_name)
                file.save(filepath)
                size = os.path.getsize(filepath)
                cursor.execute(
                    """INSERT INTO bo_documents
                       (bo_courrier_id, nom_fichier, chemin_stockage, taille_octets, mime_type)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (courrier_id, raw_name, filepath, size, file.mimetype),
                )

        log_action(cursor, courrier_id, "Modification",
                   f"Courrier N° {data['numero']} modifié", int(user_id), get_client_ip())
        conn.commit()
        return jsonify({"message": "Courrier mis à jour"})
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()

# ── DELETE /bo/courriers/<id> ───────────────────────────────────────────────

@bureau_ordre_bp.route("/courriers/<int:courrier_id>", methods=["DELETE"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def delete_courrier(courrier_id):
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, statut, saisi_par, numero FROM bo_courriers WHERE id = %s",
            (courrier_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Courrier introuvable"}), 404
        if row["saisi_par"] != int(user_id):
            return jsonify({"error": "Accès refusé"}), 403
        if row["statut"] != "Non affecté":
            return jsonify({"error": "Suppression impossible après affectation"}), 409

        # Supprimer les fichiers physiques
        cursor.execute(
            "SELECT chemin_stockage FROM bo_documents WHERE bo_courrier_id = %s",
            (courrier_id,),
        )
        for doc in cursor.fetchall():
            if doc["chemin_stockage"] and os.path.exists(doc["chemin_stockage"]):
                os.remove(doc["chemin_stockage"])

        cursor.execute("DELETE FROM bo_courriers WHERE id = %s", (courrier_id,))
        conn.commit()
        return jsonify({"message": "Courrier supprimé"})
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── POST /bo/courriers/<id>/affecter ────────────────────────────────────────

# ── PATCH /bo/courriers/<id>/annuler-affectation ─────────────────────────────

@bureau_ordre_bp.route("/courriers/<int:courrier_id>/annuler-affectation", methods=["PATCH"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def annuler_affectation(courrier_id):
    """Agent BO annule une affectation : statut → Non affecté, supprime entrée dans courriers."""
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, statut, saisi_par, numero FROM bo_courriers WHERE id = %s",
            (courrier_id,)
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Courrier introuvable"}), 404
        if row["saisi_par"] != int(user_id):
            return jsonify({"error": "Accès refusé"}), 403
        if row["statut"] == "Non affecté":
            return jsonify({"error": "Ce courrier n'est pas encore affecté"}), 409

        # Remettre bo_courriers à l'état initial
        cursor.execute(
            """UPDATE bo_courriers
               SET statut = 'Non affecté',
                   destinataire_division_id = NULL,
                   destinataire_service_id  = NULL,
                   affecte_a                = NULL,
                   date_affectation         = NULL,
                   date_affectation_service = NULL
               WHERE id = %s""",
            (courrier_id,)
        )

        # Supprimer l'entrée dans la table courriers liée à ce BO
        deleted = 0
        try:
            cursor.execute(
                "DELETE FROM courriers WHERE bo_courrier_id = %s",
                (courrier_id,)
            )
            deleted = cursor.rowcount
        except Exception:
            pass  # colonne absente

        if deleted == 0:
            # Fallback (courriers créés avant l'existence de bo_courrier_id) :
            # le `numero` n'est PAS unique — on ne supprime donc QUE des lignes
            # orphelines (bo_courrier_id IS NULL) et UNIQUEMENT s'il n'existe
            # qu'une seule correspondance, pour ne jamais toucher un autre
            # courrier partageant le même numero.
            try:
                cursor.execute(
                    """SELECT id FROM courriers
                       WHERE numero = %s AND sens = 'entrant'
                         AND bo_courrier_id IS NULL""",
                    (row["numero"],)
                )
                orphans = cursor.fetchall()
                if len(orphans) == 1:
                    cursor.execute(
                        "DELETE FROM courriers WHERE id = %s",
                        (orphans[0]["id"],)
                    )
                elif len(orphans) > 1:
                    logger.warning(
                        "Annulation affectation : %d courriers orphelins partagent le "
                        "numero %r — suppression par numero ignorée (ambiguïté).",
                        len(orphans), row["numero"]
                    )
            except Exception as del_err:
                logger.warning(f"DELETE fallback courriers: {del_err}")

        # Supprimer les notifications liées
        cursor.execute(
            "DELETE FROM bo_notifications WHERE bo_courrier_id = %s",
            (courrier_id,)
        )

        log_action(cursor, courrier_id, "Annulation affectation",
                   f"Affectation annulée par l'Agent BO — statut remis à Non affecté",
                   int(user_id), get_client_ip())
        conn.commit()
        return jsonify({"message": "Affectation annulée avec succès"})

    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


@bureau_ordre_bp.route("/courriers/<int:courrier_id>/affecter", methods=["POST"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def affecter_courrier(courrier_id):
    data        = request.get_json() or {}
    user_id = _jwt_user_id()
    division_id = data.get("division_id")

    if not division_id:
        return jsonify({"error": "division_id requis"}), 400

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, statut, saisi_par, numero FROM bo_courriers WHERE id = %s",
            (courrier_id,),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Courrier introuvable"}), 404
        if row["statut"] != "Non affecté":
            return jsonify({"error": "Courrier déjà affecté"}), 409

        # Vérifier que la division existe
        cursor.execute("SELECT id, nom FROM divisions WHERE id = %s", (int(division_id),))
        division = cursor.fetchone()
        if not division:
            return jsonify({"error": f"Division id={division_id} introuvable"}), 404

        # Mettre à jour le courrier BO
        cursor.execute(
            """UPDATE bo_courriers
               SET statut = 'Affecté',
                   destinataire_division_id = %s,
                   date_affectation = NOW()
               WHERE id = %s""",
            (int(division_id), courrier_id),
        )

        # ── Créer une entrée dans la table courriers (module principal) ──
        # Le Chef de Division verra ce courrier dans sa liste normale.
        # IMPORTANT : service_id reste NULL à ce stade — aucun service n'est encore
        # désigné. Il sera renseigné uniquement quand le Chef affecte à un service.
        cursor.execute(
            """SELECT bc.*, COALESCE(t.nom, d_exp.nom) AS exp_nom
               FROM bo_courriers bc
               LEFT JOIN tiers t         ON bc.expediteur_tiers_id    = t.id
               LEFT JOIN divisions d_exp ON bc.expediteur_division_id = d_exp.id
               WHERE bc.id = %s""",
            (courrier_id,)
        )
        bo = cursor.fetchone()

        # Toujours créer/mettre à jour l'entrée dans courriers (service_id = NULL)
        numero_courrier = bo["numero"]

        exp_tiers_id_c    = bo["expediteur_tiers_id"]
        exp_division_id_c = bo["expediteur_division_id"] if not exp_tiers_id_c else None

        if not exp_tiers_id_c and not exp_division_id_c:
            cursor.execute(
                "SELECT division_id FROM utilisateurs WHERE id = %s", (int(user_id),)
            )
            agent_row = cursor.fetchone()
            if agent_row and agent_row.get("division_id"):
                exp_division_id_c = agent_row["division_id"]
            else:
                exp_division_id_c = int(division_id)

        # IMPORTANT : aucune exception ne doit être avalée ici.
        # Si l'entrée courriers ne peut pas être créée/mise à jour, l'ensemble de
        # la transaction (y compris statut='Affecté' sur bo_courriers et les
        # notifications) doit être annulé : sinon le courrier est « affecté »
        # côté BO mais invisible chez le Chef de Division.
        # La relation bo_courriers ⇄ courriers est portée UNIQUEMENT par
        # bo_courrier_id (jamais par numero, qui n'est pas unique).
        objet_courrier = (bo.get("objet") or "").strip()
        if not objet_courrier:
            objet_courrier = f"Courrier N° {numero_courrier}"

        # Vérifier si une entrée existe déjà pour ce courrier BO (par ID source uniquement)
        cursor.execute(
            "SELECT id FROM courriers WHERE bo_courrier_id = %s AND sens = 'entrant'",
            (courrier_id,)
        )
        existing = cursor.fetchone()

        if existing:
            cursor.execute(
                """UPDATE courriers
                   SET destinataire_division_id = %s,
                       service_id               = NULL,
                       objet                    = %s,
                       statut                   = 'EN_ATTENTE'
                   WHERE id = %s""",
                (int(division_id), objet_courrier, existing["id"])
            )
            logger.info(f"Entrée courriers mise à jour pour bo_courrier_id={courrier_id}")
        else:
            cursor.execute(
                """INSERT INTO courriers
                   (numero, reference, sens, type_courrier_id,
                    expediteur_tiers_id, expediteur_division_id,
                    destinataire_division_id,
                    service_id, objet,
                    date_envoi, date_reception,
                    statut, observations, saisi_par, bo_courrier_id)
                   VALUES (%s,%s,'entrant',%s,%s,%s,%s,
                           NULL,%s,%s,%s,
                           'EN_ATTENTE',%s,%s,%s)""",
                (
                    numero_courrier,
                    bo.get("reference") or "",
                    bo["type_courrier_id"],
                    exp_tiers_id_c,
                    exp_division_id_c,
                    int(division_id),
                    objet_courrier,
                    bo["date_reception"],
                    bo["date_reception"],
                    bo.get("observations") or "",
                    int(user_id),
                    courrier_id,
                )
            )
            logger.info(f"Entrée courriers créée pour bo_courrier_id={courrier_id}")

        # Notifier uniquement le Chef de Division
        cursor.execute(
            """SELECT id FROM utilisateurs
               WHERE role = 'Chef de division'
                 AND division_id = %s
                 AND actif = 1
               LIMIT 1""",
            (int(division_id),)
        )
        chef = cursor.fetchone()
        if chef:
            cursor.execute(
                """INSERT INTO bo_notifications (destinataire, bo_courrier_id, message)
                   VALUES (%s, %s, %s)""",
                (chef["id"], courrier_id,
                 f"Nouveau courrier N° {row['numero']} affecté à votre division "
                 f"« {division['nom']} »"),
            )
            # Notification dans le système général
            create_notification(
                cursor,
                destinataire_id = chef["id"],
                type_           = "NOUVEAU_COURRIER",
                titre           = "Courrier reçu",
                message         = f"Courrier reçu de « {bo.get('exp_nom') or 'Expéditeur inconnu'} ».",
                bo_courrier_id  = courrier_id,
            )
        else:
            logger.warning(f"Aucun Chef de Division trouvé pour division_id={division_id}")

        log_action(cursor, courrier_id, "Affectation",
                   f"Affecté à la division « {division['nom']} »",
                   int(user_id), get_client_ip())
        conn.commit()
        return jsonify({
            "message": f"Courrier affecté à la division « {division['nom']} »",
        })
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()

# ── PATCH /bo/chef/courriers/<id>/affecter-service ───────────────────────────

@bureau_ordre_bp.route("/chef/courriers/<int:courrier_id>/affecter-service", methods=["PATCH"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_affecter_service(courrier_id):
    """
    Le Chef de Division affecte le courrier à un service de sa division.
    → met à jour la table courriers (service_id) pour que Chef de Service
      et Agents puissent le voir dans leur liste normale.
    """
    data       = request.get_json() or {}
    service_id = data.get("service_id")

    user_id     = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT role, division_id FROM utilisateurs WHERE id = %s AND actif = 1",
            (user_id,)
        )
        user = cursor.fetchone()
        if not user or user["role"] != "Chef de division":
            return jsonify({"error": "Accès refusé"}), 403

        division_id = user["division_id"]
        if not division_id:
            return jsonify({"error": "Aucune division associée à votre compte"}), 400

        if not service_id:
            return jsonify({"error": "service_id requis"}), 400

        # Vérifier que le service appartient à la division
        cursor.execute(
            "SELECT id, nom FROM services WHERE id = %s AND division_id = %s",
            (int(service_id), int(division_id))
        )
        service = cursor.fetchone()
        if not service:
            return jsonify({"error": "Service introuvable ou n'appartient pas à votre division"}), 404

        # Vérifier que le courrier BO appartient à cette division + récupérer l'expéditeur
        cursor.execute(
            """SELECT bc.id, bc.statut, bc.numero, bc.objet,
                      COALESCE(t.nom, d_exp.nom) AS exp_nom
               FROM bo_courriers bc
               LEFT JOIN tiers t         ON bc.expediteur_tiers_id    = t.id
               LEFT JOIN divisions d_exp ON bc.expediteur_division_id = d_exp.id
               WHERE bc.id = %s AND bc.destinataire_division_id = %s""",
            (courrier_id, int(division_id))
        )
        bo = cursor.fetchone()
        if not bo:
            return jsonify({"error": "Courrier introuvable"}), 404

        # Mettre à jour bo_courriers
        cursor.execute(
            """UPDATE bo_courriers
               SET statut = 'Affecté au service',
                   destinataire_service_id = %s,
                   date_affectation_service = NOW()
               WHERE id = %s""",
            (int(service_id), courrier_id)
        )

        # Mettre à jour la table courriers (service_id) pour visibilité Chef de service / Agent
        # Chercher par bo_courrier_id D'ABORD, puis par numero en fallback
        courrier_row = None
        try:
            cursor.execute(
                "SELECT id FROM courriers WHERE bo_courrier_id = %s",
                (courrier_id,)
            )
            courrier_row = cursor.fetchone()
        except Exception:
            pass  # colonne bo_courrier_id absente

        # Fallback (courriers créés avant l'existence de bo_courrier_id) :
        # le `numero` n'est PAS unique — on ne retient une ligne que si elle est
        # orpheline (bo_courrier_id IS NULL) et UNIQUE. En cas d'ambiguïté, on ne
        # fait rien : la branche `else` créera une entrée correctement liée par
        # bo_courrier_id, sans jamais écraser un autre courrier de même numero.
        if not courrier_row:
            cursor.execute(
                """SELECT id FROM courriers
                   WHERE numero = %s AND sens = 'entrant'
                     AND bo_courrier_id IS NULL""",
                (bo["numero"],)
            )
            matches = cursor.fetchall()
            if len(matches) == 1:
                courrier_row = matches[0]
            elif len(matches) > 1:
                logger.warning(
                    "Affectation service : %d courriers orphelins partagent le numero "
                    "%r — fallback par numero ignoré (ambiguïté).",
                    len(matches), bo["numero"]
                )

        if courrier_row:
            cursor.execute(
                "UPDATE courriers SET service_id = %s WHERE id = %s",
                (int(service_id), courrier_row["id"])
            )
        else:
            # Récupérer les données du courrier BO pour créer l'entrée manquante
            cursor.execute(
                """SELECT bc.*, COALESCE(t.nom, d_exp.nom) AS exp_nom
                   FROM bo_courriers bc
                   LEFT JOIN tiers t         ON bc.expediteur_tiers_id    = t.id
                   LEFT JOIN divisions d_exp ON bc.expediteur_division_id = d_exp.id
                   WHERE bc.id = %s""",
                (courrier_id,)
            )
            bo_full = cursor.fetchone()
            if bo_full:
                exp_tiers = bo_full.get("expediteur_tiers_id")
                exp_div   = bo_full.get("expediteur_division_id") if not exp_tiers else None
                if not exp_tiers and not exp_div:
                    exp_div = int(division_id)

                # Garantir que l'objet n'est jamais NULL
                objet_courrier = (bo_full.get("objet") or "").strip()
                if not objet_courrier:
                    objet_courrier = f"Courrier N° {bo_full.get('numero', courrier_id)}"

                # IMPORTANT : aucune exception ne doit être avalée ici.
                # Si l'entrée courriers ne peut pas être créée/mise à jour,
                # toute la transaction est annulée (rollback + 500) : sinon le
                # courrier serait marqué « Affecté au service » côté BO mais
                # invisible chez le Chef de Service / les Agents.
                # Vérifier si une entrée existe déjà pour ce courrier BO (par ID source uniquement)
                cursor.execute(
                    "SELECT id FROM courriers WHERE bo_courrier_id = %s AND sens = 'entrant'",
                    (courrier_id,)
                )
                existing = cursor.fetchone()

                if existing:
                    cursor.execute(
                        """UPDATE courriers
                           SET destinataire_division_id = %s,
                               service_id               = %s,
                               objet                    = %s,
                               statut                   = 'EN_ATTENTE'
                           WHERE id = %s""",
                        (int(division_id), int(service_id), objet_courrier, existing["id"])
                    )
                    logger.info(f"Entrée courriers mise à jour (service) pour bo_courrier_id={courrier_id}")
                else:
                    cursor.execute(
                        """INSERT INTO courriers
                           (numero, reference, sens, type_courrier_id,
                            expediteur_tiers_id, expediteur_division_id,
                            destinataire_division_id, service_id,
                            objet, date_envoi, date_reception,
                            statut, observations, saisi_par, bo_courrier_id)
                           VALUES (%s,%s,'entrant',%s,%s,%s,%s,%s,%s,%s,%s,
                                   'EN_ATTENTE',%s,%s,%s)""",
                        (
                            bo_full["numero"],
                            bo_full.get("reference") or "",
                            bo_full["type_courrier_id"],
                            exp_tiers, exp_div,
                            int(division_id),
                            int(service_id),
                            objet_courrier,
                            bo_full["date_reception"],
                            bo_full["date_reception"],
                            bo_full.get("observations") or "",
                            int(user_id),
                            courrier_id,
                        )
                    )
                    logger.info(f"Entrée courriers créée (service) pour bo_courrier_id={courrier_id}")

        # Notifier le Chef de Service du service sélectionné
        cursor.execute(
            """SELECT id FROM utilisateurs
               WHERE role = 'Chef de service' AND service_id = %s AND actif = 1
               LIMIT 1""",
            (int(service_id),)
        )
        chef_svc = cursor.fetchone()
        if chef_svc:
            cursor.execute(
                """INSERT INTO bo_notifications (destinataire, bo_courrier_id, message)
                   VALUES (%s, %s, %s)""",
                (chef_svc["id"], courrier_id,
                 f"Courrier N° {bo['numero']} affecté à votre service « {service['nom']} »")
            )
            create_notification(
                cursor,
                destinataire_id = chef_svc["id"],
                type_           = "AFFECTATION",
                titre           = "Courrier reçu",
                message         = f"Courrier reçu de « {bo.get('exp_nom') or 'Expéditeur inconnu'} ».",
                bo_courrier_id  = courrier_id,
            )

        # Notifier les Agents du service
        cursor.execute(
            """SELECT id FROM utilisateurs
               WHERE role = 'Agent' AND service_id = %s AND actif = 1""",
            (int(service_id),)
        )
        agents = cursor.fetchall()
        for agent in agents:
            create_notification(
                cursor,
                destinataire_id = agent["id"],
                type_           = "NOUVEAU_COURRIER",
                titre           = "Courrier reçu",
                message         = f"Courrier reçu de « {bo.get('exp_nom') or 'Expéditeur inconnu'} ».",
                bo_courrier_id  = courrier_id,
            )

        log_action(cursor, courrier_id, "Affectation au service",
                   f"Chef de Division a affecté au service « {service['nom']} »",
                   int(user_id), get_client_ip())
        conn.commit()
        return jsonify({"message": f"Courrier affecté au service « {service['nom']} »"})

    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── PATCH /bo/chef/courriers/<id>/annuler-affectation-service ────────────────

@bureau_ordre_bp.route("/chef/courriers/<int:courrier_id>/annuler-affectation-service", methods=["PATCH"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_annuler_affectation_service(courrier_id):
    """Chef de Division annule l'affectation d'un courrier à un service."""
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT role, division_id FROM utilisateurs WHERE id = %s AND actif = 1", (user_id,)
        )
        user = cursor.fetchone()
        if not user or user["role"] != "Chef de division":
            return jsonify({"error": "Accès refusé"}), 403

        division_id = user["division_id"]
        if not division_id:
            return jsonify({"error": "Aucune division associée à votre compte"}), 400

        # Remettre bo_courriers à "Affecté" (affecté à division, mais plus à un service)
        cursor.execute(
            """UPDATE bo_courriers
               SET statut = 'Affecté',
                   destinataire_service_id  = NULL,
                   date_affectation_service = NULL
               WHERE id = %s AND destinataire_division_id = %s""",
            (courrier_id, int(division_id))
        )

        # Remettre service_id = NULL dans courriers (aucun service assigné)
        try:
            cursor.execute(
                "UPDATE courriers SET service_id = NULL WHERE bo_courrier_id = %s",
                (courrier_id,)
            )
            if cursor.rowcount == 0:
                # Fallback (courriers créés avant bo_courrier_id). Le `numero`
                # n'est PAS unique : on ne remet à NULL qu'une ligne orpheline
                # (bo_courrier_id IS NULL) et UNIQUEMENT s'il n'y en a qu'une,
                # pour ne jamais modifier un autre courrier de même numero.
                cursor.execute(
                    """SELECT id FROM courriers
                       WHERE numero = (SELECT numero FROM bo_courriers WHERE id = %s)
                         AND sens = 'entrant'
                         AND bo_courrier_id IS NULL""",
                    (courrier_id,)
                )
                orphans = cursor.fetchall()
                if len(orphans) == 1:
                    cursor.execute(
                        "UPDATE courriers SET service_id = NULL WHERE id = %s",
                        (orphans[0]["id"],)
                    )
                elif len(orphans) > 1:
                    logger.warning(
                        "Annulation affectation service : %d courriers orphelins "
                        "partagent le numero du BO id=%s — fallback ignoré (ambiguïté).",
                        len(orphans), courrier_id
                    )
        except Exception as upd_err:
            logger.warning(f"UPDATE courriers service_id=NULL : {upd_err}")

        log_action(cursor, courrier_id, "Annulation affectation service",
                   "Chef de Division a annulé l'affectation au service",
                   int(user_id), get_client_ip())
        conn.commit()
        return jsonify({"message": "Affectation au service annulée"})
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


@bureau_ordre_bp.route("/chef/services", methods=["GET"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_get_services():
    """Retourne les services de la division du Chef de Division."""
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT role, division_id FROM utilisateurs WHERE id = %s AND actif = 1",
            (user_id,)
        )
        user = cursor.fetchone()
        if not user or user["role"] != "Chef de division":
            return jsonify({"error": "Accès refusé"}), 403

        division_id = user["division_id"]
        if not division_id:
            return jsonify({"error": "Aucune division associée à votre compte"}), 400

        cursor.execute(
            "SELECT id, nom FROM services WHERE division_id = %s ORDER BY nom",
            (int(division_id),)
        )
        return jsonify(cursor.fetchall())
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


@bureau_ordre_bp.route("/historique", methods=["GET"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def historique():
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT bh.id, bh.action, bh.details, bh.adresse_ip,
                      bh.created_at,
                      u.nom, u.prenom,
                      bc.numero
               FROM bo_historique bh
               JOIN utilisateurs u ON bh.effectue_par = u.id
               JOIN bo_courriers bc ON bh.bo_courrier_id = bc.id
               WHERE bc.saisi_par = %s
               ORDER BY bh.created_at DESC
               LIMIT 200""",
            (user_id,),
        )
        rows = cursor.fetchall()
        for r in rows:
            r["created_at"] = str(r["created_at"])
        return jsonify(rows)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── GET /bo/notifications ────────────────────────────────────────────────────

@bureau_ordre_bp.route("/notifications", methods=["GET"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def notifications():
    user_id = _jwt_user_id()
    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT n.id, n.message, n.lu, n.created_at, bc.numero
               FROM bo_notifications n
               JOIN bo_courriers bc ON n.bo_courrier_id = bc.id
               WHERE n.destinataire = %s
               ORDER BY n.created_at DESC LIMIT 50""",
            (user_id,),
        )
        rows = cursor.fetchall()
        for r in rows:
            r["created_at"] = str(r["created_at"])
        return jsonify(rows)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── DELETE /bo/documents/<id> ────────────────────────────────────────────────

@bureau_ordre_bp.route("/documents/<int:doc_id>", methods=["DELETE"])
@auth_required
@roles_required(ROLE_BUREAU_ORDRE)
def delete_document(doc_id):
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT d.chemin_stockage, bc.saisi_par
               FROM bo_documents d
               JOIN bo_courriers bc ON d.bo_courrier_id = bc.id
               WHERE d.id = %s""",
            (doc_id,),
        )
        doc = cursor.fetchone()
        if not doc:
            return jsonify({"error": "Document introuvable"}), 404
        if doc["saisi_par"] != int(user_id):
            return jsonify({"error": "Accès refusé"}), 403

        if doc["chemin_stockage"] and os.path.exists(doc["chemin_stockage"]):
            os.remove(doc["chemin_stockage"])
        cursor.execute("DELETE FROM bo_documents WHERE id = %s", (doc_id,))
        conn.commit()
        return jsonify({"message": "Document supprimé"})
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── GET /bo/documents/download/<id> ─────────────────────────────────────────

@bureau_ordre_bp.route("/documents/download/<int:doc_id>", methods=["GET"])
@auth_required
def download_document(doc_id):
    from flask import send_file
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT d.id, d.chemin_stockage, d.nom_fichier, d.mime_type, d.bo_courrier_id
               FROM bo_documents d WHERE d.id = %s""",
            (doc_id,),
        )
        doc = cursor.fetchone()
        if not doc:
            return jsonify({"error": "Fichier introuvable"}), 404

        # Contrôle d'accès AVANT toute résolution de chemin : on ne révèle pas
        # l'existence du fichier à un utilisateur non autorisé.
        if not can_access_bo_courrier_docs(cursor, int(user_id), doc["bo_courrier_id"]):
            return jsonify({"error": "Accès refusé"}), 403

        # Le chemin stocké en base est absolu et dépend du répertoire de
        # démarrage du backend : on le re-résolve proprement (avec auto-
        # réparation) au lieu de se fier uniquement à os.path.exists().
        filepath = resolve_bo_document_path(conn, cursor, doc)
        if not filepath:
            logger.error(
                "bo document %s introuvable sur le disque (nom=%s, chemin_bdd=%s)",
                doc_id, doc.get("nom_fichier"), doc.get("chemin_stockage"),
            )
            return jsonify({"error": "Fichier introuvable"}), 404

        return send_file(
            filepath,
            as_attachment=True,
            mimetype=doc["mime_type"] or "application/octet-stream",
            download_name=doc["nom_fichier"],
        )
    except Exception as e:
        logger.exception("download_document (BO) doc_id=%s", doc_id)
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── GET /bo/ref-data ─────────────────────────────────────────────────────────


# ── GET /bo/courrier-docs/<bo_courrier_id> ────────────────────────────────────
# Accessible par tous les rôles (Agent, Chef de service, Chef de division)
# pour consulter les pièces jointes d'un courrier BO après affectation

@bureau_ordre_bp.route("/courrier-docs/<int:bo_courrier_id>", methods=["GET"])
@auth_required
def get_bo_docs_public(bo_courrier_id):
    """Retourne les pièces jointes d'un courrier BO pour les utilisateurs autorisés."""
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        if not can_access_bo_courrier_docs(cursor, int(user_id), bo_courrier_id):
            return jsonify({"error": "Accès refusé"}), 403

        cursor.execute(
            """SELECT id, nom_fichier, taille_octets, mime_type, uploaded_at
               FROM bo_documents WHERE bo_courrier_id = %s""",
            (bo_courrier_id,)
        )
        docs = cursor.fetchall()
        for d in docs:
            if d.get("uploaded_at"):
                d["uploaded_at"] = str(d["uploaded_at"])
        return jsonify(docs)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


@bureau_ordre_bp.route("/ref-data", methods=["GET"])
@auth_required
def ref_data():
    """Retourne types de courrier, types de tiers et tiers pour le formulaire."""
    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, libelle FROM types_courrier ORDER BY libelle")
        types_courrier = cursor.fetchall()
        cursor.execute("SELECT id, libelle FROM type_tiers ORDER BY libelle")
        types_tiers = cursor.fetchall()
        cursor.execute(
            "SELECT t.id, t.nom, t.type_tiers_id FROM tiers t ORDER BY t.nom"
        )
        tiers = cursor.fetchall()
        cursor.execute("SELECT id, nom FROM divisions ORDER BY nom")
        divisions = cursor.fetchall()
        return jsonify({
            "types_courrier": types_courrier,
            "types_tiers": types_tiers,
            "tiers": tiers,
            "divisions": divisions,
        })
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── GET /bo/chef/courriers ────────────────────────────────────────────────────
# Accessible par le Chef de Division : liste les bo_courriers affectés à sa division

@bureau_ordre_bp.route("/chef/courriers", methods=["GET"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_list_courriers():
    """
    Retourne les courriers BO affectés à la division du Chef de Division,
    Chef de service ou Agent connecté.
    """
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT role, division_id, service_id FROM utilisateurs WHERE id = %s AND actif = 1",
            (user_id,)
        )
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        ROLES_AUTORISES = ("Chef de division", "Chef de service", "Agent")
        if user["role"] not in ROLES_AUTORISES:
            return jsonify({"error": "Accès refusé"}), 403

        division_id = user["division_id"]

        # Pour Chef de service / Agent : résoudre la division via le service
        if user["role"] in ("Chef de service", "Agent"):
            if not user.get("service_id"):
                return jsonify({"error": "Aucun service associé à votre compte"}), 400
            cursor.execute(
                "SELECT division_id FROM services WHERE id = %s",
                (user["service_id"],)
            )
            svc = cursor.fetchone()
            if not svc:
                return jsonify({"error": "Service introuvable"}), 404
            division_id = svc["division_id"]

        if not division_id:
            return jsonify({"error": "Aucune division associée à votre compte"}), 400

        search   = request.args.get("search", "").strip()
        statut   = request.args.get("statut", "").strip()
        page     = max(1, int(request.args.get("page", 1)))
        per_page = int(request.args.get("per_page", 10))
        offset   = (page - 1) * per_page

        base = """
        FROM bo_courriers bc
        LEFT JOIN tiers t          ON bc.expediteur_tiers_id      = t.id
        LEFT JOIN divisions d_exp  ON bc.expediteur_division_id   = d_exp.id
        LEFT JOIN divisions d_dest ON bc.destinataire_division_id = d_dest.id
        LEFT JOIN types_courrier tc ON bc.type_courrier_id        = tc.id
        LEFT JOIN utilisateurs u    ON bc.saisi_par               = u.id
        WHERE bc.destinataire_division_id = %s
          AND bc.statut IN ('Affecté', 'Affecté au service', 'Traité')
        """
        params = [int(division_id)]

        if search:
            base += " AND (bc.numero LIKE %s OR bc.objet LIKE %s OR bc.reference LIKE %s)"
            like = f"%{search}%"
            params += [like, like, like]
        if statut:
            base += " AND bc.statut = %s"
            params.append(statut)

        cursor.execute(f"SELECT COUNT(*) AS total {base}", params)
        total = cursor.fetchone()["total"]

        cursor.execute(
            f"""SELECT bc.id, bc.numero, bc.reference,
                       COALESCE(t.nom, d_exp.nom) AS expediteur,
                       d_dest.nom                 AS destinataire_division,
                       tc.libelle                 AS type_courrier,
                       bc.date_reception, bc.objet, bc.observations, bc.statut,
                       bc.date_saisie, bc.date_affectation,
                       u.nom AS agent_nom, u.prenom AS agent_prenom
                {base}
                ORDER BY bc.date_affectation DESC, bc.id DESC
                LIMIT %s OFFSET %s""",
            params + [per_page, offset],
        )
        rows = cursor.fetchall()
        for r in rows:
            r["date_reception"]   = str(r["date_reception"])   if r["date_reception"]   else None
            r["date_saisie"]      = str(r["date_saisie"])      if r["date_saisie"]      else None
            r["date_affectation"] = str(r["date_affectation"]) if r["date_affectation"] else None

        return jsonify({"total": total, "page": page, "per_page": per_page, "data": rows})

    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── GET /bo/chef/courriers/<id> ───────────────────────────────────────────────

@bureau_ordre_bp.route("/chef/courriers/<int:courrier_id>", methods=["GET"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_get_courrier(courrier_id):
    """Détail complet d'un courrier BO pour le Chef de Division."""
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT role, division_id FROM utilisateurs WHERE id = %s AND actif = 1",
            (user_id,)
        )
        user = cursor.fetchone()
        if not user or user["role"] not in ("Chef de division", "Chef de service", "Agent"):
            return jsonify({"error": "Accès refusé"}), 403

        division_id = user["division_id"]
        if not division_id:
            return jsonify({"error": "Aucune division associée à votre compte"}), 400

        cursor.execute(
            """SELECT bc.*,
                      COALESCE(t.nom, d_exp.nom) AS expediteur_nom,
                      d_dest.nom                 AS destinataire_division_nom,
                      tc.libelle AS type_courrier,
                      u.nom AS agent_nom, u.prenom AS agent_prenom
               FROM bo_courriers bc
               LEFT JOIN tiers t          ON bc.expediteur_tiers_id      = t.id
               LEFT JOIN divisions d_exp  ON bc.expediteur_division_id   = d_exp.id
               LEFT JOIN divisions d_dest ON bc.destinataire_division_id = d_dest.id
               LEFT JOIN types_courrier tc ON bc.type_courrier_id        = tc.id
               LEFT JOIN utilisateurs u    ON bc.saisi_par               = u.id
               WHERE bc.id = %s AND bc.destinataire_division_id = %s""",
            (courrier_id, int(division_id)),
        )
        courrier = cursor.fetchone()
        if not courrier:
            return jsonify({"error": "Courrier introuvable ou accès non autorisé"}), 404

        # Pièces jointes
        cursor.execute(
            "SELECT id, nom_fichier, taille_octets, mime_type, uploaded_at "
            "FROM bo_documents WHERE bo_courrier_id = %s",
            (courrier_id,),
        )
        courrier["documents"] = cursor.fetchall()

        # Historique
        cursor.execute(
            """SELECT bh.action, bh.details, bh.created_at, u.nom, u.prenom
               FROM bo_historique bh
               JOIN utilisateurs u ON bh.effectue_par = u.id
               WHERE bh.bo_courrier_id = %s
               ORDER BY bh.created_at DESC""",
            (courrier_id,),
        )
        courrier["historique"] = cursor.fetchall()

        for key in ("date_reception", "date_saisie", "date_affectation"):
            if courrier.get(key):
                courrier[key] = str(courrier[key])
        for h in courrier["historique"]:
            if h.get("created_at"):
                h["created_at"] = str(h["created_at"])
        for doc in courrier["documents"]:
            if doc.get("uploaded_at"):
                doc["uploaded_at"] = str(doc["uploaded_at"])

        return jsonify(courrier)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── PATCH /bo/chef/courriers/<id>/statut ─────────────────────────────────────

@bureau_ordre_bp.route("/chef/courriers/<int:courrier_id>/statut", methods=["PATCH"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_update_statut(courrier_id):
    """Le Chef de Division peut marquer un courrier comme Affecté ou Traité."""
    data        = request.get_json() or {}
    new_statut  = data.get("statut")

    STATUTS_AUTORISES = ("Affecté", "Traité")
    if new_statut not in STATUTS_AUTORISES:
        return jsonify({"error": f"Statut invalide. Valeurs acceptées : {STATUTS_AUTORISES}"}), 422

    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT role, division_id FROM utilisateurs WHERE id = %s AND actif = 1",
            (user_id,)
        )
        user = cursor.fetchone()
        if not user or user["role"] not in ("Chef de division", "Chef de service", "Agent"):
            return jsonify({"error": "Accès refusé"}), 403

        division_id = user["division_id"]
        if not division_id:
            return jsonify({"error": "Aucune division associée à votre compte"}), 400

        cursor.execute(
            "SELECT id, statut, numero FROM bo_courriers WHERE id = %s AND destinataire_division_id = %s",
            (courrier_id, int(division_id)),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"error": "Courrier introuvable"}), 404

        cursor.execute(
            "UPDATE bo_courriers SET statut = %s WHERE id = %s",
            (new_statut, courrier_id),
        )
        log_action(cursor, courrier_id, f"Statut → {new_statut}",
                   f"Chef de Division a mis le statut à « {new_statut} »",
                   int(user_id), get_client_ip())
        conn.commit()
        return jsonify({"message": f"Statut mis à jour : {new_statut}"})
    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


# ── GET /bo/chef/notifications ────────────────────────────────────────────────

@bureau_ordre_bp.route("/chef/notifications", methods=["GET"])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def chef_notifications():
    """Notifications non lues pour le Chef de Division authentifié (depuis JWT)."""
    user_id = _jwt_user_id()

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT n.id, n.message, n.lu, n.created_at, bc.numero
               FROM bo_notifications n
               JOIN bo_courriers bc ON n.bo_courrier_id = bc.id
               WHERE n.destinataire = %s
               ORDER BY n.created_at DESC LIMIT 50""",
            (user_id,),
        )
        rows = cursor.fetchall()
        for r in rows:
            r["created_at"] = str(r["created_at"])

        # Marquer toutes comme lues
        cursor.execute(
            "UPDATE bo_notifications SET lu = TRUE WHERE destinataire = %s AND lu = FALSE",
            (user_id,),
        )
        conn.commit()
        return jsonify(rows)
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()
