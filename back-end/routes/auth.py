import logging
import bcrypt
from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from db import get_connection
from logger_config import get_logger
from limiter_ext import limiter

auth_bp = Blueprint("auth", __name__)
logger = get_logger(__name__)

# Hash bcrypt factice. Sans lui, une connexion avec un identifiant INCONNU
# revenait immédiatement (aucun `checkpw` exécuté) alors qu'un identifiant
# EXISTANT coûtait ~250 ms de bcrypt : la différence de temps de réponse
# permettait d'énumérer les comptes valides. On exécute donc toujours `checkpw`.
_DUMMY_HASH = b"$2b$12$F38sl5z0WuEeiCGkvsY3kOSOMPut22GqT7plO1QXMtUNqkkCEo3T2"


@auth_bp.route("/login", methods=["POST"])
@limiter.limit("10 per minute")
def login():
    """Authentification — protégée contre le brute-force par Flask-Limiter (10/min)."""
    data = request.get_json(silent=True) or {}

    identite    = (data.get("identite")    or "").strip()
    mot_de_passe = data.get("motDePasse") or ""

    logger.info("Tentative de connexion pour identite=%s", identite)

    if not identite or not mot_de_passe:
        return jsonify({"error": "Identifiant et mot de passe requis."}), 400

    if len(identite) > 100 or len(mot_de_passe) > 256:
        return jsonify({"error": "Données invalides."}), 400

    conn   = None
    cursor = None
    try:
        logger.info("Connexion a la base de donnees...")
        conn   = get_connection()
        cursor = conn.cursor(dictionary=True)
        logger.info("Connexion base de donnees OK")

        logger.info(f"Execution requete SQL pour identite: {identite}")
        cursor.execute(
            """
            SELECT u.id, u.nom, u.prenom, u.identite, u.role, u.actif,
                   u.mot_de_passe, u.grade, u.email, u.numero,
                   u.division_id, u.service_id,
                   d.nom AS division, s.nom AS service
            FROM utilisateurs u
            LEFT JOIN divisions d ON u.division_id = d.id
            LEFT JOIN services  s ON u.service_id  = s.id
            WHERE u.identite = %s
            """,
            (identite,),
        )
        user = cursor.fetchone()
        logger.info(f"Utilisateur trouve: {user is not None}")

        if user and not user.get("actif"):
            logger.info(f"Compte desactive pour utilisateur: {identite}")
            return jsonify({"success": False, "message": "Compte désactivé."}), 403

        # Le hash retombe sur le factice quand l'identifiant est inconnu (ou que
        # le hash stocké est vide) : `checkpw` est donc TOUJOURS exécuté, le temps
        # de réponse ne révèle plus si le compte existe, et `bool(user)` garantit
        # qu'un hash factice ne peut jamais authentifier quelqu'un.
        stored_hash = (user["mot_de_passe"] or "").encode("utf-8") if user else b""
        if not stored_hash:
            stored_hash = _DUMMY_HASH
        password_ok = False
        try:
            password_ok = bool(user) and bcrypt.checkpw(mot_de_passe.encode("utf-8"), stored_hash)
            logger.info("Verification mot de passe: %s", password_ok)
        except Exception as e:
            logger.error("Erreur verification mot de passe: %s", e)
            password_ok = False

        if not user or not password_ok:
                logger.info(f"Authentification echouee pour: {identite}")
                return jsonify({"success": False, "message": "Identifiant ou mot de passe incorrect."}), 401

        user_data = {
            "id":          user["id"],
            "nom":         user["nom"],
            "prenom":      user["prenom"],
            "identite":    user["identite"],
            "role":        user["role"],
            "grade":       user["grade"],
            "email":       user["email"],
            "numero":      user["numero"],
            "division_id": user["division_id"],
            "service_id":  user["service_id"],
            "division":    user["division"],
            "service":     user["service"],
        }

        token = create_access_token(
            identity=str(user["id"]),
            additional_claims={"role": user["role"]},
        )

        logger.info("Connexion réussie pour l'utilisateur id=%s", user["id"])

        return jsonify({
            "success": True,
            "token":   token,
            "user":    user_data,
        })

    except Exception as e:
        logging.exception("Erreur inattendue lors du login")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()
