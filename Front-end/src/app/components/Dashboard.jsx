import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Mail, Send, Clock, CheckCircle, Loader2, Eye, X,
  User, Calendar, FileText, Info, Hash, Building,
  Download, Inbox, TrendingUp,
  FileImage, File,
} from "lucide-react";
import { useState, useEffect } from "react";
import { api } from "../../services/api";
import { useI18n, translateStatus, translateRole, formatFileSize } from "../../i18n";
import { removeBOPrefix } from "../../i18n/helpers";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6"];


function getStatutConfig(statut) {
  const s = (statut || "").toUpperCase();
  if (s === "URGENT")                              return { cls: "bg-red-100 text-red-700 border-red-200" };
  if (s === "EN_ATTENTE" || s === "EN ATTENTE")    return { cls: "bg-amber-100 text-amber-700 border-amber-200" };
  if (s === "EN_COURS"   || s === "EN COURS")      return { cls: "bg-blue-100 text-blue-700 border-blue-200" };
  if (s === "TRAITE"     || s === "TRAITÉ")        return { cls: "bg-green-100 text-green-700 border-green-200" };
  return { cls: "bg-gray-100 text-gray-700 border-gray-200" };
}


// Construit l'entrée « pièce jointe » de repli à partir du nom exposé par la
// liste. La provenance (`fichier_source`) est déterminante : un nom issu de
// bo_documents doit être téléchargé via /bo/documents/download/<id>, sinon le
// backend répond « Fichier introuvable ».
function fallbackAttachment(courrier) {
  const vientDuBo = courrier?.fichier_source === "bo" && courrier?.fichier_bo_id;
  return vientDuBo
    ? { id: courrier.fichier_bo_id, nom_fichier: courrier.fichier, source: "bo" }
    : { nom_fichier: courrier.fichier, source: "standard" };
}


function InfoRow({ icon: Icon, iconBg, iconColor, label, value, valueClass = "text-gray-800 font-semibold" }) {  return (
    <div className="flex items-start gap-3 px-5 py-3.5">
      <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
        <p className={`text-sm mt-0.5 leading-relaxed whitespace-pre-line ${valueClass}`}>{value || "—"}</p>
      </div>
    </div>
  );
}



function getFileIconConfig(filename) {
  const ext = filename ? filename.split(".").pop()?.toLowerCase() : "";
  if (ext === "pdf")                                   return { Icon: FileText,  bg: "bg-red-100",    color: "text-red-600",    ext };
  if (["jpg","jpeg","png","gif","webp"].includes(ext)) return { Icon: FileImage, bg: "bg-purple-100", color: "text-purple-600", ext };
  if (["doc","docx"].includes(ext))                    return { Icon: FileText,  bg: "bg-blue-100",   color: "text-blue-600",   ext };
  return { Icon: File, bg: "bg-gray-100", color: "text-gray-500", ext };
}

