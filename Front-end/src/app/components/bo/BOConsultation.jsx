import { useState, useEffect } from "react";
import {
  ArrowLeft, FileText, Download, Clock, User,
  Calendar, Info, Building2, Hash,
  AlertCircle, Loader2,
} from "lucide-react";
import { api } from "../../../services/api";
import { useI18n } from "../../../i18n";
import { translateStatus, translateAction, formatFileSize, removeBOPrefix } from "../../../i18n/helpers";

const STATUT_CONFIG = {
  "Non affecté":        { color: "bg-yellow-100 text-yellow-800 border-yellow-200", dot: "bg-yellow-400" },
  "Affecté":            { color: "bg-blue-100 text-blue-800 border-blue-200",        dot: "bg-blue-500" },
  "Affecté au service": { color: "bg-purple-100 text-purple-800 border-purple-200",  dot: "bg-purple-500" },
  "Traité":             { color: "bg-green-100 text-green-800 border-green-200",      dot: "bg-green-500" },
};

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
        <Icon className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({ label, value, mono = false, wide = false }) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? "font-mono font-semibold" : "font-medium"}`}>
        {value || "—"}
      </p>
    </div>
  );
}

export default function BOConsultation({ courrierId, userConnecte, onBack }) {
  const { t } = useI18n();
  const [courrier, setCourrier] = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    setLoading(true);
    api.boGetCourrier(courrierId, userConnecte.id)
      .then(setCourrier)
      .catch(() => setError(t("bo.cannotLoad")))
      .finally(() => setLoading(false));
  }, [courrierId, userConnecte.id]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm text-gray-400">{t("common.loading")}</p>
      </div>
    );
  }

  if (error || !courrier) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <AlertCircle className="w-12 h-12 text-red-400" />
        <p className="text-gray-600">{error || t("bo.notFound")}</p>
        <button onClick={onBack}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> {t("bo.back")}
        </button>
      </div>
    );
  }

  const statut = STATUT_CONFIG[courrier.statut] || { color: "bg-gray-100 text-gray-700", dot: "bg-gray-400" };

  return (
    <div className="w-full space-y-4">

      {/* Bouton retour */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition">
        <ArrowLeft className="w-4 h-4" /> {t("bo.backToList")}
      </button>

      {/* ── En-tête : sens + numéro + référence uniquement ── */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl shadow-md px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                             bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider mb-3">
              <FileText className="w-3 h-3" /> {t("bo.mailBO")}
            </span>
            <p className="text-white text-2xl font-bold font-mono truncate">
              {courrier.numero}
            </p>
            {courrier.reference && (
              <p className="text-slate-300 text-sm mt-1">
                {t("common.refShort", { value: courrier.reference })}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                              text-xs font-bold border ${statut.color}`}>
              <span className={`w-2 h-2 rounded-full ${statut.dot}`} />
              {translateStatus(t, courrier.statut)}
            </span>
            <p className="text-slate-400 text-xs">
              {courrier.date_saisie?.slice(0, 16).replace("T", " ")}
            </p>
          </div>
        </div>
      </div>

      {/* ── Informations générales ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title={t("entrant.sender")} icon={User}>
          <div className="space-y-3">
            <Field label={t("bo.senderOrg")}  value={courrier.expediteur_nom} />
            <Field label={t("bo.mailType")}   value={courrier.type_courrier} />
          </div>
        </Section>

        <Section title={t("bo.dates")} icon={Calendar}>
          <div className="space-y-3">
            <Field label={t("bo.receivedDate")}
              value={courrier.date_reception} />
            <Field label={t("bo.assignmentDate")}
              value={courrier.date_affectation?.slice(0, 16).replace("T", " ")} />
          </div>
        </Section>

        <Section title={t("entrant.recipient")} icon={Building2}>
          <div className="space-y-3">
            <Field label={t("settings.division")} value={courrier.destinataire_division_nom} />
            <Field label={t("entrant.enteredBy")}
              value={`${courrier.agent_prenom || ""} ${courrier.agent_nom || ""}`.trim()} />
          </div>
        </Section>

        <Section title={t("bo.traceability")} icon={Info}>
          <div className="space-y-3">
            <Field label={t("bo.currentStatus")} value={translateStatus(t, courrier.statut)} />
            <Field label={t("bo.orderNumber")}   value={courrier.numero} mono />
          </div>
        </Section>
      </div>

      {/* ── Contenu : objet + observations ── */}
      <Section title={t("entrant.content")} icon={Hash}>
        <div className="space-y-4">
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
      </Section>

      {/* ── Pièces jointes ── */}
      {courrier.documents?.length > 0 && (
        <Section title={t("bo.attachmentsCount", { n: courrier.documents.length })} icon={FileText}>
          <div className="space-y-2">
            {courrier.documents.map((doc) => {
              const size = formatFileSize(t, doc.taille_octets);
              return (
                <div key={doc.id}
                  className="flex items-center justify-between p-3 bg-blue-50
                             rounded-xl border border-blue-100 hover:bg-blue-100 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center
                                    justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{removeBOPrefix(doc.nom_fichier)}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-2">
                        {size && <span>{size}</span>}
                        {doc.uploaded_at && <span>{doc.uploaded_at.slice(0, 16)}</span>}
                      </p>
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
        </Section>
      )}

      {/* ── Historique ── */}
      {courrier.historique?.length > 0 && (
        <Section title={t("bo.historyActions")} icon={Clock}>
          <div className="relative">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
            <div className="space-y-5 pl-1">
              {courrier.historique.map((h, i) => {
                const dotColor = h.action?.includes("Création")    ? "bg-green-500"
                  : h.action?.includes("Affectation") ? "bg-blue-500"
                  : h.action?.includes("Annulation")  ? "bg-orange-500"
                  : h.action?.includes("Modification")? "bg-yellow-500"
                  : "bg-gray-400";
                return (
                  <div key={i} className="flex gap-4 relative">
                    <div className={`w-6 h-6 rounded-full ${dotColor} flex items-center
                                     justify-center flex-shrink-0 z-10 mt-0.5`}>
                      <Info className="w-3 h-3 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center justify-between flex-wrap gap-1 mb-0.5">
                        <span className="text-xs font-bold text-gray-800">
                          {translateAction(t, h.action)}
                        </span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">
                          {h.created_at?.slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                      {h.details && (
                        <p className="text-xs text-gray-600 leading-relaxed">{h.details}</p>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1.5">
                        <User className="w-3 h-3" /> {h.prenom} {h.nom}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

    </div>
  );
}
