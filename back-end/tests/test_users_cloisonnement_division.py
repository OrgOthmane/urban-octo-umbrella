"""Tests de régression — cloisonnement par division de la gestion des utilisateurs.

Contexte d'audit (faille ÉLEVÉE corrigée) :
    GET /utilisateurs filtrait bien les résultats sur la division de l'appelant,
    mais PUT et DELETE /utilisateurs/<id> se contentaient du décorateur
    @roles_required(ROLE_CHEF_DIVISION) avec un simple « WHERE id=%s ».

    Un Chef de division pouvait donc, sur n'importe quel identifiant :
      - réinitialiser le mot de passe d'un compte d'une AUTRE division,
        y compris celui d'un autre Chef de division (reprise de compte) ;
      - modifier arbitrairement son propre role/division_id et sortir de son
        périmètre ;
      - supprimer n'importe quel utilisateur.

    De plus, l'UPDATE réécrivait toutes les colonnes à partir de data.get(...) :
    tout champ absent du payload était mis à NULL (perte silencieuse de
    role/division_id/service_id/actif).

Ces tests s'exécutent SANS base de données (doubles de test).
"""

import os
import sys

import pytest

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ.setdefault("SECRET_KEY", "0123456789abcdef0123456789abcdef-test")

from flask import Flask                                   # noqa: E402
from flask_jwt_extended import JWTManager, create_access_token  # noqa: E402

import routes.users as users_mod                           # noqa: E402


CHEF_DIV_1 = {"id": 10, "role": "Chef de division", "division_id": 1, "identite": "chef.div1"}


class FakeCursor:
    """Répond aux SELECT selon un mot-clé et journalise toutes les requêtes."""

    def __init__(self, conn, cible=None):
        self.conn = conn
        self.cible = cible          # ligne retournée pour le SELECT de la cible
        self.executed = []
        self.lastrowid = 1

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        self._last_sql = sql

    def fetchone(self):
        sql = getattr(self, "_last_sql", "")
        # SELECT de la cible (division_id) ou contrôle d'unicité d'identite
        if "division_id" in sql and "FROM utilisateurs" in sql:
            return self.cible
        if "identite = %s" in sql:
            return None             # aucune collision d'identite
        return self.cible

    def fetchall(self):
        return [self.cible] if self.cible else []

    def close(self):
        pass


class FakeConn:
    def __init__(self, cible=None):
        self.cible = cible
        self.committed = False
        self.rolled_back = False
        self._cursor = None

    def cursor(self, dictionary=False):
        self._cursor = FakeCursor(self, self.cible)
        return self._cursor

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def close(self):
        pass


@pytest.fixture()
def app():
    application = Flask(__name__)
    application.config["JWT_SECRET_KEY"] = os.environ["SECRET_KEY"]
    application.config["TESTING"] = True
    JWTManager(application)
    application.register_blueprint(users_mod.users_bp)
    return application


@pytest.fixture()
def auth_chef_div1(app):
    with app.app_context():
        token = create_access_token(
            identity=str(CHEF_DIV_1["id"]),
            additional_claims={"role": CHEF_DIV_1["role"]},
        )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def state(monkeypatch):
    box = {"conn": None}
    monkeypatch.setattr(users_mod, "get_current_user", lambda: dict(CHEF_DIV_1))

    def factory(cible):
        def _connect():
            box["conn"] = FakeConn(cible=cible)
            return box["conn"]
        return _connect

    box["set_cible"] = lambda cible: monkeypatch.setattr(
        users_mod, "get_connection", factory(cible)
    )
    return box


def _executed(box, keyword):
    """Requêtes journalisées contenant `keyword` (vide si aucune connexion ouverte)."""
    conn = box.get("conn")
    if conn is None or conn._cursor is None:
        return []
    return [(s, p) for (s, p) in conn._cursor.executed if keyword in s]


# ── PUT : cloisonnement par division ─────────────────────────────────────────
def test_put_refuse_un_utilisateur_d_une_autre_division(app, auth_chef_div1, state):
    state["set_cible"]({"id": 77, "division_id": 2})   # autre division
    client = app.test_client()

    resp = client.put(
        "/utilisateurs/77",
        headers=auth_chef_div1,
        json={"mot_de_passe": "Nouveau@12345"},
    )

    assert resp.status_code == 403
    assert _executed(state, "UPDATE") == [], "Aucun UPDATE ne doit être exécuté"
    assert state["conn"].committed is False


def test_put_autorise_un_utilisateur_de_sa_division(app, auth_chef_div1, state):
    state["set_cible"]({"id": 55, "division_id": 1})   # même division
    client = app.test_client()

    resp = client.put(
        "/utilisateurs/55",
        headers=auth_chef_div1,
        json={"nom": "Benali", "prenom": "Said"},
    )

    assert resp.status_code == 200, resp.get_data(as_text=True)
    updates = _executed(state, "UPDATE")
    assert len(updates) == 1
    assert state["conn"].committed is True