function CourrierDrawer({ courrier, onClose, userConnecte }) {
  const { t, isRTL } = useI18n();
  const [visible, setVisible] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [loadingAttachments, setLoadingAttachments] = useState(true);

  // Enter animation
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Charger les pièces jointes complètes (même logique que CourrierEntrant)
  useEffect(() => {
    if (!courrier?.id) return undefined;

    let cancelled = false;
    setLoadingAttachments(true);
    setAttachments([]);

    const loadAttachments = async () => {
      try {
        const docs = await api.getCourrierDocuments(courrier.id);
        let boDocs = [];
        if (courrier.bo_courrier_id && userConnecte?.id) {
          try {
            boDocs = await api.boGetCourierDocs(courrier.bo_courrier_id, userConnecte.id);
          } catch {
            boDocs = [];
          }
        }

        if (cancelled) return;

        // Une seule pièce jointe affichée : le fichier courant de la table
        // documents est prioritaire (pièce jointe actuelle, éventuellement
        // remplacée via le formulaire). Les pièces BO ne s'affichent qu'en
        // l'absence de fichier documents — jamais les deux, quel que soit le rôle.
        const combined = (docs || []).length > 0
          ? docs.map((d) => ({ ...d, source: "standard" }))
          : (boDocs || []).map((d) => ({ ...d, source: "bo" }));

        if (combined.length === 0 && courrier.fichier) {
          combined.push(fallbackAttachment(courrier));
        }

        setAttachments(combined);
      } catch (err) {
        console.error("Erreur chargement pièces jointes:", err);
        if (!cancelled && courrier.fichier) {
          setAttachments([fallbackAttachment(courrier)]);
        }
      } finally {
        if (!cancelled) setLoadingAttachments(false);
      }
    };

    loadAttachments();
    return () => { cancelled = true; };
  }, [courrier?.id, courrier?.bo_courrier_id, courrier?.fichier, userConnecte?.id]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  if (!courrier) return null;

  const isEntrant = courrier.genre === "entrant";
  const statut    = getStatutConfig(courrier.statut);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300
                    ${visible ? "opacity-100" : "opacity-0"}`}
      />

      {/* Drawer panel */}
      <div
        className={`fixed top-0 end-0 h-full w-full max-w-md bg-white shadow-2xl z-50
                    flex flex-col transition-transform duration-300 ease-out
                    ${visible ? "translate-x-0" : (isRTL ? "-translate-x-full" : "translate-x-full")}`}
        style={{ borderRadius: isRTL ? "0 16px 16px 0" : "16px 0 0 16px" }}
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 bg-[#F8FAFC]"
             style={{ borderRadius: "16px 0 0 0" }}>
          <div className="flex-1 min-w-0 pe-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              {t("dashboard.detailTitle")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-bold
                                uppercase tracking-wider border
                                ${isEntrant
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-green-50 text-green-700 border-green-200"}`}>
                {isEntrant ? t("dashboard.incomingBadge") : t("dashboard.outgoingBadge")}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[11px]
                                font-bold uppercase tracking-wider border ${statut.cls}`}>
                {translateStatus(t, courrier.statut)}
              </span>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 p-2 rounded-xl text-gray-400 hover:text-gray-700
                       hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-[#F8FAFC]">

          {/* Info rows */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 divide-y divide-gray-50">

              <InfoRow icon={Hash} iconBg="bg-blue-50" iconColor="text-blue-600"
                label={t("common.reference")} value={courrier.reference} valueClass="text-blue-600 font-semibold" />

              {courrier.type && (
                <InfoRow icon={FileText} iconBg="bg-violet-50" iconColor="text-violet-600"
                  label={t("dashboard.type")} value={courrier.type} />
              )}

              <InfoRow
                icon={User} iconBg="bg-indigo-50" iconColor="text-indigo-600"
                label={isEntrant ? t("dashboard.sender") : t("dashboard.recipient")}
                value={isEntrant ? courrier.expediteur : courrier.destinataire}
              />

              <InfoRow icon={FileText} iconBg="bg-slate-50" iconColor="text-slate-600"
                label={t("common.object")} value={courrier.objet} valueClass="text-gray-700" />

              <InfoRow icon={Calendar} iconBg="bg-emerald-50" iconColor="text-emerald-600"
                label={isEntrant ? t("dashboard.receivedDate") : t("dashboard.sentDate")}
                value={courrier.date} />

              {courrier.date_saisie && (
                <InfoRow icon={Calendar} iconBg="bg-teal-50" iconColor="text-teal-600"
                  label={t("dashboard.registeredDate")} value={courrier.date_saisie} />
              )}

              {courrier.agent && (
                <InfoRow icon={Building} iconBg="bg-amber-50" iconColor="text-amber-600"
                  label={t("dashboard.registeredBy")} value={courrier.agent} />
              )}
            </div>
          </div>

          {/* ── Pièces jointes — même logique que CourrierEntrant/Sortant ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-50">
              <Download className="w-3.5 h-3.5 text-[#2563EB]" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                {t("common.attachments")}
              </span>
              <span className="ms-auto text-[10px] font-bold text-gray-400">
                {loadingAttachments
                  ? t("common.ellipsis")
                  : attachments.length === 1
                    ? t("common.fileCount", { n: attachments.length })
                    : t("common.fileCountPlural", { n: attachments.length })}
              </span>
            </div>
            <div className="px-5 py-4">
              {loadingAttachments ? (
                <div className="flex items-center justify-center py-6 gap-2">
                  <Loader2 className="w-5 h-5 text-[#2563EB] animate-spin" />
                  <p className="text-xs font-medium text-gray-400">{t("common.loadingAttachments")}</p>
                </div>
              ) : attachments.length > 0 ? (
                <div className="space-y-2">
                  {attachments.map((doc) => {
                    const filename = doc.nom_fichier;
                    const iconConfig = getFileIconConfig(filename);
                    const canPreview = doc.source === "standard"
                      && ["jpg","jpeg","png","gif","webp"].includes(iconConfig.ext);
                    const sizeLabel = formatFileSize(t, doc.taille_octets);

                    return (
                      <div
                        key={`${doc.source}-${doc.id || filename}`}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl
                                   border border-gray-100 bg-gray-50/80 hover:bg-blue-50
                                   hover:border-blue-100 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center
                                           flex-shrink-0 ${iconConfig.bg}`}>
                            <iconConfig.Icon className={`w-4 h-4 ${iconConfig.color}`} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate max-w-[180px]">
                              {removeBOPrefix(filename)}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5 uppercase font-bold">
                              {sizeLabel || iconConfig.ext || t("common.file")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {canPreview && (
                            <a
                              href={`${API_BASE_URL}/documents/download/${encodeURIComponent(filename)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500
                                         hover:bg-purple-600 hover:text-white hover:border-purple-600
                                         transition-colors shadow-sm"
                              title={t("common.preview")}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                if (doc.source === "bo") {
                                  await api.boDownloadDocument(doc.id, userConnecte.id, filename);
                                } else {
                                  await api.downloadFichier(filename);
                                }
                              } catch (err) {
                                alert(t("common.downloadError", { message: err.message }));
                              }
                            }}
                            className="p-2 rounded-lg bg-white border border-gray-200 text-[#2563EB]
                                       hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB]
                                       transition-colors shadow-sm"
                            title={t("common.download")}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <File className="w-8 h-8 text-gray-200" />
                  <p className="text-xs font-medium text-gray-400">{t("common.noAttachments")}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Observation ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-50">
              <Info className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t("common.observation")}</span>
            </div>
            <div className="px-5 py-4">
              {courrier.observation ? (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {courrier.observation}
                </p>
              ) : (
                <p className="text-sm text-gray-300 italic">{t("common.noObservation")}</p>
              )}
            </div>
          </div>

        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 bg-white"
             style={{ borderRadius: "0 0 0 16px" }}>
          <button
            onClick={handleClose}
            className="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm
                       font-semibold hover:bg-slate-700 transition-colors"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    </>
  );
}

/* ─── Dashboard ──────────────────────────────────────────────────── */

export function Dashboard({ userConnecte }) {
  const { t, locale } = useI18n();
  const [data, setData] = useState({
    stats_global: { entrants: 0, sortants: 0, en_attente: 0, traites: 0 },
    stats_mois:   { entrants: 0, sortants: 0, en_attente: 0, traites: 0 },
    repartition: [],
    monthly: [],
    recent: [],
  });
  const [loading, setLoading]               = useState(true);
  const [selectedCourrier, setSelectedCourrier] = useState(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const stats = await api.getDashboardStats({
          role:        userConnecte?.role,
          division_id: userConnecte?.division_id,
          service_id:  userConnecte?.service_id,
        });
        setData(stats);
      } catch (err) {
        console.error("Erreur stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [userConnecte]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-gray-500 font-medium text-lg">{t("dashboard.loading")}</p>
      </div>
    );
  }

  const isAgent = userConnecte?.role === "Agent";
  const isChefService  = userConnecte?.role === "Chef de service";
  const isChefDivision = userConnecte?.role === "Chef de division";

  const subtitle = isChefService
    ? t("dashboard.serviceLabel", { name: userConnecte.service })
    : isChefDivision
      ? t("dashboard.divisionLabel", { name: userConnecte.division })
      : t("dashboard.subtitle");

  const statsCards = [
    { label: t("dashboard.totalIncoming"), value: data.stats_global?.entrants || 0,   icon: Mail,         color: "blue"    },
    { label: t("dashboard.totalOutgoing"), value: data.stats_global?.sortants || 0,   icon: Send,         color: "green"   },
    { label: t("dashboard.pending"),     value: data.stats_global?.en_attente || 0, icon: Clock,        color: "amber"   },
    { label: t("dashboard.processed"),        value: data.stats_global?.traites || 0,    icon: CheckCircle,  color: "emerald" },
  ];

  const colorMap = {
    blue:    { card: "bg-blue-50 text-blue-600",    border: "border-blue-100" },
    green:   { card: "bg-green-50 text-green-600",  border: "border-green-100" },
    amber:   { card: "bg-amber-50 text-amber-600",  border: "border-amber-100" },
    emerald: { card: "bg-emerald-50 text-emerald-600", border: "border-emerald-100" },
  };

  return (
    <div className="p-6 space-y-6 bg-[#F8FAFC] min-h-screen">

      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{t("dashboard.title")}</h2>
          <p className="text-gray-500 mt-0.5 text-sm">{translateRole(t, userConnecte?.role)} — {subtitle}</p>
        </div>
        <div className="bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100
                        flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#2563EB]" />
          <span className="text-sm font-semibold text-gray-700">
            {new Date().toLocaleDateString(locale, { month: "long", year: "numeric" })}
          </span>
        </div>
      </div>

      {/* Stats cards */}
      {!isAgent && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map((stat) => {
            const Icon = stat.icon;
            const c    = colorMap[stat.color];
            return (
              <div key={stat.label}
                className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm
                           hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                      {stat.label}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${c.card}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Charts */}
      {!isAgent && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-4 h-4 text-[#2563EB]" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                {t("dashboard.monthlyFlow")}
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="mois" axisLine={false} tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                <Tooltip cursor={{ fill: "#f9fafb" }}
                  contentStyle={{ background: "#fff", border: "none", borderRadius: 12,
                                  boxShadow: "0 10px 15px -3px rgba(0,0,0,.1)" }} />
                <Legend iconType="circle" />
                <Bar dataKey="entrants" fill="#2563EB" name={t("dashboard.incoming")} radius={[6,6,0,0]} barSize={28} />
                <Bar dataKey="sortants" fill="#10b981" name={t("dashboard.outgoing")} radius={[6,6,0,0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                {t("dashboard.statusBreakdown")}
              </h3>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={data.repartition.map((item) => ({
                  ...item,
                  statutLabel: translateStatus(t, item.statut),
                }))} cx="50%" cy="50%"
                  innerRadius={60} outerRadius={100} paddingAngle={8}
                  dataKey="count" nameKey="statutLabel">
                  {data.repartition.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#fff", border: "none", borderRadius: 12,
                                         boxShadow: "0 10px 15px -3px rgba(0,0,0,.1)" }} />
                <Legend layout="horizontal" verticalAlign="bottom" align="center" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Courriers Récents ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#2563EB]/10 flex items-center justify-center">
              <Inbox className="w-3.5 h-3.5 text-[#2563EB]" />
            </div>
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              {t("dashboard.recentTitle")}
            </h3>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {t("dashboard.recentHint")}
            </span>
          </div>
          {data.recent?.length > 0 && (
            <span className="text-[11px] font-semibold text-gray-400">
              {t("dashboard.courrierCount", { n: data.recent.length })}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-start py-3 px-5 text-[10px] font-bold text-gray-400
                               uppercase tracking-widest">{t("dashboard.genre")}</th>
                <th className="text-start py-3 px-5 text-[10px] font-bold text-gray-400
                               uppercase tracking-widest">{t("dashboard.correspondent")}</th>
                <th className="text-start py-3 px-5 text-[10px] font-bold text-gray-400
                               uppercase tracking-widest">{t("common.observation")}</th>
                <th className="text-start py-3 px-5 text-[10px] font-bold text-gray-400
                               uppercase tracking-widest">{t("common.date")}</th>
                <th className="text-start py-3 px-5 text-[10px] font-bold text-gray-400
                               uppercase tracking-widest">{t("common.status")}</th>
                <th className="text-center py-3 px-5 text-[10px] font-bold text-gray-400
                               uppercase tracking-widest">{t("common.action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.recent && data.recent.length > 0 ? (
                data.recent.map((item) => {
                  const isEntrant = item.genre === "entrant";
                  const statut    = getStatutConfig(item.statut);
                  return (
                    <tr key={`${item.genre}-${item.id}`}
                      className="hover:bg-blue-50/30 transition-colors group">

                      {/* Genre */}
                      <td className="py-4 px-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-md
                                          text-[10px] font-bold uppercase tracking-wider border
                                          ${isEntrant
                                            ? "bg-blue-50 text-blue-700 border-blue-200"
                                            : "bg-green-50 text-green-700 border-green-200"}`}>
                          {isEntrant ? t("dashboard.incomingBadge") : t("dashboard.outgoingBadge")}
                        </span>
                      </td>

                      {/* Expéditeur / Destinataire */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                                           flex-shrink-0
                                           ${isEntrant ? "bg-blue-50" : "bg-green-50"}`}>
                            {isEntrant
                              ? <User className="w-3.5 h-3.5 text-blue-600" />
                              : <Building className="w-3.5 h-3.5 text-green-600" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">
                              {isEntrant ? item.expediteur : item.destinataire}
                            </p>
                            {item.reference && (
                              <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                {t("common.refShort", { value: item.reference })}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Observation */}
                      <td className="py-4 px-5 max-w-[200px]">
                        <p className="text-sm text-gray-500 truncate">
                          {item.observation || t("common.emDash")}
                        </p>
                      </td>

                      {/* Date */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-gray-300 flex-shrink-0" />
                          <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
                            {item.date}
                          </span>
                        </div>
                      </td>

                      {/* Statut */}
                      <td className="py-4 px-5">
                        {isEntrant ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md
                                            text-[10px] font-bold border ${statut.cls}`}>
                            {translateStatus(t, item.statut)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400 font-medium block" style={{ marginLeft: "24%" }}>X</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-4 px-5 text-center">
                        <button
                          onClick={() => setSelectedCourrier(item)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                      text-xs font-semibold border transition-all
                                      opacity-70 group-hover:opacity-100
                                      ${isEntrant
                                        ? "text-blue-600 border-blue-200 hover:bg-[#2563EB] hover:text-white hover:border-[#2563EB]"
                                        : "text-green-600 border-green-200 hover:bg-green-600 hover:text-white hover:border-green-600"}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{t("common.see")}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
                        <Inbox className="w-7 h-7 text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400 font-medium">{t("dashboard.emptyRecent")}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Slide-over Drawer */}
      {selectedCourrier && (
        <CourrierDrawer
          courrier={selectedCourrier}
          userConnecte={userConnecte}
          onClose={() => setSelectedCourrier(null)}
        />
      )}
    </div>
  );
}
