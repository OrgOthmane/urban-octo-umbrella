import {
  Plus, Filter, Download, X, FileText, Send, Calendar,
  User, Hash, Info, Paperclip, Loader2, Edit, Trash2,
  Building, Eye, Archive, Printer,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../../services/api";
import { useI18n, translateStatus, formatFileSize } from "../../i18n";
import { removeBOPrefix } from "../../i18n/helpers";
import PrintService from "../../services/PrintService";
import { Pagination } from "./Pagination";

const STATUT_OPTIONS = [
  { value: "EN_ATTENTE", label: "En attente" },
  { value: "TRAITE",     label: "Traité" },
];

function normalizeStatutValue(statut) {
  if (statut === "Traité" || statut === "TRAITE") return "TRAITE";
  if (statut === "En attente" || statut === "EN_ATTENTE") return "EN_ATTENTE";
  return statut || "EN_ATTENTE";
}

function getStatutLabel(t, statut) {
  const normalized = normalizeStatutValue(statut);
  if (normalized === "TRAITE") return t("status.processed");
  if (normalized === "EN_ATTENTE") return t("status.pending");
  return translateStatus(t, statut);
}

function isTraite(statut) {
  return normalizeStatutValue(statut) === "TRAITE";
}

function getStatutBadgeClass(statut) {
  return isTraite(statut)
    ? "bg-green-50 text-green-700 border-green-100"
    : "bg-amber-50 text-amber-700 border-amber-100";
}

function Field({ label, value, wide = false, highlight = false }) {
  const { t } = useI18n();
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-medium ${highlight ? "text-blue-700" : "text-gray-800"}`}>
        {value || t("common.emDash")}
      </p>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-100">
        <Icon className="w-3.5 h-3.5 text-blue-500" />
        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function CourrierDetailModal({ courrier, onClose, userConnecte }) {
  const { t } = useI18n();
  const [boDocs, setBoDocs] = useState([]);
  useEffect(() => {
    if (courrier?.bo_courrier_id && userConnecte?.id) {
      api.boGetCourierDocs(courrier.bo_courrier_id, userConnecte.id)
        .then(setBoDocs)
        .catch(() => setBoDocs([]));
    } else {
      setBoDocs([]);
    }
  }, [courrier?.bo_courrier_id, userConnecte?.id]);

  if (!courrier) return null;

  // Pièces jointes consolidées — UNE SEULE pièce affichée :
  // 1) Le fichier courant de la table documents (pièce jointe actuelle,
  //    éventuellement remplacée via le formulaire de modification) ;
  // 2) À défaut, la (ou les) pièce(s) jointe(s) saisie(s) au Bureau
  //    d'Ordre (bo_documents).
  // Jamais les deux en même temps : le remplacement remplace visuellement
  // l'ancienne pièce jointe — aucun doublon, quel que soit le rôle.
  const boItems = boDocs.map((doc) => ({
    key: `bo-${doc.id}`,
    id: doc.id,
    source: "bo",
    name: doc.nom_fichier,
    taille_octets: doc.taille_octets,
    uploaded_at: doc.uploaded_at,
  }));

  // Provenance du « fichier joint » exposé par la liste :
  //   fichier_source === "bo"        → le nom vient de bo_documents
  //   fichier_source === "documents" → le nom vient de documents
  // Sans cette information, un fichier du Bureau d'Ordre était envoyé vers
  // /documents/download/<nom> qui ne connaît que la table `documents`
  // → « Erreur téléchargement : Fichier introuvable ».
  const fichierCourant = courrier.fichier || null;
  let boMatch = null;
  if (fichierCourant) {
    if (courrier.fichier_bo_id) {
      boMatch = boItems.find((d) => d.id === courrier.fichier_bo_id)
             || { id: courrier.fichier_bo_id, source: "bo", name: fichierCourant };
    }
    if (!boMatch) {
      boMatch = boItems.find(
        (d) => d.name === fichierCourant || removeBOPrefix(d.name) === fichierCourant
      ) || null;
    }
  }
  const fichierVientDuBo = courrier.fichier_source === "bo" || (!courrier.fichier_source && !!boMatch);

  const piecesJointes = fichierCourant
    ? [fichierVientDuBo && boMatch
        ? { key: `bo-${boMatch.id}`, id: boMatch.id, source: "bo", name: fichierCourant,
            taille_octets: boMatch.taille_octets, uploaded_at: boMatch.uploaded_at }
        : { key: "classic", source: "classic", name: fichierCourant }]
    : boItems;

  const statutColor = isTraite(courrier.statut)
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-amber-100 text-amber-700 border-amber-200";

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* En-tête : sens + numéro + référence uniquement */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full
                                 bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider">
                  <FileText className="w-3 h-3" /> {t("entrant.incomingMail")}
                </span>
              </div>
              <p className="text-white font-bold text-xl font-mono leading-tight">
                {courrier.numero || t("common.emDash")}
              </p>
              {courrier.reference && (
                <p className="text-slate-300 text-sm mt-1">
                  {t("common.refShort", { value: courrier.reference })}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px]
                                font-bold border ${statutColor}`}>
                {getStatutLabel(t, courrier.statut)}
              </span>
              <button onClick={onClose}
                className="text-slate-400 hover:text-white hover:bg-white/10
                           p-1.5 rounded-lg transition">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-5 space-y-4">

          {/* Informations générales */}
          <Section title={t("entrant.generalInfo")} icon={Info}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Field label={t("entrant.sender")}        value={courrier.expediteur} />
              <Field label={t("entrant.receivedDate")} value={courrier.date} />
              <Field label={t("entrant.type")}              value={courrier.type} />
              <Field label={t("entrant.enteredBy")}         value={courrier.saisi_par} />
              <Field label={t("entrant.recipient")}      value={courrier.Destinataire || courrier.destinataire} wide />
            </div>
          </Section>

          {/* Contenu : objet + observation */}
          <Section title={t("entrant.content")} icon={Hash}>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t("common.object")}</p>
                <p className="text-sm font-semibold text-gray-800 bg-blue-50 rounded-xl
                               px-4 py-3 border border-blue-100 leading-relaxed whitespace-pre-line">
                  {courrier.objet || t("common.emDash")}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{t("common.observation")}</p>
                <p className="text-sm text-gray-600 bg-amber-50 rounded-xl px-4 py-3
                               border border-amber-100 whitespace-pre-line italic min-h-[2.5rem]">
                  {courrier.observation || t("common.noObservation")}
                </p>
              </div>
            </div>
          </Section>

          {/* Fichier joint : section unique (BO + classique, sans doublon) */}
          {piecesJointes.length > 0 && (
            <Section title={t("entrant.attachedFile")} icon={Paperclip}>
              <div className="space-y-2">
                {piecesJointes.map((pj) => {
                  const isBo = pj.source === "bo";
                  const size = isBo ? formatFileSize(t, pj.taille_octets) : "";
                  return (
                    <div key={pj.key}
                      className="flex items-center justify-between p-3 bg-blue-50
                                 border border-blue-100 rounded-xl hover:bg-blue-100 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center
                                        justify-center flex-shrink-0">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {removeBOPrefix(pj.name)}
                          </p>
                          {isBo && (size || pj.uploaded_at) && (
                            <p className="text-[10px] text-gray-400">
                              {size && <span>{size}</span>}
                              {pj.uploaded_at && <span className="ml-2">{pj.uploaded_at.slice(0,16)}</span>}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            if (isBo) {
                              await api.boDownloadDocument(pj.id, userConnecte.id, pj.name);
                            } else {
                              await api.downloadFichier(pj.name);
                            }
                          } catch (err) {
                            alert(t("common.downloadError", { message: err.message }));
                          }
                        }}
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
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-white border-t border-gray-100 flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 bg-slate-800 text-white rounded-xl hover:bg-slate-700
                       transition text-sm font-semibold">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FormulaireModification
───────────────────────────────────────────── */
function FormulaireModification({ courrier, agent, onClose, onSubmit }) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    // ID interne unique — sans lui, le backend retombe sur le `numero` (non
    // unique) et peut planter (« Unread result ») ou modifier le mauvais courrier.
    id: courrier.dbId ?? courrier.id,
    oldReference:   courrier.id,
    reference:      courrier.reference || "",
    numero:         courrier.numero || courrier.id,
    expediteur:     courrier.expediteur || "",
    // Le service n'est PAS modifiable ici : l'affectation / le changement de
    // service se fait uniquement via le bouton dédié « Affecter au service »
    // (zone à droite du statut dans la liste).
    dateReception:  courrier.date || new Date().toISOString().split("T")[0],
    // Préremplissage depuis les données saisies par l'Agent du Bureau d'Ordre
    // (selects : valeurs sous forme de chaîne pour correspondre aux options).
    typeCourrierId: courrier.typeCourrierId ? String(courrier.typeCourrierId) : "",
    objet:          courrier.objet || "",
    observation:    courrier.observation || "",
    fichier:        courrier.fichier || null,
    _fichierFile:   null,
  });
  const [typesCourrier, setTypesCourrier] = useState([]);
  const [typeTiersList, setTypeTiersList] = useState([]);
  const [tiersList,     setTiersList]     = useState([]);
  // Type d'expéditeur prérempli depuis le courrier → charge la liste des
  // tiers correspondante et dégrise le select « Expéditeur ».
  const [selectedTypeId, setSelectedTypeId] = useState(
    courrier.type_tiers_id ? String(courrier.type_tiers_id) : ""
  );
  useEffect(() => { api.getTypesCourrier().then(setTypesCourrier).catch(console.error); }, []);
  useEffect(() => { api.getTypeTiers().then(setTypeTiersList).catch(console.error); }, []);
  useEffect(() => {
    if (selectedTypeId) api.getTiers(selectedTypeId).then(setTiersList).catch(console.error);
    else setTiersList([]);
  }, [selectedTypeId]);

  const fileInputRef = useRef(null);
  const handleChange    = (e) => setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));
  const handleTypeChange = (e) => { setSelectedTypeId(e.target.value); setFormData((p) => ({ ...p, expediteur: "" })); };
  // _fichierFile : File object du NOUVEAU fichier choisi (envoyé en multipart
  // après la mise à jour). Tant qu'aucun nouveau fichier n'est sélectionné,
  // le fichier existant est conservé — aucune resélection n'est exigée.
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    setFormData((p) => ({ ...p, fichier: f ? f.name : (courrier.fichier || null), _fichierFile: f || null }));
  };
  // Revenir au fichier existant après avoir choisi un nouveau fichier
  const handleKeepCurrentFile = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFormData((p) => ({ ...p, fichier: courrier.fichier || null, _fichierFile: null }));
  };
  const handleSubmit = async (e) => { e.preventDefault(); try { await onSubmit(formData); onClose(); } catch (err) { console.error("Erreur modification:", err); } };

  return (
    <div className="fixed inset-0 bg-gray-950/45 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-xl rounded-[28px] shadow-2xl shadow-gray-950/20 ring-1 ring-gray-900/5 max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        {/* En-tête clair et sobre : icône en pastille dégradée + titre fin */}
        <div className="px-7 pt-6 pb-5 flex items-start justify-between border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-b from-amber-50 to-amber-100 ring-1 ring-amber-200/70 flex items-center justify-center shrink-0">
              <Edit className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-gray-900 tracking-tight">{t("entrant.editTitle")}</h3>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                {courrier.numero}{courrier.reference ? ` · ${t("entrant.folderRef")} ${courrier.reference}` : ""}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-500 flex items-center justify-center transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto bg-[#f5f5f7] px-7 py-6 space-y-4">
            {/* Groupe — Identification : carte blanche arrondie, style iOS */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-900/5 shadow-sm shadow-gray-950/5 p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-amber-500" /> {t("entrant.orderNumber")}
                  </label>
                  <input type="text" name="numero" required value={formData.numero} onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <FileText className="w-3 h-3 text-amber-500" /> {t("entrant.folderRef")}
                  </label>
                  <input type="text" name="reference" required value={formData.reference} onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-amber-500" /> {t("entrant.receivedDate")}
                  </label>
                  <input type="date" name="dateReception" required value={formData.dateReception} onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Info className="w-3 h-3 text-amber-500" /> {t("entrant.mailType")}
                  </label>
                  <select name="typeCourrierId" required value={formData.typeCourrierId} onChange={handleChange}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all">
                    <option value="">{t("common.choose")}</option>
                    {typesCourrier.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Groupe — Expéditeur. Le service n'est PAS modifiable depuis ce
                formulaire : il se gère uniquement via le bouton dédié
                « Affecter au service » (à droite du statut dans la liste). */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-900/5 shadow-sm shadow-gray-950/5 p-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <Building className="w-3 h-3 text-amber-500" /> {t("entrant.senderType")}
                  </label>
                  <select value={selectedTypeId} onChange={handleTypeChange}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all">
                    <option value="">{t("common.choose")}</option>
                    {typeTiersList.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                    <User className="w-3 h-3 text-amber-500" /> {t("entrant.sender")}
                  </label>
                  <select name="expediteur" required value={formData.expediteur} onChange={handleChange}
                    disabled={!selectedTypeId}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all disabled:bg-gray-100 disabled:text-gray-400">
                    <option value="">{t("common.choose")}</option>
                    {tiersList.map((t) => <option key={t.id} value={t.nom}>{t.nom}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Groupe — Contenu */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-900/5 shadow-sm shadow-gray-950/5 p-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                  <Edit className="w-3 h-3 text-amber-500" /> {t("common.object")}
                </label>
                <textarea name="objet" required value={formData.objet} onChange={handleChange} rows="3"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200/80 rounded-xl text-sm text-gray-900 outline-none focus:bg-white focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10 transition-all resize-y" />
              </div>
            </div>

            {/* Groupe — Pièce jointe : carte dédiée avec aperçu du fichier */}
            <div className="bg-white rounded-2xl ring-1 ring-gray-900/5 shadow-sm shadow-gray-950/5 p-5 space-y-3">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <Paperclip className="w-3 h-3 text-amber-500" /> {t("entrant.document")}
              </label>
              <input type="file" onChange={handleFileChange} ref={fileInputRef}
                className="w-full text-sm text-gray-500 file:mr-3 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-xs file:font-semibold file:bg-gray-900 file:text-white hover:file:bg-gray-800 active:file:bg-gray-700 cursor-pointer" />
              {formData._fichierFile ? (
                // Nouveau fichier sélectionné : il remplacera le fichier actuel
                // à l'enregistrement. Possibilité de revenir au fichier existant.
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 rounded-2xl ring-1 ring-amber-200">
                  <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-amber-200 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-800">Nouveau fichier sélectionné</p>
                    <p className="text-[11px] text-amber-700/80 truncate">{formData.fichier}</p>
                  </div>
                  <button type="button" onClick={handleKeepCurrentFile}
                    className="text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 whitespace-nowrap shrink-0">
                    Conserver le fichier actuel
                  </button>
                </div>
              ) : formData.fichier ? (
                // Fichier existant prérempli : conservé par défaut — aucun
                // nouveau fichier n'est exigé pour enregistrer le formulaire.
                <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-2xl ring-1 ring-gray-200">
                  <div className="w-9 h-9 rounded-xl bg-white ring-1 ring-gray-200 flex items-center justify-center shrink-0">
                    <Paperclip className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-700">Fichier joint actuel</p>
                    <p className="text-[11px] text-gray-500 truncate">{formData.fichier}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 ring-1 ring-emerald-200/70 rounded-full px-2.5 py-1 whitespace-nowrap shrink-0">
                    conservé par défaut
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Pied : boutons pilule flottants, séparés du contenu */}
          <div className="px-7 py-5 bg-white/90 backdrop-blur border-t border-gray-100 flex items-center justify-end gap-3">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 rounded-full bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 text-sm font-semibold transition-colors">
              {t("common.cancel")}
            </button>
            <button type="submit"
              className="px-6 py-2.5 rounded-full bg-gradient-to-b from-amber-500 to-amber-600 hover:to-amber-700 text-white text-sm font-semibold shadow-lg shadow-amber-600/30 transition-all active:scale-[0.98]">
              {t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   FormulaiReponse
───────────────────────────────────────────── */
function FormulaiReponse({ courrier, agent, onClose, onSubmit }) {
  const { t } = useI18n();
  const [formData, setFormData] = useState({
    numero: "",
    reference:      courrier.reference || "",
    destinataire:   courrier.expediteur || "",
    expediteur:     `${agent.division || ""} | ${agent.service || ""}`,
    dateEnvoi:      new Date().toISOString().split("T")[0],
    typeCourrierId: "",
    objet: "", observation: "", fichier: null,
    identiteAgent:  `${agent.prenom || ""} ${agent.nom || ""}`,
    reponse_a_id:   courrier.dbId || null,
  });
  const [typesCourrier, setTypesCourrier] = useState([]);
  const [selectedTypeTiersId] = useState(courrier.type_tiers_id || "");

  useEffect(() => {
    api.getTypesCourrier().then(setTypesCourrier).catch(console.error);
  }, []);

  const handleChange    = (e) => setFormData((p) => ({ ...p, [e.target.name]: e.target.value }));
  const handleFileChange = (e) => {
    const f = e.target.files[0];
    // Stocker le nom pour l'affichage ET le File object pour l'upload réel
    setFormData((p) => ({ ...p, fichier: f ? f.name : null, _fichierFile: f || null }));
  };
  const handleSubmit    = (e) => { e.preventDefault(); if (onSubmit) onSubmit(formData); };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col font-sans">
        <div className="bg-indigo-700 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <Send className="w-5 h-5" />
            <div>
              <h3 className="text-lg font-bold uppercase tracking-tight">{t("entrant.replyTitle")}</h3>
              <p className="text-[10px] text-indigo-100 font-medium opacity-80">{t("entrant.originRef", { value: courrier.reference })}</p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-white/10 p-1 rounded-lg transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 bg-gray-50/50">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Hash className="w-3 h-3" /> {t("entrant.number")}
              </label>
              <input type="text" name="numero" required value={formData.numero} onChange={handleChange}
                placeholder={t("entrant.numberPlaceholder")}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> {t("entrant.sendDate")}
              </label>
              <input type="date" name="dateEnvoi" required value={formData.dateEnvoi} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Info className="w-3 h-3" /> {t("entrant.folderRef")}
              </label>
              <input type="text" name="reference" value={formData.reference} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                {t("entrant.mailType")}
              </label>
              <select name="typeCourrierId" required value={formData.typeCourrierId} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm cursor-pointer">
                <option value="">{t("common.chooseType")}</option>
                {typesCourrier.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select>
            </div>
          </div>
          <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-50 pb-2">
              {t("entrant.correspondents")}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">{t("entrant.senderUs")}</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50/50 rounded-lg text-xs font-bold text-indigo-700 border border-indigo-100">
                  <Building className="w-3.5 h-3.5" /> {formData.expediteur}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase">{t("entrant.recipientThem")}</label>
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50/50 rounded-lg text-xs font-bold text-emerald-700 border border-emerald-100">
                  <User className="w-3.5 h-3.5" /> {formData.destinataire}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t("entrant.replyObject")}</label>
            <textarea name="objet" required value={formData.objet} onChange={handleChange} rows="3"
              placeholder={t("entrant.replyObjectPlaceholder")}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm resize-y" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{t("common.observations")}</label>
            <input type="text" name="observation" value={formData.observation} onChange={handleChange}
              placeholder={t("entrant.remarksPlaceholder")}
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Paperclip className="w-3 h-3" /> {t("entrant.attachedFile")}
            </label>
            <input type="file" onChange={handleFileChange}
              className="w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-6 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 file:cursor-pointer file:transition-colors bg-white p-1 rounded-2xl border border-dashed border-gray-300" />
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-500 hover:bg-white transition-all">
              {t("common.cancel")}
            </button>
            <button type="submit"
              className="px-8 py-2.5 bg-indigo-700 text-white rounded-xl text-sm font-black shadow-lg shadow-indigo-200 hover:bg-indigo-800 active:scale-95 transition-all">
              {t("entrant.sendReply")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   CourrierEntrant  (composant principal)
───────────────────────────────────────────── */
export function CourrierEntrant({ userConnecte }) {
  const { t } = useI18n();
  const agent = userConnecte || {};

  /* ── onglets : plus d'onglet Bureau d'Ordre — liste unique ── */
  const [activeTab] = useState("standard");

  /* ── état de la liste ── */
  const [searchTerm,  setSearchTerm]  = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters,     setFilters]     = useState({ dateDebut: "", dateFin: "", statut: "", expediteur: "" });
  const [courriers,   setCourriers]   = useState([]);
  const [loading,     setLoading]     = useState(true);

  /* ── état des modales ── */
  const [selectedCourrier,    setSelectedCourrier]    = useState(null);
  const [showDetailModal,     setShowDetailModal]     = useState(false);
  const [showModificationForm,setShowModificationForm]= useState(false);
  const [showReplyForm,       setShowReplyForm]       = useState(false);
  /* Modal affectation au service (Chef de Division) */
  const [affectServiceModal,  setAffectServiceModal]  = useState(null); // courrier
  const [services,            setServices]            = useState([]);
  const [selectedService,     setSelectedService]     = useState("");
  const [affectingService,    setAffectingService]    = useState(false);
  const [updatingStatus,      setUpdatingStatus]      = useState(null);

  /* ── rôles ── */
  const isChefDivision = agent?.role === "Chef de division";
  const isChefService  = agent?.role === "Chef de service";
  const isAgent        = agent?.role === "Agent";

  /* ── chargement des courriers (module principal) ── */
  const [pagination, setPagination] = useState({ page: 1, per_page: 10, total: 0, total_pages: 0 });

  // Pagination côté SERVEUR : réutilise le contrat existant de l'API
  // (GET /courrier_entrant?page=&per_page= -> { data, total, page, per_page, total_pages }).
  const fetchCourriers = async (page = 1, perPage = pagination.per_page) => {
    setLoading(true);
    try {
      const response = await api.getCourriersEntrants({
        role:        agent.role,
        service_id:  agent.service_id,
        division_id: agent.division_id,
        page:        page,
        per_page:    perPage,
      });
      let courriersData = response.data || response || [];
      let currentPage = response.page || page;

      // Anti page vide : si la page demandée est vide alors qu'une page précédente
      // existe (ex. après suppression/traitement du dernier élément de la page),
      // on recharge la page précédente pour éviter un écran vide inutile.
      if (courriersData.length === 0 && currentPage > 1) {
        const prevPage = currentPage - 1;
        const prevResp = await api.getCourriersEntrants({
          role:        agent.role,
          service_id:  agent.service_id,
          division_id: agent.division_id,
          page:        prevPage,
          per_page:    perPage,
        });
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
      console.error("Erreur chargement courriers:", err);
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

  /* Charger les courriers module principal */
  useEffect(() => {
    fetchCourriers();
  }, [agent.role, agent.service_id, agent.division_id]);

  /* ── filtrage côté client (optimisé) ── */
  const filteredCourriers = useMemo(() => {
    // Avec pagination côté serveur, le filtrage côté client est limité à la page actuelle
    // Idéalement, déplacer les filtres vers le backend pour de meilleures performances
    return courriers.filter((c) => {
      const q = searchTerm.toLowerCase();
      const matchSearch = !searchTerm
        || c.reference?.toLowerCase().includes(q)
        || c.expediteur?.toLowerCase().includes(q)
        || c.objet?.toLowerCase().includes(q)
        || c.numero?.toLowerCase().includes(q);
      return matchSearch
        && (!filters.statut     || c.statut === filters.statut)
        && (!filters.expediteur || c.expediteur?.toLowerCase().includes(filters.expediteur.toLowerCase()))
        && (!filters.dateDebut  || new Date(c.date) >= new Date(filters.dateDebut))
        && (!filters.dateFin    || new Date(c.date) <= new Date(filters.dateFin));
    });
  }, [courriers, searchTerm, filters]);

  /* ── handlers ── */
  const handleStatusChange = async (id, newStatus) => {
    const normalized = normalizeStatutValue(newStatus);
    setUpdatingStatus(id);
    try {
      await api.updateCourrierStatus(id, normalized);
      setCourriers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, statut: normalized } : c))
      );
    } catch (err) {
      console.error("Erreur statut:", err);
      alert(t("entrant.statusUpdateError", { message: err.message }));
    } finally {
      setUpdatingStatus(null);
    }
  };
  const handleArchiveCourrier = async (id) => {
    const courrier = courriers.find(c => c.id === id);
    if (!courrier) return;
    
    if (!isTraite(courrier.statut)) {
      alert(t("entrant.archiveNotProcessedError"));
      return;
    }
    
    if (!window.confirm(t("entrant.archiveConfirm"))) return;
    try {
      await api.archiveCourrierEntrant(id, true, userConnecte?.id);
      fetchCourriers(pagination.page);
    } catch (err) { alert(t("entrant.archiveError", { message: err.message })); }
  };

  const handleModificationSubmit = async (formData) => {
    try {
      // Le File object ne part pas dans le JSON — il est envoyé séparément
      // en multipart après la mise à jour des champs texte.
      const { _fichierFile, ...dataWithoutFile } = formData;
      await api.updateCourrierEntrant(formData.id, dataWithoutFile);

      // Remplacement de la pièce jointe : si un NOUVEAU fichier a été choisi,
      // /documents/upload remplace la ligne documents existante (upsert sur
      // courrier_id + is_export = 0). Sinon, le fichier actuel est conservé.
      if (_fichierFile) {
        try {
          await api.uploadFichier(formData.id, _fichierFile);
        } catch (uploadErr) {
          console.error("Erreur upload pièce jointe :", uploadErr);
          alert(t("entrant.editError", { message: uploadErr.message }));
        }
      }

      fetchCourriers(pagination.page); // Recharger la page actuelle
    } catch (err) {
      console.error("Erreur modification:", err);
      alert(t("entrant.editError", { message: err.message }));
    }
  };

  const handleDeleteCourrier = async (id) => {
    if (!window.confirm(t("entrant.deleteConfirm"))) return;
    try {
      await api.deleteCourrierEntrant(id);
      fetchCourriers(pagination.page);
    } catch (err) { console.error("Erreur suppression:", err); }
  };

  /* ── rendu ── */
  return (
    <div className="p-6 space-y-6">

      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t("entrant.title")}</h2>
          <p className="text-sm text-gray-500">{t("entrant.subtitle")}</p>
        </div>
      </div>

          {/* Barre de recherche + filtres */}
          <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[250px]">
                <input
                  type="text"
                  placeholder={t("common.quickSearch")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-4 pr-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-bold transition-all ${
                  showFilters
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Filter className="w-4 h-4" /> {t("common.filters")} {showFilters ? t("common.filtersActive") : ""}
              </button>
            </div>
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{t("common.status")}</label>
                  <select value={filters.statut} onChange={(e) => setFilters({ ...filters, statut: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm">
                    <option value="">{t("common.all")}</option>
                    <option value="EN_ATTENTE">{t("status.pending")}</option>
                    <option value="TRAITE">{t("status.processed")}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{t("entrant.sender")}</label>
                  <input type="text" placeholder={t("common.namePlaceholder")} value={filters.expediteur}
                    onChange={(e) => setFilters({ ...filters, expediteur: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{t("common.from")}</label>
                  <input type="date" value={filters.dateDebut}
                    onChange={(e) => setFilters({ ...filters, dateDebut: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-400 uppercase">{t("common.to")}</label>
                  <input type="date" value={filters.dateFin}
                    onChange={(e) => setFilters({ ...filters, dateFin: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
            )}
          </div>

          {/* Tableau des courriers */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">{t("common.loading")}</p>
              </div>
            ) : filteredCourriers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 italic">
                {t("entrant.empty")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("entrant.refNum")}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("entrant.sender")}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("common.observation")}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">{t("common.status")}</th>
                      <th className="py-3 px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCourriers.map((courrier) => (
                      <tr key={courrier.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-indigo-700">{courrier.reference || "N/A"}</span>
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                              N° {courrier.numero || courrier.id}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-gray-900">{courrier.expediteur}</span>
                            <span className="text-[10px] text-gray-400">{courrier.date}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-sm text-gray-600 truncate max-w-xs">{courrier.observation || "—"}</p>
                        </td>
                        <td className="py-4 px-4">
                          {/* Traiter (statut) : Agent normal + Chef de service (même logique) */}
                          {(isAgent || isChefService) ? (
                            <select
                              value={normalizeStatutValue(courrier.statut)}
                              disabled={updatingStatus === courrier.id}
                              onChange={(e) => handleStatusChange(courrier.id, e.target.value)}
                              className={`px-2 py-1 rounded text-[10px] font-bold uppercase border
                                          cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400
                                          disabled:opacity-50 disabled:cursor-wait
                                          ${getStatutBadgeClass(courrier.statut)}`}
                              title={t("entrant.changeStatus")}
                            >
                              {STATUT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border
                                              ${getStatutBadgeClass(courrier.statut)}`}>
                              {getStatutLabel(t, courrier.statut)}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex justify-center items-center gap-2">
                            {/* Consulter */}
                            <button
                              onClick={() => { setSelectedCourrier(courrier); setShowDetailModal(true); }}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title={t("common.details")}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {/* Exporter PDF */}
                            <button
                              onClick={async () => {
                                try { await api.exportCourrier(courrier.dbId ?? courrier.id, userConnecte?.id, courrier.numero); }
                                catch (err) { alert(t("common.exportError", { message: err.message })); }
                              }}
                              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title={t("common.exportPdf")}
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            {/* Imprimer */}
                            <button
                              onClick={async () => {
                                try { await PrintService.printById(courrier.dbId ?? courrier.id, userConnecte?.id); }
                                catch (err) { alert(t("common.printError", { message: err.message })); }
                              }}
                              className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
                              title={t("common.print")}
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            {/* Modifier */}
                            {isChefDivision && (
                              <button
                                onClick={() => { setSelectedCourrier(courrier); setShowModificationForm(true); }}
                                className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                title={t("common.edit")}
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            )}
                            {/* Supprimer */}
                            {isChefDivision && (
                              <button
                                onClick={() => handleDeleteCourrier(courrier.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                title={t("common.delete")}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                            {/* Répondre — Agent normal + Chef de service (même logique) */}
                            {(isAgent || isChefService) && !isTraite(courrier.statut) && (
                              <button
                                onClick={() => { setSelectedCourrier(courrier); setShowReplyForm(true); }}
                                className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
                                title={t("entrant.reply")}
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {/* Archiver — Chef de division, Agent normal + Chef de service */}
                            {(isChefDivision || isAgent || isChefService) && (
                              <button
                                onClick={() => handleArchiveCourrier(courrier.id)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                title={t("entrant.archive")}
                              >
                                <Archive className="w-4 h-4" />
                              </button>
                            )}
                            {/* Affecter au service — Chef de Division uniquement */}
                            {isChefDivision && courrier.bo_courrier_id && courrier.bo_statut !== "Affecté au service" && (
                              <button
                                onClick={() => {
                                  setAffectServiceModal(courrier);
                                  setSelectedService("");
                                  api.boChefGetServices(userConnecte.id, agent.division_id)
                                    .then(setServices)
                                    .catch(console.error);
                                }}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title={t("entrant.assignToService")}
                              >
                                <Send className="w-4 h-4" />
                              </button>
                            )}
                            {/* Badge + Annuler affectation — si déjà affecté au service */}
                            {isChefDivision && courrier.bo_statut === "Affecté au service" && (
                              <>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full
                                                  text-[10px] font-bold bg-green-100 text-green-700
                                                  border border-green-200 whitespace-nowrap">
                                  ✓ {t("entrant.assignedBadge")}
                                  {courrier.bo_service_affecte && (
                                    <span className="ml-1 text-green-600">
                                      — {courrier.bo_service_affecte}
                                    </span>
                                  )}
                                </span>
                                <button
                                  onClick={async () => {
                                    if (!window.confirm(t("entrant.cancelAssignmentConfirm", { name: courrier.bo_service_affecte || t("entrant.thisService") }))) return;
                                    try {
                                      await api.boChefAnnulerAffectationService(
                                        courrier.bo_courrier_id,
                                        userConnecte.id,
                                        agent.division_id
                                      );
                                      fetchCourriers();
                                    } catch (e) {
                                      alert(e?.message || t("entrant.cancelError"));
                                    }
                                  }}
                                  className="p-1.5 text-orange-500 hover:bg-orange-50 rounded
                                             transition-colors"
                                  title={t("entrant.cancelAssignment")}
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
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

      {/* ─── Modales ─── */}

      {/* Modale : affectation au service (Chef de Division) */}
      {affectServiceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-800">{t("entrant.assignTitle")}</h3>
                <p className="text-xs text-gray-500 truncate max-w-48">
                  {affectServiceModal.reference || affectServiceModal.numero}
                </p>
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                {t("entrant.targetService")} <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                           focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t("entrant.selectService")}</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>{s.nom}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {t("entrant.assignHint")}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setAffectServiceModal(null); setSelectedService(""); }}
                disabled={affectingService}
                className="flex-1 py-2 text-sm font-medium border border-gray-300
                           rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={affectingService || !selectedService}
                onClick={async () => {
                  if (!selectedService) return;
                  setAffectingService(true);
                  try {
                    // Appeler la route BO pour affecter au service
                    if (affectServiceModal.bo_courrier_id) {
                      await api.boChefAffecterService(
                        affectServiceModal.bo_courrier_id,
                        userConnecte.id,
                        agent.division_id,
                        selectedService
                      );
                    } else {
                      // Courrier classique (pas BO) : mettre à jour service via updateCourrierEntrant
                      const serviceName = services.find(s => String(s.id) === String(selectedService))?.nom;
                      if (serviceName) {
                        await api.updateCourrierEntrant(affectServiceModal.id, {
                          destinataire:  serviceName,
                          objet:         affectServiceModal.objet,
                          dateReception: affectServiceModal.date,
                        });
                      }
                    }
                    setAffectServiceModal(null);
                    setSelectedService("");
                    fetchCourriers();
                  } catch (e) {
                    alert(e?.message || t("entrant.assignError"));
                  } finally {
                    setAffectingService(false);
                  }
                }}
                className="flex-1 py-2 text-sm font-medium text-white bg-blue-600
                           rounded-lg hover:bg-blue-700 disabled:opacity-50
                           disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {affectingService
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send className="w-4 h-4" />}
                {affectingService ? t("entrant.assigning") : t("entrant.assign")}
              </button>
            </div>
          </div>
        </div>
      )}



      {showDetailModal && selectedCourrier && (
        <CourrierDetailModal
          courrier={selectedCourrier}
          userConnecte={userConnecte}
          onClose={() => { setShowDetailModal(false); setSelectedCourrier(null); }}
        />
      )}

      {showModificationForm && selectedCourrier && (
        <FormulaireModification
          courrier={selectedCourrier}
          agent={agent}
          onClose={() => { setShowModificationForm(false); setSelectedCourrier(null); }}
          onSubmit={handleModificationSubmit}
        />
      )}

      {showReplyForm && selectedCourrier && (
        <FormulaiReponse
          courrier={selectedCourrier}
          agent={agent}
          onClose={() => { setShowReplyForm(false); setSelectedCourrier(null); }}
          onSubmit={async (data) => {
            try {
              // Étape 1 : créer le courrier sortant (sans fichier)
              const { _fichierFile, fichier: _nomFichier, ...dataWithoutFile } = data;
              const result = await api.createCourrierSortant(dataWithoutFile);

              // Étape 2 : uploader le fichier si présent, avec le dbId retourné
              if (_fichierFile && result?.dbId) {
                try {
                  await api.uploadFichier(result.dbId, _fichierFile);
                } catch (uploadErr) {
                  // Le courrier est créé, seul l'upload a échoué — on alerte sans bloquer
                  console.error("Erreur upload pièce jointe :", uploadErr);
                  alert(t("entrant.replyError", { message: uploadErr.message }));
                }
              }

              // Marquer le courrier entrant original comme « Traité » en utilisant
              // son ID interne unique (dbId/id) — jamais le `numero`, qui n'est pas
              // unique et provoquerait « Courrier introuvable » ou une mauvaise cible.
              const courrierEntrantId = selectedCourrier.dbId ?? selectedCourrier.id;
              handleStatusChange(courrierEntrantId, "TRAITE");
              setShowReplyForm(false);
              setSelectedCourrier(null);
              fetchCourriers();
            } catch (err) {
              alert(t("entrant.replyError", { message: err.message }));
            }
          }}
        />
      )}

    </div>
  );
}
