import os
import mysql.connector
from dotenv import load_dotenv
from logger_config import get_logger

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

logger = get_logger(__name__)


def get_connection():
    host     = os.getenv("DB_HOST", "localhost")
    port     = int(os.getenv("DB_PORT", "3306"))
    user     = os.getenv("DB_USER")
    password = os.getenv("DB_PASSWORD", "")
    database = os.getenv("DB_NAME")

    if not user or not database:
        raise RuntimeError(
            "Variables d'environnement DB_USER et DB_NAME requises. "
            "Vérifiez votre fichier .env."
        )

    try:
        conn = mysql.connector.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            charset="utf8mb4",
            collation="utf8mb4_unicode_ci",
        )
        return conn
    except mysql.connector.Error as err:
        import logging
        logging.error("Erreur de connexion à la base de données : %s", err)
        raise RuntimeError("Impossible de se connecter à la base de données.") from err


if __name__ == "__main__":
    conn = get_connection()
    logger.info("Connexion MySQL OK")
    conn.close()
