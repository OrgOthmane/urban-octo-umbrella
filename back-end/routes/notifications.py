import logging
from flask import Blueprint, request, jsonify
from db import get_connection
from routes.auth_helpers import auth_required, get_current_user
from logger_config import get_logger

notifications_bp = Blueprint("notifications", __name__, url_prefix="/notifications")
logger = get_logger(__name__)


def start_notification_scheduler(app):
    try:
        from apscheduler.schedulers.background import BackgroundScheduler

        def cleanup():
            with app.app_context():
                try:
                    conn   = get_connection()
                    cursor = conn.cursor()
                    cursor.execute(
                        "DELETE FROM notifications WHERE lu = FALSE AND expire_at < NOW()"
                    )
                    deleted = cursor.rowcount
                    conn.commit()
                    if deleted > 0:
                        logger.info(f"{deleted} notification(s) expirée(s) supprimée(s)")
                except Exception as e:
                    logger.error(f"Erreur nettoyage notifications: {e}")
                finally:
                    try: cursor.close(); conn.close()
                    except: pass

        scheduler = BackgroundScheduler(daemon=True)
        scheduler.add_job(cleanup, "interval", hours=1, id="notif_cleanup")
        scheduler.start()
        logger.info("Nettoyage notifications activé (toutes les heures)")
    except ImportError:
        logger.warning("APScheduler non installé. Installez avec : pip install apscheduler")



def create_notification(cursor, destinataire_id: int, type_: str,
                         titre: str, message: str,
                         courrier_id=None, bo_courrier_id=None):
    cursor.execute(
        """INSERT INTO notifications
               (destinataire, type, titre, message,
                courrier_id, bo_courrier_id,
                lu, created_at, expire_at)
           VALUES (%s, %s, %s, %s, %s, %s,
                   FALSE, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))""",
        (destinataire_id, type_, titre[:200], message[:500],
         courrier_id, bo_courrier_id)
    )


def notify_users(cursor, user_ids: list, type_: str,
                  titre: str, message: str,
                  courrier_id=None, bo_courrier_id=None):
    for uid in user_ids:
        create_notification(cursor, uid, type_, titre, message,
                            courrier_id, bo_courrier_id)



@notifications_bp.route("", methods=["GET"])
@auth_required
def get_notifications():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    user_id = user["id"]

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            """DELETE FROM notifications
               WHERE destinataire = %s
                 AND lu = FALSE
                 AND expire_at < NOW()""",
            (user_id,)
        )
        conn.commit()

        cursor.execute(
            """SELECT id, type, titre, message,
                      courrier_id, bo_courrier_id,
                      lu, created_at, expire_at
               FROM notifications
               WHERE destinataire = %s
                 AND lu = FALSE
               ORDER BY created_at DESC
               LIMIT 50""",
            (user_id,)
        )
        rows = cursor.fetchall()
        for r in rows:
            r["created_at"] = str(r["created_at"]) if r.get("created_at") else None
            r["expire_at"]  = str(r["expire_at"])  if r.get("expire_at")  else None

        return jsonify(rows)
    except Exception as e:
        logging.exception("Erreur get_notifications")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


@notifications_bp.route("/<int:notif_id>/lire", methods=["PATCH"])
@auth_required
def marquer_lue(notif_id):
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    user_id = user["id"]

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, courrier_id, bo_courrier_id, type FROM notifications WHERE id = %s AND destinataire = %s",
            (notif_id, user_id)
        )
        notif = cursor.fetchone()
        if not notif:
            return jsonify({"error": "Notification introuvable"}), 404

        cursor.execute(
            "DELETE FROM notifications WHERE id = %s AND destinataire = %s",
            (notif_id, user_id)
        )
        conn.commit()
        return jsonify({
            "message":       "Notification supprimée",
            "courrier_id":   notif.get("courrier_id"),
            "bo_courrier_id": notif.get("bo_courrier_id"),
            "type":          notif.get("type"),
        })
    except Exception as e:
        conn.rollback()
        logging.exception("Erreur marquer_lue")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()



@notifications_bp.route("/tout-lire", methods=["DELETE"])
@auth_required
def tout_supprimer():
    user = get_current_user()
    if not user:
        return jsonify({"error": "Utilisateur introuvable."}), 401
    user_id = user["id"]

    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "DELETE FROM notifications WHERE destinataire = %s", (user_id,)
        )
        conn.commit()
        return jsonify({"message": "Toutes les notifications supprimées"})
    except Exception as e:
        conn.rollback()
        logging.exception("Erreur tout_supprimer notifications")
        return jsonify({"error": "Erreur serveur."}), 500
    finally:
        cursor.close(); conn.close()


@notifications_bp.route("/count", methods=["GET"])
@auth_required
def count_notifications():
    user = get_current_user()
    if not user:
        return jsonify({"count": 0})
    user_id = user["id"]
    conn   = get_connection()
    cursor = conn.cursor(dictionary=True)
    try:
        cursor.execute(
            "DELETE FROM notifications WHERE destinataire = %s AND lu = FALSE AND expire_at < NOW()",
            (user_id,)
        )
        conn.commit()
        cursor.execute(
            "SELECT COUNT(*) as count FROM notifications WHERE destinataire = %s AND lu = FALSE",
            (user_id,)
        )
        return jsonify({"count": cursor.fetchone()["count"]})
    except Exception as e:
        return jsonify({"count": 0})
    finally:
        cursor.close(); conn.close()
