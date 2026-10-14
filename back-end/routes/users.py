import logging
import bcrypt
from flask import Blueprint, request, jsonify
from db import get_connection
from routes.auth_helpers import (
    auth_required, roles_required, get_current_user,
    ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE,
)
from logger_config import get_logger

users_bp = Blueprint('users', __name__)
logger = get_logger(__name__)

@users_bp.route('/utilisateurs', methods=['GET'])
@auth_required
def get_utilisateurs():
    try:
        user = get_current_user()
        if not user:
            return jsonify({"error": "Utilisateur non authentifié"}), 401
        
        # Paramètres de pagination
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        offset = (page - 1) * per_page
        
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        
        query = """
        SELECT u.id, u.nom, u.prenom, u.grade, u.email, u.numero,
               u.role, u.actif, u.cin, u.identite,
               u.division_id, u.service_id,
               d.nom AS division_nom, s.nom AS service_nom
        FROM utilisateurs u
        LEFT JOIN divisions d ON u.division_id = d.id
        LEFT JOIN services  s ON u.service_id  = s.id
        """
        count_query = """
        SELECT COUNT(*) as total
        FROM utilisateurs u
        """
        params = []
        
        if user["role"] == "Chef de service":
            if not user.get("service_id"):
                return jsonify({"error": "Aucun service associé à ce Chef de service"}), 400
            query += " WHERE u.service_id = %s"
            count_query += " WHERE u.service_id = %s"
            params.append(user["service_id"])
        elif user["role"] == "Chef de division":
            if not user.get("division_id"):
                return jsonify({"error": "Aucune division associée à ce Chef de division"}), 400
            query += " WHERE u.division_id = %s"
            count_query += " WHERE u.division_id = %s"
            params.append(user["division_id"])
        else:
            return jsonify({"error": "Accès refusé"}), 403
        
        # Compter le total pour la pagination
        cursor.execute(count_query, tuple(params))
        total = cursor.fetchone()['total']
        
        # Ajouter pagination à la requête principale
        query += " ORDER BY u.nom ASC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        
        cursor.execute(query, tuple(params))
        users = cursor.fetchall()
        
        return jsonify({
            "data": users,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        })
    except Exception as e:
        logger.exception("Erreur get_utilisateurs")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()

