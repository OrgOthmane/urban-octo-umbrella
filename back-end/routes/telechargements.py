import logging
import os
from flask import Blueprint, request, jsonify, send_file
from db import get_connection
from routes.auth_helpers import auth_required, get_current_user, ROLE_CHEF_DIVISION
from logger_config import get_logger

telechargements_bp = Blueprint("telechargements", __name__, url_prefix="/telechargements")
logger = get_logger(__name__)

# Dossier d'export légitime, avec le même chemin robuste basé sur __file__ que
# routes/courriers.py. Aucun fichier situé hors de ce dossier ne doit jamais
# être servi ni supprimé via ce blueprint.
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXPORT_FOLDER = os.path.realpath(os.path.join(BASE_DIR, "exports"))


def _safe_export_path(raw_path):
    """Retourne le chemin absolu réel s'il est strictement contenu dans
    EXPORT_FOLDER, sinon None.

    Pourquoi : `pdf_downloads.chemin_stockage` est alimenté depuis la requête
    cliente (POST /telechargements/record). Sans ce contrôle, un compte à
    faibles privilèges pouvait y inscrire n'importe quel chemin du serveur
    (ex. back-end/.env) puis le faire servir (lecture arbitraire, y compris de
    la SECRET_KEY) ou le faire supprimer via DELETE.

    La vérification porte sur le chemin résolu (realpath) pour neutraliser les
    séquences `..` et les liens symboliques.
    """
    if not raw_path:
        return None
    try:
        candidate = os.path.realpath(str(raw_path))
    except (TypeError, ValueError, OSError):
        return None
    # Le fichier doit résider DANS EXPORT_FOLDER : un simple préfixe texte ne
    # suffit pas (exports_evil ne doit pas passer), d'où le séparateur ajouté.
    if candidate != EXPORT_FOLDER and not candidate.startswith(EXPORT_FOLDER + os.sep):
        return None
    return candidate


