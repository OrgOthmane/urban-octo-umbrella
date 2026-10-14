import { useState, useEffect, useCallback } from "react";
import {
  Search, Plus, Eye, Pencil, Trash2, Send, X,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle,
  ChevronUp, ChevronDown, RefreshCw, Building2,
} from "lucide-react";
import { api } from "../../../services/api";
import BOConsultation from "./BOConsultation";
import { useI18n } from "../../../i18n";
import { translateStatus } from "../../../i18n/helpers";

const STATUT_COLORS = {
  "Non affecté": "bg-yellow-100 text-yellow-800",
  "Affecté":     "bg-green-100 text-green-800",
  "Traité":      "bg-blue-100 text-blue-800",
};

export default function BOListeCourriers({ userConnecte, onEdit, onNouveau }) {
  const { t } = useI18n();

  const [data,          setData]          = useState({ total: 0, data: [], page: 1 });
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState("");
  const [statut,        setStatut]        = useState("");
  const [page,          setPage]          = useState(1);
  const [sortCol,       setSortCol]       = useState("date_saisie");
  const [sortDir,       setSortDir]       = useState("desc");
  const [toast,         setToast]         = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [affectModal,   setAffectModal]   = useState(null);
  const [confirmAnnuler,setConfirmAnnuler]= useState(null);
  const [divisions,     setDivisions]     = useState([]);
  const [selectedDiv,   setSelectedDiv]   = useState("");
  const [affecting,     setAffecting]     = useState(false);
  const [consultId,     setConsultId]     = useState(null);

  const PER_PAGE = 10;

  useEffect(() => {
    api.boGetRefData()
      .then((d) => setDivisions(d.divisions || []))
      .catch(console.error);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.boGetCourriers({
      user_id: userConnecte.id,
      search, statut, page, per_page: PER_PAGE,
    })
      .then(setData)
      .catch(() => showToast("error", t("bo.loadError")))
      .finally(() => setLoading(false));
  }, [userConnecte.id, search, statut, page]);

  useEffect(() => { load(); }, [load]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleDelete = async (id) => {
    try {
      await api.boDeleteCourrier(id, userConnecte.id);
      showToast("success", t("bo.deleted"));
      load();
    } catch (e) {
      showToast("error", e?.message || t("bo.deleteImpossible"));
    } finally {
      setConfirmDelete(null);
    }
  };

  const openAffectModal = (id) => {
    setSelectedDiv("");
    setAffectModal(id);
  };

  const handleAffecter = async () => {
    if (!selectedDiv) {
      showToast("error", t("bo.selectDivisionError"));
      return;
    }
    setAffecting(true);
    try {
      const res = await api.boAffecter(affectModal, userConnecte.id, selectedDiv);
      showToast("success", res?.message || t("bo.assignedSuccess"));
      setAffectModal(null);
      load();
    } catch (e) {
      showToast("error", e?.message || t("bo.assignImpossible"));
    } finally {
      setAffecting(false);
    }
  };

  const handleAnnuler = async (id) => {
    try {
      await api.boAnnulerAffectation(id, userConnecte.id);
      showToast("success", t("bo.assignmentCancelled"));
      load();
    } catch (e) {
      showToast("error", e?.message || t("bo.cancelImpossible"));
    } finally {
      setConfirmAnnuler(null);
    }
  };

  const rows = [...(data.data || [])].sort((a, b) => {
    let va = a[sortCol] ?? ""; let vb = b[sortCol] ?? "";
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE));

  const Th = ({ col, label }) => (
    <th
      onClick={() => toggleSort(col)}
      className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider
                 cursor-pointer hover:text-blue-600 select-none"
    >
      <span className="flex items-center gap-1">
        {label}
        {sortCol === col
          ? sortDir === "asc"
            ? <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3" />
          : <span className="w-3 h-3" />}
      </span>
    </th>
  );

  if (consultId) {
    return (
      <BOConsultation
        courrierId={consultId}
        userConnecte={userConnecte}
        onBack={() => setConsultId(null)}
      />
    );
  }

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3
                         rounded-xl shadow-lg text-sm font-medium
                         ${toast.type === "success"
                           ? "bg-green-50 text-green-800 border border-green-200"
                           : "bg-red-50 text-red-800 border border-red-200"}`}>
          {toast.type === "success"
            ? <CheckCircle className="w-4 h-4 text-green-500" />
            : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}

      {/* Modal confirmer suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-800 mb-2">{t("bo.confirmDeleteTitle")}</h3>
            <p className="text-sm text-gray-600 mb-5">{t("bo.confirmDeleteBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">
                {t("common.cancel")}
              </button>
              <button onClick={() => handleDelete(confirmDelete)}
                className="flex-1 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700">
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmer annulation d'affectation */}
      {confirmAnnuler && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="text-base font-bold text-gray-800 mb-2">{t("bo.cancelAssignTitle")}</h3>
            <p className="text-sm text-gray-600 mb-5">{t("bo.cancelAssignBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAnnuler(null)}
                className="flex-1 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50">
                {t("bo.keep")}
              </button>
              <button onClick={() => handleAnnuler(confirmAnnuler)}
                className="flex-1 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700">
                {t("bo.cancelAssignTitle")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal affecter — sélection de division */}
      {affectModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">{t("bo.assignTitle")}</h3>
                <p className="text-xs text-gray-500">{t("bo.assignSubtitle")}</p>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                {t("settings.division")} <span className="text-red-500">{t("common.required")}</span>
              </label>
              <select
                value={selectedDiv}
                onChange={(e) => setSelectedDiv(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("bo.selectDivision")}</option>
                {divisions.map((d) => (
                  <option key={d.id} value={d.id}>{d.nom}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {t("bo.assignVisibilityHint")}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setAffectModal(null)}
                disabled={affecting}
                className="flex-1 py-2 text-sm font-medium border border-gray-300
                           rounded-lg hover:bg-gray-50 disabled:opacity-50">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleAffecter}
                disabled={affecting || !selectedDiv}
                className="flex-1 py-2 text-sm font-medium text-white bg-blue-600
                           rounded-lg hover:bg-blue-700 disabled:opacity-50
                           disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {affecting
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send className="w-4 h-4" />}
                {affecting ? t("bo.assigning") : t("bo.assign")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t("bo.listTitle")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("bo.totalMails", { n: data.total })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            title={t("common.refresh")}>
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onNouveau}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm
                       font-medium rounded-lg hover:bg-blue-700 transition">
            <Plus className="w-4 h-4" /> {t("bo.newMail")}
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t("bo.searchPlaceholder")}
          />
        </div>
        <select value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-44">
          <option value="">{t("bo.allStatuses")}</option>
          <option value="Non affecté">{translateStatus(t, "Non affecté")}</option>
          <option value="Affecté">{translateStatus(t, "Affecté")}</option>
          <option value="Traité">{translateStatus(t, "Traité")}</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <Th col="numero"                label={t("bo.orderNumber")} />
                <Th col="reference"             label={t("common.reference")} />
                <Th col="expediteur"            label={t("entrant.sender")} />
                <Th col="observation"           label={t("common.observation")} />
                <Th col="date_reception"        label={t("bo.receivedDate")} />
                <Th col="statut"                label={t("common.status")} />
                <Th col="destinataire_division" label={t("bo.assignedDivision")} />
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  {t("common.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  {t("common.loading")}
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                  {t("entrant.empty")}
                </td></tr>
              ) : rows.map((c) => {
                const canEdit   = c.statut === "Non affecté";
                const canAffect = c.statut === "Non affecté";
                const isAffected = c.statut !== "Non affecté";
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-700">
                      {c.numero}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.reference || t("common.emDash")}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-32 truncate">
                      {c.expediteur || t("common.emDash")}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 max-w-48">
                      <span className="line-clamp-2">{c.observations || t("common.emDash")}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {c.date_reception}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px]
                                        font-semibold
                                        ${STATUT_COLORS[c.statut] || "bg-gray-100 text-gray-700"}`}>
                        {translateStatus(t, c.statut)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.destinataire_division || t("common.emDash")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setConsultId(c.id)}
                          title={t("bo.consult")}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50
                                     rounded-lg transition">
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button onClick={() => onEdit(c.id)}
                            title={t("common.edit")}
                            className="p-1.5 text-gray-500 hover:text-yellow-600
                                       hover:bg-yellow-50 rounded-lg transition">
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canEdit && (
                          <button onClick={() => setConfirmDelete(c.id)}
                            title={t("common.delete")}
                            className="p-1.5 text-gray-500 hover:text-red-600
                                       hover:bg-red-50 rounded-lg transition">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {canAffect && (
                          <button onClick={() => openAffectModal(c.id)}
                            title={t("bo.assignToDivision")}
                            className="p-1.5 text-gray-500 hover:text-green-700
                                       hover:bg-green-50 rounded-lg transition">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {isAffected && (
                          <button onClick={() => setConfirmAnnuler(c.id)}
                            title={t("bo.cancelAssignTitle")}
                            className="p-1.5 text-gray-500 hover:text-orange-600
                                       hover:bg-orange-50 rounded-lg transition">
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {t("bo.resultsCount", { page, pages: totalPages, total: data.total })}
            </p>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                return (
                  <button key={pg} onClick={() => setPage(pg)}
                    className={`w-8 h-8 text-xs rounded-lg border font-medium transition
                                ${pg === page
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                    {pg}
                  </button>
                );
              })}
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
