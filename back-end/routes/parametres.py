import logging
from flask import Blueprint, request, jsonify
from db import get_connection
from routes.auth_helpers import auth_required, roles_required, ROLE_CHEF_DIVISION
from logger_config import get_logger

parametres_bp = Blueprint('parametres', __name__)
logger = get_logger(__name__)

def _generic_error(e):
    logging.exception("Erreur parametres")
    return jsonify({"error": "Erreur serveur."}), 500



@parametres_bp.route('/types-courrier', methods=['GET'])
@auth_required
def get_types_courrier():
    try:
        conn = get_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, libelle FROM types_courrier ORDER BY id")
        return jsonify(cursor.fetchall())
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/types-courrier', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def create_type_courrier():
    data = request.get_json() or {}
    if not data.get('libelle'): return jsonify({"error": "Libellé requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("INSERT INTO types_courrier (libelle) VALUES (%s)", (data['libelle'],))
        conn.commit()
        return jsonify({"id": cursor.lastrowid, "libelle": data['libelle']}), 201
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/types-courrier/<int:type_id>', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def update_type_courrier(type_id):
    data = request.get_json() or {}
    if not data.get('libelle'): return jsonify({"error": "Libellé requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("UPDATE types_courrier SET libelle = %s WHERE id = %s", (data['libelle'], type_id))
        conn.commit()
        return jsonify({"id": type_id, "libelle": data['libelle']})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/types-courrier/<int:type_id>', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_type_courrier(type_id):
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("DELETE FROM types_courrier WHERE id = %s", (type_id,))
        conn.commit()
        return jsonify({"message": "Supprimé avec succès"})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()



@parametres_bp.route('/types-tiers', methods=['GET'])
@auth_required
def get_types_tiers():
    try:
        conn = get_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, libelle FROM type_tiers ORDER BY id")
        return jsonify(cursor.fetchall())
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/types-tiers', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def create_type_tiers():
    data = request.get_json() or {}
    if not data.get('libelle'): return jsonify({"error": "Libellé requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("INSERT INTO type_tiers (libelle) VALUES (%s)", (data['libelle'],))
        conn.commit()
        return jsonify({"id": cursor.lastrowid, "libelle": data['libelle']}), 201
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/types-tiers/<int:type_id>', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def update_type_tiers(type_id):
    data = request.get_json() or {}
    if not data.get('libelle'): return jsonify({"error": "Libellé requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("UPDATE type_tiers SET libelle = %s WHERE id = %s", (data['libelle'], type_id))
        conn.commit()
        return jsonify({"id": type_id, "libelle": data['libelle']})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/types-tiers/<int:type_id>', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_type_tiers(type_id):
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("DELETE FROM type_tiers WHERE id = %s", (type_id,))
        conn.commit()
        return jsonify({"message": "Supprimé avec succès"})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()


# ── Tiers ─────────────────────────────────────────────────────────────────────

@parametres_bp.route('/tiers', methods=['GET'])
@auth_required
def get_tiers():
    type_tiers_id = request.args.get('type_tiers_id')
    try:
        conn = get_connection(); cursor = conn.cursor(dictionary=True)
        if type_tiers_id:
            cursor.execute(
                "SELECT t.id, t.nom, t.type_tiers_id, tt.libelle as type_libelle FROM tiers t LEFT JOIN type_tiers tt ON t.type_tiers_id = tt.id WHERE t.type_tiers_id = %s ORDER BY t.nom",
                (type_tiers_id,)
            )
        else:
            cursor.execute("SELECT t.id, t.nom, t.type_tiers_id, tt.libelle as type_libelle FROM tiers t LEFT JOIN type_tiers tt ON t.type_tiers_id = tt.id ORDER BY t.nom")
        return jsonify(cursor.fetchall())
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/tiers', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def create_tiers():
    data = request.get_json() or {}
    if not data.get('nom') or not data.get('type_tiers_id'):
        return jsonify({"error": "Nom et type requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("INSERT INTO tiers (nom, type_tiers_id) VALUES (%s, %s)", (data['nom'], data['type_tiers_id']))
        conn.commit()
        return jsonify({"id": cursor.lastrowid, "nom": data['nom'], "type_tiers_id": data['type_tiers_id']}), 201
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/tiers/<int:tiers_id>', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def update_tiers(tiers_id):
    data = request.get_json() or {}
    if not data.get('nom') or not data.get('type_tiers_id'):
        return jsonify({"error": "Nom et type requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("UPDATE tiers SET nom = %s, type_tiers_id = %s WHERE id = %s", (data['nom'], data['type_tiers_id'], tiers_id))
        conn.commit()
        return jsonify({"id": tiers_id, "nom": data['nom'], "type_tiers_id": data['type_tiers_id']})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/tiers/<int:tiers_id>', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_tiers(tiers_id):
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("DELETE FROM tiers WHERE id = %s", (tiers_id,))
        conn.commit()
        return jsonify({"message": "Supprimé avec succès"})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()


# ── Divisions ─────────────────────────────────────────────────────────────────

@parametres_bp.route('/divisions-param', methods=['GET'])
@auth_required
def get_divisions_param():
    try:
        conn = get_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, nom FROM divisions ORDER BY nom")
        return jsonify(cursor.fetchall())
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/divisions-param', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def create_division_param():
    data = request.get_json() or {}
    if not data.get('nom'): return jsonify({"error": "Nom requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("INSERT INTO divisions (nom) VALUES (%s)", (data['nom'],))
        conn.commit()
        return jsonify({"id": cursor.lastrowid, "nom": data['nom']}), 201
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/divisions-param/<int:div_id>', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def update_division_param(div_id):
    data = request.get_json() or {}
    if not data.get('nom'): return jsonify({"error": "Nom requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("UPDATE divisions SET nom = %s WHERE id = %s", (data['nom'], div_id))
        conn.commit()
        return jsonify({"id": div_id, "nom": data['nom']})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/divisions-param/<int:div_id>', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_division_param(div_id):
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("DELETE FROM divisions WHERE id = %s", (div_id,))
        conn.commit()
        return jsonify({"message": "Supprimé avec succès"})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()


# ── Services ──────────────────────────────────────────────────────────────────

@parametres_bp.route('/services-param', methods=['GET'])
@auth_required
def get_services_param():
    try:
        conn = get_connection(); cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT s.id, s.nom, s.division_id, d.nom as division_nom
            FROM services s LEFT JOIN divisions d ON s.division_id = d.id ORDER BY s.nom
        """)
        return jsonify(cursor.fetchall())
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/services-param', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def create_service_param():
    data = request.get_json() or {}
    if not data.get('nom') or not data.get('division_id'):
        return jsonify({"error": "Nom et division requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("INSERT INTO services (nom, division_id) VALUES (%s, %s)", (data['nom'], data['division_id']))
        conn.commit()
        return jsonify({"id": cursor.lastrowid, "nom": data['nom'], "division_id": data['division_id']}), 201
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/services-param/<int:service_id>', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def update_service_param(service_id):
    data = request.get_json() or {}
    if not data.get('nom') or not data.get('division_id'):
        return jsonify({"error": "Nom et division requis"}), 400
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("UPDATE services SET nom = %s, division_id = %s WHERE id = %s", (data['nom'], data['division_id'], service_id))
        conn.commit()
        return jsonify({"id": service_id, "nom": data['nom'], "division_id": data['division_id']})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()

@parametres_bp.route('/services-param/<int:service_id>', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_service_param(service_id):
    try:
        conn = get_connection(); cursor = conn.cursor()
        cursor.execute("DELETE FROM services WHERE id = %s", (service_id,))
        conn.commit()
        return jsonify({"message": "Supprimé avec succès"})
    except Exception as e: return _generic_error(e)
    finally: cursor.close(); conn.close()
