from flask import Blueprint, request, jsonify
from db import get_connection
from routes.notifications import create_notification
from routes.auth_helpers import (
    auth_required, roles_required, get_current_user,
    refus_si_perimetre_manquant,
    ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT,
    COURRIER_ROLES,
)
import logging
import os
from logger_config import get_logger

courriers_entrants_bp = Blueprint('courriers_entrants', __name__)
logger = get_logger(__name__)

@courriers_entrants_bp.route('/courrier_entrant', methods=['GET'])
@auth_required
def get_courriers_entrants():
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
        
        # Requête optimisée - suppression des sous-requêtes N+1
        query = """
        SELECT c.id, c.numero, c.reference, c.objet, c.date_reception, c.statut, c.archive,
               c.saisi_par, c.service_id, c.destinataire_division_id, c.expediteur_tiers_id,
               c.type_courrier_id, c.observations, c.bo_courrier_id, c.date_saisie,
               u.nom as saisi_par_nom, u.prenom as saisi_par_prenom,
               d.nom as division_nom, s.nom as service_nom, t.nom as expediteur_nom, t.type_tiers_id as type_tiers_id,
               tc.libelle as type_libelle,
               arch_u.nom as archive_par_nom, arch_u.prenom as archive_par_prenom,
               bc.statut as bo_statut, bc.destinataire_service_id as bo_service_affecte_id,
               svc.nom as bo_service_affecte
        FROM courriers c
        LEFT JOIN utilisateurs u ON c.saisi_par = u.id
        LEFT JOIN utilisateurs arch_u ON c.archive_par = arch_u.id
        LEFT JOIN divisions d ON c.destinataire_division_id = d.id
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN tiers t ON c.expediteur_tiers_id = t.id
        LEFT JOIN types_courrier tc ON c.type_courrier_id = tc.id
        LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
        LEFT JOIN services svc ON bc.destinataire_service_id = svc.id
        WHERE c.sens = 'entrant' AND c.archive = %s
        """
        params = [archive.lower() == 'true']

        if (role == 'Chef de service' or role == 'Agent') and service_id:
            # Exclure les courriers BO non encore affectés au service par le Chef de Division
            # Utiliser la même logique que le dashboard avec EXISTS
            query += """ AND c.service_id = %s
                         AND (c.bo_courrier_id IS NULL
                              OR EXISTS (
                                  SELECT 1 FROM bo_courriers bc2
                                  WHERE bc2.id = c.bo_courrier_id
                                    AND bc2.statut IN ('Affecté au service', 'Traité')
                              ))"""
            params.append(service_id)
        elif role == 'Chef de division' and division_id:
            # FIX: Harmoniser avec le dashboard - inclure les courriers où la division est expéditeur
            query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            params.extend([division_id, division_id])

        # Compter le total pour la pagination
        # Construire une requête COUNT simple avec les mêmes filtres
        count_query = """
        SELECT COUNT(*) as total
        FROM courriers c
        WHERE c.sens = 'entrant' AND c.archive = %s
        """
        count_params = [archive.lower() == 'true']

        if (role == 'Chef de service' or role == 'Agent') and service_id:
            # Exclure les courriers BO non encore affectés au service par le Chef de Division
            # Utiliser la même logique que le dashboard avec EXISTS
            count_query += """ AND c.service_id = %s
                             AND (c.bo_courrier_id IS NULL
                                  OR EXISTS (
                                      SELECT 1 FROM bo_courriers bc
                                      WHERE bc.id = c.bo_courrier_id
                                        AND bc.statut IN ('Affecté au service', 'Traité')
                                  ))"""
            count_params.append(service_id)
        elif role == 'Chef de division' and division_id:
            count_query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            count_params.extend([division_id, division_id])

        cursor.execute(count_query, count_params)
        result = cursor.fetchone()
        total = result['total'] if result else 0

        query += " ORDER BY c.date_reception DESC LIMIT %s OFFSET %s"
        params.extend([per_page, offset])
        cursor.execute(query, params)
        courriers = cursor.fetchall()
        
        # Récupérer les IDs de courriers pour charger les données associées en une seule requête
        courrier_ids = [c['id'] for c in courriers]
        bo_courrier_ids = [c['bo_courrier_id'] for c in courriers if c['bo_courrier_id']]
        
        # Charger les fichiers joints en une seule requête
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
        
        # Charger les counts et noms des documents BO en une seule requête.
        # Les pièces jointes saisies au Bureau d'Ordre sont stockées dans
        # bo_documents (et non dans documents) : elles servent de repli pour
        # l'affichage du « fichier joint actuel » dans le formulaire de
        # modification, quel que soit le rôle.
        bo_docs_counts = {}
        bo_docs_names = {}
        bo_docs_ids = {}
        if bo_courrier_ids:
            placeholders = ','.join(['%s'] * len(bo_courrier_ids))
            cursor.execute(
                f"SELECT id, bo_courrier_id, nom_fichier FROM bo_documents WHERE bo_courrier_id IN ({placeholders})",
                bo_courrier_ids
            )
            for row in cursor.fetchall():
                bo_docs_counts[row['bo_courrier_id']] = bo_docs_counts.get(row['bo_courrier_id'], 0) + 1
                if row['bo_courrier_id'] not in bo_docs_names:
                    bo_docs_names[row['bo_courrier_id']] = row['nom_fichier']
                    bo_docs_ids[row['bo_courrier_id']] = row['id']

        # Repli : si le courrier n'a aucun document classique, exposer sa
        # première pièce jointe BO comme fichier joint actuel (affichage seul ;
        # la logique d'enregistrement reste inchangée).
        #
        # IMPORTANT : `fichier_source` indique d'où vient le nom exposé dans
        # `fichier`. Sans cette information, le frontend ne peut pas savoir quel
        # endpoint de téléchargement appeler :
        #   - "documents" → /documents/download/<nom_fichier>
        #   - "bo"        → /bo/documents/download/<fichier_bo_id>
        # (les pièces BO sont physiquement dans uploads/bo/bo_<id>_<nom> et ne
        #  sont PAS présentes dans la table `documents`).
        fichier_sources = {}
        fichier_bo_ids = {}
        for c in courriers:
            if c['id'] in file_names:
                fichier_sources[c['id']] = 'documents'
            elif (c.get('bo_courrier_id')
                    and c['bo_courrier_id'] in bo_docs_names):
                file_names[c['id']] = bo_docs_names[c['bo_courrier_id']]
                fichier_sources[c['id']] = 'bo'
                fichier_bo_ids[c['id']] = bo_docs_ids[c['bo_courrier_id']]

        formatted_courriers = []
        for c in courriers:
            formatted_courriers.append({
                "id": c['id'],
                "numero": c['numero'],
                "reference": c.get('reference') or "",
                "expediteur": c.get('expediteur_nom') or "Non spécifié",
                "objet": c.get('objet') or "",
                "date": str(c['date_reception']),
                "statut": c.get('statut') or "En attente",
                "archive": c.get('archive', False),
                "fichier": file_names.get(c['id']),
                # Provenance du nom exposé dans `fichier` — indispensable pour
                # router le téléchargement vers le bon endpoint.
                "fichier_source": fichier_sources.get(c['id']),
                "fichier_bo_id":  fichier_bo_ids.get(c['id']),
                "expediteur_tiers_id": c.get('expediteur_tiers_id'),
                "type_tiers_id": c.get('type_tiers_id'),
                "type": c.get('type_libelle') or "N/A",
                # Champs utilisés par le formulaire « Modifier » (Chef de Division)
                # pour préremplir Type de courrier et Service.
                "typeCourrierId": c.get('type_courrier_id'),
                "service_nom": c.get('service_nom') or None,
                "dbId": c['id'],
                "Destinataire": (
                    # Courrier issu du Bureau d'Ordre :
                    # masquer le service tant que le Chef de Division ne l'a pas affecté
                    # (service_id vide). Une fois le service enregistré, l'afficher.
                    "Division : {}".format(c.get('division_nom') or "")
                    if (c.get('bo_courrier_id') and c.get('bo_statut') == 'Affecté'
                        and not c.get('service_id'))
                    else "Division : {} | Service : {}".format(
                        c.get('division_nom') or "",
                        c.get('service_nom') or ""
                    )
                ),
                "observation": c.get('observations') or "",
                "saisi_par": "{} {}".format(c.get('saisi_par_prenom') or "", c.get('saisi_par_nom') or ""),
                "bo_courrier_id": c.get('bo_courrier_id'),
                "bo_docs_count":  bo_docs_counts.get(c['bo_courrier_id'], 0),
                "bo_statut":      c.get('bo_statut') or None,
                "bo_service_affecte": c.get('bo_service_affecte') or None,
                "archive_par_nom": c.get('archive_par_nom') or None,
                "archive_par_prenom": c.get('archive_par_prenom') or None,
                "date_archivage": str(c['date_archivage']) if c.get('date_archivage') else None,
            })

        return jsonify({
            "data": formatted_courriers,
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": (total + per_page - 1) // per_page
        })
    except Exception as e:
        logging.exception("Erreur get_courriers_entrants")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close()
        conn.close()


