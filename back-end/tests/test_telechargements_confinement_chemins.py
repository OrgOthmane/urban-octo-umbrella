"""Tests de régression — confinement des chemins de fichiers (routes/telechargements.py).

Contexte d'audit (faille CRITIQUE corrigée) :
    POST /telechargements/record acceptait un champ `chemin_stockage` fourni par
    le client et l'enregistrait tel quel. GET /telechargements/serve/<id> faisait
    ensuite send_file() sur ce chemin et DELETE /telechargements/<id> un
    os.remove(), sans aucune vérification de confinement dans le dossier
    `exports/`.

    Un simple compte « Agent » pouvait donc :
      1. lire n'importe quel fichier du serveur (ex. back-end/.env, qui contient
         la SECRET_KEY) → falsification de JWT → prise de contrôle totale ;
      2. supprimer n'importe quel fichier accessible au processus Flask.

Ces tests s'exécutent SANS base de données : le blueprint est monté sur une
application Flask minimale et la couche DB est remplacée par un double de test.
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# SECRET_KEY minimale requise pour que flask_jwt_extended puisse signer un jeton
# de test. Aucune donnée réelle n'est utilisée.
os.environ.setdefault("SECRET_KEY", "0123456789abcdef0123456789abcdef-test")

from flask import Flask                                   # noqa: E402
from flask_jwt_extended import JWTManager, create_access_token  # noqa: E402

import routes.telechargements as tel                       # noqa: E402


EXPORTS = tel.EXPORT_FOLDER
# Fichier sensible réel du serveur : cible de l'attaque. On vise le dépôt lui-même
# (présent ou non), et à défaut un chemin absolu clairement hors exports/.
SENSITIVE_TARGET = os.path.join(BACKEND_DIR, ".env")


# ── Doubles de test pour la couche base de données ───────────────────────────
class FakeCursor:
    """Mémorise les requêtes exécutées et retourne une ligne configurable."""

    def __init__(self, conn, row=None):
        self.conn = conn
        self.row = row
        self.executed = []
        self.lastrowid = 4242

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        return self.row

    def fetchall(self):
        return [self.row] if self.row else []

    def close(self):
        pass


class FakeConn:
    def __init__(self, row=None):
        self.row = row
        self.committed = False
        self.rolled_back = False

    def cursor(self, dictionary=False):
        self._cursor = FakeCursor(self, self.row)
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        pass


FAKE_AGENT = {"id": 999, "role": "Agent", "identite": "agent.test"}


@pytest.fixture()
def app():
    application = Flask(__name__)
    application.config["JWT_SECRET_KEY"] = os.environ["SECRET_KEY"]
    application.config["TESTING"] = True
    JWTManager(application)
    application.register_blueprint(tel.telechargements_bp)
    return application


@pytest.fixture()
def auth_header(app):
    with app.app_context():
        token = create_access_token(
            identity=str(FAKE_AGENT["id"]),
            additional_claims={"role": FAKE_AGENT["role"]},
        )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def patched(monkeypatch):
    """Remplace get_current_user et get_connection par des doubles."""
    state = {"conn": None}

    def fake_get_current_user():
        return dict(FAKE_AGENT)

    def make_conn_factory(row=None):
        def fake_get_connection():
            state["conn"] = FakeConn(row=row)
            return state["conn"]
        return fake_get_connection

    monkeypatch.setattr(tel, "get_current_user", fake_get_current_user)
    monkeypatch.setattr(tel, "get_connection", make_conn_factory(None))
    state["set_row"] = lambda row: monkeypatch.setattr(
        tel, "get_connection", make_conn_factory(row)
    )
    return state


# ── 1. Tests unitaires du garde-fou _safe_export_path ────────────────────────
def test_accepte_un_chemin_dans_exports():
    legitime = os.path.join(EXPORTS, "courrier_11.pdf")
    assert tel._safe_export_path(legitime) == os.path.realpath(legitime)


def test_accepte_rien_pour_un_chemin_vide():
    assert tel._safe_export_path(None) is None
    assert tel._safe_export_path("") is None


@pytest.mark.parametrize("malicious", [
    SENSITIVE_TARGET,                                   # back-end/.env (SECRET_KEY)
    os.path.join(EXPORTS, "..", ".env"),                # traversal relatif
    os.path.join(EXPORTS, "..", "..", "database.sql"),  # traversal plus profond
    os.path.join(BACKEND_DIR, "db.py"),                 # code source
    "/etc/passwd",                                      # cible Unix
    "C:\\Windows\\win.ini",                             # cible Windows
    EXPORTS + "_evil\\secret.pdf",                      # confusion de préfixe texte
])
def test_refuse_tout_chemin_hors_exports(malicious):
    assert tel._safe_export_path(malicious) is None, (
        f"Le chemin {malicious!r} aurait dû être refusé"
    )


def test_refuse_les_types_invalides():
    assert tel._safe_export_path(12345) is None or isinstance(
        tel._safe_export_path(12345), str
    )
    # Un objet non convertible en chemin ne doit jamais lever d'exception.
    assert tel._safe_export_path({"a": 1}) is None


# ── 2. POST /telechargements/record ──────────────────────────────────────────
def test_record_refuse_un_chemin_sensible(app, auth_header, patched):
    client = app.test_client()
    resp = client.post(
        "/telechargements/record",
        headers=auth_header,
        json={
            "nom_fichier": "innocent.pdf",
            "chemin_stockage": SENSITIVE_TARGET,
        },
    )
    assert resp.status_code == 400
    # Aucune écriture en base ne doit avoir eu lieu.
    assert patched["conn"] is None, "Aucune connexion DB ne devrait être ouverte"


def test_record_refuse_un_traversal(app, auth_header, patched):
    client = app.test_client()
    resp = client.post(
        "/telechargements/record",
        headers=auth_header,
        json={
            "nom_fichier": "innocent.pdf",
            "chemin_stockage": os.path.join(EXPORTS, "..", ".env"),
        },
    )
    assert resp.status_code == 400
    assert patched["conn"] is None


def test_record_accepte_un_chemin_legitime(app, auth_header, patched):
    client = app.test_client()
    legitime = os.path.join(EXPORTS, "courrier_11.pdf")
    resp = client.post(
        "/telechargements/record",
        headers=auth_header,
        json={
            "nom_fichier": "courrier_11.pdf",
            "chemin_stockage": legitime,
            "courrier_id": 11,
            "taille_octets": 1597,
        },
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    # Le chemin enregistré doit être la version résolue, à l'intérieur d'exports/.
    inserts = [p for (s, p) in patched["conn"]._cursor.executed if "INSERT" in s]
    assert inserts, "Un INSERT aurait dû être exécuté"
    params = inserts[0]
    assert os.path.realpath(legitime) in params
    assert patched["conn"].committed is True


def test_record_sans_chemin_reste_autorise(app, auth_header, patched):
    """Comportement existant préservé : chemin_stockage est optionnel."""
    client = app.test_client()
    resp = client.post(
        "/telechargements/record",
        headers=auth_header,
        json={"nom_fichier": "courrier_12.pdf", "courrier_id": 12},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)


# ── 3. GET /telechargements/serve/<id> (défense en profondeur) ───────────────
def test_serve_refuse_une_ligne_deja_empoisonnee(app, auth_header, patched, monkeypatch):
    """Une ligne enregistrée AVANT le correctif ne doit plus pouvoir être servie."""
    patched["set_row"]({
        "id": 1,
        "user_id": FAKE_AGENT["id"],
        "nom_fichier": "innocent.pdf",
        "chemin_stockage": SENSITIVE_TARGET,
    })

    def explode(*args, **kwargs):
        raise AssertionError("send_file ne doit JAMAIS être appelé sur un chemin hors exports/")

    monkeypatch.setattr(tel, "send_file", explode)

    client = app.test_client()
    resp = client.get("/telechargements/serve/1", headers=auth_header)
    assert resp.status_code == 404


def test_serve_refuse_un_traversal_stocke(app, auth_header, patched, monkeypatch):
    patched["set_row"]({
        "id": 2,
        "user_id": FAKE_AGENT["id"],
        "nom_fichier": "innocent.pdf",
        "chemin_stockage": os.path.join(EXPORTS, "..", ".env"),
    })

    def explode(*args, **kwargs):
        raise AssertionError("send_file ne doit JAMAIS être appelé sur un chemin hors exports/")

    monkeypatch.setattr(tel, "send_file", explode)

    client = app.test_client()
    resp = client.get("/telechargements/serve/2", headers=auth_header)
    assert resp.status_code == 404


def test_serve_interdit_le_compte_d_autrui(app, auth_header, patched):
    """Le contrôle propriétaire existant doit continuer à s'appliquer (non-régression)."""
    patched["set_row"]({
        "id": 3,
        "user_id": 12345,  # un autre utilisateur
        "nom_fichier": "autre.pdf",
        "chemin_stockage": os.path.join(EXPORTS, "autre.pdf"),
    })
    client = app.test_client()
    resp = client.get("/telechargements/serve/3", headers=auth_header)
    assert resp.status_code == 403


