from flask import Blueprint, request, jsonify
from db import get_connection
import logging
import datetime
import os
from routes.auth_helpers import (
    auth_required, roles_required, get_current_user,
    refus_si_perimetre_manquant,
    ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT, COURRIER_ROLES,
)
from logger_config import get_logger

courriers_sortants_bp = Blueprint('courriers_sortants', __name__)
logger = get_logger(__name__)

def _generate_numero(cursor):
    year = datetime.date.today().year
    query = "SELECT MAX(CAST(SUBSTRING_INDEX(numero, '-', -1) AS UNSIGNED)) as max_val FROM courriers WHERE sens = 'sortant' AND numero LIKE %s"
    cursor.execute(query, (f"CS-{year}-%",))
    row = cursor.fetchone()
    
    next_id = (row['max_val'] if row and row['max_val'] is not None else 0) + 1
    return f"CS-{year}-{str(next_id).zfill(3)}"


def _format_courrier(c, include_archive_info=False):
    date_saisie_str = ""
    if c.get('date_saisie'):
        try:
            date_saisie_str = (
                c['date_saisie'].strftime('%Y-%m-%d')
                if hasattr(c['date_saisie'], 'strftime')
                else str(c['date_saisie'])
            )
        except Exception:
            date_saisie_str = str(c['date_saisie']) if c['date_saisie'] else ""

    redacteur = "Non spécifié"
    if c.get('saisi_par_prenom') and c.get('saisi_par_nom'):
        redacteur = f"{c['saisi_par_prenom']} {c['saisi_par_nom']}"

    expediteur = "Non spécifié"
    if c.get('division_nom') and c.get('service_nom'):
        expediteur = f"{c['division_nom']} - {c['service_nom']}"

    result = {
        # `id` = ID technique interne (unique). Ne JAMAIS exposer le numero
        # comme identifiant : plusieurs courriers peuvent partager le même
        # numero/reference. `dbId` est conservé pour la compatibilité frontend.
        "id": c['id'],
        "numero": c['numero'],
        "reference": c.get('reference') or "",
        "destinataire": c.get('destinataire_nom') or "Non spécifié",
        "objet": c['objet'],
        "date": str(c['date_envoi']),
        "dateSaisie": date_saisie_str,
        "redacteur": redacteur,
        "expediteur": expediteur,
        "observation": c.get('observations') or "",
        "archive": c.get('archive', False),
        "typeCourrierId": c.get('type_courrier_id'),
        "type": c.get('type_libelle') or "N/A",
        "typeTiersId": c.get('type_tiers_id'),
        "fichier": c.get('file_name'),
        "dbId": c.get('id'),
        "service_id": c.get('service_id'),
        "saisi_par": c.get('saisi_par'),
        "expediteur_division_id": c.get('expediteur_division_id'),
    }


    if include_archive_info:
        result["archive_par_nom"] = c.get('archive_par_nom') or None
        result["archive_par_prenom"] = c.get('archive_par_prenom') or None
        result["date_archivage"] = str(c['date_archivage']) if c.get('date_archivage') else None

    return result


