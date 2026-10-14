"""
Configuration centralisée du logging pour l'application.
Remplace les print() par un système de logging structuré.
"""
import logging
import sys
from logging.handlers import RotatingFileHandler
import os


def setup_logging():
    """
    Configure le logging pour l'application.
    
    - Niveau DEBUG en développement (si FLASK_DEBUG=true)
    - Niveau INFO en production (par défaut)
    - Logs vers la console et vers un fichier si nécessaire
    """
    log_level = os.getenv("FLASK_DEBUG", "false").lower() == "true"
    level = logging.DEBUG if log_level else logging.INFO
    
    # Logger racine
    logger = logging.getLogger()
    logger.setLevel(level)
    
    # Supprimer les handlers existants pour éviter les doublons
    logger.handlers.clear()
    
    # Format des logs
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Handler console
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Handler fichier (optionnel, en production)
    log_file = os.getenv("LOG_FILE")
    if log_file:
        try:
            file_handler = RotatingFileHandler(
                log_file,
                maxBytes=10*1024*1024,  # 10 MB
                backupCount=5
            )
            file_handler.setLevel(level)
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
        except Exception as e:
            logger.warning(f"Impossible de créer le fichier de log {log_file}: {e}")
    
    return logger


def get_logger(name):
    """
    Retourne un logger avec le nom spécifié.
    
    Utilisation:
        from logger_config import get_logger
        logger = get_logger(__name__)
        logger.info("Message informatif")
        logger.error("Message d'erreur")
    """
    return logging.getLogger(name)


# Initialiser le logging au démarrage
setup_logging()