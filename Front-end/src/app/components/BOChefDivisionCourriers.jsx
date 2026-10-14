import { useState, useEffect, useCallback } from "react";
import {
  Inbox, Search, RefreshCw, Eye, CheckCircle,
  ChevronLeft, ChevronRight, AlertCircle,
  Send, FileText, Download, Info, X, Building2, ArrowRight, Hash,
} from "lucide-react";
import { api } from "../../services/api";
import { useI18n } from "../../i18n";
import { translateStatus, translateAction, formatFileSize, removeBOPrefix } from "../../i18n/helpers";

const STATUT_COLORS = {
  "Affecté":            "bg-purple-100 text-purple-800 border-purple-200",
  "Affecté au service": "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Traité":             "bg-green-100 text-green-800 border-green-200",
};

function DetailModal({ courrier, userConnecte, divisionId, onClose, onAffected }) {
  const { t } = useI18n();
  const [services, setServices] = useState([]);
  const [selectedService, setSelectedService] = useState("");
  const [affecting, setAffecting] = useState(false);
  const [changingStatut, setChangingStatut] = useState(false);

  useEffect(() => {
    if (userConnecte?.id && divisionId) {
      api.boChefGetServices(userConnecte.id, divisionId)
        .then(setServices)
        .catch((e) => console.error("Erreur chargement services:", e));
    }
  }, [userConnecte, divisionId]);

  const handleAffecter = async () => {
    if (!selectedService) return;
    setAffecting(true);
    try {
      await api.boChefAffecterService(
        courrier.id, userConnecte.id, divisionId, selectedService
      );
      onAffected(courrier.id, "Affecté au service");
      onClose();
    } catch (e) {
      alert(e?.message || t("bo.assignServiceError"));
    } finally {
      setAffecting(false);
    }
  };

  const handleMarkTraite = async () => {
    setChangingStatut(true);
    try {
      await api.boChefUpdateStatut(
        courrier.id, userConnecte.id, divisionId, "Traité"
      );
      onAffected(courrier.id, "Traité");
      onClose();
    } catch (e) {
      alert(e?.message || t("bo.statusError"));
    } finally {
      setChangingStatut(false);
    }
  };

  const canAffecter   = courrier.statut === "Affecté";
  const canMarkTraite = courrier.statut === "Affecté" || courrier.statut === "Affecté au service";

  const statut = STATUT_COLORS[courrier.statut]
    ? { color: STATUT_COLORS[courrier.statut] }
    : { color: "bg-gray-100 text-gray-700 border-gray-200" };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh]
                      flex flex-col overflow-hidden">

        {/* ── En-tête ── */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                               bg-white/15 text-white text-[10px] font-bold uppercase
                               tracking-wider mb-3">
                <FileText className="w-3 h-3" /> {t("entrant.incomingMail")}
              </span>
              <p className="text-white text-xl font-bold font-mono truncate">
                {courrier.numero}
              </p>
              {courrier.reference && (
                <p className="text-slate-300 text-sm mt-1">
                  {t("common.refShort", { value: courrier.reference })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full
                                text-xs font-bold border ${statut.color}`}>
                {translateStatus(t, courrier.statut)}
              </span>
              <button onClick={onClose}
                className="text-slate-400 hover:text-white hover:bg-white/10
                           p-1.5 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Corps ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-5 space-y-4">

          {/* Informations générales */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {t("entrant.generalInfo")}
              </span>
            </div>
            <div className="px-5 py-4 grid grid-cols-2 gap-x-6 gap-y-4">
              {[
                [t("entrant.sender"),          courrier.expediteur_nom || courrier.expediteur],
                [t("bo.mailType"),             courrier.type_courrier],
                [t("bo.destDivision"),         courrier.destinataire_division_nom || courrier.destinataire_division],
                [t("bo.receivedDate"),         courrier.date_reception],
                [t("bo.assignmentDate"),       courrier.date_affectation?.slice(0,16).replace("T"," ")],
                [t("entrant.enteredBy"),       `${courrier.agent_prenom||""} ${courrier.agent_nom||""}`.trim()],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    {label}
                  </p>
                  <p className="text-sm text-gray-800 font-medium">{value || t("common.emDash")}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Contenu */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
              <Hash className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {t("entrant.content")}
              </span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                  {t("common.object")}
                </p>
                <p className="text-sm font-semibold text-gray-800 bg-blue-50 rounded-xl
                               px-4 py-3 border border-blue-100 leading-relaxed whitespace-pre-line">
                  {courrier.objet || t("common.emDash")}
                </p>
              </div>
              {courrier.observations && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                    {t("common.observations")}
                  </p>
                  <p className="text-sm text-gray-700 bg-amber-50 rounded-xl px-4 py-3
                                 border border-amber-100 whitespace-pre-line leading-relaxed">
                    {courrier.observations}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Affectation au service */}
          {canAffecter && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 bg-blue-50 border-b border-blue-100">
                <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  {t("entrant.assignToService")}
                </span>
              </div>
              <div className="px-5 py-4 flex items-center gap-3">
                <select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}
                  className="flex-1 px-3 py-2.5 text-sm border border-gray-300 rounded-xl
                             focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">{t("entrant.selectService")}</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
                </select>
                <button onClick={handleAffecter} disabled={!selectedService || affecting}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold
                             text-white bg-blue-600 rounded-xl hover:bg-blue-700
                             transition disabled:opacity-50 disabled:cursor-not-allowed">
                  {affecting
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <ArrowRight className="w-4 h-4" />}
                  {t("entrant.assign")}
                </button>
              </div>
            </div>
          )}

          {/* Pièces jointes */}
          {courrier.documents?.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                <FileText className="w-3.5 h-3.5 text-blue-500" />
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {t("bo.attachmentsCount", { n: courrier.documents.length })}
                </span>
              </div>
              <div className="px-5 py-4 space-y-2">
                {courrier.documents.map((doc) => {
                  const size = formatFileSize(t, doc.taille_octets);
                  return (
                    <div key={doc.id}
                      className="flex items-center justify-between p-3 bg-blue-50
                                 border border-blue-100 rounded-xl hover:bg-blue-100 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center
                                        justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {removeBOPrefix(doc.nom_fichier)}
                          </p>
                          {size && <p className="text-[10px] text-gray-400">{size}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => api.boDownloadDocument(doc.id, userConnecte.id, doc.nom_fichier)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white
                                   text-xs font-semibold rounded-lg hover:bg-blue-700 transition
                                   flex-shrink-0 ml-3">
                        <Download className="w-3.5 h-3.5" /> {t("common.download")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Historique */}
          {courrier.historique?.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                {t("bo.historyActions")}
              </p>
              <div className="space-y-2">
                {courrier.historique.map((h, i) => (
                  <div key={i}
                    className="flex items-start gap-3 px-3 py-2.5
                               bg-gray-50 border border-gray-100 rounded-xl">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center
                                    justify-center flex-shrink-0 mt-0.5">
                      <Info className="w-3 h-3 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700">
                        {translateAction(t, h.action)}
                      </p>
                      <p className="text-[10px] text-gray-500">{h.details}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {h.prenom} {h.nom} · {h.created_at?.slice(0,16).replace("T"," ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50
                        flex flex-wrap items-center justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border
                       border-gray-300 rounded-lg hover:bg-gray-100 transition">
            {t("common.close")}
          </button>
          {canMarkTraite && (
            <button
              onClick={handleMarkTraite}
              disabled={changingStatut}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium
                         text-white bg-green-600 rounded-lg hover:bg-green-700
                         transition disabled:opacity-60">
              {changingStatut
                ? <span className="w-4 h-4 border-2 border-white
                                   border-t-transparent rounded-full animate-spin" />
                : <CheckCircle className="w-4 h-4" />}
              {t("bo.markProcessed")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function BOChefDivisionCourriers({ userConnecte }) {
  const { t } = useI18n();
  const [data,          setData]          = useState({ total: 0, data: [], page: 1 });
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState("");
  const [statut,        setStatut]        = useState("");
  const [page,          setPage]          = useState(1);
  const [selected,      setSelected]      = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [toast,         setToast]         = useState(null);

  const PER_PAGE = 10;

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const effectiveDivisionId = userConnecte?.division_id || null;

  const load = useCallback(() => {
    if (!userConnecte?.id) return;
    if (!effectiveDivisionId) {
      showToast("error", t("chef.noDivision"));
      setLoading(false);
      return;
    }
    setLoading(true);
    api.boChefGetCourriers({
      user_id:     userConnecte.id,
      division_id: effectiveDivisionId,
      search, statut, page,
      per_page: PER_PAGE,
    })
      .then(setData)
      .catch((e) => {
        console.error("[BOChef] Erreur chargement:", e);
        showToast("error", e?.message || t("chef.loadError"));
      })
      .finally(() => setLoading(false));
  }, [userConnecte, effectiveDivisionId, search, statut, page]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    setLoadingDetail(true);
    try {
      const c = await api.boChefGetCourrier(id, userConnecte.id, effectiveDivisionId);
      setSelected(c);
    } catch {
      showToast("error", t("chef.detailError"));
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleAffected = (id, newStatut) => {
    setData((prev) => ({
      ...prev,
      data: prev.data.map((c) => c.id === id ? { ...c, statut: newStatut } : c),
    }));
    showToast("success", t("chef.statusUpdated", { status: translateStatus(t, newStatut) }));
    load();
  };

  const totalPages = Math.max(1, Math.ceil(data.total / PER_PAGE));

  const tableHeaders = [
    t("bo.orderNumber"), t("common.reference"), t("entrant.sender"),
    t("common.observation"), t("bo.receivedDate"), t("common.status"),
    t("chef.assignedOn"), t("common.actions"),
  ];

  return (
    <div className="p-6">
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

      {selected && (
        <DetailModal
          courrier={selected}
          userConnecte={userConnecte}
          divisionId={effectiveDivisionId}
          onClose={() => setSelected(null)}
          onAffected={handleAffected}
        />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Inbox className="w-5 h-5 text-blue-600" />
            {t("bo.receivedFromBO")}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {userConnecte?.division
              ? <>{t("bo.divisionPrefix")} <strong>{userConnecte.division}</strong></>
              : t("chef.yourMails")}
            {" · "}{t("bo.totalMails", { n: data.total })}
          </p>
        </div>
        <button onClick={load}
          className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          title={t("common.refresh")}>
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Filtres */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300
                       rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t("bo.searchPlaceholder")}
          />
        </div>
        <select value={statut}
          onChange={(e) => { setStatut(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg
                     focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-52">
          <option value="">{t("bo.allStatuses")}</option>
          <option value="Affecté">{t("bo.assignedPending")}</option>
          <option value="Traité">{translateStatus(t, "Traité")}</option>
        </select>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {tableHeaders.map((h) => (
                  <th key={h}
                    className="px-4 py-3 text-left text-xs font-bold
                               text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  {t("common.loading")}
                </td></tr>
              ) : data.data.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-16 text-gray-400 text-sm">
                  <Inbox className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  {t("bo.emptyBO")}
                </td></tr>
              ) : data.data.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-mono font-semibold text-blue-700">
                    {c.numero}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {c.reference || t("common.emDash")}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-32 truncate">
                    {c.expediteur || t("common.emDash")}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 max-w-48">
                    <span className="line-clamp-2">
                      {c.observation || c.observations || t("common.emDash")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                    {c.date_reception}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px]
                                      font-semibold border
                                      ${STATUT_COLORS[c.statut] || "bg-gray-100 text-gray-700"}`}>
                      {translateStatus(t, c.statut)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                    {c.date_affectation?.slice(0,16).replace("T"," ") || t("common.emDash")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(c.id)}
                      disabled={loadingDetail}
                      title={t("bo.consultAssign")}
                      className="p-1.5 text-gray-500 hover:text-blue-600
                                 hover:bg-blue-50 rounded-lg transition">
                      {loadingDetail
                        ? <RefreshCw className="w-4 h-4 animate-spin" />
                        : <Eye className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {t("bo.pageOf", { page, pages: totalPages })}
            </p>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50
                           disabled:opacity-40 transition">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50
                           disabled:opacity-40 transition">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
