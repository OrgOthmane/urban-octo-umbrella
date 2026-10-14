from flask import Blueprint, request, jsonify
from db import get_connection
from routes.auth_helpers import auth_required, roles_required, ROLE_CHEF_DIVISION
from logger_config import get_logger

tiers_bp = Blueprint('tiers', __name__)
logger = get_logger(__name__)

@tiers_bp.route('/type_tiers', methods=['GET'])
@auth_required
def get_type_tiers():
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM type_tiers")
        types = cursor.fetchall()
        return jsonify(types)
    except Exception as e:
        logger.exception("Erreur get_type_tiers")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()

@tiers_bp.route('/tiers', methods=['GET'])
@auth_required
def get_tiers():
    type_tiers_id = request.args.get('type_tiers_id')
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        if type_tiers_id:
            cursor.execute("SELECT * FROM tiers WHERE type_tiers_id = %s", (type_tiers_id,))
        else:
            cursor.execute("SELECT * FROM tiers")
        tiers = cursor.fetchall()
        return jsonify(tiers)
    except Exception as e:
        logger.exception("Erreur get_tiers")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()
