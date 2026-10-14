import { LogIn } from "lucide-react";
import { useState } from "react";
import { api, tokenStorage } from "../../services/api";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../../i18n";

export function Login({ onLoginSuccess }) {
  const { t } = useI18n();
  const [identite, setIdentite] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [error, setError] = useState("");

  const mapError = (message) => {
    if (!message) return t("common.serverError");
    // Correspondances avec les messages exacts retournés par le backend
    const known = {
      "Identifiant ou mot de passe incorrect.": t("auth.invalidCredentials"),
      "Identifiant et mot de passe requis.": t("auth.fillAll"),
      "Compte désactivé.": t("auth.accountDisabled"),
      "Données invalides.": t("auth.invalidCredentials"),
      // Fallbacks pour éviter d'exposer des messages techniques
      "Failed to fetch": t("common.serverError"),
      "NetworkError": t("common.serverError"),
      "Load failed": t("common.serverError"),
    };
    // Correspondance exacte
    if (known[message]) return known[message];
    // Correspondance partielle pour les messages réseaux
    if (message.includes("fetch") || message.includes("network") || message.includes("Network")) {
      return t("common.serverError");
    }
    // Pour les erreurs 4xx/5xx génériques, afficher un message propre
    if (message.startsWith("Erreur 4") || message.startsWith("Erreur 5")) {
      return t("common.serverError");
    }
    return message;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!identite || !motDePasse) {
      setError(t("auth.fillAll"));
      return;
    }

    try {
      const data = await api.login({ identite, motDePasse });
      // La route /login retourne toujours 200 avec {success: true} en cas de succès
      if (data && data.success) {
        tokenStorage.setToken(data.token);
        tokenStorage.setUser(data.user);
        onLoginSuccess(data.user);
      } else {
        // Cas improbable : 200 mais success=false
        setError(mapError(data?.message) || t("auth.invalidCredentials"));
      }
    } catch (err) {
      // api.js throw une erreur avec err.message = le message du backend (401, 400...)
      // ou "Failed to fetch" si le serveur est inaccessible
      setError(mapError(err.message) || t("common.serverError"));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>
        <div className="flex items-center justify-center mb-8">
          <div className="bg-blue-600 p-3 rounded-lg">
            <LogIn className="w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-center text-gray-900 mb-2">
          {t("auth.title")}
        </h1>
        <p className="text-center text-gray-600 mb-6">
          {t("auth.subtitle")}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("auth.identity")}
            </label>
            <input
              type="text"
              value={identite}
              onChange={(e) => setIdentite(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t("auth.identityPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("auth.password")}
            </label>
            <input
              type="password"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            {t("auth.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
