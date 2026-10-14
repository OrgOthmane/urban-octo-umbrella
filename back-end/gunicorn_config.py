"""
Configuration Gunicorn pour la production de l'application Flask.
Utilisation: gunicorn -c gunicorn_config.py app:app
"""
import multiprocessing
import os

# Nombre de workers (recommandé: 2-4 x nombre de CPU cores)
workers = multiprocessing.cpu_count() * 2 + 1

# Type de worker (gevent recommandé pour les applications I/O)
worker_class = 'sync'

# Port d'écoute
bind = '0.0.0.0:5000'

# Timeout des workers (secondes)
timeout = 120
keepalive = 2

# Nombre de threads par worker
threads = 2

# Niveau de logging
loglevel = 'info'

# Fichiers de log
accesslog = '-'  # stdout
errorlog = '-'   # stderr

# Processus maître
daemon = False
pidfile = 'gunicorn.pid'
user = None
group = None

# Reload automatique en développement (à désactiver en production)
reload = False

# Limites de requêtes
limit_request_line = 4096
limit_request_fields = 100
limit_request_field_size = 8190

# Configuration spécifique pour Flask
wsgi_app = 'app'

# Variables d'environnement pour la production
# Ces valeurs peuvent être surchargées par des variables d'environnement réelles
raw_env = [
    'FLASK_ENV=production',
    'FLASK_DEBUG=false',
]

# Options de sécurité
# Prévenir le spawn de workers avec des connexions actives
preload_app = False

# Max requests par worker avant redémarrage (pour éviter les fuites mémoire)
max_requests = 1000
max_requests_jitter = 50

# Graceful timeout
graceful_timeout = 30