@courriers_entrants_bp.route('/courrier_entrant', methods=['POST'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def add_courrier_entrant():
    data = request.json
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        required_fields = ['numero', 'reference', 'destinataire', 'expediteur', 'dateReception', 'objet', 'enregistrePar']
        for field in required_fields:
            val = data.get(field)
            if not val or (isinstance(val, str) and not val.strip()):
                return jsonify({"error": f"Le champ '{field}' est requis"}), 400

        cursor.execute("SELECT id, division_id FROM services WHERE nom = %s", (data['destinataire'].strip(),))
        service = cursor.fetchone()
        if not service:
            return jsonify({"error": f"Service '{data['destinataire']}' non trouvé"}), 400
        service_id = service['id']
        division_id = service['division_id']

        cursor.execute("SELECT id FROM tiers WHERE nom = %s", (data['expediteur'].strip(),))
        tier = cursor.fetchone()
        if not tier:
            return jsonify({"error": f"Expéditeur '{data['expediteur']}' non trouvé"}), 400
        expediteur_tiers_id = tier['id']

        cursor.execute("SELECT id FROM utilisateurs WHERE CONCAT(prenom, ' ', nom) = %s", (data['enregistrePar'].strip(),))
        user = cursor.fetchone()
        if not user:
            return jsonify({"error": f"Utilisateur '{data['enregistrePar']}' non trouvé"}), 400
        user_id = user['id']

        type_courrier_id = data.get('typeCourrierId', 1)
        try:
            type_courrier_id = int(type_courrier_id) if type_courrier_id else 1
        except (ValueError, TypeError):
            type_courrier_id = 1

        query = """
        INSERT INTO courriers
        (numero, reference, sens, type_courrier_id, service_id, objet,
         date_reception, date_envoi, observations, saisi_par, statut,
         destinataire_division_id, expediteur_tiers_id, date_saisie)
        VALUES (%s, %s, 'entrant', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_DATE())
        """
        cursor.execute(query, (
            data['numero'].strip(),
            data['reference'].strip(),
            type_courrier_id,
            service_id,
            data['objet'].strip(),
            data['dateReception'],
            data['dateReception'],
            data.get('observation', '').strip() if data.get('observation') else '',
            user_id,
            'EN_ATTENTE',
            division_id,
            expediteur_tiers_id
        ))
        courrier_id = cursor.lastrowid
        conn.commit()
        return jsonify({"message": "Courrier enregistré avec succès", "statut": "EN_ATTENTE", "dbId": courrier_id}), 201
    except Exception as e:
        if conn:
            conn.rollback()
        logging.exception("Erreur add_courrier_entrant")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@courriers_entrants_bp.route('/courrier_entrant/update', methods=['PUT'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def update_courrier_entrant():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    role = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    user_id = user.get("id")

    # FAIL-CLOSED : sans périmètre, le contrôle d'ownership ci-dessous ne
    # s'appliquait pas et n'importe quel courrier devenait modifiable.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user_id)
    if _refus:
        return _refus

    data = request.json
    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # Identification par l'ID interne unique. Le `numero` et la `reference`
        # ne sont PAS uniques : ils ne doivent jamais servir de clé. Un
        # identifiant interne doit être un entier — on refuse qu'une valeur non
        # numérique (un numero injecté par erreur) soit passée à `WHERE id = %s`,
        # sinon MySQL la casterait en nombre (erreur 1292) et pourrait modifier
        # le mauvais courrier.
        db_id = data.get('id') or data.get('dbId')
        if db_id is not None:
            try:
                db_id = int(db_id)
            except (TypeError, ValueError):
                db_id = None

        courrier = None
        if db_id:
            cursor.execute(
                """SELECT c.id, c.service_id, c.destinataire_division_id, c.expediteur_division_id,
                          c.saisi_par, c.bo_courrier_id, bc.statut AS bo_statut
                   FROM courriers c
                   LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
                   WHERE c.id = %s AND c.sens = 'entrant'""",
                (db_id,),
            )
            courrier = cursor.fetchone()
        else:
            # Repli exceptionnel (appel sans ID interne) : le numero n'étant pas
            # unique, on ne l'utilise que s'il identifie UNE SEULE ligne, sans
            # ambiguïté. fetchall() pour éviter « Unread result found ».
            numero = (data.get('numero') or '').strip()
            if not numero:
                return jsonify({"error": "ID ou Numéro requis pour la mise à jour"}), 400
            cursor.execute(
                """SELECT c.id, c.service_id, c.destinataire_division_id, c.expediteur_division_id,
                          c.saisi_par, c.bo_courrier_id, bc.statut AS bo_statut
                   FROM courriers c
                   LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
                   WHERE c.numero = %s AND c.sens = 'entrant'""",
                (numero,)
            )
            matches = cursor.fetchall()
            if len(matches) != 1:
                return jsonify({"error": "Courrier introuvable ou ambigu : l'ID interne est requis."}), 400
            courrier = matches[0]
            db_id = courrier['id']
        if not courrier:
            return jsonify({"error": "Courrier introuvable"}), 404

        # === CONTRÔLE D'ACCÈS (ownership) - cohérent avec la liste GET ===
        _bo_id = courrier.get('bo_courrier_id')
        _bo_statut = courrier.get('bo_statut')
        _bo_visible = (
            _bo_id is None
            or _bo_statut in ('Affecté au service', 'Traité')
        )
        if role in (ROLE_CHEF_SERVICE, ROLE_AGENT) and service_id:
            _autorise = (
                (courrier.get('service_id') == service_id and _bo_visible)
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier que les courriers entrants de votre service."}), 403
        elif role == ROLE_CHEF_DIVISION and division_id:
            _autorise = (
                courrier.get('destinataire_division_id') == division_id
                or courrier.get('expediteur_division_id') == division_id
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier que les courriers entrants de votre division."}), 403

        # NOTE : le service n'est PAS modifiable via ce endpoint. L'affectation
        # / le changement de service se fait exclusivement via le bouton dédié
        # « Affecter au service » du Chef de Division (routes bureau_ordre).
        # Le formulaire « Modifier » n'envoie plus de champ destinataire.

        # Résoudre expediteur_tiers_id depuis le nom si fourni
        new_expediteur_tiers_id = None
        if data.get('expediteur'):
            cursor.execute("SELECT id FROM tiers WHERE nom = %s", (data['expediteur'].strip(),))
            tier = cursor.fetchall()
            if tier:
                new_expediteur_tiers_id = tier[0]['id']

        # Construire la requête dynamiquement
        fields = []
        params = []
        # Valeurs réellement appliquées : servent à propager la modification
        # vers le courrier Bureau d'Ordre lié et à tracer l'historique.
        applied = {}

        # Le numero est un champ modifiable du formulaire : il doit être
        # réellement enregistré. Il reste NON unique (aucune contrainte).
        if 'numero' in data:
            num_val = (data.get('numero') or '').strip()
            if num_val:
                fields.append("numero = %s")
                params.append(num_val)
                applied['numero'] = num_val

        if 'objet' in data:
            # S'assurer que l'objet n'est pas None/NULL
            obj_val = (data.get('objet') or '').strip()
            if obj_val:
                fields.append("objet = %s")
                params.append(obj_val)
                applied['objet'] = obj_val

        if 'dateReception' in data and data.get('dateReception'):
            fields.append("date_reception = %s")
            params.append(data['dateReception'])
            applied['date_reception'] = data['dateReception']

        if 'observation' in data:
            fields.append("observations = %s")
            params.append(data.get('observation') or '')
            applied['observations'] = data.get('observation') or ''

        if 'reference' in data:
            fields.append("reference = %s")
            params.append(data['reference'])
            applied['reference'] = data['reference']

        if 'typeCourrierId' in data and data.get('typeCourrierId'):
            try:
                type_id = int(data['typeCourrierId'])
                fields.append("type_courrier_id = %s")
                params.append(type_id)
                applied['type_courrier_id'] = type_id
            except (TypeError, ValueError):
                pass

        if new_expediteur_tiers_id:
            fields.append("expediteur_tiers_id = %s")
            params.append(new_expediteur_tiers_id)
            applied['expediteur_tiers_id'] = new_expediteur_tiers_id

        if not fields:
            return jsonify({"message": "Aucun champ à modifier"}), 200

        params.append(db_id)
        query = f"UPDATE courriers SET {', '.join(fields)} WHERE id = %s AND sens = 'entrant'"
        cursor.execute(query, params)

        if cursor.rowcount == 0:
            # rowcount == 0 peut simplement signifier « aucune valeur modifiée »
            # (soumission sans changement) : on vérifie l'existence réelle avant
            # de répondre 404.
            cursor.execute(
                "SELECT id FROM courriers WHERE id = %s AND sens = 'entrant'",
                (db_id,)
            )
            if not cursor.fetchall():
                return jsonify({"error": "Courrier introuvable"}), 404

        # ── Propagation vers le courrier du Bureau d'Ordre lié ───────────────
        # `courriers` et `bo_courriers` décrivent le MÊME courrier (lien unique :
        # courriers.bo_courrier_id — jamais le numero, qui n'est pas unique).
        # Les écrans de consultation Bureau d'Ordre / Chef de Division lisent
        # `bo_courriers` : sans cette propagation, ils continuaient d'afficher
        # l'ancienne version (expéditeur, type, objet…) après modification.
        # Aucun champ de règle métier n'est touché (statut, affectations,
        # saisi_par restent inchangés).
        cursor.execute(
            "SELECT bo_courrier_id FROM courriers WHERE id = %s AND sens = 'entrant'",
            (db_id,)
        )
        row = cursor.fetchone()
        bo_courrier_id = row.get('bo_courrier_id') if row else None

        if bo_courrier_id and applied:
            shared = {
                'numero':              'numero',
                'reference':           'reference',
                'objet':               'objet',
                'observations':        'observations',
                'date_reception':      'date_reception',
                'type_courrier_id':    'type_courrier_id',
                'expediteur_tiers_id': 'expediteur_tiers_id',
            }
            bo_sets = []
            bo_params = []
            for src, dst in shared.items():
                if src in applied:
                    bo_sets.append(f"{dst} = %s")
                    bo_params.append(applied[src])
                    if src == 'expediteur_tiers_id':
                        # L'expéditeur devient un tiers : garder la cohérence du
                        # type pour l'affichage COALESCE(tiers, division).
                        bo_sets.append("type_expediteur = 'tiers'")

            if bo_sets:
                bo_params.append(bo_courrier_id)
                cursor.execute(
                    f"UPDATE bo_courriers SET {', '.join(bo_sets)} WHERE id = %s",
                    bo_params
                )

                # Traçabilité de la modification côté Bureau d'Ordre
                user = get_current_user() or {}
                if user.get('id'):
                    details = "; ".join(
                        "{} : {}".format(k, "" if v is None else v)
                        for k, v in applied.items()
                    )[:1000]
                    cursor.execute(
                        """INSERT INTO bo_historique
                               (bo_courrier_id, action, details, effectue_par, adresse_ip)
                           VALUES (%s, %s, %s, %s, %s)""",
                        (bo_courrier_id, "Modification",
                         "Courrier mis à jour depuis le module Courrier entrant — " + details,
                         user['id'], request.remote_addr)
                    )

        # ── Rafraîchissement des instantanés « Téléchargements » ─────────────
        # pdf_downloads conserve des copies (numero, ref, sens, objet) : elles
        # doivent suivre la modification, sinon la liste affiche l'ancienne
        # version du courrier.
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

        # ── Invalidation du PDF en cache (export / impression) ───────────────
        # Fait APRÈS le commit : si la transaction échoue, le cache reste valide.
        try:
            from routes.courriers import invalidate_export_cache
            invalidate_export_cache(db_id)
        except Exception as cache_err:
            logger.warning("Invalidation cache export : %s", cache_err)

        return jsonify({"message": "Courrier mis à jour avec succès"})
    except Exception as e:
        if conn: conn.rollback()
        logging.exception("Erreur update_courrier_entrant")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_entrants_bp.route('/courrier_entrant/delete', methods=['DELETE'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION)
def delete_courrier_entrant():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    division_id = user.get("division_id")
    user_id = user.get("id")

    # FAIL-CLOSED : un Chef de division sans division_id ne doit rien pouvoir
    # supprimer — le contrôle d'ownership ci-dessous était sinon entièrement sauté.
    _refus = refus_si_perimetre_manquant(user["role"], user.get("service_id"), division_id, user_id)
    if _refus:
        return _refus

    courrier_id = request.args.get('id')
    numero = str(request.args.get('numero') or '').strip()  # Fallback

    # Un identifiant interne doit être un entier. Le `numero` n'étant PAS
    # unique, on refuse qu'une valeur non numérique soit injectée dans
    # `WHERE id = %s` (MySQL la casterait et supprimerait le mauvais courrier).
    db_id = None
    if courrier_id is not None:
        try:
            db_id = int(courrier_id)
        except (TypeError, ValueError):
            db_id = None

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        # === RÉCUPÉRATION + CONTRÔLE D'ACCÈS AVANT SUPPRESSION ===
        courrier = None
        if db_id:
            cursor.execute(
                """SELECT c.id, c.destinataire_division_id, c.expediteur_division_id, c.saisi_par
                   FROM courriers c
                   WHERE c.id = %s AND c.sens = 'entrant'""",
                (db_id,),
            )
            courrier = cursor.fetchone()
        elif numero:
            # Repli exceptionnel (appel sans ID) : le numero n'est pas unique,
            # on ne supprime que s'il identifie UNE seule ligne, sans ambiguïté.
            cursor.execute(
                """SELECT c.id, c.destinataire_division_id, c.expediteur_division_id, c.saisi_par
                   FROM courriers c
                   WHERE c.numero = %s AND c.sens = 'entrant'""",
                (numero,),
            )
            matches = cursor.fetchall()
            if len(matches) != 1:
                return jsonify({"error": "Courrier introuvable ou ambigu : l'ID interne est requis."}), 400
            courrier = matches[0]
            db_id = courrier['id']
        else:
            return jsonify({"error": "ID ou numéro requis."}), 400
        if not courrier:
            return jsonify({"error": "Courrier introuvable"}), 404

        # Contrôle ownership Chef de Division (cohérent avec liste GET)
        if division_id:
            _autorise = (
                courrier.get('destinataire_division_id') == division_id
                or courrier.get('expediteur_division_id') == division_id
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez supprimer que les courriers entrants de votre division."}), 403

        cursor.execute("DELETE FROM courriers WHERE id = %s AND sens = 'entrant'", (db_id,))

        conn.commit()
        return jsonify({"message": "Courrier supprimé avec succès"})
    except Exception as e:
        if conn: conn.rollback()
        logging.exception("Erreur delete_courrier_entrant")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_entrants_bp.route('/courrier_entrant/status', methods=['PATCH'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def update_courrier_status():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    role = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    user_id = user.get("id")

    # FAIL-CLOSED : sans périmètre, le contrôle d'ownership ci-dessous était sauté.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user_id)
    if _refus:
        return _refus

    data = request.json
    db_id = data.get('id') or data.get('dbId')
    numero = str(data.get('numero') or '').strip()  # Fallback
    statut = data.get('statut')

    # Un identifiant interne doit être un entier. Le `numero` n'étant PAS
    # unique, une valeur non numérique injectée dans `WHERE id = %s` serait
    # castée par MySQL et pourrait cibler le mauvais courrier.
    if db_id is not None:
        try:
            db_id = int(db_id)
        except (TypeError, ValueError):
            db_id = None

    statut_map = {
        'En attente': 'EN_ATTENTE',
        'Traité':     'TRAITE',
        'EN_ATTENTE': 'EN_ATTENTE',
        'TRAITE':     'TRAITE'
    }
    statut = statut_map.get(statut, statut)

    if statut not in ('EN_ATTENTE', 'TRAITE'):
        return jsonify({"error": f"Statut invalide : {statut}"}), 400

    conn = None
    cursor = None
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        if db_id:
            cursor.execute(
                """SELECT c.id, c.numero, c.bo_courrier_id, c.service_id,
                          c.destinataire_division_id, c.expediteur_division_id, c.saisi_par,
                          bc.statut AS bo_statut
                   FROM courriers c
                   LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
                   WHERE c.id = %s AND c.sens = 'entrant'""",
                (db_id,),
            )
            courrier = cursor.fetchone()
        elif numero:
            # Repli exceptionnel (appel sans ID) : le numero n'est pas unique,
            # on ne l'utilise que s'il identifie UNE seule ligne, sans ambiguïté.
            cursor.execute(
                """SELECT c.id, c.numero, c.bo_courrier_id, c.service_id,
                          c.destinataire_division_id, c.expediteur_division_id, c.saisi_par,
                          bc.statut AS bo_statut
                   FROM courriers c
                   LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
                   WHERE c.numero = %s AND c.sens = 'entrant'""",
                (numero,),
            )
            matches = cursor.fetchall()
            if len(matches) != 1:
                return jsonify({"error": "Courrier introuvable ou ambigu : l'ID interne est requis."}), 400
            courrier = matches[0]
        else:
            return jsonify({"error": "ID ou numéro requis."}), 400
        if not courrier:
            return jsonify({"error": "Courrier introuvable"}), 404

        # === CONTRÔLE D'ACCÈS (ownership) - cohérent avec la liste GET ===
        _bo_id = courrier.get('bo_courrier_id')
        _bo_statut = courrier.get('bo_statut')
        _bo_visible = (
            _bo_id is None
            or _bo_statut in ('Affecté au service', 'Traité')
        )
        if role in (ROLE_CHEF_SERVICE, ROLE_AGENT) and service_id:
            _autorise = (
                (courrier.get('service_id') == service_id and _bo_visible)
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier le statut que des courriers entrants de votre service."}), 403
        elif role == ROLE_CHEF_DIVISION and division_id:
            _autorise = (
                courrier.get('destinataire_division_id') == division_id
                or courrier.get('expediteur_division_id') == division_id
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez modifier le statut que des courriers entrants de votre division."}), 403

        actual_id = courrier['id']

        cursor.execute(
            "UPDATE courriers SET statut = %s WHERE id = %s AND sens = 'entrant'",
            (statut, actual_id),
        )

        if statut == "EN_ATTENTE":
            # Réponses liées à CE courrier : identifiées par reponse_a_id
            # (ID interne unique). Ne JAMAIS filtrer sur numero/reference qui
            # ne sont pas uniques (risque de supprimer les réponses d'autres
            # courriers partageant le même numéro).
            cursor.execute(
                "DELETE FROM courriers WHERE sens = 'sortant' AND reponse_a_id = %s",
                (actual_id,),
            )

        # Synchroniser le statut BO pour visibilité Agent BO / Chef de Division
        bo_courrier_id = courrier.get('bo_courrier_id')
        if bo_courrier_id:
            if statut == "TRAITE":
                cursor.execute(
                    "UPDATE bo_courriers SET statut = 'Traité' WHERE id = %s",
                    (bo_courrier_id,),
                )
            elif statut == "EN_ATTENTE":
                cursor.execute(
                    """UPDATE bo_courriers
                       SET statut = 'Affecté au service'
                       WHERE id = %s AND statut = 'Traité'""",
                    (bo_courrier_id,),
                )

        conn.commit()
        return jsonify({"message": "Statut mis à jour avec succès", "statut": statut})
    except Exception as e:
        if conn:
            conn.rollback()
        logger.exception("Erreur serveur")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@courriers_entrants_bp.route('/courrier_entrant/archive', methods=['PATCH'])
@auth_required
@roles_required(ROLE_CHEF_DIVISION, ROLE_CHEF_SERVICE, ROLE_AGENT)
def archive_courrier_entrant():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    role = user["role"]
    service_id = user.get("service_id")
    division_id = user.get("division_id")
    user_id = user.get("id")

    # FAIL-CLOSED : sans périmètre, le contrôle d'ownership ci-dessous était sauté.
    _refus = refus_si_perimetre_manquant(role, service_id, division_id, user_id)
    if _refus:
        return _refus

    data = request.json
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
            cursor.execute(
                """SELECT c.id, c.service_id, c.destinataire_division_id, c.expediteur_division_id,
                          c.saisi_par, c.bo_courrier_id, bc.statut AS bo_statut
                   FROM courriers c
                   LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
                   WHERE c.id = %s AND c.sens = 'entrant'""",
                (db_id,),
            )
            courrier = cursor.fetchone()
            where_param = db_id
        elif numero:
            # Repli exceptionnel (appel sans ID) : le numero n'est pas unique,
            # on ne l'utilise que s'il identifie UNE seule ligne, sans ambiguïté.
            cursor.execute(
                """SELECT c.id, c.service_id, c.destinataire_division_id, c.expediteur_division_id,
                          c.saisi_par, c.bo_courrier_id, bc.statut AS bo_statut
                   FROM courriers c
                   LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
                   WHERE c.numero = %s AND c.sens = 'entrant'""",
                (numero,)
            )
            matches = cursor.fetchall()
            if len(matches) == 1:
                courrier = matches[0]
                where_param = courrier['id']
            else:
                return jsonify({"error": "Courrier introuvable ou ambigu : l'ID interne est requis."}), 400
        else:
            return jsonify({"error": "ID ou numéro requis."}), 400
        if not courrier:
            return jsonify({"error": "Courrier introuvable."}), 404

        # === CONTRÔLE D'ACCÈS (ownership) - cohérent avec la liste GET ===
        _bo_id = courrier.get('bo_courrier_id')
        _bo_statut = courrier.get('bo_statut')
        _bo_visible = (
            _bo_id is None
            or _bo_statut in ('Affecté au service', 'Traité')
        )
        if role in (ROLE_CHEF_SERVICE, ROLE_AGENT) and service_id:
            _autorise = (
                (courrier.get('service_id') == service_id and _bo_visible)
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez archiver que les courriers entrants de votre service."}), 403
        elif role == ROLE_CHEF_DIVISION and division_id:
            _autorise = (
                courrier.get('destinataire_division_id') == division_id
                or courrier.get('expediteur_division_id') == division_id
                or courrier.get('saisi_par') == user_id
            )
            if not _autorise:
                return jsonify({"error": "Accès non autorisé : vous ne pouvez archiver que les courriers entrants de votre division."}), 403

        if archive:
            cursor.execute(
                """UPDATE courriers
                   SET archive = %s,
                       date_archivage = NOW(),
                       archive_par = %s
                   WHERE id = %s AND sens = 'entrant'""",
                (archive, archive_par, where_param)
            )
        else:
            # Désarchivage : on remet archive à NULL SANS toucher au statut.
            # Règle métier : le statut courant doit être conservé (un courrier
            # TRAITÉ avant archivage doit redevenir TRAITÉ après désarchivage).
            cursor.execute(
                """UPDATE courriers
                   SET archive = %s,
                       date_archivage = NULL,
                       archive_par = NULL
                   WHERE id = %s AND sens = 'entrant'""",
                (archive, where_param)
            )

        if cursor.rowcount == 0:
            return jsonify({"error": "Courrier introuvable."}), 404

        conn.commit()
        action = "archivé" if archive else "désarchivé"
        return jsonify({"message": f"Courrier {action} avec succès"})
    except Exception as e:
        logging.exception("Erreur archive_courrier_entrant")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


@courriers_entrants_bp.route('/courrier_entrant/archive', methods=['GET'])
@auth_required
def get_archived_courriers_entrants():
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
        SELECT c.id, c.numero, c.reference, c.objet, c.date_reception, c.statut, c.archive,
               c.saisi_par, c.service_id, c.destinataire_division_id, c.expediteur_tiers_id,
               c.type_courrier_id, c.observations, c.bo_courrier_id, c.date_saisie, c.date_archivage,
               u.nom as saisi_par_nom, u.prenom as saisi_par_prenom,
               d.nom as division_nom, s.nom as service_nom, t.nom as expediteur_nom, t.type_tiers_id as type_tiers_id,
               tc.libelle as type_libelle,
               arch_u.nom as archive_par_nom, arch_u.prenom as archive_par_prenom,
               bc.statut as bo_statut
        FROM courriers c
        LEFT JOIN utilisateurs u ON c.saisi_par = u.id
        LEFT JOIN utilisateurs arch_u ON c.archive_par = arch_u.id
        LEFT JOIN divisions d ON c.destinataire_division_id = d.id
        LEFT JOIN services s ON c.service_id = s.id
        LEFT JOIN tiers t ON c.expediteur_tiers_id = t.id
        LEFT JOIN types_courrier tc ON c.type_courrier_id = tc.id
        LEFT JOIN bo_courriers bc ON c.bo_courrier_id = bc.id
        WHERE c.sens = 'entrant' AND c.archive = TRUE
        """
        params = []
        if (role == 'Chef de service' or role == 'Agent') and service_id:
            query += " AND c.service_id = %s"
            params.append(service_id)
        elif role == 'Chef de division' and division_id:
            # FIX: Harmoniser avec le dashboard - inclure les courriers où la division est expéditeur
            query += " AND (c.destinataire_division_id = %s OR c.expediteur_division_id = %s)"
            params.extend([division_id, division_id])

        # Compter le total pour la pagination
        count_query = query.replace(
            "SELECT c.id, c.numero, c.reference, c.objet, c.date_reception, c.statut, c.archive,\n               c.saisi_par, c.service_id, c.destinataire_division_id, c.expediteur_tiers_id,\n               c.type_courrier_id, c.observations, c.bo_courrier_id, c.date_saisie, c.date_archivage,\n               u.nom as saisi_par_nom, u.prenom as saisi_par_prenom,\n               d.nom as division_nom, s.nom as service_nom, t.nom as expediteur_nom, t.type_tiers_id as type_tiers_id,\n               tc.libelle as type_libelle,\n               arch_u.nom as archive_par_nom, arch_u.prenom as archive_par_prenom,\n               bc.statut as bo_statut",
            "SELECT COUNT(*) as total"
        )
        count_query = count_query.split("FROM")[0] + "FROM courriers c " + query.split("FROM courriers c")[1].split("ORDER BY")[0]
        cursor.execute(count_query, params)
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

        # Repli : pièces jointes saisies au Bureau d'Ordre (bo_documents).
        # Si le courrier n'a aucun document classique, exposer sa première
        # pièce jointe BO comme fichier joint actuel (affichage seul).
        # `fichier_source` / `fichier_bo_id` permettent au frontend d'appeler le
        # bon endpoint de téléchargement (uploads/bo vs uploads).
        fichier_sources = {}
        fichier_bo_ids = {}
        for c in courriers:
            if c['id'] in file_names:
                fichier_sources[c['id']] = 'documents'

        bo_ids = [c['bo_courrier_id'] for c in courriers if c.get('bo_courrier_id')]
        if bo_ids:
            placeholders = ','.join(['%s'] * len(bo_ids))
            cursor.execute(
                f"SELECT id, bo_courrier_id, nom_fichier FROM bo_documents WHERE bo_courrier_id IN ({placeholders})",
                bo_ids
            )
            bo_docs_names = {}
            bo_docs_ids = {}
            for row in cursor.fetchall():
                if row['bo_courrier_id'] not in bo_docs_names:
                    bo_docs_names[row['bo_courrier_id']] = row['nom_fichier']
                    bo_docs_ids[row['bo_courrier_id']] = row['id']
            for c in courriers:
                if (c['id'] not in file_names and c.get('bo_courrier_id')
                        and c['bo_courrier_id'] in bo_docs_names):
                    file_names[c['id']] = bo_docs_names[c['bo_courrier_id']]
                    fichier_sources[c['id']] = 'bo'
                    fichier_bo_ids[c['id']] = bo_docs_ids[c['bo_courrier_id']]

        formatted_courriers = []
        for c in courriers:
            formatted_courriers.append({
                # `id` = ID technique interne (unique). Le numero n'étant pas
                # unique, il ne doit jamais servir d'identifiant.
                "id": c['id'],
                "numero": c['numero'],
                "reference": c.get('reference') or "",
                "expediteur": c.get('expediteur_nom') or "Non spécifié",
                "objet": c['objet'],
                "date": str(c['date_reception']),
                "statut": c.get('statut') or "En attente",
                "archive": True,
                "fichier": file_names.get(c['id']),
                "fichier_source": fichier_sources.get(c['id']),
                "fichier_bo_id":  fichier_bo_ids.get(c['id']),
                "expediteur_tiers_id": c.get('expediteur_tiers_id'),
                "type_tiers_id": c.get('type_tiers_id'),
                "type": c.get('type_libelle') or "N/A",
                "dbId": c['id'],
                "Destinataire": (
                    # Courrier issu du Bureau d'Ordre :
                    # n'afficher le service que si le Chef de Division l'a explicitement affecté
                    "Division : {}".format(c.get('division_nom') or "")
                    if (c.get('bo_courrier_id') and c.get('bo_statut') == 'Affecté')
                    else "Division : {} | Service : {}".format(
                        c.get('division_nom') or "",
                        c.get('service_nom') or ""
                    )
                ),
                "observation": c.get('observations') or "",
                "saisi_par": "{} {}".format(c.get('saisi_par_prenom') or "", c.get('saisi_par_nom') or ""),
                #données d'archivage
                "archive_par_nom": c.get('archive_par_nom') or None,
                "archive_par_prenom": c.get('archive_par_prenom') or None,
                "date_archivage": str(c['date_archivage']) if c.get('date_archivage') else None,
            })

        return jsonify({
            "data": formatted_courriers,
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