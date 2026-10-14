import {
  Plus,
  Filter,
  Download,
  X,
  FileText,
  Calendar,
  User,
  Hash,
  Info,
  Printer,
  Paperclip,
  Loader2,
  Edit,
  Trash2,
  Building,
  Eye,
  Archive,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import { useI18n, formatFileSize } from "../../i18n";
import { removeBOPrefix } from "../../i18n/helpers";
import PrintService from "../../services/PrintService";
import { Pagination } from "./Pagination";

function CourrierDetailModal({ courrier, onClose }) {
  const { t } = useI18n();
  const [refreshedCourrier, setRefreshedCourrier] = useState(courrier);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Rafraîchir les données du courrier à l'ouverture du modal pour avoir le fichier à jour
    const refreshCourrier = async () => {
      if (!courrier?.dbId) return;
      setLoading(true);
      try {
        const response = await api.getCourrierDocuments(courrier.dbId);
        // Si des documents existent, mettre à jour le nom du fichier
        if (response && response.length > 0) {
          setRefreshedCourrier({
            ...courrier,
            fichier: response[0].nom_fichier
          });
        } else {
          setRefreshedCourrier(courrier);
        }
      } catch (err) {
        console.error("Erreur lors du rafraîchissement du courrier:", err);
        setRefreshedCourrier(courrier);
      } finally {
        setLoading(false);
      }
    };
    refreshCourrier();
  }, [courrier]);

  if (!refreshedCourrier) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gray-800 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5" />
            <div>
              <h3 className="text-lg font-bold">{t("sortant.detailTitle")}</h3>
              <p className="text-xs text-gray-300">
                {t("common.refShort", { value: refreshedCourrier.reference || t("common.na") })} | {t("common.numberShort", { value: refreshedCourrier.numero || refreshedCourrier.id })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-4">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider border-b pb-2">{t("sortant.expedition")}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.recipient")}</label>
                      <p className="text-sm font-semibold text-gray-900">{refreshedCourrier.destinataire}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.senderService")}</label>
                      <p className="text-sm text-gray-700">{refreshedCourrier.expediteur}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-4">
                  <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider border-b pb-2">{t("sortant.datesAgent")}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.sendDate")}</label>
                      <p className="text-sm font-semibold text-gray-900">{refreshedCourrier.date || refreshedCourrier.dateEnvoi}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.writtenBy")}</label>
                      <p className="text-sm text-gray-700">{refreshedCourrier.redacteur || refreshedCourrier.identiteAgent}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-xs font-bold text-indigo-600 uppercase tracking-wider border-b pb-2 mb-4">{t("sortant.objectAndObs")}</h4>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">{t("common.object")}</label>
                    <p className="text-sm text-gray-800 font-medium whitespace-pre-line">{refreshedCourrier.objet}</p>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase">{t("common.observation")}</label>
                    <p className="text-sm text-gray-600 italic whitespace-pre-wrap">
                      {refreshedCourrier.observation || t("common.noObservation")}
                    </p>
                  </div>
                </div>
              </div>

              {refreshedCourrier.fichier && (
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Paperclip className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700">{removeBOPrefix(refreshedCourrier.fichier)}</span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await api.downloadFichier(refreshedCourrier.fichier);
                      } catch (err) {
                        alert(t("archives.downloadError", { message: err.message }));
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1">
                    <Download className="w-4 h-4" /> {t("common.download")}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-bold">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function NouveauCourrierModal({ onClose, agent, onSubmit, selectedReference }) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    numero: "",
    reference: selectedReference || "",
    destinataire: "",
    expediteur: `${agent.division || ""} | ${agent.service || ""}`,
    dateEnvoi: new Date().toISOString().split("T")[0],
    typeCourrierId: "",
    objet: "",
    observation: "",
    fichier: null,
    identiteAgent: `${agent.prenom} ${agent.nom}`,
  });

  const [typeTiersList, setTypeTiersList] = useState([]);
  const [tiersList, setTiersList] = useState([]);
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [typesCourrier, setTypesCourrier] = useState([]);

  useEffect(() => { api.getTypeTiers().then(setTypeTiersList).catch(console.error); }, []);
  useEffect(() => { api.getTypesCourrier().then(setTypesCourrier).catch(console.error); }, []);
  useEffect(() => {
    if (selectedTypeId) api.getTiers(selectedTypeId).then(setTiersList).catch(console.error);
    else setTiersList([]);
  }, [selectedTypeId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, fichier: file ? file.name : null, fichierObj: file || null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-blue-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            <h3 className="text-lg font-bold">{t("sortant.newTitle")}</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">{t("entrant.orderNumber")}</label>
              <input type="text" name="numero" required value={formData.numero} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">{t("entrant.folderRef")}</label>
              <input type="text" name="reference" value={formData.reference} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">{t("sortant.recipientType")}</label>
              <select value={selectedTypeId} onChange={(e) => setSelectedTypeId(e.target.value)} required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">{t("common.choose")}</option>
                {typeTiersList.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">{t("sortant.recipient")}</label>
              <select name="destinataire" required value={formData.destinataire} onChange={handleChange} disabled={!selectedTypeId}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100">
                <option value="">{t("common.choose")}</option>
                {tiersList.map((t) => <option key={t.id} value={t.nom}>{t.nom}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">{t("sortant.sendDate")}</label>
              <input type="date" name="dateEnvoi" required value={formData.dateEnvoi} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600">{t("entrant.mailType")}</label>
              <select name="typeCourrierId" required value={formData.typeCourrierId} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">{t("common.choose")}</option>
                {typesCourrier.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600">{t("common.object")}</label>
            <textarea name="objet" required value={formData.objet} onChange={handleChange} rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm resize-y" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600">{t("entrant.document")}</label>
            <input type="file" onChange={handleFileChange}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600">{t("common.observations")}</label>
            <textarea name="observation" value={formData.observation} onChange={handleChange} rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600">{t("common.cancel")}</button>
            <button type="submit" className="px-6 py-2 bg-blue-700 text-white rounded-lg text-sm font-bold">{t("common.save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditCourrierModal({ courrier, onClose, onSubmit, role }) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    // ID interne unique (jamais le numero, qui n'est pas unique)
    id: courrier.dbId ?? courrier.id,
    oldNumero: courrier.numero,
    numero: courrier.numero || "",
    reference: courrier.reference || "",
    destinataire: courrier.destinataire || "",
    typeTiersId: courrier.typeTiersId ? String(courrier.typeTiersId) : "",
    typeCourrierId: courrier.typeCourrierId ? String(courrier.typeCourrierId) : "",
    objet: courrier.objet || "",
    dateEnvoi: courrier.date || courrier.dateEnvoi || "",
    observation: courrier.observation || "",
    fichier: courrier.fichier || null,
    fichierObj: null,
  });

  const [typeTiersList, setTypeTiersList] = useState([]);
  const [tiersList, setTiersList] = useState([]);
  const [typesCourrier, setTypesCourrier] = useState([]);

  useEffect(() => {
    api.getTypeTiers().then(setTypeTiersList).catch(console.error);
    api.getTypesCourrier().then(setTypesCourrier).catch(console.error);
  }, []);

  useEffect(() => {
    if (formData.typeTiersId) {
      api.getTiers(formData.typeTiersId).then(setTiersList).catch(console.error);
    } else {
      setTiersList([]);
    }
  }, [formData.typeTiersId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "typeTiersId") {
      setFormData((prev) => ({ ...prev, typeTiersId: value, destinataire: "" }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setFormData((prev) => ({ ...prev, fichier: file ? file.name : prev.fichier, fichierObj: file || null }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-amber-600 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            <h3 className="text-lg font-bold">{t("sortant.editTitle")}</h3>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-lg">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">{t("entrant.orderNumber")}</label>
              <input type="text" name="numero" required value={formData.numero} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">{t("entrant.folderRef")}</label>
              <input type="text" name="reference" value={formData.reference} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">{t("sortant.recipientType")}</label>
              <select name="typeTiersId" value={formData.typeTiersId} onChange={handleChange} required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">{t("common.choose")}</option>
                {typeTiersList.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">{t("sortant.recipient")}</label>
              <select name="destinataire" required value={formData.destinataire} onChange={handleChange} disabled={!formData.typeTiersId}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm disabled:bg-gray-100">
                <option value="">{t("common.choose")}</option>
                {formData.destinataire && !tiersList.some(t => t.nom === formData.destinataire) && (
                  <option value={formData.destinataire}>{formData.destinataire}</option>
                )}
                {tiersList.map((t) => <option key={t.id} value={t.nom}>{t.nom}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">{t("sortant.sendDate")}</label>
              <input type="date" name="dateEnvoi" required value={formData.dateEnvoi} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase">{t("entrant.mailType")}</label>
              <select name="typeCourrierId" required value={formData.typeCourrierId} onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="">{t("common.choose")}</option>
                {typesCourrier.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600 uppercase">{t("common.object")}</label>
            <textarea name="objet" required value={formData.objet} onChange={handleChange} rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm resize-y focus:ring-2 focus:ring-amber-500 outline-none" />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600 uppercase">{t("entrant.document")}</label>
            <input type="file" onChange={handleFileChange}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100" />
            {formData.fichier && (
              <p className="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> Fichier actuel : <span className="font-bold">{formData.fichier}</span>
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-600 uppercase">{t("common.observations")}</label>
            <textarea name="observation" value={formData.observation} onChange={handleChange} rows="3"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-amber-500 outline-none" />
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-white transition-colors">{t("common.cancel")}</button>
            <button type="submit" className="px-6 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-shadow shadow-md">{t("common.save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- COMPOSANT PRINCIPAL ---

export function CourrierSortant({ userConnecte }) {
  const { t } = useI18n();
  const [courriers, setCourriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    dateDebut: "", dateFin: "", destinataire: "",
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCourrier, setSelectedCourrier] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedReference, setSelectedReference] = useState("");

  // ✅ FIX : toutes les variables de rôle déclarées au même endroit
  const isChefDivision = userConnecte?.role === "Chef de division";
  const isChefService  = userConnecte?.role === "Chef de service";
  const isAgent        = userConnecte?.role === "Agent";

  // Contrôle strict des permissions de modification :
  // Le Chef de service ne peut modifier que les courriers sortants de son propre service
  const canEditCourrier = (c) => {
    if (isChefDivision) {
      return !c.expediteur_division_id || !userConnecte?.division_id || c.expediteur_division_id === userConnecte?.division_id;
    }
    if (isChefService) {
      return !c.service_id || c.service_id === userConnecte?.service_id;
    }
    if (isAgent) {
      return !c.service_id || c.service_id === userConnecte?.service_id;
    }
    return false;
  };

  const [pagination, setPagination] = useState({ page: 1, per_page: 10, total: 0, total_pages: 0 });

  // Pagination côté SERVEUR : on réutilise le contrat existant de l'API
  // (GET /courrier_sortant?page=&per_page= -> { data, total, page, per_page, total_pages }).
  // Aucun chargement de la totalité des courriers : seule la page courante est récupérée.
  const fetchCourriers = async (page = 1, perPage = pagination.per_page) => {
    setLoading(true);
    try {
      const response = await api.getCourriersSortants({ page, per_page: perPage });
      let courriersData = response.data || response || [];
      let currentPage = response.page || page;

      // Anti page vide : si la page demandée est vide alors qu'une page précédente
      // existe (ex. après suppression du dernier élément de la page), on recharge
      // automatiquement la page précédente pour éviter un écran vide inutile.
      if (courriersData.length === 0 && currentPage > 1) {
        const prevPage = currentPage - 1;
        const prevResp = await api.getCourriersSortants({ page: prevPage, per_page: perPage });
        courriersData = prevResp.data || prevResp || [];
        currentPage = prevResp.page || prevPage;
        setCourriers(courriersData);
        setPagination({
          page: currentPage,
          per_page: prevResp.per_page || perPage,
          total: prevResp.total || 0,
          total_pages: prevResp.total_pages || 1,
        });
        return;
      }

      setCourriers(courriersData);
      setPagination({
        page: currentPage,
        per_page: response.per_page || perPage,
        total: response.total || 0,
        total_pages: response.total_pages || 1,
      });
    } catch (err) {
      console.error("Erreur chargement courriers sortants:", err);
      setCourriers([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage) => fetchCourriers(newPage);
  const handlePerPageChange = (newPerPage) => {
    setPagination((prev) => ({ ...prev, per_page: newPerPage, page: 1 }));
    fetchCourriers(1, newPerPage);
  };

  useEffect(() => { fetchCourriers(); }, []);

  const filteredData = useMemo(() => {
    return courriers.filter((c) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch =
        !searchTerm ||
        c.reference?.toLowerCase().includes(search) ||
        c.destinataire?.toLowerCase().includes(search) ||
        c.objet?.toLowerCase().includes(search) ||
        c.numero?.toLowerCase().includes(search);

      const matchesDest = !filters.destinataire || c.destinataire.toLowerCase().includes(filters.destinataire.toLowerCase());
      const matchesDateDebut = !filters.dateDebut || new Date(c.date) >= new Date(filters.dateDebut);
      const matchesDateFin = !filters.dateFin || new Date(c.date) <= new Date(filters.dateFin);

      return matchesSearch && matchesDest && matchesDateDebut && matchesDateFin;
    });
  }, [courriers, searchTerm, filters]);

  const handleCreateSubmit = async (formData) => {
    try {
      // Étape 1 : créer le courrier sortant (sans le File object dans le JSON)
      const { fichierObj, ...dataWithoutFile } = formData;
      const result = await api.createCourrierSortant(dataWithoutFile);

      // Étape 2 : uploader le fichier avec le dbId retourné directement
      if (fichierObj && result?.dbId) {
        try {
          await api.uploadFichier(result.dbId, fichierObj);
        } catch (uploadErr) {
          console.warn("Upload fichier échoué:", uploadErr.message);
        }
      }
      // Étape 3 : rafraîchir la liste et mettre à jour selectedCourrier si le modal de détail est ouvert
      await fetchCourriers();
      setShowCreateModal(false);
      setSelectedReference("");
      // Si le modal de détail est ouvert pour ce courrier, mettre à jour avec les données fraîches
      if (showDetailModal && selectedCourrier && selectedCourrier.dbId === result.dbId) {
        const updatedCourrier = courriers.find(c => c.dbId === result.dbId);
        if (updatedCourrier) {
          setSelectedCourrier(updatedCourrier);
        }
      }
    } catch (err) {
      console.error("Erreur lors de la création:", err);
      alert(t("sortant.genericError", { message: err.message }));
    }
  };

  const handleExport = async (courrier) => {
    try {
      await api.exportCourrier(courrier.dbId, userConnecte?.id, courrier.numero);
    } catch {
      alert(t("common.exportPdfError"));
    }
  };

  // ✅ FIX : on passe archive_par (id de l'utilisateur connecté) au backend.
  // L'archivage identifie le courrier par son ID interne unique (dbId) — jamais
  // par le numero, qui n'est pas unique (plusieurs courriers peuvent le partager).
  const handleArchiveCourrier = async (id) => {
    if (!window.confirm(t("entrant.archiveConfirm"))) return;
    try {
      await api.archiveCourrierSortant(id, true, userConnecte?.id);
      fetchCourriers(pagination.page);
    } catch (err) {
      alert(t("entrant.archiveError", { message: err.message }));
    }
  };

  const handleEditSubmit = async (formData) => {
    try {
      // Contrôle de sécurité strict côté frontend
      if (isChefService && selectedCourrier?.service_id && userConnecte?.service_id && selectedCourrier.service_id !== userConnecte.service_id) {
        alert("Accès non autorisé : vous ne pouvez modifier que les courriers sortants de votre service.");
        return;
      }
      if (isAgent && selectedCourrier?.service_id && userConnecte?.service_id && selectedCourrier.service_id !== userConnecte.service_id) {
        alert("Accès non autorisé : vous ne pouvez modifier que les courriers sortants de votre service.");
        return;
      }

      // Étape 1 : mettre à jour le courrier sortant (sans le File object dans le JSON)
      const { fichierObj, ...dataWithoutFile } = formData;
      // Identification par l'ID interne unique (dbId/id) — JAMAIS le `numero`,
      // qui n'est pas unique : passé en `id`, il provoquait l'erreur MySQL 1292
      // (« Truncated incorrect DOUBLE value ») car le backend compare `WHERE id = %s`.
      const courrierId = selectedCourrier?.dbId ?? formData.id;
      await api.updateCourrierSortant(courrierId, dataWithoutFile);

      // Étape 2 : uploader le nouveau fichier si fourni
      if (fichierObj && courrierId) {
        try {
          await api.uploadFichier(courrierId, fichierObj);
        } catch (uploadErr) {
          console.warn("Upload fichier échoué:", uploadErr.message);
        }
      }

      // Étape 3 : rafraîchir la liste et mettre à jour selectedCourrier si le modal de détail est ouvert
      await fetchCourriers(pagination.page);
      setShowEditModal(false);
      // Si le modal de détail est ouvert, mettre à jour avec les données fraîches
      if (showDetailModal && selectedCourrier) {
        // Le `numero` n'est PAS unique : identifier le courrier par son ID interne
        // (dbId) pour ne jamais sélectionner un homonyme. Repli sur l'`id` si besoin.
        const targetDbId = selectedCourrier.dbId ?? selectedCourrier.id;
        const updatedCourrier = courriers.find(
          c => (c.dbId ?? c.id) === targetDbId
        );
        if (updatedCourrier) {
          setSelectedCourrier(updatedCourrier);
        } else {
          setSelectedCourrier(null);
        }
      } else {
        setSelectedCourrier(null);
      }
    } catch (err) {
      alert(t("sortant.editError", { message: err.message }));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm(t("entrant.deleteConfirm"))) {
      try {
        await api.deleteCourrierSortant(id);
        fetchCourriers(pagination.page);
      } catch (err) {
        alert(t("sortant.deleteError", { message: err.message }));
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("sortant.title")}</h2>
          <p className="text-sm text-gray-500">{t("sortant.subtitle")}</p>
        </div>
        {/* ✅ Seul l'Agent peut créer un nouveau courrier sortant */}
        {isAgent && (
          <button onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-bold shadow-sm">
            <Plus className="w-4 h-4" /> {t("sortant.newButton")}
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[250px] relative">
            <input type="text"
              placeholder={t("common.quickSearch")}
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-4 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${
              showFilters ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}>
            <Filter className="w-4 h-4" /> {t("common.filters")} {showFilters ? t("common.filtersActive") : ""}
          </button>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.recipient")}</label>
              <input type="text" placeholder={t("common.namePlaceholder")} value={filters.destinataire}
                onChange={(e) => setFilters({...filters, destinataire: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.sendFrom")}</label>
              <input type="date" value={filters.dateDebut}
                onChange={(e) => setFilters({...filters, dateDebut: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase">{t("sortant.sendTo")}</label>
              <input type="date" value={filters.dateFin}
                onChange={(e) => setFilters({...filters, dateFin: e.target.value})}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{t("common.loading")}</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 italic">
            Aucun courrier sortant trouvé
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("entrant.refNum")}</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("sortant.recipient")}</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("common.observation")}</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("sortant.sendDate")}</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredData.map((courrier) => (
                  <tr key={courrier.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-blue-700">{courrier.reference || "N/A"}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">N° {courrier.numero || courrier.id}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-900">{courrier.destinataire}</span>
                        <span className="text-[10px] text-gray-400">{courrier.redacteur}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <p className="text-sm text-gray-600 truncate max-w-xs">{courrier.observation || "—"}</p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-gray-100 text-gray-700 border border-gray-200">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] font-bold">{courrier.date}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex justify-center items-center gap-2">
                        {/* Voir détails — tous les rôles */}
                        <button
                          onClick={() => { setSelectedCourrier(courrier); setShowDetailModal(true); }}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors" title={t("common.details")}>
                          <Eye className="w-4 h-4" />
                        </button>

                        {/* Export PDF — tous les rôles */}
                        <button
                          onClick={() => handleExport(courrier)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors" title={t("common.exportPdf")}>
                          <Download className="w-4 h-4" />
                        </button>

                        {/* Imprimer — tous les rôles */}
                        <button
                          onClick={async () => {
                            try { await PrintService.printById(courrier.dbId, userConnecte?.id); }
                            catch (err) { alert(t("common.printError", { message: err.message })); }
                          }}
                          className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                          title={t("common.print")}>
                          <Printer className="w-4 h-4" />
                        </button>

                        {/* Modifier — Chef de division, Chef de service et Agent selon leurs permissions */}
                        {canEditCourrier(courrier) && (
                          <button
                            onClick={() => { setSelectedCourrier(courrier); setShowEditModal(true); }}
                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors" title={t("common.edit")}>
                            <Edit className="w-4 h-4" />
                          </button>
                        )}

                        {/* Supprimer — Chef de division uniquement */}
                        {isChefDivision && (
                          <button
                            onClick={() => handleDelete(courrier.dbId)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors" title={t("common.delete")}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {/* ✅ FIX : isChefDivision maintenant déclaré — Archiver pour Chef de division et Agent */}
                        {(isChefDivision || isAgent) && (
                          <button onClick={() => handleArchiveCourrier(courrier.dbId)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors" title={t("entrant.archive")}>
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={pagination.page}
          perPage={pagination.per_page}
          total={pagination.total}
          totalPages={pagination.total_pages}
          loading={loading}
          onPageChange={handlePageChange}
          onPerPageChange={handlePerPageChange}
        />
      </div>

      {/* Modals */}
      {showCreateModal && (
        <NouveauCourrierModal
          onClose={() => setShowCreateModal(false)}
          agent={userConnecte}
          onSubmit={handleCreateSubmit}
          selectedReference={selectedReference}
        />
      )}

      {showEditModal && selectedCourrier && (
        <EditCourrierModal
          courrier={selectedCourrier}
          onClose={() => { setShowEditModal(false); setSelectedCourrier(null); }}
          onSubmit={handleEditSubmit}
          role={userConnecte?.role}
        />
      )}

      {showDetailModal && selectedCourrier && (
        <CourrierDetailModal
          courrier={selectedCourrier}
          onClose={() => { setShowDetailModal(false); setSelectedCourrier(null); }}
        />
      )}
    </div>
  );
}