def test_put_accepte_division_id_en_chaine_depuis_le_select(app, auth_chef_div1, state):
    """Non-régression UI : le <select> envoie "1" (chaîne), la base renvoie 1 (entier)."""
    state["set_cible"]({"id": 55, "division_id": 1})
    client = app.test_client()

    resp = client.put(
        "/utilisateurs/55",
        headers=auth_chef_div1,
        json={"nom": "Benali", "division_id": "1", "service_id": "3"},
    )

    assert resp.status_code == 200, resp.get_data(as_text=True)


def test_put_refuse_le_deplacement_vers_une_autre_division(app, auth_chef_div1, state):
    state["set_cible"]({"id": 55, "division_id": 1})
    client = app.test_client()

    resp = client.put(
        "/utilisateurs/55",
        headers=auth_chef_div1,
        json={"division_id": "2"},
    )

    assert resp.status_code == 403
    assert _executed(state, "UPDATE") == []


def test_put_n_ecrase_pas_les_champs_absents(app, auth_chef_div1, state):
    """Les colonnes non fournies ne doivent plus être mises à NULL."""
    state["set_cible"]({"id": 55, "division_id": 1})
    client = app.test_client()

    resp = client.put("/utilisateurs/55", headers=auth_chef_div1, json={"email": "a@b.ma"})

    assert resp.status_code == 200
    sql, params = _executed(state, "UPDATE")[0]
    assert "email=%s" in sql
    for champ_interdit in ("role", "division_id", "service_id", "actif", "cin", "identite", "nom"):
        assert f"{champ_interdit}=%s" not in sql, (
            f"Le champ {champ_interdit} ne devrait pas être réécrit (risque de mise à NULL)"
        )
    assert params == ("a@b.ma", 55)


def test_put_refuse_un_role_invalide(app, auth_chef_div1, state):
    state["set_cible"]({"id": 55, "division_id": 1})
    client = app.test_client()

    resp = client.put(
        "/utilisateurs/55", headers=auth_chef_div1, json={"role": "Super Admin"}
    )

    assert resp.status_code == 400
    assert _executed(state, "UPDATE") == []
    # Le rôle est validé avant tout accès base : échec rapide, aucune connexion ouverte.
    assert state["conn"] is None


def test_put_retourne_404_si_cible_inexistante(app, auth_chef_div1, state):
    state["set_cible"](None)
    client = app.test_client()

    resp = client.put("/utilisateurs/9999", headers=auth_chef_div1, json={"nom": "X"})

    assert resp.status_code == 404


# ── DELETE : cloisonnement par division ──────────────────────────────────────
def test_delete_refuse_un_utilisateur_d_une_autre_division(app, auth_chef_div1, state):
    state["set_cible"]({"id": 77, "division_id": 2})
    client = app.test_client()

    resp = client.delete("/utilisateurs/77", headers=auth_chef_div1)

    assert resp.status_code == 403
    assert _executed(state, "DELETE") == [], "Aucun DELETE ne doit être exécuté"


def test_delete_autorise_un_utilisateur_de_sa_division(app, auth_chef_div1, state):
    state["set_cible"]({"id": 55, "division_id": 1})
    client = app.test_client()

    resp = client.delete("/utilisateurs/55", headers=auth_chef_div1)

    assert resp.status_code == 200, resp.get_data(as_text=True)
    deletes = _executed(state, "DELETE")
    assert len(deletes) == 1
    # La suppression reste bornée à la division de l'appelant.
    assert "division_id = %s" in deletes[0][0]
    assert deletes[0][1] == (55, 1)


def test_delete_interdit_la_suppression_de_son_propre_compte(app, auth_chef_div1, state):
    state["set_cible"]({"id": CHEF_DIV_1["id"], "division_id": 1})
    client = app.test_client()

    resp = client.delete(f"/utilisateurs/{CHEF_DIV_1['id']}", headers=auth_chef_div1)

    assert resp.status_code == 400
    assert state["conn"] is None or _executed(state, "DELETE") == []


# ── Non-régression : le rôle reste exigé ─────────────────────────────────────
def test_un_agent_ne_peut_pas_modifier_un_utilisateur(app, auth_chef_div1, state, monkeypatch):
    monkeypatch.setattr(
        users_mod, "get_current_user",
        lambda: {"id": 99, "role": "Agent", "division_id": 1},
    )
    state["set_cible"]({"id": 55, "division_id": 1})

    # Jeton d'un Agent : le décorateur @roles_required doit refuser avant tout accès DB.
    from flask_jwt_extended import create_access_token
    with app.app_context():
        token = create_access_token(identity="99", additional_claims={"role": "Agent"})

    client = app.test_client()
    resp = client.put(
        "/utilisateurs/55",
        headers={"Authorization": f"Bearer {token}"},
        json={"nom": "Pirate"},
    )

    assert resp.status_code == 403
