import { useState, useEffect, useRef } from "react";
import {
  Save, X, Upload, Trash2, FileText, AlertCircle,
  CheckCircle, ChevronRight, Home,
} from "lucide-react";
import { api } from "../../../services/api";
import { useI18n } from "../../../i18n";
import { formatFileSize, removeBOPrefix } from "../../../i18n/helpers";

const ALLOWED_EXT = [".pdf",".doc",".docx",".jpg",".jpeg",".png"];

export default function BONouveauCourrier({ userConnecte, editId, onSuccess, onCancel }) {
  const { t } = useI18n();
  const isEdit = Boolean(editId);

  const [refData, setRefData]   = useState({ types_courrier:[], tiers:[], divisions:[], types_tiers:[] });
  const [loading, setLoading]   = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [toast,   setToast]     = useState(null);
  const [errors,  setErrors]    = useState({});
  const fileInputRef = useRef();

  const [form, setForm] = useState({
    numero: "", reference: "",
    // Même logique que le Chef de Division : le Type d'expéditeur (type_tiers)
    // est choisi en premier, et l'Expéditeur (tiers) en dépend.
    type_tiers_id: "",
    expediteur_id: "",
    type_courrier_id: "",
    date_reception: "",
    objet: "", observations: "",
  });
  const [newFiles,     setNewFiles]     = useState([]);
  const [existingDocs, setExistingDocs] = useState([]);

  useEffect(() => {
    api.boGetRefData().then(setRefData).catch(console.error);
  }, []);

  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    api.boGetCourrier(editId, userConnecte.id)
      .then((c) => {
        setForm({
          numero:           c.numero              || "",
          reference:        c.reference           || "",
          // Préchargement : le type n'est pas stocké dans bo_courriers, on le
          // dérive du tiers courant (voir selectedTypeTiersId ci-dessous).
          type_tiers_id:    "",
          expediteur_id:    c.expediteur_tiers_id || "",
          type_courrier_id: c.type_courrier_id    || "",
          date_reception:   c.date_reception      || "",
          objet:            c.objet               || "",
          observations:     c.observations        || "",
        });
        setExistingDocs(c.documents || []);
      })
      .catch(() => showToast("error", t("bo.loadMailError")))
      .finally(() => setLoading(false));
  }, [editId, userConnecte.id]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => { const n = {...p}; delete n[name]; return n; });
  };

  // Même logique que le Chef de Division : changer de type réinitialise
  // l'expéditeur, car la liste des expéditeurs dépend du type sélectionné.
  const handleTypeChange = (e) => {
    const { value } = e.target;
    setForm((p) => ({ ...p, type_tiers_id: value, expediteur_id: "" }));
  };

  const handleFileAdd = (e) => {
    const selected = Array.from(e.target.files);
    const valid = selected.filter((f) => {
      const ext = "." + f.name.split(".").pop().toLowerCase();
      return ALLOWED_EXT.includes(ext);
    });
    if (valid.length < selected.length) showToast("error", t("bo.badFileType"));
    setNewFiles((p) => [...p, ...valid]);
    e.target.value = "";
  };

  const removeNewFile = (idx) =>
    setNewFiles((p) => p.filter((_, i) => i !== idx));

  const removeExistingDoc = async (docId) => {
    try {
      await api.boDeleteDocument(docId, userConnecte.id);
      setExistingDocs((p) => p.filter((d) => d.id !== docId));
    } catch {
      showToast("error", t("bo.deleteFileError"));
    }
  };

  const validate = () => {
    const e = {};
    if (!form.numero.trim())    e.numero           = t("bo.numeroRequired");
    if (!form.type_courrier_id) e.type_courrier_id = t("bo.typeRequired");
    if (!form.date_reception)   e.date_reception   = t("bo.dateRequired");
    if (!form.objet.trim())     e.objet            = t("bo.objectRequired");
    if (!form.expediteur_id)    e.expediteur_id    = t("bo.senderRequired");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);

    const fd = new FormData();
    fd.append("user_id",          userConnecte.id);
    fd.append("numero",           form.numero.trim());
    fd.append("reference",        form.reference.trim());
    // L'expéditeur est désormais toujours un tiers externe identifié par son
    // type (type_tiers) — contrat backend inchangé : type_expediteur="tiers".
    fd.append("type_expediteur",  "tiers");
    fd.append("expediteur_id",    form.expediteur_id);
    fd.append("type_courrier_id", form.type_courrier_id);
    fd.append("date_reception",   form.date_reception);
    fd.append("objet",            form.objet.trim());
    fd.append("observations",     (form.observations || "").trim());
    newFiles.forEach((f) => fd.append("fichiers", f));

    try {
      if (isEdit) {
        await api.boUpdateCourrier(editId, fd);
        showToast("success", t("bo.updatedSuccess"));
      } else {
        await api.boCreateCourrier(fd);
        showToast("success", t("bo.createdSuccess"));
      }
      setTimeout(() => onSuccess(), 1200);
    } catch (err) {
      const serverErrors = err?.response?.errors;
      if (serverErrors) {
        setErrors(serverErrors);
      } else {
        showToast("error", err?.response?.error || t("common.error"));
      }
    } finally {
      setSaving(false);
    }
  };

  // Type d'expéditeur effectif : choix explicite de l'utilisateur, ou — lors de
  // la modification d'un courrier existant — type du tiers actuellement
  // sélectionné. La dérivation au rendu (plutôt qu'au chargement) rend le
  // préchargement insensible à l'ordre d'arrivée de refData et du courrier.
  const selectedTypeTiersId =
    form.type_tiers_id ||
    (refData.tiers.find((t) => String(t.id) === String(form.expediteur_id))?.type_tiers_id ?? "");

  // Expéditeurs associés au type sélectionné uniquement (même logique que
  // le Chef de Division : Administrateur → uniquement les tiers de ce type).
  const expediteurOptions = selectedTypeTiersId
    ? refData.tiers.filter((t) => String(t.type_tiers_id) === String(selectedTypeTiersId))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3
                         rounded-xl shadow-lg text-sm font-medium animate-fade-in
                         ${toast.type === "success"
                           ? "bg-green-50 text-green-800 border border-green-200"
                           : "bg-red-50 text-red-800 border border-red-200"}`}>
          {toast.type === "success"
            ? <CheckCircle className="w-4 h-4 text-green-500" />
            : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-xs text-gray-500 mb-5">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <span>{t("bo.bureauOrdre")}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="text-blue-600 font-medium">
          {isEdit ? t("bo.editTitle") : t("bo.newTitle")}
        </span>
      </nav>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-blue-700">
          <h2 className="text-base font-bold text-white">
            {isEdit ? t("bo.editSubtitle") : t("bo.newSubtitle")}
          </h2>
          <p className="text-blue-100 text-xs mt-0.5">
            {t("bo.requiredFields")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="divide-y divide-gray-100">

          {/* ── Section 1 : Informations générales ── */}
          <section className="px-6 py-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              {t("entrant.generalInfo")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

              {/* Numéro d'ordre */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("bo.orderNumber")} <span className="text-red-500">{t("common.required")}</span>
                </label>
                <input name="numero" value={form.numero} onChange={handleChange}
                  disabled={isEdit}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none
                              focus:ring-2 focus:ring-blue-500 transition
                              ${errors.numero ? "border-red-400 bg-red-50" : "border-gray-300"}
                              ${isEdit ? "bg-gray-100 cursor-not-allowed" : ""}`}
                  placeholder={t("bo.numberPlaceholder")} />
                {errors.numero && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.numero}
                  </p>
                )}
              </div>

              {/* Référence */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("common.reference")}
                </label>
                <input name="reference" value={form.reference} onChange={handleChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t("bo.refPlaceholder")} />
              </div>

              {/* Type d'expéditeur — alimenté par la table type_tiers */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("bo.senderType")} <span className="text-red-500">{t("common.required")}</span>
                </label>
                <select name="type_tiers_id" value={selectedTypeTiersId} onChange={handleTypeChange}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">{t("common.choose")}</option>
                  {refData.types_tiers.map((tt) => (
                    <option key={tt.id} value={tt.id}>{tt.libelle}</option>
                  ))}
                </select>
              </div>

              {/* Expéditeur — dépend du Type d'expéditeur : désactivé tant
                  qu'aucun type n'est sélectionné (même logique que le Chef
                  de Division), puis limité aux tiers de ce type */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("entrant.sender")} <span className="text-red-500">{t("common.required")}</span>
                </label>
                <select name="expediteur_id" value={form.expediteur_id} onChange={handleChange}
                  disabled={!selectedTypeTiersId}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none
                              focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100
                              disabled:cursor-not-allowed
                              ${errors.expediteur_id ? "border-red-400 bg-red-50" : "border-gray-300"}`}>
                  <option value="">
                    {selectedTypeTiersId ? t("bo.selectPlaceholder") : t("bo.selectSenderAfterType")}
                  </option>
                  {expediteurOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.nom}</option>
                  ))}
                </select>
                {errors.expediteur_id && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.expediteur_id}
                  </p>
                )}
              </div>

              {/* Type de courrier */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("bo.mailType")} <span className="text-red-500">{t("common.required")}</span>
                </label>
                <select name="type_courrier_id" value={form.type_courrier_id} onChange={handleChange}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none
                              focus:ring-2 focus:ring-blue-500
                              ${errors.type_courrier_id ? "border-red-400 bg-red-50" : "border-gray-300"}`}>
                  <option value="">{t("bo.selectType")}</option>
                  {refData.types_courrier.map((type) => (
                    <option key={type.id} value={type.id}>{type.libelle}</option>
                  ))}
                </select>
                {errors.type_courrier_id && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.type_courrier_id}
                  </p>
                )}
              </div>

              {/* Date de réception */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t("bo.receivedDate")} <span className="text-red-500">{t("common.required")}</span>
                </label>
                <input type="date" name="date_reception" value={form.date_reception}
                  onChange={handleChange}
                  className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none
                              focus:ring-2 focus:ring-blue-500
                              ${errors.date_reception ? "border-red-400 bg-red-50" : "border-gray-300"}`} />
                {errors.date_reception && (
                  <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{errors.date_reception}
                  </p>
                )}
              </div>
            </div>

            {/* Objet */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                {t("common.object")} <span className="text-red-500">{t("common.required")}</span>
              </label>
              <textarea name="objet" value={form.objet} onChange={handleChange} rows="3"
                className={`w-full px-3 py-2 text-sm border rounded-lg resize-y focus:outline-none
                            focus:ring-2 focus:ring-blue-500
                            ${errors.objet ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                placeholder={t("bo.objectPlaceholder")} />
              {errors.objet && (
                <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />{errors.objet}
                </p>
              )}
            </div>
          </section>

          {/* ── Section 2 : Documents joints ── */}
          <section className="px-6 py-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              {t("bo.attachedDocs")}
            </h3>

            {/* Existing docs */}
            {existingDocs.length > 0 && (
              <div className="mb-3 space-y-2">
                {existingDocs.map((doc) => (
                  <div key={doc.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-50
                               border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <div>
                        <p className="text-xs font-medium text-gray-700">{removeBOPrefix(doc.nom_fichier)}</p>
                        <p className="text-[10px] text-gray-400">
                          {formatFileSize(t, doc.taille_octets) || t("common.emDash")}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeExistingDoc(doc.id)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* New files */}
            {newFiles.length > 0 && (
              <div className="mb-3 space-y-2">
                {newFiles.map((f, i) => (
                  <div key={i}
                    className="flex items-center justify-between px-3 py-2 bg-blue-50
                               border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <div>
                        <p className="text-xs font-medium text-gray-700">{f.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {formatFileSize(t, f.size) || t("common.emDash")}
                        </p>
                      </div>
                    </div>
                    <button type="button" onClick={() => removeNewFile(i)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300
                         rounded-xl text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600
                         hover:bg-blue-50 transition-colors w-full justify-center">
              <Upload className="w-4 h-4" />
              {t("bo.addFiles")}
            </button>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={handleFileAdd} className="hidden" />
          </section>

          {/* ── Section 3 : Observations ── */}
          <section className="px-6 py-5">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              {t("common.observations")}
            </h3>
            <textarea name="observations" value={form.observations} onChange={handleChange}
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg
                         focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder={t("bo.notesPlaceholder")} />
          </section>

          {/* ── Actions ── */}
          <div className="px-6 py-4 bg-gray-50 flex flex-wrap items-center justify-end gap-3">
            <button type="button" onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700
                         border border-gray-300 rounded-lg hover:bg-gray-100 transition">
              <X className="w-4 h-4" /> {t("common.cancel")}
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white
                         bg-blue-600 rounded-lg hover:bg-blue-700 transition
                         disabled:opacity-60 disabled:cursor-not-allowed">
              {saving
                ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save className="w-4 h-4" />}
              {isEdit ? t("bo.saveChanges") : t("bo.saveMail")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
