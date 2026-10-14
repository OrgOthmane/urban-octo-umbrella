import { removeBOPrefix } from "../i18n/helpers";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const TOKEN_KEY = "auth_token";
const USER_KEY  = "userConnecte";

export const tokenStorage = {
  getToken:    ()       => sessionStorage.getItem(TOKEN_KEY),
  setToken:    (token)  => sessionStorage.setItem(TOKEN_KEY, token),
  getUser:     ()       => { try { return JSON.parse(sessionStorage.getItem(USER_KEY)); } catch { return null; } },
  setUser:     (user)   => sessionStorage.setItem(USER_KEY, JSON.stringify(user)),
  clear:       ()       => { sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(USER_KEY); sessionStorage.removeItem("activeView"); },
};

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const token = tokenStorage.getToken();
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type");
  let data = null;
  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  }

  if (!response.ok) {
    // Ne pas déconnecter l'utilisateur sur un 401 lors du login (pas encore de session)
    // Seulement sur les routes protégées (quand un token était présent)
    if (response.status === 401 && token) {
      tokenStorage.clear();
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    const err = new Error(
      data?.message ||
        data?.error ||
        `Erreur ${response.status}: ${response.statusText}`,
    );
    // Attacher le statut HTTP et le body complet pour que les appelants puissent les inspecter
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Nom de fichier à utiliser pour un téléchargement par blob : on privilégie le
// `Content-Disposition` renvoyé par le serveur (nom propre, sans préfixe
// technique), sinon on retombe sur le nom demandé en nettoyant les préfixes
// d'upload (`<courrier_id>_` ou `bo_<id>_`).
function filenameFromResponse(response, fallbackName) {
  const header = response?.headers?.get?.("Content-Disposition") || "";
  const star   = header.match(/filename\*=UTF-8''([^;]+)/i);
  const plain  = header.match(/filename="?([^";]+)"?/i);
  const raw    = star?.[1] || plain?.[1] || "";
  let name = raw;
  try {
    name = star?.[1] ? decodeURIComponent(raw) : raw;
  } catch (_) { /* encodage non conforme : garder la valeur brute */ }
  if (!name) name = fallbackName || "fichier";
  // Nettoyage limité aux préfixes techniques du Bureau d'Ordre : un fichier
  // classique dont le nom commencerait par « bo_ » n'est pas renommé.
  return /^bo(_\d+)?_/.test(name) ? removeBOPrefix(name) : name;
}

export const api = {
  login: (credentials) =>
    request("/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    }),

  getUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/utilisateurs${query ? `?${query}` : ""}`);
  },
  createUser: (userData) =>
    request("/utilisateurs", {
      method: "POST",
      body: JSON.stringify(userData),
    }),
  updateUser: (id, userData) =>
    request(`/utilisateurs/${id}`, {
      method: "PUT",
      body: JSON.stringify(userData),
    }),
  deleteUser: (id) =>
    request(`/utilisateurs/${id}`, {
      method: "DELETE",
    }),

  getDivisions: () => request("/divisions"),
  getServices: (divisionId) =>
    request(`/services${divisionId ? `?division_id=${divisionId}` : ""}`),

  getCourriersEntrants: (params) => {
    const query = new URLSearchParams(params).toString();
    return request(`/courrier_entrant${query ? `?${query}` : ""}`);
  },
  createCourrierEntrant: (data) =>
    request("/courrier_entrant", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCourrierEntrant: (id, data) =>
    request("/courrier_entrant/update", {
      method: "PUT",
      body: JSON.stringify({ ...data, id }),
    }),
  deleteCourrierEntrant: (id) =>
    request(`/courrier_entrant/delete?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  updateCourrierStatus: (id, statut) =>
    request("/courrier_entrant/status", {
      method: "PATCH",
      body: JSON.stringify({ id, statut }),
    }),
  archiveCourrierEntrant: (id, archive = true, archive_par = null) =>
    request("/courrier_entrant/archive", {
      method: "PATCH",
      body: JSON.stringify({ id, archive, archive_par }),
    }),
  getArchivedCourriersEntrants: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/courrier_entrant/archive${query ? `?${query}` : ""}`);
  },

  getCourriersSortants: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/courrier_sortant${query ? `?${query}` : ""}`);
  },
  createCourrierSortant: (data) =>
    request("/courrier_sortant", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateCourrierSortant: (id, data) =>
    request("/courrier_sortant/update", {
      method: "PUT",
      body: JSON.stringify({ ...data, id }),
    }),
  deleteCourrierSortant: (id) =>
    request(`/courrier_sortant/delete?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  archiveCourrierSortant: (id, archive = true, archive_par = null) =>
    request("/courrier_sortant/archive", {
      method: "PATCH",
      body: JSON.stringify({ id, archive, archive_par }),
    }),
  getArchivedCourriersSortants: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/courrier_sortant/archive${query ? `?${query}` : ""}`);
  },
  uploadFichier: async (courrier_id, file) => {
    const formData = new FormData();
    formData.append("fichier", file);
    formData.append("courrier_id", courrier_id);
    const token = tokenStorage.getToken();
    const response = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: "POST",
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || "Erreur upload");
    return data;
  },

  getCourrierDocuments: (courrierId) =>
    request(`/documents/courrier/${courrierId}`),

  downloadFichier: async (nomFichier) => {
    const token = tokenStorage.getToken();
    const response = await fetch(
      `${API_BASE_URL}/documents/download/${encodeURIComponent(nomFichier)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!response.ok) {
      // Ne pas masquer l'erreur réelle du backend : sans ce message, un 403
      // (droits) ou un 404 (fichier absent du disque) étaient tous affichés
      // comme « Fichier introuvable », ce qui rendait le diagnostic impossible.
      let message = "Fichier introuvable";
      try {
        const data = await response.json();
        message = data?.error || message;
      } catch (_) { /* réponse non JSON */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filenameFromResponse(response, nomFichier);
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  exportCourrier: async (id, userId = null, numero = "courrier") => {
    const token = tokenStorage.getToken();
    const url = userId
      ? `${API_BASE_URL}/export/${encodeURIComponent(id)}?user_id=${userId}`
      : `${API_BASE_URL}/export/${encodeURIComponent(id)}`;
    const response = await fetch(
      url,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!response.ok) throw new Error("Erreur d'exportation");
    const blob = await response.blob();
    const urlObj = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = urlObj;
    a.download = `Courrier_${numero.replace(/[\/\\]/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(urlObj);
    document.body.removeChild(a);
  },

  // ── Téléchargements ───────────────────────────────────────────────────────
  getTelechargements: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/telechargements${query ? `?${query}` : ""}`);
  },

  // URL pour prévisualiser un PDF inline — le token est passé en query param pour les iframes
  getPdfPreviewUrl: (dlId) => {
    const token = tokenStorage.getToken();
    return token
      ? `${API_BASE_URL}/telechargements/serve/${dlId}?token=${encodeURIComponent(token)}`
      : `${API_BASE_URL}/telechargements/serve/${dlId}`;
  },

  // Enregistre manuellement un téléchargement (utilisé pour les cas hors export)
  recordTelechargement: (data) =>
    request("/telechargements/record", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Supprime un téléchargement PDF
  deleteTelechargement: (dlId) =>
    request(`/telechargements/${dlId}`, {
      method: "DELETE",
    }),
  getDashboardStats: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/dashboard/stats${query ? `?${query}` : ""}`);
  },

  // ── Bureau d'Ordre ────────────────────────────────────────────────────────
  boGetCourriers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/bo/courriers${query ? `?${query}` : ""}`);
  },
  boGetCourrier: (id, userId) =>
    request(`/bo/courriers/${id}?user_id=${userId}`),
  boCreateCourrier: async (formData) => {
    const token = tokenStorage.getToken();
    const response = await fetch(`${API_BASE_URL}/bo/courriers`, {
      method: "POST",
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    if (!response.ok) throw { response: data };
    return data;
  },
  boUpdateCourrier: async (id, formData) => {
    const token = tokenStorage.getToken();
    const response = await fetch(`${API_BASE_URL}/bo/courriers/${id}`, {
      method: "PUT",
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    if (!response.ok) throw { response: data };
    return data;
  },
  boDeleteCourrier: (id, userId) =>
    request(`/bo/courriers/${id}?user_id=${userId}`, { method: "DELETE" }),
  boAffecter: (id, userId, divisionId) =>
    request(`/bo/courriers/${id}/affecter`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, division_id: divisionId }),
    }),
  boAnnulerAffectation: (id, userId) =>
    request(`/bo/courriers/${id}/annuler-affectation`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId }),
    }),
  boGetHistorique: (userId) =>
    request(`/bo/historique?user_id=${userId}`),
  boGetNotifications: (userId) =>
    request(`/bo/notifications?user_id=${userId}`),
  boDeleteDocument: (docId, userId) =>
    request(`/bo/documents/${docId}?user_id=${userId}`, { method: "DELETE" }),
  boDownloadDocument: async (docId, userId, nomFichier) => {
    const token = tokenStorage.getToken();
    const response = await fetch(
      `${API_BASE_URL}/bo/documents/download/${docId}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!response.ok) {
      let message = "Erreur lors du téléchargement";
      try {
        const data = await response.json();
        message = data?.error || message;
      } catch (_) { /* réponse non JSON */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = removeBOPrefix(nomFichier);
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },
  boGetRefData: () => request("/bo/ref-data"),
  boGetCourierDocs: (boCourrierId, userId) =>
    request(`/bo/courrier-docs/${boCourrierId}?user_id=${userId}`),

  // ── Bureau d'Ordre — Vue Chef de Division ────────────────────────────────
  boChefGetCourriers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/bo/chef/courriers${query ? `?${query}` : ""}`);
  },
  boChefGetCourrier: (id, userId, divisionId) =>
    request(`/bo/chef/courriers/${id}?user_id=${userId}&division_id=${divisionId}`),
  boChefUpdateStatut: (id, userId, divisionId, statut) =>
    request(`/bo/chef/courriers/${id}/statut`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId, division_id: divisionId, statut }),
    }),
  boChefGetNotifications: () =>
    request(`/bo/chef/notifications`),
  boChefAffecterService: (courierId, userId, divisionId, serviceId) =>
    request(`/bo/chef/courriers/${courierId}/affecter-service`, {
      method: "PATCH",
      body: JSON.stringify({
        user_id: userId,
        division_id: divisionId,
        service_id: serviceId,
      }),
    }),
  boChefAnnulerAffectationService: (courierId, userId, divisionId) =>
    request(`/bo/chef/courriers/${courierId}/annuler-affectation-service`, {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId, division_id: divisionId }),
    }),
  boChefGetServices: (userId, divisionId) =>
    request(`/bo/chef/services?user_id=${userId}&division_id=${divisionId}`),

  // Tiers
  getTypeTiers: () => request("/type_tiers"),
  getTiers: (typeTiersId) =>
    request(`/tiers${typeTiersId ? `?type_tiers_id=${typeTiersId}` : ""}`),

  // Paramètres
  getTypesCourrier: () => request("/types-courrier"),
  createTypeCourrier: (data) =>
    request("/types-courrier", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTypeCourrier: (id, data) =>
    request(`/types-courrier/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteTypeCourrier: (id) =>
    request(`/types-courrier/${id}`, {
      method: "DELETE",
    }),

  getTypesTiers: () => request("/types-tiers"),
  createTypeTiers: (data) =>
    request("/types-tiers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTypeTiers: (id, data) =>
    request(`/types-tiers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteTypeTiers: (id) =>
    request(`/types-tiers/${id}`, {
      method: "DELETE",
    }),

  getTiersParam: () => request("/tiers"),
  createTiersParam: (data) =>
    request("/tiers", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTiersParam: (id, data) =>
    request(`/tiers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteTiersParam: (id) =>
    request(`/tiers/${id}`, {
      method: "DELETE",
    }),

  getDivisionsParam: () => request("/divisions-param"),
  createDivisionParam: (data) =>
    request("/divisions-param", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateDivisionParam: (id, data) =>
    request(`/divisions-param/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteDivisionParam: (id) =>
    request(`/divisions-param/${id}`, {
      method: "DELETE",
    }),

  getServicesParam: () => request("/services-param"),
  createServiceParam: (data) =>
    request("/services-param", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateServiceParam: (id, data) =>
    request(`/services-param/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteServiceParam: (id) =>
    request(`/services-param/${id}`, {
      method: "DELETE",
    }),
};
