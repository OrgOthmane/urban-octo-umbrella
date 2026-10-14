import logging
from functools import wraps

from flask import jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity, get_jwt

from db import get_connection



def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            verify_jwt_in_request()
        except Exception:
            return jsonify({"error": "Authentification requise."}), 401
        return fn(*args, **kwargs)
    return wrapper



def roles_required(*allowed_roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            claims = get_jwt()
            role   = claims.get("role", "")
            if role not in allowed_roles:
                logging.warning(
                    "Accès refusé : user_id=%s rôle=%s tente d'accéder à une route réservée à %s",
                    get_jwt_identity(), role, allowed_roles,
                )
                return jsonify({"error": "Accès non autorisé pour votre rôle."}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator



def get_current_user():
    user_id = get_jwt_identity()
    if not user_id:
        return None

    conn   = None
    cursor = None
    try:
        conn   = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT u.id, u.nom, u.prenom, u.identite, u.role, u.actif,
                   u.division_id, u.service_id,
                   d.nom AS division, s.nom AS service
            FROM utilisateurs u
            LEFT JOIN divisions d ON u.division_id = d.id
            LEFT JOIN services  s ON u.service_id  = s.id
            WHERE u.id = %s AND u.actif = 1
            """,
            (int(user_id),),
        )
        return cursor.fetchone()
    except Exception:
        logging.exception("Erreur lors de la récupération de l'utilisateur courant")
        return None
    finally:
        if cursor: cursor.close()
        if conn:   conn.close()



ROLE_CHEF_DIVISION  = "Chef de division"
ROLE_CHEF_SERVICE   = "Chef de service"
ROLE_AGENT          = "Agent"
ROLE_BUREAU_ORDRE   = "Agent du Bureau d'Ordre"

ALL_INTERNAL_ROLES  = (ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT, ROLE_BUREAU_ORDRE)
MANAGEMENT_ROLES    = (ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE)
COURRIER_ROLES      = (ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)


def refus_si_perimetre_manquant(role, service_id, division_id, user_id=None):
    """Garde-fou FAIL-CLOSED pour les rôles dont l'accès est borné à un périmètre.

    Retourne un tuple ``(response, 403)`` lorsque le rôle est censé être filtré
    par service ou par division mais que l'identifiant correspondant est absent
    (NULL en base) ; retourne ``None`` dans tous les autres cas.

    Pourquoi ce garde-fou existe :
        Les routes de courriers construisent leur filtrage ainsi :
            if role in (Chef de service, Agent) and service_id:  ...filtre...
            elif role == Chef de division and division_id:       ...filtre...
        Quand service_id/division_id est NULL, AUCUNE des deux branches ne
        s'applique : la requête partait alors SANS clause WHERE de périmètre et
        l'utilisateur voyait (ou modifiait) les courriers de TOUTE
        l'administration. Ce cas est désormais un refus explicite.

    Les rôles non concernés — notamment ROLE_BUREAU_ORDRE, dont la vision
    transversale du courrier est le métier — retournent None et conservent
    strictement leur comportement existant.

    Usage :
        _refus = refus_si_perimetre_manquant(role, service_id, division_id, user.get("id"))
        if _refus:
            return _refus
    """
    if role in (ROLE_CHEF_SERVICE, ROLE_AGENT):
        if service_id:
            return None
        manquant = "service"
    elif role == ROLE_CHEF_DIVISION:
        if division_id:
            return None
        manquant = "division"
    else:
        # Rôle hors périmètre (ex. Agent du Bureau d'Ordre) : comportement inchangé.
        return None

    logging.warning(
        "Périmètre manquant : user_id=%s rôle=%s service_id=%s division_id=%s — accès refusé",
        user_id, role, service_id, division_id,
    )
    return (
        jsonify({
            "error": f"Aucun {manquant} n'est associé à votre compte : "
                     f"impossible de déterminer votre périmètre d'accès."
        }),
        403,
    )
