from flask import Blueprint, request, jsonify
from db import get_connection
from routes.auth_helpers import auth_required, roles_required, ROLE_CHEF_DIVISION
from logger_config import get_logger

divisions_bp = Blueprint('divisions', __name__)
logger = get_logger(__name__)

@divisions_bp.route('/divisions', methods=['GET'])
@auth_required
def get_divisions():

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM divisions")
        divisions = cursor.fetchall()
        return jsonify(divisions)
    except Exception as e:
        logger.exception("Erreur get_divisions")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()

@divisions_bp.route('/services', methods=['GET'])
@auth_required
def get_services():
    division_id = request.args.get('division_id')
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        if division_id:
            cursor.execute("SELECT * FROM services WHERE division_id = %s", (division_id,))
        else:
            cursor.execute("SELECT * FROM services")
        services = cursor.fetchall()
        return jsonify(services)
    except Exception as e:
        logger.exception("Erreur get_services")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()
