import { UserPlus, Mail, Phone, Shield, X, Lock, CheckCircle2, Trash2, Edit, User, Briefcase, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useI18n, translateRole } from "../../i18n";

function FormulaireUtilisateur({ onClose, onUserCreated, userToEdit = null, currentPage = 1 }) {
  const { t } = useI18n();
  const isEditMode = !!userToEdit;
  const [divisions, setDivisions] = useState([]);
  const [services, setServices] = useState([]);
  const [formData, setFormData] = useState({
    nom: userToEdit?.nom || "",
    prenom: userToEdit?.prenom || "",
    grade: userToEdit?.grade || "",
    email: userToEdit?.email || "",
    numero: userToEdit?.numero || "",
    role: userToEdit?.role || "Agent",
    division_id: userToEdit?.division_id || "",
    service_id: userToEdit?.service_id || "",
    actif: userToEdit ? Boolean(userToEdit.actif) : true,
    cin: userToEdit?.cin || "",
    identite: userToEdit?.identite || "",
    mot_de_passe: "" 
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.getDivisions()
      .then(data => setDivisions(data))
      .catch(err => console.error("Erreur divisions:", err));
  }, []);

  useEffect(() => {
    if (formData.division_id) {
      api.getServices(formData.division_id)
        .then(data => setServices(data))
        .catch(err => console.error("Erreur services:", err));
    } else {
      setServices([]);
    }
  }, [formData.division_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      if (isEditMode) {
        await api.updateUser(userToEdit.id, formData);
        setSuccess(true);
      } else {
        await api.createUser(formData);
        setSuccess(true);
      }
      
      setTimeout(() => {
        onUserCreated(currentPage);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || "Erreur de connexion au serveur");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-6 flex items-center justify-between shadow-md text-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-md">
              {isEditMode ? <Edit className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-xl font-bold">
                {isEditMode ? "Modifier le profil" : "Nouvel Utilisateur"}
              </h3>
              <p className="text-blue-100 text-xs font-normal">Gestion des accès et informations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-all hover:rotate-90 duration-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-50/30 max-h-[85vh]">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2 animate-pulse">
              <X className="w-4 h-4" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2 shadow-sm">
              <CheckCircle2 className="w-4 h-4" />
              <span className="text-sm font-medium">
                {isEditMode ? "Modifications enregistrées !" : "Utilisateur créé avec succès !"}
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-blue-700 border-b border-blue-100 pb-2">
                <User className="w-4 h-4" />
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-black">Identité Civile</h4>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black uppercase ml-1">Nom</label>
                    <input
                      type="text"
                      required
                      value={formData.nom}
                      onChange={(e) => setFormData({...formData, nom: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-black uppercase ml-1">Prénom</label>
                    <input
                      type="text"
                      required
                      value={formData.prenom}
                      onChange={(e) => setFormData({...formData, prenom: e.target.value})}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-black uppercase ml-1">CIN (Carte d'Identité)</label>
                  <input
                    type="text"
                    required
                    value={formData.cin}
                    onChange={(e) => setFormData({...formData, cin: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    placeholder="Ex: UD123456"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-black uppercase ml-1">Identifiant Système</label>
                  <input
                    type="text"
                    required
                    value={formData.identite}
                    onChange={(e) => {
                      const value = e.target.value;
                      const formatted = value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : "";
                      setFormData({...formData, identite: formatted});
                    }}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-blue-600 focus:ring-2 focus:ring-blue-500 outline-none transition-all shadow-sm"
                    placeholder="Ex: Pnom"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-black uppercase ml-1">Grade</label>
                  <input
                    type="text"
                    value={formData.grade}
                    onChange={(e) => setFormData({...formData, grade: e.target.value})}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-blue-700 border-b border-blue-100 pb-2">
                <Shield className="w-4 h-4" />
                <h4 className="text-[11px] font-bold uppercase tracking-widest text-black">Contact & Accès</h4>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-black uppercase ml-1">Email Professionnel</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-black uppercase ml-1">Téléphone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={formData.numero}
                      onChange={(e) => setFormData({...formData, numero: e.target.value})}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-black uppercase ml-1">
                    Mot de passe {isEditMode && "(optionnel)"}
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input
                      type="password"
                      required={!isEditMode}
                      value={formData.mot_de_passe}
                      onChange={(e) => setFormData({...formData, mot_de_passe: e.target.value})}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
                      placeholder={isEditMode ? "••••••••" : "Saisir un mot de passe"}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-5 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 text-blue-700 border-b border-blue-50 pb-2">
              <Briefcase className="w-4 h-4" />
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-black">Rattachement Administratif</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-black uppercase ml-1">Rôle Système</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="Chef de division">Chef de division</option>
                  <option value="Chef de service">Chef de service</option>
                  <option value="Agent">Agent</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-black uppercase ml-1">Statut du compte</label>
                <select
                  value={formData.actif}
                  onChange={(e) => setFormData({...formData, actif: e.target.value === "true"})}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="true">Actif</option>
                  <option value="false">Inactif</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-black uppercase ml-1">Division</label>
                <select
                  required
                  value={formData.division_id}
                  onChange={(e) => setFormData({...formData, division_id: e.target.value, service_id: ""})}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">Sélectionner une division</option>
                  {divisions.map(d => (
                    <option key={d.id} value={d.id}>{d.nom}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-black uppercase ml-1">Service</label>
                <select
                  value={formData.service_id}
                  onChange={(e) => setFormData({...formData, service_id: e.target.value})}
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                  disabled={!formData.division_id}
                >
                  <option value="">Sélectionner un service</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>{s.nom}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 border border-gray-200 rounded-xl text-black hover:bg-white hover:border-gray-400 transition-all font-semibold text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl hover:shadow-lg hover:shadow-blue-200 transition-all font-bold text-sm flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {isEditMode ? "Enregistrer les modifications" : "Créer l'utilisateur"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export function Utilisateurs({ userConnecte }) {
  const { t } = useI18n();
  const [usersList, setUsersList] = useState([]);
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [userToEdit, setUserToEdit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, per_page: 50, total: 0, total_pages: 0 });

  const isChefDivision = userConnecte?.role === "Chef de division";
  const isChefService = userConnecte?.role === "Chef de service";

  const handleDeleteUser = async (user) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer l'utilisateur ${user.prenom} ${user.nom} ?`)) {
      try {
        await api.deleteUser(user.id);
        fetchUsers(pagination.page);
      } catch (err) {
        alert(err.message || "Erreur lors de la suppression");
      }
    }
  };

  const openEditForm = (user) => {
    setUserToEdit(user);
    setShowNewUserForm(true);
  };

  const closeForm = () => {
    setShowNewUserForm(false);
    setUserToEdit(null);
  };
  const fetchUsers = async (page = 1) => {
    setLoading(true);
    try {
      const data = await api.getUsers({ page, per_page: pagination.per_page });
      setUsersList(data.data || data || []);
      setPagination({
        page: data.page || page,
        per_page: data.per_page || pagination.per_page,
        total: data.total || 0,
        total_pages: data.total_pages || 1,
      });
    } catch (err) {
      console.error("Erreur fetch users:", err);
      setUsersList([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchUsers();
  }, []);
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">
            Gestion des utilisateurs
          </h2>
          <p className="text-gray-600 mt-1">
            Gérer les profils et les permissions
          </p>
        </div>
        {!isChefService && (
          <button 
            onClick={() => setShowNewUserForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            <UserPlus className="w-4 h-4" />
            Nouvel utilisateur
          </button>
        )}
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-3 inline-flex items-center gap-3">
        <div className="bg-purple-50 p-2 rounded">
          <Shield className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">{pagination.total}</p>
          <p className="text-xs text-gray-600">Total Utilisateurs</p>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                  Nom complet
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                  Rôle
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                  Division/Service
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                  Contact
                </th>
                <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                  Statut
                </th>
                {!isChefService && (
                  <th className="text-left py-4 px-6 text-sm font-semibold text-gray-900">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-gray-500">Chargement...</td>
                </tr>
              ) : usersList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    {isChefService ? "Aucun agent dans votre service" : "Aucun utilisateur trouvé"}
                  </td>
                </tr>
              ) : usersList.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                        {user.nom[0]}{user.prenom[0]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{user.prenom} {user.nom}</p>
                        <p className="text-xs text-gray-500">{user.grade || "Sans grade"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "Chef de division"
                          ? "bg-purple-100 text-purple-800"
                          : user.role === "Chef de service"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-sm text-gray-700">
                    <div>{user.division_nom}</div>
                    <div className="text-xs text-gray-500">{user.service_nom || "N/A"}</div>
                  </td>
                  <td className="py-4 px-6">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Mail className="w-3.5 h-3.5" />
                        {user.email || "N/A"}
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Phone className="w-3.5 h-3.5" />
                        {user.numero || "N/A"}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.actif
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {user.actif ? "Actif" : "Inactif"}
                    </span>
                  </td>
                  {!isChefService && (
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => openEditForm(user)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors title='Modifier'"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {isChefDivision && (
                          <button 
                            onClick={() => handleDeleteUser(user)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors title='Supprimer'"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Page {pagination.page} sur {pagination.total_pages} ({pagination.total} utilisateurs)
            </p>
            <div className="flex items-center gap-1">
              <button 
                disabled={pagination.page <= 1} 
                onClick={() => fetchUsers(pagination.page - 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                const pg = Math.max(1, Math.min(pagination.page - 2, pagination.total_pages - 4)) + i;
                return (
                  <button 
                    key={pg} 
                    onClick={() => fetchUsers(pg)}
                    className={`w-8 h-8 text-xs rounded-lg border font-medium transition ${
                      pg === pagination.page
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {pg}
                  </button>
                );
              })}
              <button 
                disabled={pagination.page >= pagination.total_pages} 
                onClick={() => fetchUsers(pagination.page + 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
      {showNewUserForm && (
        <FormulaireUtilisateur 
          onClose={closeForm} 
          onUserCreated={() => fetchUsers(pagination.page)}
          userToEdit={userToEdit}
          currentPage={pagination.page}
        />
      )}
    </div>
  );
}
