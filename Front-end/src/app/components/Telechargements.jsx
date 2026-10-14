
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Download,
  Eye,
  Printer,
  Search,
  Filter,
  FileText,
  Loader2,
  X,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RefreshCw,
  Calendar,
  User,
  ArrowUpDown,
  Trash2,
} from "lucide-react";
import { api } from "../../services/api";
import { useI18n } from "../../i18n";
import PrintService from "../../services/PrintService";


function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge de type de document (basé sur le sens du courrier)
// ─────────────────────────────────────────────────────────────────────────────

function DocTypeBadge({ sens }) {
  const { t } = useI18n();

  if (sens === "entrant") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
        {t("downloads.typeEntrant")}
      </span>
    );
  }
  if (sens === "sortant") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-violet-50 text-violet-700 border-violet-200 whitespace-nowrap">
        {t("downloads.typeSortant")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border bg-gray-100 text-gray-500 border-gray-200 whitespace-nowrap">
      {t("downloads.typeOther")}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Visionneuse PDF inline
// ─────────────────────────────────────────────────────────────────────────────

function PdfPreviewModal({ doc, userId, onClose }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const iframeRef = useRef(null);

  const pdfUrl = api.getPdfPreviewUrl(doc.id, userId);

  // URL avec zoom pour l'iframe (paramètre de visionneuse PDF du navigateur)
  const iframeSrc = `${pdfUrl}#zoom=${zoom}&toolbar=0&navpanes=1&scrollbar=1`;

  const handleZoomIn  = () => setZoom((z) => Math.min(z + 25, 300));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 25, 50));
  const handleFit     = () => setZoom(100);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = doc.nom_fichier;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    PrintService.printByUrl(pdfUrl).catch((err) => {
      console.error("Impression échouée :", err);
    });
  };

  // Fermer sur Échap
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm">
      {/* ── Barre d'outils ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5
                      bg-slate-800 text-white shadow-lg flex-shrink-0">

        {/* Infos document */}
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate max-w-xs">{doc.nom_fichier}</p>
            {doc.courrier_ref && (
              <p className="text-[10px] text-slate-400">
                {t("common.refShort", { value: doc.courrier_ref })}
              </p>
            )}
          </div>
        </div>

        {/* Contrôles de zoom et navigation */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 50}
            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-40 transition-colors"
            title={t("downloads.zoomOut")}
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          <span className="px-2 py-0.5 bg-slate-700 rounded text-xs font-mono w-14 text-center">
            {zoom}%
          </span>

          <button
            onClick={handleZoomIn}
            disabled={zoom >= 300}
            className="p-1.5 rounded hover:bg-white/10 disabled:opacity-40 transition-colors"
            title={t("downloads.zoomIn")}
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={handleFit}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            title={t("downloads.fitPage")}
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-slate-600 mx-1" />

          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700
                       rounded text-xs font-semibold transition-colors"
            title={t("common.download")}
          >
            <Download className="w-3.5 h-3.5" />
            {t("common.download")}
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 hover:bg-slate-500
                       rounded text-xs font-semibold transition-colors"
            title={t("downloads.print")}
          >
            <Printer className="w-3.5 h-3.5" />
            {t("downloads.print")}
          </button>

          <div className="w-px h-5 bg-slate-600 mx-1" />

          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
            title={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Zone d'affichage PDF ──────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden bg-slate-700">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-xs text-slate-300 uppercase tracking-wider font-bold">
              {t("common.loading")}
            </p>
          </div>
        )}

        {error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <FileText className="w-12 h-12 text-slate-500" />
            <p className="text-sm text-slate-300 font-medium">{t("downloads.previewError")}</p>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700
                         text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Download className="w-4 h-4" />
              {t("downloads.downloadInstead")}
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title={doc.nom_fichier}
            className="w-full h-full border-0"
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

export default function Telechargements({ userConnecte }) {
  const { t } = useI18n();

  const isAdmin = userConnecte?.role === "Chef de division";

  // ── État ────────────────────────────────────────────────────────────────
  const [documents, setDocuments]         = useState([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(true);
  const [searchTerm, setSearchTerm]       = useState("");
  const [showFilters, setShowFilters]     = useState(false);
  const [filters, setFilters]             = useState({
    sens: "",
    dateDebut: "",
    dateFin: "",
  });
  const [previewDoc, setPreviewDoc]       = useState(null);
  const [sortDesc, setSortDesc]           = useState(true);

  // ── Chargement des données ───────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    if (!userConnecte?.id) return;
    setLoading(true);
    try {
      const params = { user_id: userConnecte.id };
      if (searchTerm.trim())    params.search     = searchTerm.trim();
      if (filters.sens)         params.sens        = filters.sens;
      if (filters.dateDebut)    params.date_debut  = filters.dateDebut;
      if (filters.dateFin)      params.date_fin    = filters.dateFin;

      const data = await api.getTelechargements(params);
      const rows = data?.data ?? [];
      setDocuments(sortDesc ? rows : [...rows].reverse());
      setTotal(data?.total ?? rows.length);
    } catch (err) {
      console.error("Téléchargements fetch error:", err);
      setDocuments([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [userConnecte?.id, searchTerm, filters, sortDesc]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // ── Impression via PrintService (centralisé) ──────────────────────────
  const handlePrint = async (doc) => {
    try {
      const pdfUrl = api.getPdfPreviewUrl(doc.id, userConnecte.id);
      await PrintService.printByUrl(pdfUrl);
    } catch (err) {
      alert(t("common.printError", { message: err.message }));
    }
  };

  // ── Suppression d'un téléchargement ─────────────────────────────────
  const handleDelete = async (doc) => {
    if (!confirm(t("downloads.deleteConfirm"))) return;

    try {
      await api.deleteTelechargement(doc.id);
      // Retirer le document de la liste locale
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Erreur suppression téléchargement:", err);
      alert(t("common.error"));
    }
  };

  // ── Réinitialisation des filtres ────────────────────────────────────────
  const handleResetFilters = () => {
    setFilters({ sens: "", dateDebut: "", dateFin: "" });
    setSearchTerm("");
  };

  const hasActiveFilters =
    searchTerm || filters.sens || filters.dateDebut || filters.dateFin;

  // ─────────────────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">

      {/* ── En-tête ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {t("downloads.title")}
          </h2>
          <p className="text-sm text-gray-500">{t("downloads.subtitle")}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Compteur */}
          {!loading && (
            <span className="text-xs text-gray-400 font-medium">
              {t("downloads.count", { n: total })}
            </span>
          )}
          {/* Rafraîchir */}
          <button
            onClick={fetchDocuments}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200
                       rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors
                       disabled:opacity-50"
            title={t("common.refresh")}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </button>
        </div>
      </div>

      {/* ── Barre de recherche + filtres ──────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Champ de recherche */}
          <div className="flex-1 min-w-[250px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t("downloads.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg
                         text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Bouton filtres */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold
                        transition-all ${
                          showFilters || (filters.sens || filters.dateDebut || filters.dateFin)
                            ? "bg-blue-50 border-blue-200 text-blue-700"
                            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
          >
            <Filter className="w-4 h-4" />
            {t("common.filters")}
            {(filters.sens || filters.dateDebut || filters.dateFin) &&
              <span className="ml-1 text-blue-500">{t("common.filtersActive")}</span>
            }
          </button>

          {/* Tri par date */}
          <button
            onClick={() => setSortDesc((d) => !d)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300
                       bg-white text-gray-700 text-sm hover:bg-gray-50 transition-colors"
            title={t("downloads.sortByDate")}
          >
            <ArrowUpDown className="w-4 h-4" />
            {sortDesc ? t("downloads.newestFirst") : t("downloads.oldestFirst")}
          </button>

          {/* Réinitialiser */}
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 px-3 py-2 text-sm text-red-500
                         hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              {t("downloads.clearFilters")}
            </button>
          )}
        </div>

        {/* Panneau de filtres avancés */}
        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">

            {/* Type (sens) */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3 h-3" /> {t("downloads.filterType")}
              </label>
              <select
                value={filters.sens}
                onChange={(e) => setFilters({ ...filters, sens: e.target.value })}
                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm"
              >
                <option value="">{t("common.all")}</option>
                <option value="entrant">{t("downloads.typeEntrant")}</option>
                <option value="sortant">{t("downloads.typeSortant")}</option>
              </select>
            </div>

            {/* Date début */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {t("common.from")}
              </label>
              <input
                type="date"
                value={filters.dateDebut}
                onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            {/* Date fin */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {t("common.to")}
              </label>
              <input
                type="date"
                value={filters.dateFin}
                onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
                className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Tableau des documents ─────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        {loading ? (
          /* État de chargement */
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">
              {t("common.loading")}
            </p>
          </div>

        ) : documents.length === 0 ? (
          /* État vide */
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Download className="w-7 h-7 text-gray-300" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-gray-500">
                {t("downloads.empty")}
              </p>
              <p className="text-xs text-gray-400 mt-1">{t("downloads.emptyHint")}</p>
            </div>
          </div>

        ) : (
          /* Table */
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-start">
                    {t("downloads.colType")}
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-start">
                    {t("downloads.colParty")}
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">
                    {t("common.actions")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors">

                    {/* Type (badge) */}
                    <td className="py-3.5 px-4">
                      <DocTypeBadge sens={doc.courrier_sens} />
                    </td>

                    {/* Expéditeur (entrant) ou Destinataire (sortant) */}
                    <td className="py-3.5 px-4">
                      <span className="text-sm font-medium text-gray-800">
                        {doc.courrier_sens === "entrant"
                          ? (doc.expediteur || "—")
                          : (doc.destinataire || "—")}
                      </span>
                    </td>

                    {/* Actions : Voir + Imprimer + Supprimer */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center justify-center gap-2">

                        {/* Voir */}
                        <button
                          onClick={() => doc.file_exists && setPreviewDoc(doc)}
                          disabled={!doc.file_exists}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                                      font-semibold transition-colors
                                      ${doc.file_exists
                                        ? "bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200"
                                        : "bg-gray-50 text-gray-300 border border-gray-200 cursor-not-allowed"
                                      }`}
                          title={doc.file_exists ? t("downloads.preview") : t("downloads.fileUnavailable")}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          {t("downloads.preview")}
                        </button>

                        {/* Imprimer */}
                        <button
                          onClick={() => doc.file_exists && handlePrint(doc)}
                          disabled={!doc.file_exists}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                                      font-semibold transition-colors
                                      ${doc.file_exists
                                        ? "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                                        : "bg-gray-50 text-gray-300 border border-gray-200 cursor-not-allowed"
                                      }`}
                          title={doc.file_exists ? t("downloads.print") : t("downloads.fileUnavailable")}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          {t("downloads.print")}
                        </button>

                        {/* Supprimer */}
                        <button
                          onClick={() => handleDelete(doc)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs
                                     font-semibold transition-colors bg-red-50 text-red-700
                                     hover:bg-red-100 border border-red-200"
                          title={t("common.delete")}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {t("common.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Visionneuse PDF (modale plein écran) ──────────────────── */}
      {previewDoc && (
        <PdfPreviewModal
          doc={previewDoc}
          userId={userConnecte.id}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </div>
  );
}