@telechargements_bp.route("/record", methods=["POST"])
@auth_required
def record_download():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    data = request.get_json() or {}
    if not data.get("nom_fichier"):
        return jsonify({"error": "Champ requis : nom_fichier"}), 400

    data["user_id"] = user["id"]

    # SÉCURITÉ : refuser tout chemin de stockage qui ne pointe pas vers le
    # dossier d'export. Un chemin vide reste accepté (comportement existant).
    raw_chemin = data.get("chemin_stockage")
    chemin_stockage = _safe_export_path(raw_chemin)
    if raw_chemin and chemin_stockage is None:
        logger.warning(
            "chemin_stockage refusé car hors du dossier d'export : user_id=%s valeur=%r",
            user["id"], raw_chemin,
        )
        return jsonify({"error": "Chemin de stockage invalide."}), 400

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            """SELECT id FROM pdf_downloads
               WHERE user_id = %s AND nom_fichier = %s AND courrier_id <=> %s
               LIMIT 1""",
            (data["user_id"], data["nom_fichier"], data.get("courrier_id"))
        )
        existing = cursor.fetchone()
        if existing:
            cursor.execute(
                "UPDATE pdf_downloads SET generated_at = NOW() WHERE id = %s",
                (existing["id"],)
            )
            conn.commit()
            return jsonify({"message": "updated", "id": existing["id"]})

        cursor.execute(
            """INSERT INTO pdf_downloads
               (user_id, courrier_id, courrier_numero, courrier_ref,
                courrier_sens, courrier_objet, nom_fichier,
                chemin_stockage, taille_octets)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                data["user_id"],
                data.get("courrier_id"),
                data.get("courrier_numero"),
                data.get("courrier_ref"),
                data.get("courrier_sens"),
                data.get("courrier_objet"),
                data["nom_fichier"],
                chemin_stockage,
                data.get("taille_octets"),
            )
        )
        new_id = cursor.lastrowid
        conn.commit()
        return jsonify({"message": "recorded", "id": new_id}), 201

    except Exception as e:
        if conn: conn.rollback()
        logger.exception("Erreur record_download")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()


# ── GET /telechargements ─────────────────────────────────────────────────────
@telechargements_bp.route("", methods=["GET"])
@auth_required
def list_downloads():
    """
    Liste les PDFs de l'utilisateur authentifié.
    Les admins (Chef de division) voient tout.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    user_id  = user["id"]
    is_admin = user["role"] == ROLE_CHEF_DIVISION

    search     = request.args.get("search",     "").strip()
    sens       = request.args.get("sens",        "").strip()
    date_debut = request.args.get("date_debut",  "").strip()
    date_fin   = request.args.get("date_fin",    "").strip()

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        base = """
            FROM pdf_downloads pd
            JOIN utilisateurs u ON pd.user_id = u.id
            WHERE 1=1
        """
        params = []

        if not is_admin:
            base += " AND pd.user_id = %s"
            params.append(user_id)

        if search:
            base += """ AND (
                pd.courrier_ref    LIKE %s OR
                pd.courrier_objet  LIKE %s OR
                pd.courrier_numero LIKE %s OR
                pd.nom_fichier     LIKE %s
            )"""
            like = f"%{search}%"
            params += [like, like, like, like]

        if sens:
            base += " AND pd.courrier_sens = %s"
            params.append(sens)

        if date_debut:
            base += " AND DATE(pd.generated_at) >= %s"
            params.append(date_debut)

        if date_fin:
            base += " AND DATE(pd.generated_at) <= %s"
            params.append(date_fin)

        cursor.execute(f"SELECT COUNT(*) AS total {base}", params)
        total = cursor.fetchone()["total"]

        cursor.execute(
            f"""SELECT
                    pd.id,
                    pd.courrier_id,
                    pd.courrier_numero,
                    pd.courrier_ref,
                    pd.courrier_sens,
                    pd.courrier_objet,
                    pd.nom_fichier,
                    pd.chemin_stockage,
                    pd.taille_octets,
                    pd.generated_at,
                    pd.user_id,
                    u.nom    AS user_nom,
                    u.prenom AS user_prenom,
                    COALESCE(t_exp.nom,  d_exp.nom)  AS expediteur,
                    COALESCE(t_dest.nom, d_dest.nom) AS destinataire
                FROM pdf_downloads pd
                JOIN utilisateurs u ON pd.user_id = u.id
                LEFT JOIN courriers  c      ON pd.courrier_id            = c.id
                LEFT JOIN tiers      t_exp  ON c.expediteur_tiers_id     = t_exp.id
                LEFT JOIN divisions  d_exp  ON c.expediteur_division_id  = d_exp.id
                LEFT JOIN tiers      t_dest ON c.destinataire_tiers_id   = t_dest.id
                LEFT JOIN divisions  d_dest ON c.destinataire_division_id = d_dest.id
                WHERE 1=1
                {base.split('WHERE 1=1')[1]}
                ORDER BY pd.generated_at DESC
                LIMIT 200""",
            params
        )
        rows = cursor.fetchall()
        for r in rows:
            if r.get("generated_at"):
                r["generated_at"] = str(r["generated_at"])
            # Indique si le fichier physique est accessible. Le chemin est
            # re-validé afin de ne pas offrir une sonde d'existence sur des
            # fichiers arbitraires du serveur (défense en profondeur).
            chemin = _safe_export_path(r.get("chemin_stockage"))
            r["file_exists"] = bool(chemin and os.path.exists(chemin))

        return jsonify({"total": total, "data": rows})

    except Exception as e:
        logging.exception("Erreur list_downloads")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()


# ── GET /telechargements/serve/<int:dl_id> ───────────────────────────────────
@telechargements_bp.route("/serve/<int:dl_id>", methods=["GET"])
@auth_required
def serve_pdf(dl_id):
    """
    Sert le PDF pour prévisualisation inline (ne force pas le téléchargement).
    L'identité est tirée du JWT — le user_id en query string est ignoré.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Accès refusé."}), 403

    user_id  = user["id"]
    is_admin = user["role"] == ROLE_CHEF_DIVISION

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT * FROM pdf_downloads WHERE id = %s", (dl_id,))
        doc = cursor.fetchone()
        if not doc:
            return jsonify({"error": "Document introuvable."}), 404

        # Vérification des droits : propriétaire ou admin
        if not is_admin and int(doc["user_id"]) != int(user_id):
            return jsonify({"error": "Accès refusé."}), 403

        # SÉCURITÉ : défense en profondeur. Même un enregistrement créé avant ce
        # correctif avec un chemin illégitime ne peut plus être servi.
        filepath = _safe_export_path(doc.get("chemin_stockage"))
        if not filepath:
            logger.warning(
                "serve_pdf : chemin_stockage hors du dossier d'export refusé (dl_id=%s)",
                dl_id,
            )
            return jsonify({"error": "Fichier introuvable."}), 404
        if not os.path.exists(filepath):
            return jsonify({"error": "Fichier introuvable."}), 404

        return send_file(
            filepath,
            mimetype="application/pdf",
            as_attachment=False,          # inline — pas de téléchargement forcé
            download_name=doc["nom_fichier"],
        )

    except Exception as e:
        logger.exception("Erreur serve_pdf")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()


# ── DELETE /telechargements/<int:dl_id> ─────────────────────────────────────
@telechargements_bp.route("/<int:dl_id>", methods=["DELETE"])
@auth_required
def delete_download(dl_id):
    """
    Supprime un PDF téléchargé de la base de données et du stockage.
    Accessible à tous les utilisateurs pour leurs propres téléchargements.
    """
    user = get_current_user()
    if not user:
        return jsonify({"error": "Accès refusé."}), 403

    user_id  = user["id"]
    is_admin = user["role"] == ROLE_CHEF_DIVISION

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Récupérer le document
        cursor.execute("SELECT * FROM pdf_downloads WHERE id = %s", (dl_id,))
        doc = cursor.fetchone()
        if not doc:
            return jsonify({"error": "Document introuvable."}), 404

        # Vérification des droits : propriétaire ou admin
        if not is_admin and int(doc["user_id"]) != int(user_id):
            return jsonify({"error": "Accès refusé."}), 403

        # SÉCURITÉ : ne supprimer le fichier physique que s'il se trouve bien
        # dans le dossier d'export. Sans ce contrôle, cet endpoint permettait de
        # supprimer n'importe quel fichier accessible au processus Flask
        # (ex. back-end/.env, pièces jointes, sauvegardes).
        filepath = _safe_export_path(doc.get("chemin_stockage"))
        if not filepath:
            if doc.get("chemin_stockage"):
                logger.warning(
                    "delete_download : chemin_stockage hors du dossier d'export, "
                    "suppression du fichier ignorée (dl_id=%s)", dl_id,
                )
        elif os.path.exists(filepath):
            try:
                os.remove(filepath)
                logger.info(f"Fichier supprimé : {filepath}")
            except Exception as e:
                logger.error(f"Erreur suppression fichier {filepath}: {e}")
                # Continuer même si la suppression du fichier échoue

        # Supprimer l'enregistrement de la base de données
        cursor.execute("DELETE FROM pdf_downloads WHERE id = %s", (dl_id,))
        conn.commit()

        logger.info(f"Téléchargement supprimé : id={dl_id}, user_id={user_id}")
        return jsonify({"message": "Document supprimé avec succès."}), 200

    except Exception as e:
        if conn: conn.rollback()
        logger.exception("Erreur delete_download")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()
