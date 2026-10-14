"""
Instance partagée du rate limiter (Flask-Limiter).

Pourquoi un module dédié :
    Le limiter doit exister AVANT l'import des routes pour pouvoir décorer les
    endpoints sensibles (ex. `/login`) au moment de leur définition. On crée ici
    une instance « nue » (sans app), puis on l'initialise dans `app.py` via
    `limiter.init_app(app)`. Les routes importent cette même instance unique.

Activation / désactivation :
    Contrôlée par `app.config["RATELIMIT_ENABLED"]` (positionnée dans app.py
    depuis la variable d'environnement RATELIMIT_ENABLED). Flask-Limiter respecte
    nativement ce flag : à `false`, aucune limite n'est appliquée.
"""
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

# Stockage en mémoire locale (suffisant pour un déploiement mono-processus).
limiter = Limiter(get_remote_address, default_limits=[], storage_uri="memory://")