@users_bp.route('/utilisateurs', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def create_utilisateur():
    data = request.get_json()
    
    nom = data.get('nom')
    prenom = data.get('prenom')
    grade = data.get('grade')
    email = data.get('email')
    numero = data.get('numero')
    role = data.get('role')
    division_id = data.get('division_id')
    service_id = data.get('service_id')
    actif = data.get('actif', True)
    cin = data.get('cin')
    identite = data.get('identite')
    mot_de_passe = data.get('mot_de_passe')

    if not all([nom, prenom, role, division_id, cin, identite, mot_de_passe]):
        return jsonify({"error": "Champs obligatoires manquants"}), 400

    if len(identite) > 50 or len(mot_de_passe) > 256:
        return jsonify({"error": "Données invalides."}), 400

    ROLES_VALIDES = ("Chef de division", "Chef de service", "Agent", "Agent du Bureau d'Ordre")
    if role not in ROLES_VALIDES:
        return jsonify({"error": "Rôle invalide."}), 400

    try:
        conn = get_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM utilisateurs WHERE identite = %s", (identite,))
        if cursor.fetchone():
            return jsonify({"error": "Cet identifiant est déjà utilisé."}), 400
        
        hashed_pwd = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        
        query = """
        INSERT INTO utilisateurs 
        (nom, prenom, grade, email, numero, role, division_id, service_id, actif, cin, identite, mot_de_passe)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) 
        """
        cursor.execute(query, (nom, prenom, grade, email, numero, role, division_id, service_id, actif, cin, identite, hashed_pwd))
        conn.commit()
        
        return jsonify({"success": True, "message": "Utilisateur créé avec succès"}), 201
    except Exception as e:
        logger.exception("Erreur create_utilisateur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()

@users_bp.route('/utilisateurs/<int:user_id>', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def update_utilisateur(user_id):
    data = request.get_json() or {}

    demandeur = get_current_user()
    if not demandeur:
        return jsonify({"error": "Utilisateur non authentifié"}), 401

    ROLES_VALIDES = ("Chef de division", "Chef de service", "Agent", "Agent du Bureau d'Ordre")
    if 'role' in data and data.get('role') not in ROLES_VALIDES:
        return jsonify({"error": "Rôle invalide."}), 400

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # CONTRÔLE DE PÉRIMÈTRE (IDOR) : un Chef de division ne peut modifier que
        # les utilisateurs de SA propre division. C'est déjà la règle appliquée par
        # GET /utilisateurs (voir plus haut) ; PUT/DELETE ne l'appliquaient pas, ce
        # qui permettait de réinitialiser le mot de passe de n'importe quel compte,
        # y compris celui d'un autre Chef de division.
        cursor.execute(
            "SELECT id, division_id FROM utilisateurs WHERE id = %s", (user_id,)
        )
        cible = cursor.fetchone()
        if not cible:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        division_demandeur = demandeur.get("division_id")
        if not division_demandeur or cible.get("division_id") != division_demandeur:
            logger.warning(
                "Modification d'utilisateur hors périmètre refusée : auteur_id=%s "
                "cible_id=%s division_cible=%s division_auteur=%s",
                demandeur.get("id"), user_id, cible.get("division_id"), division_demandeur,
            )
            return jsonify({
                "error": "Accès non autorisé : vous ne pouvez modifier que les "
                         "utilisateurs de votre division."
            }), 403

        # Interdit de déplacer un utilisateur vers une AUTRE division : sinon un
        # Chef de division pourrait s'affecter lui-même (ou affecter un agent) à
        # une division différente et sortir définitivement de son périmètre.
        # Seule la division de l'appelant est acceptée. La valeur arrive du
        # formulaire sous forme de chaîne (select HTML) alors que la base renvoie
        # un entier : la comparaison est donc normalisée pour éviter tout faux
        # rejet d'une modification légitime.
        if 'division_id' in data and data['division_id'] not in (None, ""):
            try:
                nouvelle_division = int(data['division_id'])
            except (TypeError, ValueError):
                return jsonify({"error": "division_id invalide."}), 400
            if nouvelle_division != int(division_demandeur):
                return jsonify({
                    "error": "Accès non autorisé : un utilisateur ne peut pas être "
                             "affecté à une autre division que la vôtre."
                }), 403

        if data.get('identite'):
            cursor.execute(
                "SELECT id FROM utilisateurs WHERE identite = %s AND id != %s",
                (data['identite'], user_id),
            )
            if cursor.fetchone():
                return jsonify({
                    "error": f"L'identité '{data['identite']}' est déjà utilisée "
                             f"par un autre utilisateur"
                }), 400

        # MISE À JOUR PARTIELLE : seules les clés réellement présentes dans le
        # payload sont écrites. L'ancien code réécrivait systématiquement toutes
        # les colonnes à partir de data.get(...), ce qui mettait à NULL chaque
        # champ absent (perte silencieuse de role/division_id/service_id/actif,
        # et ces NULL désactivaient ensuite les contrôles de périmètre des
        # courriers). Envoyer explicitement null permet toujours de vider un champ.
        CHAMPS_MODIFIABLES = (
            'nom', 'prenom', 'grade', 'email', 'numero', 'role',
            'division_id', 'service_id', 'actif', 'cin', 'identite',
        )
        morceaux = []
        params = []
        for champ in CHAMPS_MODIFIABLES:
            if champ in data:
                valeur = bool(data[champ]) if champ == 'actif' else data[champ]
                morceaux.append(f"{champ}=%s")
                params.append(valeur)

        if data.get('mot_de_passe'):
            morceaux.append("mot_de_passe=%s")
            params.append(
                bcrypt.hashpw(
                    data['mot_de_passe'].encode('utf-8'), bcrypt.gensalt()
                ).decode('utf-8')
            )

        if not morceaux:
            return jsonify({"error": "Aucun champ à mettre à jour."}), 400

        # Les noms de colonnes proviennent exclusivement de la liste blanche
        # CHAMPS_MODIFIABLES ; toutes les valeurs restent paramétrées.
        cursor.execute(
            f"UPDATE utilisateurs SET {', '.join(morceaux)} WHERE id=%s",
            tuple(params) + (user_id,),
        )
        conn.commit()

        return jsonify({"success": True, "message": "Utilisateur mis à jour avec succès"})
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erreur update_utilisateur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

@users_bp.route('/utilisateurs/<int:user_id>', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_utilisateur(user_id):
    demandeur = get_current_user()
    if not demandeur:
        return jsonify({"error": "Utilisateur non authentifié"}), 401

    # Évite qu'un administrateur ne se verrouille lui-même dehors.
    if int(demandeur.get("id")) == int(user_id):
        return jsonify({"error": "Vous ne pouvez pas supprimer votre propre compte."}), 400

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT id, division_id FROM utilisateurs WHERE id = %s", (user_id,)
        )
        cible = cursor.fetchone()
        if not cible:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        division_demandeur = demandeur.get("division_id")
        if not division_demandeur or cible.get("division_id") != division_demandeur:
            logger.warning(
                "Suppression d'utilisateur hors périmètre refusée : auteur_id=%s "
                "cible_id=%s division_cible=%s division_auteur=%s",
                demandeur.get("id"), user_id, cible.get("division_id"), division_demandeur,
            )
            return jsonify({
                "error": "Accès non autorisé : vous ne pouvez supprimer que les "
                         "utilisateurs de votre division."
            }), 403

        cursor.execute(
            "DELETE FROM utilisateurs WHERE id = %s AND division_id = %s",
            (user_id, division_demandeur),
        )
        conn.commit()
        return jsonify({"success": True, "message": "Utilisateur supprimé avec succès"})
    except Exception:
        if conn:
            conn.rollback()
        logger.exception("Erreur delete_utilisateur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()