# ── 4. DELETE /telechargements/<id> ──────────────────────────────────────────
def test_delete_ne_supprime_pas_un_fichier_hors_exports(app, auth_header, patched, monkeypatch):
    patched["set_row"]({
        "id": 4,
        "user_id": FAKE_AGENT["id"],
        "nom_fichier": "innocent.pdf",
        "chemin_stockage": SENSITIVE_TARGET,
    })

    removed = []
    monkeypatch.setattr(tel.os, "remove", lambda p: removed.append(p))

    client = app.test_client()
    resp = client.delete("/telechargements/4", headers=auth_header)

    # La ligne DB est bien supprimée (fonctionnalité préservée)...
    assert resp.status_code == 200
    deletes = [s for (s, p) in patched["conn"]._cursor.executed if "DELETE" in s]
    assert deletes, "La ligne pdf_downloads aurait dû être supprimée"
    # ...mais AUCUN fichier physique hors exports/ n'est touché.
    assert removed == [], f"os.remove a été appelé sur {removed!r}"


def test_delete_supprime_un_fichier_legitime(app, auth_header, patched, monkeypatch, tmp_path):
    """Non-régression : la suppression d'un PDF d'export légitime fonctionne toujours."""
    legitime = os.path.join(EXPORTS, "courrier_a_supprimer.pdf")
    with open(legitime, "wb") as fh:
        fh.write(b"%PDF-1.4 test")

    patched["set_row"]({
        "id": 5,
        "user_id": FAKE_AGENT["id"],
        "nom_fichier": "courrier_a_supprimer.pdf",
        "chemin_stockage": legitime,
    })

    removed = []
    vrai_remove = os.remove

    def spy_remove(p):
        removed.append(p)
        return vrai_remove(p)

    monkeypatch.setattr(tel.os, "remove", spy_remove)

    client = app.test_client()
    resp = client.delete("/telechargements/5", headers=auth_header)

    assert resp.status_code == 200
    assert removed == [os.path.realpath(legitime)]
    assert not os.path.exists(legitime)


# ── 5. Les erreurs ne doivent plus fuiter de détails internes ────────────────
def test_les_erreurs_500_ne_fuient_pas_le_message_interne(app, auth_header, monkeypatch):
    monkeypatch.setattr(tel, "get_current_user", lambda: dict(FAKE_AGENT))

    def broken_connection():
        raise RuntimeError("Mot de passe MySQL invalide: root/s3cr3t @ 127.0.0.1")

    monkeypatch.setattr(tel, "get_connection", broken_connection)

    client = app.test_client()
    resp = client.post(
        "/telechargements/record",
        headers=auth_header,
        json={
            "nom_fichier": "x.pdf",
            "chemin_stockage": os.path.join(EXPORTS, "x.pdf"),
        },
    )
    assert resp.status_code == 500
    body = resp.get_data(as_text=True)
    assert "s3cr3t" not in body
    assert "MySQL" not in body
