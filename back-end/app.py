import os
import logging
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from werkzeug.exceptions import HTTPException

from logger_config import get_logger
from limiter_ext import limiter

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logger = get_logger(__name__)

_SECRET_KEY = os.getenv("SECRET_KEY")
_DEFAULT_PREFIXES = (
    "CHANGEZ_MOI",
    "CHANGE_THIS",
    "CHANGE_ME",
    "DEFAULT",
    "PLACEHOLDER",
    "SAMPLE",
    "EXEMPLE",
    "EXAMPLE",
)
_SK_UPPER = (_SECRET_KEY or "").strip().upper()
_SK_TOO_SHORT = bool(_SECRET_KEY) and len(_SECRET_KEY.strip()) < 16
_SK_IS_DEFAULT = (
    not _SECRET_KEY
    or not _SECRET_KEY.strip()
    or any(_SK_UPPER.startswith(p) for p in _DEFAULT_PREFIXES)
)
if _SK_IS_DEFAULT or _SK_TOO_SHORT:
    if _SK_TOO_SHORT and not _SK_IS_DEFAULT:
        logger.error(
            "SECRET_KEY trop courte (< 16 caractères). "
            "Générez une clé forte : python -c \"import secrets; print(secrets.token_hex(64))\" "
            "puis renseignez-la dans back-end/.env"
        )
        raise RuntimeError(
            "SECRET_KEY trop courte (< 16 caractères).\n"
            "Générez une clé forte : python -c \"import secrets; print(secrets.token_hex(64))\"\n"
            "puis renseignez-la dans back-end/.env"
        )
    logger.error(
        "SECRET_KEY non configurée ou toujours à sa valeur par défaut. "
        "Générez une clé forte : python -c \"import secrets; print(secrets.token_hex(64))\" "
        "puis renseignez-la dans back-end/.env"
    )
    raise RuntimeError(
        "SECRET_KEY non configurée ou toujours à sa valeur par défaut.\n"
        "Générez une clé forte : python -c \"import secrets; print(secrets.token_hex(64))\"\n"
        "puis renseignez-la dans back-end/.env"
    )

app = Flask(__name__)

app.config["SECRET_KEY"] = _SECRET_KEY

# Limite globale du corps de requête (10 MB), cohérente avec la limite
# applicative déjà appliquée aux uploads (routes/courriers.py et
# routes/bureau_ordre.py) et avec client_max_body_size dans nginx.conf.
# Sans elle, une requête envoyée directement sur le port 5000 (sans passer par
# nginx) pouvait faire saturer le disque ou la mémoire du serveur.
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

app.config["JWT_SECRET_KEY"] = _SECRET_KEY
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(
    hours=int(os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", "8"))
)
app.config["JWT_TOKEN_LOCATION"] = ["headers", "query_string"]
app.config["JWT_HEADER_NAME"] = "Authorization"
app.config["JWT_HEADER_TYPE"] = "Bearer"
app.config["JWT_QUERY_STRING_NAME"] = "token"

jwt = JWTManager(app)


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({"error": "Token expiré. Veuillez vous reconnecter."}), 401


@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({"error": "Token invalide."}), 401


@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({"error": "Authentification requise."}), 401


_limiter_enabled = os.getenv("RATELIMIT_ENABLED", "true").lower() not in ("0", "false", "no", "off")
# Le limiter est une instance partagée (voir limiter_ext.py), importée par les
# routes pour décorer les endpoints sensibles (ex. /login limité à 10/min).
# On l'initialise ici avec l'app. Flask-Limiter respecte nativement le flag
# RATELIMIT_ENABLED : à false, aucune limite n'est appliquée.
app.config["RATELIMIT_ENABLED"] = _limiter_enabled
try:
    limiter.init_app(app)
    if _limiter_enabled:
        logger.info("Flask-Limiter ACTIVÉ (mémoire locale) — /login limité à 10/min")
    else:
        logger.info("Flask-Limiter DÉSACTIVÉ (RATELIMIT_ENABLED=false)")
except Exception as _lim_err:
    logger.warning("Flask-Limiter indisponible (%s) — poursuite sans rate limit", _lim_err)

_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
# Accepter aussi l'équivalent IPv4 (127.0.0.1) pour éviter les problèmes
# de résolution IPv6/IPv4 selon le navigateur
_frontend_origins = [_frontend_url]
if "localhost" in _frontend_url:
    _frontend_origins.append(_frontend_url.replace("localhost", "127.0.0.1"))
CORS(
    app,
    origins=_frontend_origins,
    supports_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
    methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
)

from routes.auth import auth_bp
from routes.users import users_bp
from routes.divisions import divisions_bp
from routes.courriers import courriers_bp
from routes.courriers_entrants import courriers_entrants_bp
from routes.courriers_sortants import courriers_sortants_bp
from routes.tiers import tiers_bp
from routes.parametres import parametres_bp
from routes.bureau_ordre import bureau_ordre_bp
from routes.notifications import notifications_bp, start_notification_scheduler
from routes.telechargements import telechargements_bp

app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(divisions_bp)
app.register_blueprint(courriers_bp)
app.register_blueprint(courriers_entrants_bp)
app.register_blueprint(courriers_sortants_bp)
app.register_blueprint(tiers_bp)
app.register_blueprint(parametres_bp)
app.register_blueprint(bureau_ordre_bp)
app.register_blueprint(notifications_bp)
app.register_blueprint(telechargements_bp)

start_notification_scheduler(app)

@app.errorhandler(Exception)
def handle_unexpected_error(e):
    # Laisser passer les exceptions HTTP natives (404, 413, 429 du rate limiter,
    # etc.) avec leur code/statut d'origine. Sans cela, le gestionnaire global
    # transformerait ces réponses attendues en 500 générique.
    if isinstance(e, HTTPException):
        return e
    logger.exception("Erreur non gérée : %s", e)
    return jsonify({"error": "Une erreur interne est survenue."}), 500


if __name__ == "__main__":
    debug_mode = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    if debug_mode:
        logger.warning("FLASK_DEBUG=true — NE PAS utiliser cette configuration en production.")
    else:
        logger.info("Démarrage en mode production (FLASK_DEBUG=false)")
    logger.info(f"Démarrage du serveur Flask sur host=0.0.0.0, port=5000, debug={debug_mode}")
    app.run(debug=debug_mode, host="0.0.0.0", port=5000)