@courriers_sortants_bp.route('/courrier_sortant', methods=['GET'])
@auth_required
def get_courriers_sortants():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    role       = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    archive    = request.args.get('archive', 'false')
    page       = int(request.args.get('page', 1))
    per_page   = int(request.args.get('per_page', 25))
    offset     = (page - 1) * per_page

    # FAIL-CLOSED : un Chef de service / Agent sans service_id (ou un Chef de
    # division sans division_id) ne doit PAS voir le courrier de toute
    # l'administration. Sans ce garde-fou, aucune branche de filtrage ci-dessous
    # ne s'appliquait et la requête partait sans clause WHERE de périmètre.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user.get("id"))
    if _refus:
        return _refus
    
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
        SELECT c.id, c.numero, c.reference, c.objet, c.date_envoi, c.archive,
               c.saisi_par, c.service_id, c.expediteur_division_id, c.destinataire_tiers_id,
               c.type_courrier_id, c.observations, c.date_saisie,
               u.nom as saisi_par_nom, u.prenom as saisi_par_prenom,
               d.nom as division_nom, s.nom as service_nom, t.nom as destinataire_nom, t.type_tiers_id,
               tc.libelle as type_libelle
        FROM courriers c
        LEFT JOIN utilisateurs u ON c.saisi_par = u.id
        LEFT JOIN divisions d ON c.expediteur_division_id = d.id
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN tiers t ON c.destinataire_tiers_id = t.id
        LEFT JOIN types_courrier tc ON c.type_courrier_id = tc.id
        WHERE c.sens = 'sortant' AND c.archive = %s
        """
        params = [archive.lower() == 'true']

        # Filtres selon le rôle - le Chef de service et l'Agent accèdent aux courriers de leur service
        if (role == 'Chef de service' or role == 'Agent') and service_id:
            query += """ AND (
                c.service_id = %s
                OR c.saisi_par IN (SELECT u2.id FROM utilisateurs u2 WHERE u2.service_id = %s)
                OR c.reponse_a_id IN (SELECT c2.id FROM courriers c2 WHERE c2.service_id = %s)
            )"""
            params.extend([service_id, service_id, service_id])
        elif role == 'Chef de division' and division_id:
            # FIX: Harmoniser avec le dashboard - inclure les courriers où la division est expéditeur
            query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            params.extend([division_id, division_id])

        # Compter le total pour la pagination
        count_query = """
        SELECT COUNT(*) as total
        FROM courriers c
        WHERE c.sens = 'sortant' AND c.archive = %s
        """
        count_params = [archive.lower() == 'true']

        if (role == 'Chef de service' or role == 'Agent') and service_id:
            count_query += """ AND (
                c.service_id = %s
                OR c.saisi_par IN (SELECT u2.id FROM utilisateurs u2 WHERE u2.service_id = %s)
                OR c.reponse_a_id IN (SELECT c2.id FROM courriers c2 WHERE c2.service_id = %s)
            )"""
            count_params.extend([service_id, service_id, service_id])
        elif role == 'Chef de division' and division_id:
            count_query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            count_params.extend([division_id, division_id])

        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']

        query += " ORDER BY c.date_envoi DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cursor.execute(query, params)
        courriers = cursor.fetchall()
        
        # Charger les fichiers joints en une seule requête pour éviter N+1
        courrier_ids = [c['id'] for c in courriers]
        file_names = {}
        if courrier_ids:
            placeholders = ','.join(['%s'] * len(courrier_ids))
            cursor.execute(
                f"SELECT courrier_id, nom_fichier FROM documents WHERE courrier_id IN ({placeholders}) AND is_export = 0",
                courrier_ids
            )
            for row in cursor.fetchall():
                if row['courrier_id'] not in file_names:
                    file_names[row['courrier_id']] = row['nom_fichier']
        
        # Ajouter les noms de fichiers aux courriers
        for c in courriers:
            c['file_name'] = file_names.get(c['id'])
        
        return jsonify({
            "data": [_format_courrier(c) for c in courriers],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        })
    except Exception as e:
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()


@courriers_sortants_bp.route('/courrier_sortant', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def add_courrier_sortant():
    data = request.json
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        required_fields = ['destinataire', 'dateEnvoi', 'objet', 'identiteAgent']
        for field in required_fields:
            if not data.get(field):
                return jsonify({"error": f"Le champ '{field}' est requis"}), 400
        numero = data.get('numero')
        if not numero:
            numero = _generate_numero(cursor)
        cursor.execute("SELECT id FROM tiers WHERE nom = %s", (data.get('destinataire'),))
        tier = cursor.fetchone()
        if not tier:
            return jsonify({"error": f"Destinataire '{data.get('destinataire')}' non trouvé dans la base de données"}), 400
        destinataire_tiers_id = tier['id']
        identite = data.get('identiteAgent', '').strip()
        parts = identite.split(' ', 1)
        if len(parts) == 2:
            prenom, nom = parts
        else:
            prenom, nom = identite, ''

        cursor.execute(
            "SELECT id, division_id, service_id FROM utilisateurs WHERE prenom = %s AND nom = %s",
            (prenom, nom)
        )
        user = cursor.fetchone()
        if not user:
            cursor.execute(
                "SELECT id, division_id, service_id FROM utilisateurs WHERE CONCAT(prenom, ' ', nom) = %s",
                (identite,)
            )
            user = cursor.fetchone()
        if not user:
            return jsonify({"error": f"Utilisateur '{identite}' non trouvé"}), 400

        user_id = user['id']
        division_id = user['division_id']
        service_id = user['service_id']
        if not service_id:
            cursor.execute("SELECT id FROM services WHERE division_id = %s LIMIT 1", (division_id,))
            service = cursor.fetchone()
            if service:
                service_id = service['id']
            else:
                return jsonify({"error": "Aucun service trouvé pour la division de l'utilisateur"}), 400

        query = """
        INSERT INTO courriers
        (numero, reference, sens, type_courrier_id, service_id, objet,
         date_reception, date_envoi, observations, saisi_par,
         expediteur_division_id, destinataire_tiers_id, date_saisie, reponse_a_id)
        VALUES (%s, %s, 'sortant', %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_DATE(), %s)
        """
        cursor.execute(query, (
            numero,
            data.get('reference', ''),
            data.get('typeCourrierId', 1),
            service_id,
            data.get('objet'),
            data.get('dateEnvoi'),
            data.get('dateEnvoi'),
            data.get('observation', ''),
            user_id,
            division_id,
            destinataire_tiers_id,
            data.get('reponse_a_id')
        ))
        
        courrier_id = cursor.lastrowid
        # NE PAS enregistrer de document ici : le fichier n'a pas encore été uploadé.
        # Le frontend appellera /documents/upload séparément avec le courrier_id retourné,
        # puis /documents/upload enregistrera lui-même la ligne dans la table documents.

        conn.commit()
        return jsonify({
            "message": "Courrier sortant enregistré avec succès",
            "numero": numero,
            "dbId": courrier_id,          # ← nécessaire pour l'upload du fichier en 2e étape
        }), 201

    except Exception as e:
        conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()


@courriers_sortants_bp.route('/courrier_sortant/update', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def update_courrier_sortant():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur non authentifié ou introuvable."}), 401

    role = user.get("role")
    user_id = user.get("id")
    user_service_id = user.get("service_id")
    user_division_id = user.get("division_id")

    # FAIL-CLOSED : sans périmètre, les contrôles d'ownership ci-dessous étaient
    # tous sautés (branche Chef de division conditionnée à `if user_division_id`
    # et comparaisons `== None` jamais vraies côté service).
    _refus = refus_si_perimetre_manquant(role, user_service_id, user_division_id, user_id)
    if _refus:
        return _refus

    data = request.json or {}
    # Identification par l'ID interne unique. Le `numero` n'est PAS unique et ne
    # doit JAMAIS être injecté dans `WHERE id = %s` : MySQL le casterait en
    # nombre (erreur 1292 « Truncated incorrect DOUBLE value ») et pourrait
    # modifier le mauvais courrier.
    db_id = data.get('id') or data.get('dbId')
    if db_id is not None:
        try:
            db_id = int(db_id)
        except (TypeError, ValueError):
            db_id = None

    old_numero = data.get('oldNumero')
    new_numero = data.get('numero')

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        if not db_id:
            # Repli exceptionnel (appel sans ID interne) : le numero n'étant pas
            # unique, on ne l'utilise que s'il identifie UNE SEULE ligne, sans
            # ambiguïté. fetchall() pour éviter « Unread result found ».
            cursor.execute(
                "SELECT id FROM courriers WHERE numero = %s AND sens = 'sortant'",
                (old_numero or new_numero,)
            )
            matches = cursor.fetchall()
            if len(matches) != 1:
                return jsonify({"error": "Courrier introuvable ou ambigu : l'ID interne est requis."}), 400
            db_id = matches[0]['id']

        # Récupération complète du courrier sortant avec ses liaisons pour le contrôle d'accès
        cursor.execute(
            """
            SELECT c.id, c.numero, c.reference, c.sens, c.service_id,
                   c.expediteur_division_id, c.destinataire_division_id,
                   c.saisi_par, c.reponse_a_id,
                   u.service_id AS redacteur_service_id,
                   u.division_id AS redacteur_division_id,
                   rep.service_id AS reponse_courrier_service_id,
                   s.division_id AS service_division_id
            FROM courriers c
            LEFT JOIN utilisateurs u ON c.saisi_par = u.id
            LEFT JOIN courriers rep ON c.reponse_a_id = rep.id
            LEFT JOIN services s ON c.service_id = s.id
            WHERE c.id = %s AND c.sens = 'sortant'
            """,
            (db_id,)
        )
        courrier = cursor.fetchone()
        if not courrier:
            return jsonify({"error": "Courrier sortant introuvable"}), 404

        # Contrôle strict des autorisations d'accès selon le rôle
        if role == ROLE_CHEF_SERVICE:
            if not user_service_id:
                return jsonify({"error": "Aucun service associé à votre compte utilisateur."}), 403

            # Le Chef de Service a le droit de modifier tous les champs des courriers
            # sortants créés ou traités par son service.
            # Il ne doit en aucun cas pouvoir modifier un courrier appartenant à un autre service.
            appartient_au_service = (
                courrier.get('service_id') == user_service_id
                or courrier.get('redacteur_service_id') == user_service_id
                or courrier.get('reponse_courrier_service_id') == user_service_id
            )
            if not appartient_au_service:
                logger.warning(
                    "Accès refusé : Chef de service (user_id=%s, service_id=%s) a tenté de modifier le courrier sortant id=%s (service_id=%s)",
                    user_id, user_service_id, db_id, courrier.get('service_id')
                )
                return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier que les courriers sortants de votre service."}), 403

        elif role == ROLE_AGENT:
            appartient_a_agent_ou_service = (
                (user_service_id and (
                    courrier.get('service_id') == user_service_id
                    or courrier.get('redacteur_service_id') == user_service_id
                ))
                or courrier.get('saisi_par') == user_id
            )
            if not appartient_a_agent_ou_service:
                logger.warning(
                    "Accès refusé : Agent (user_id=%s, service_id=%s) a tenté de modifier le courrier sortant id=%s",
                    user_id, user_service_id, db_id
                )
                return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier que les courriers sortants de votre service."}), 403

        elif role == ROLE_CHEF_DIVISION:
            if user_division_id:
                appartient_a_division = (
                    courrier.get('expediteur_division_id') == user_division_id
                    or courrier.get('destinataire_division_id') == user_division_id
                    or courrier.get('service_division_id') == user_division_id
                    or courrier.get('redacteur_division_id') == user_division_id
                )
                if not appartient_a_division:
                    logger.warning(
                        "Accès refusé : Chef de division (user_id=%s, division_id=%s) a tenté de modifier le courrier sortant id=%s",
                        user_id, user_division_id, db_id
                    )
                    return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier que les courriers sortants de votre division."}), 403

        destinataire_tiers_id = None
        if data.get('destinataire_tiers_id'):
            try:
                destinataire_tiers_id = int(data.get('destinataire_tiers_id'))
            except (TypeError, ValueError):
                destinataire_tiers_id = None
        elif data.get('destinataire'):
            cursor.execute("SELECT id FROM tiers WHERE nom = %s", (data.get('destinataire').strip(),))
            tier = cursor.fetchone()
            if tier:
                destinataire_tiers_id = tier['id']

        # type_courrier_id : coercition sécurisée
        try:
            type_id = int(data.get('typeCourrierId')) if data.get('typeCourrierId') else None
        except (TypeError, ValueError):
            type_id = None

        # observation : champ PRESENT mais vide -> effacer ('') ; champ ABSENT -> None (conserver)
        obs_val = data.get('observation')
        if obs_val is None:
            obs_val = data.get('observations')

        date_envoi_val = data.get('dateEnvoi') or data.get('date')

        # Mise à jour de TOUS les champs modifiables du courrier sortant
        query = """
        UPDATE courriers
        SET numero = COALESCE(%s, numero),
            reference = COALESCE(%s, reference),
            objet = COALESCE(%s, objet),
            date_envoi = COALESCE(%s, date_envoi),
            observations = COALESCE(%s, observations),
            type_courrier_id = COALESCE(%s, type_courrier_id),
            destinataire_tiers_id = COALESCE(%s, destinataire_tiers_id)
        WHERE id = %s AND sens = 'sortant'
        """
        cursor.execute(query, (
            new_numero,
            data.get('reference'),
            data.get('objet'),
            date_envoi_val,
            obs_val,
            type_id,
            destinataire_tiers_id,
            db_id
        ))

        # Rafraîchissement des instantanés pdf_downloads
        cursor.execute(
            """UPDATE pdf_downloads pd
               JOIN courriers c ON pd.courrier_id = c.id
               SET pd.courrier_numero = c.numero,
                   pd.courrier_ref    = c.reference,
                   pd.courrier_sens   = c.sens,
                   pd.courrier_objet  = c.objet
               WHERE pd.courrier_id = %s""",
            (db_id,)
        )

        conn.commit()

        # Invalidation du cache PDF export/print
        try:
            from routes.courriers import invalidate_export_cache
            invalidate_export_cache(db_id)
        except Exception as cache_err:
            logger.warning(f"Invalidation cache export courrier sortant {db_id}: {cache_err}")

        return jsonify({"message": "Courrier sortant mis à jour avec succès"})
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error(f"Erreur update_courrier_sortant: {e}")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@courriers_sortants_bp.route('/courrier_sortant/delete', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_courrier_sortant():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    role = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    user_id = user.get("id")

    # FAIL-CLOSED : sans division_id, le contrôle d'ownership ci-dessous était sauté.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user_id)
    if _refus:
        return _refus

    # Validation entier de l'ID (securité — cf. commentaires autres endpoints)
    raw_courrier_id = request.args.get('id')
    if not raw_courrier_id:
        return jsonify({"error": "ID requis"}), 400
    try:
        courrier_id = int(raw_courrier_id)
    except (TypeError, ValueError):
        return jsonify({"error": "ID invalide."}), 400

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Chargement avec jointures pour contrôle d'accès (même pattern que archive_courrier_sortant)
        cursor.execute(
            """SELECT c.id, c.service_id, c.expediteur_division_id, c.destinataire_division_id,
                      c.saisi_par, u.service_id AS redacteur_service_id,
                      rep.service_id AS reponse_courrier_service_id,
                      s.division_id AS service_division_id, c.reponse_a_id
               FROM courriers c
               LEFT JOIN utilisateurs u ON c.saisi_par = u.id
               LEFT JOIN courriers rep ON c.reponse_a_id = rep.id
               LEFT JOIN services s ON c.service_id = s.id
               WHERE c.id = %s AND c.sens = 'sortant'""",
            (courrier_id,),
        )
        courrier = cursor.fetchone()
        if not courrier:
            return jsonify({"error": "Courrier non trouvé."}), 404

        # === CONTRÔLE D'ACCÈS (même logique que archive_courrier_sortant) ===
        if role == ROLE_CHEF_SERVICE and service_id:
            appartient = (
                courrier.get('service_id') == service_id
                or courrier.get('redacteur_service_id') == service_id
                or courrier.get('reponse_courrier_service_id') == service_id
            )
            if not appartient:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez supprimer que les courriers sortants de votre service."}), 403

        elif role == ROLE_AGENT and service_id:
            appartient = (
                courrier.get('service_id') == service_id
                or courrier.get('redacteur_service_id') == service_id
                or courrier.get('saisi_par') == user_id
            )
            if not appartient:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez supprimer que les courriers sortants de votre service."}), 403

        elif role == ROLE_CHEF_DIVISION and division_id:
            appartient = (
                courrier.get('expediteur_division_id') == division_id
                or courrier.get('destinataire_division_id') == division_id
                or courrier.get('service_division_id') == division_id
                or courrier.get('saisi_par') == user_id
            )
            if not appartient:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez supprimer que les courriers sortants de votre division."}), 403

        reponse_a_id = courrier['reponse_a_id']
        cursor.execute("DELETE FROM courriers WHERE id = %s AND sens = 'sortant'", (courrier_id,))
        if reponse_a_id:
            cursor.execute(
                "UPDATE courriers SET statut = 'EN_ATTENTE' WHERE id = %s AND sens = 'entrant'",
                (reponse_a_id,)
            )
        conn.commit()
        return jsonify({"message": "Courrier sortant supprimé et statut d'origine réinitialisé"})
    except Exception as e:
        if conn: conn.rollback()
        logging.exception("Erreur delete_courrier_sortant")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_sortants_bp.route('/courrier_sortant/archive', methods=['PATCH'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def archive_courrier_sortant():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401

    role = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")

    # FAIL-CLOSED : sans périmètre, le contrôle d'ownership ci-dessous était sauté.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user.get("id"))
    if _refus:
        return _refus

    data = request.json or {}
    db_id = data.get('id') or data.get('dbId')
    numero = data.get('numero') # Fallback
    archive = data.get('archive', True)
    archive_par = data.get('archive_par')

    # Un identifiant interne doit être un entier. Le `numero` et la `reference`
    # n'étant PAS uniques, on refuse qu'une valeur non numérique soit injectée
    # dans `WHERE id = %s` (MySQL la casterait silencieusement en entier et
    # archiverait/désarchiverait le mauvais courrier).
    if db_id is not None:
        try:
            db_id = int(db_id)
        except (TypeError, ValueError):
            db_id = None

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Identification du courrier par son ID interne unique
        if db_id:
            where_clause = "WHERE c.id = %s"
            where_param = db_id
        elif numero:
            cursor.execute(
                "SELECT id FROM courriers WHERE numero = %s AND sens = 'sortant'",
                (numero,)
            )
            matches = cursor.fetchall()
            if len(matches) == 1:
                where_clause = "WHERE c.id = %s"
                where_param = matches[0]['id']
            else:
                return jsonify({"error": "Courrier introuvable ou ambigu : l'ID interne est requis."}), 400
        else:
            return jsonify({"error": "ID ou numéro requis."}), 400

        # Contrôle d'accès au courrier
        cursor.execute(
            """SELECT c.id, c.service_id, c.expediteur_division_id, c.destinataire_division_id,
                      c.saisi_par, u.service_id AS redacteur_service_id, rep.service_id AS reponse_courrier_service_id,
                      s.division_id AS service_division_id
               FROM courriers c
               LEFT JOIN utilisateurs u ON c.saisi_par = u.id
               LEFT JOIN courriers rep ON c.reponse_a_id = rep.id
               LEFT JOIN services s ON c.service_id = s.id
               """ + where_clause + " AND c.sens = 'sortant'",
            (where_param,)
        )
        courrier = cursor.fetchone()
        if not courrier:
            return jsonify({"error": "Courrier introuvable."}), 404

        if role == ROLE_CHEF_SERVICE and service_id:
            appartient = (
                courrier.get('service_id') == service_id
                or courrier.get('redacteur_service_id') == service_id
                or courrier.get('reponse_courrier_service_id') == service_id
            )
            if not appartient:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez archiver que les courriers sortants de votre service."}), 403

        elif role == ROLE_AGENT and service_id:
            appartient = (
                courrier.get('service_id') == service_id
                or courrier.get('redacteur_service_id') == service_id
                or courrier.get('saisi_par') == user.get('id')
            )
            if not appartient:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez archiver que les courriers sortants de votre service."}), 403

        elif role == ROLE_CHEF_DIVISION and division_id:
            appartient = (
                courrier.get('expediteur_division_id') == division_id
                or courrier.get('destinataire_division_id') == division_id
                or courrier.get('service_division_id') == division_id
            )
            if not appartient:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez archiver que les courriers sortants de votre division."}), 403

        target_id = courrier['id']
        if archive:
            cursor.execute(
                """UPDATE courriers
                   SET archive = %s, date_archivage = NOW(), archive_par = %s
                   WHERE id = %s AND sens = 'sortant'""",
                (archive, archive_par, target_id)
            )
        else:
            cursor.execute(
                """UPDATE courriers
                   SET archive = %s, date_archivage = NULL, archive_par = NULL
                   WHERE id = %s AND sens = 'sortant'""",
                (archive, target_id)
            )

        conn.commit()

        # Invalidation cache export
        try:
            from routes.courriers import invalidate_export_cache
            invalidate_export_cache(target_id)
        except Exception as cache_err:
            logger.warning(f"Invalidation cache export: {cache_err}")

        action = "archivé" if archive else "désarchivé"
        return jsonify({"message": f"Courrier {action} avec succès"})
    except Exception as e:
        logging.exception("Erreur archive_courrier_sortant")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_sortants_bp.route('/courrier_sortant/archive', methods=['GET'])
@auth_required
def get_archived_courriers_sortants():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    role       = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    page       = int(request.args.get('page', 1))
    per_page   = int(request.args.get('per_page', 25))
    offset     = (page - 1) * per_page

    # FAIL-CLOSED : même garde-fou que la liste des courriers non archivés.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user.get("id"))
    if _refus:
        return _refus

    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        query = """
        SELECT c.id, c.numero, c.reference, c.objet, c.date_envoi, c.archive,
               c.saisi_par, c.service_id, c.expediteur_division_id, c.destinataire_tiers_id,
               c.type_courrier_id, c.observations, c.date_saisie, c.date_archivage,
               u.nom as saisi_par_nom, u.prenom as saisi_par_prenom,
               d.nom as division_nom, s.nom as service_nom, t.nom as destinataire_nom, t.type_tiers_id,
               tc.libelle as type_libelle,
               arch_u.nom as archive_par_nom, arch_u.prenom as archive_par_prenom
        FROM courriers c
        LEFT JOIN utilisateurs u ON c.saisi_par = u.id
        LEFT JOIN utilisateurs arch_u ON c.archive_par = arch_u.id
        LEFT JOIN divisions d ON c.expediteur_division_id = d.id
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN tiers t ON c.destinataire_tiers_id = t.id
        LEFT JOIN types_courrier tc ON c.type_courrier_id = tc.id
        WHERE c.sens = 'sortant' AND c.archive = TRUE
        """
        params = []
        if (role == 'Chef de service' or role == 'Agent') and service_id:
            query += """ AND (
                c.service_id = %s
                OR c.saisi_par IN (SELECT u2.id FROM utilisateurs u2 WHERE u2.service_id = %s)
                OR c.reponse_a_id IN (SELECT c2.id FROM courriers c2 WHERE c2.service_id = %s)
            )"""
            params.extend([service_id, service_id, service_id])
        elif role == 'Chef de division' and division_id:
            query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            params.extend([division_id, division_id])

        # Compter le total pour la pagination
        count_query = """
        SELECT COUNT(*) as total
        FROM courriers c
        WHERE c.sens = 'sortant' AND c.archive = TRUE
        """
        count_params = []
        if (role == 'Chef de service' or role == 'Agent') and service_id:
            count_query += """ AND (
                c.service_id = %s
                OR c.saisi_par IN (SELECT u2.id FROM utilisateurs u2 WHERE u2.service_id = %s)
                OR c.reponse_a_id IN (SELECT c2.id FROM courriers c2 WHERE c2.service_id = %s)
            )"""
            count_params.extend([service_id, service_id, service_id])
        elif role == 'Chef de division' and division_id:
            count_query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            count_params.extend([division_id, division_id])

        cursor.execute(count_query, count_params)
        total = cursor.fetchone()['total']

        query += " ORDER BY c.date_archivage DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cursor.execute(query, params)
        courriers = cursor.fetchall()
        
        # Charger les fichiers joints en une seule requête pour éviter N+1
        courrier_ids = [c['id'] for c in courriers]
        file_names = {}
        if courrier_ids:
            placeholders = ','.join(['%s'] * len(courrier_ids))
            cursor.execute(
                f"SELECT courrier_id, nom_fichier FROM documents WHERE courrier_id IN ({placeholders}) AND is_export = 0",
                courrier_ids
            )
            for row in cursor.fetchall():
                if row['courrier_id'] not in file_names:
                    file_names[row['courrier_id']] = row['nom_fichier']
        
        # Ajouter les noms de fichiers aux courriers
        for c in courriers:
            c['file_name'] = file_names.get(c['id'])
        
        return jsonify({
            "data": [_format_courrier(c, include_archive_info=True) for c in courriers],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        })
    except Exception as e:
        logging.exception("Erreur get_archived_courriers_sortants")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()