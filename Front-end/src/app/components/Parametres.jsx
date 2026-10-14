import { api } from "../../services/api";
import { useState, useEffect } from "react";
import { useI18n } from "../../i18n";
import {
  Mail,
  Users,
  Building2,
  Briefcase,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Search,
  ChevronRight,
  Tag,
  AlertTriangle,
  Settings2,
  Loader2,
} from "lucide-react";

function settingsCopy(t) {
  return {
    appTitle: t("settings.title"),
    appSub: t("settings.subtitle"),
    sections: {
      typesCourrier: t("settings.typesCourrier"),
      typesTiers: t("settings.typesTiers"),
      tiers: t("settings.tiers"),
      divisions: t("settings.divisions"),
      services: t("settings.services"),
    },
    actions: {
      add: t("common.add"),
      edit: t("common.edit"),
      delete: t("common.delete"),
      save: t("common.save"),
      cancel: t("common.cancel"),
    },
    search: t("common.search"),
    empty: t("settings.empty"),
    confirmDel: t("settings.confirmDel"),
    yes: t("common.yes"),
    no: t("common.no"),
    elements: t("settings.elements"),
    fields: {
      libelle: t("settings.libelle"),
      nom: t("settings.nom"),
      typeTiers: t("settings.typeTiers"),
      division: t("settings.division"),
    },
    placeholders: {
      libelle: t("settings.placeholderLibelle"),
      nom: t("settings.placeholderNom"),
      chooseType: t("settings.chooseType"),
      chooseDivision: t("settings.chooseDivision"),
    },
    messages: {
      saving: t("settings.saving"),
      deleting: t("settings.deleting"),
      error: t("common.error"),
    },
  };
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition";
const selectCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition";
const btnPrimary =
  "flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 transition active:scale-95 shrink-0";
const btnGhost =
  "flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 transition active:scale-95";
const btnDanger =
  "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50 transition";
const btnEditSm =
  "flex items-center gap-1 rounded-md px-2 py-1 text-xs text-indigo-500 hover:bg-indigo-50 transition";

function InlineForm({
  t,
  sectionKey,
  item,
  typesTiers,
  divisions,
  onSave,
  onCancel,
  isRTL,
  isSaving,
}) {
  const [libelle, setLibelle] = useState(item?.libelle ?? "");
  const [nom, setNom] = useState(item?.nom ?? "");
  const [typeTiersId, setTypeTiersId] = useState(item?.type_tiers_id ?? "");
  const [divisionId, setDivisionId] = useState(item?.division_id ?? "");
  const dir = isRTL ? "rtl" : "ltr";

  const handleSave = () => {
    if (sectionKey === "typesCourrier" || sectionKey === "typesTiers") {
      if (!libelle.trim()) return;
      onSave({ ...(item || {}), libelle: libelle.trim() });
    } else if (sectionKey === "tiers") {
      if (!nom.trim() || !typeTiersId) return;
      onSave({
        ...(item || {}),
        nom: nom.trim(),
        type_tiers_id: Number(typeTiersId),
      });
    } else if (sectionKey === "divisions") {
      if (!nom.trim()) return;
      onSave({ ...(item || {}), nom: nom.trim() });
    } else if (sectionKey === "services") {
      if (!nom.trim() || !divisionId) return;
      onSave({
        ...(item || {}),
        nom: nom.trim(),
        division_id: Number(divisionId),
      });
    }
  };

  return (
    <div
      dir={dir}
      className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col gap-3"
    >
      {(sectionKey === "typesCourrier" || sectionKey === "typesTiers") && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t.fields.libelle}
          </label>
          <input
            autoFocus
            className={inputCls}
            placeholder={t.placeholders.libelle}
            value={libelle}
            onChange={(e) => setLibelle(e.target.value)}
            dir={dir}
            disabled={isSaving}
          />
        </div>
      )}
      {sectionKey === "divisions" && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">
            {t.fields.nom}
          </label>
          <input
            autoFocus
            className={inputCls}
            placeholder={t.placeholders.nom}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            dir={dir}
            disabled={isSaving}
          />
        </div>
      )}
      {sectionKey === "tiers" && (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {t.fields.nom}
            </label>
            <input
              autoFocus
              className={inputCls}
              placeholder={t.placeholders.nom}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              dir={dir}
              disabled={isSaving}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {t.fields.typeTiers}
            </label>
            <select
              className={selectCls}
              value={typeTiersId}
              onChange={(e) => setTypeTiersId(e.target.value)}
              dir={dir}
              disabled={isSaving}
            >
              <option value="">{t.placeholders.chooseType}</option>
              {typesTiers.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.libelle}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {sectionKey === "services" && (
        <>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {t.fields.nom}
            </label>
            <input
              autoFocus
              className={inputCls}
              placeholder={t.placeholders.nom}
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              dir={dir}
              disabled={isSaving}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {t.fields.division}
            </label>
            <select
              className={selectCls}
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              dir={dir}
              disabled={isSaving}
            >
              <option value="">{t.placeholders.chooseDivision}</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nom}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <button className={btnPrimary} onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Check size={13} />
          )}
          {t.actions.save}
        </button>
        <button className={btnGhost} onClick={onCancel} disabled={isSaving}>
          <X size={13} />
          {t.actions.cancel}
        </button>
      </div>
    </div>
  );
}

function DeleteConfirm({ t, onConfirm, onCancel, isRTL, isDeleting }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 ${isRTL ? "flex-row-reverse" : ""}`}
    >
      <AlertTriangle size={15} className="text-rose-500 shrink-0" />
      <span className="text-xs text-rose-700 font-medium flex-1">
        {t.confirmDel}
      </span>
      <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <button
          onClick={onConfirm}
          disabled={isDeleting}
          className="rounded-md bg-rose-500 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-600 transition disabled:opacity-50"
        >
          {isDeleting ? (
            <Loader2 size={12} className="inline animate-spin" />
          ) : (
            t.yes
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={isDeleting}
          className="rounded-md border border-rose-200 px-3 py-1 text-xs text-rose-600 hover:bg-rose-100 transition disabled:opacity-50"
        >
          {t.no}
        </button>
      </div>
    </div>
  );
}

function SectionPanel({
  t,
  sectionKey,
  data,
  setData,
  typesTiers,
  divisions,
  isRTL,
  onSave,
  onDelete,
  isLoading,
}) {
  const [search, setSearch] = useState("");
  const [formMode, setFormMode] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const dir = isRTL ? "rtl" : "ltr";

  const getLabel = (item) => item.libelle ?? item.nom ?? "";

  const filtered = data.filter((item) =>
    getLabel(item).toLowerCase().includes(search.toLowerCase()),
  );

  const openAdd = () => {
    setFormMode("add");
    setDeleteId(null);
  };
  const openEdit = (item) => {
    setFormMode({ editItem: item });
    setDeleteId(null);
  };
  const closeForm = () => setFormMode(null);

  const handleSave = async (item) => {
    setIsSaving(true);
    try {
      if (formMode === "add") {
        await onSave(sectionKey, item, true);
      } else {
        await onSave(sectionKey, item, false);
      }
      setFormMode(null);
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      alert(t.messages.error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setIsDeleting(true);
    try {
      await onDelete(sectionKey, id);
      setDeleteId(null);
    } catch (err) {
      console.error("Erreur suppression:", err);
      alert(t.messages.error);
    } finally {
      setIsDeleting(false);
    }
  };

  const getSubLabel = (item) => {
    if (sectionKey === "tiers") {
      const tp = typesTiers.find((tp) => tp.id === item.type_tiers_id);
      return tp ? tp.libelle : "";
    }
    if (sectionKey === "services") {
      const div = divisions.find((d) => d.id === item.division_id);
      return div ? div.nom : "";
    }
    return "";
  };

  const canEdit = true; // All sections are editable in the backend

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div dir={dir} className="flex flex-col gap-3">
      {/* Toolbar */}
      <div
        className={`flex gap-2 items-center ${isRTL ? "flex-row-reverse" : ""}`}
      >
        <div className="relative flex-1">
          <Search
            size={14}
            className={`absolute top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none ${isRTL ? "right-3" : "left-3"}`}
          />
          <input
            className={`w-full rounded-lg border border-slate-200 bg-white py-2 text-sm text-slate-700 placeholder-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 transition ${isRTL ? "pr-9 pl-3" : "pl-9 pr-3"}`}
            placeholder={t.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            dir={dir}
          />
        </div>
        <button
          className={btnPrimary}
          onClick={openAdd}
          disabled={isSaving || isDeleting}
        >
          <Plus size={14} />
          {t.actions.add}
        </button>
      </div>

      {formMode === "add" && (
        <InlineForm
          t={t}
          sectionKey={sectionKey}
          item={null}
          typesTiers={typesTiers}
          divisions={divisions}
          onSave={handleSave}
          onCancel={closeForm}
          isRTL={isRTL}
          isSaving={isSaving}
        />
      )}

      {/* List */}
      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-10">{t.empty}</p>
        ) : (
          filtered.map((item) => (
            <div key={item.id}>
              {formMode?.editItem?.id === item.id ? (
                <InlineForm
                  t={t}
                  sectionKey={sectionKey}
                  item={item}
                  typesTiers={typesTiers}
                  divisions={divisions}
                  onSave={handleSave}
                  onCancel={closeForm}
                  isRTL={isRTL}
                  isSaving={isSaving}
                />
              ) : deleteId === item.id ? (
                <DeleteConfirm
                  t={t}
                  onConfirm={() => handleDelete(item.id)}
                  onCancel={() => setDeleteId(null)}
                  isRTL={isRTL}
                  isDeleting={isDeleting}
                />
              ) : (
                <div
                  className={`group flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-2.5 hover:border-indigo-100 hover:bg-indigo-50/30 transition ${isRTL ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex flex-col ${isRTL ? "items-end" : "items-start"}`}
                  >
                    <span className="text-sm font-medium text-slate-800">
                      {getLabel(item)}
                    </span>
                    {getSubLabel(item) && (
                      <span className="text-xs text-slate-400 mt-0.5">
                        {getSubLabel(item)}
                      </span>
                    )}
                  </div>
                  <div
                    className={`flex gap-1 opacity-0 group-hover:opacity-100 transition ${isRTL ? "flex-row-reverse" : ""}`}
                  >
                    {canEdit && (
                      <button
                        className={btnEditSm}
                        onClick={() => openEdit(item)}
                        disabled={isSaving || isDeleting}
                      >
                        <Pencil size={12} />
                        {t.actions.edit}
                      </button>
                    )}
                    <button
                      className={btnDanger}
                      onClick={() => setDeleteId(item.id)}
                      disabled={isSaving || isDeleting}
                    >
                      <Trash2 size={12} />
                      {t.actions.delete}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Parametre() {
  const { t: translate, isRTL } = useI18n();
  const t = settingsCopy(translate);
  const [activeSection, setActiveSection] = useState("typesCourrier");

  const [typesCourrier, setTypesCourrier] = useState([]);
  const [typesTiers, setTypesTiers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [services, setServices] = useState([]);

  const [loadingStates, setLoadingStates] = useState({});

  const dir = isRTL ? "rtl" : "ltr";

  // Charger les données au montage
  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoadingStates((prev) => ({ ...prev, all: true }));
      const [typesC, typesT, tiersData, divsData, servicesData] =
        await Promise.all([
          api.getTypesCourrier(),
          api.getTypesTiers(),
          api.getTiersParam(),
          api.getDivisionsParam(),
          api.getServicesParam(),
        ]);
      setTypesCourrier(typesC || []);
      setTypesTiers(typesT || []);
      setTiers(tiersData || []);
      setDivisions(divsData || []);
      setServices(servicesData || []);
    } catch (err) {
      console.error("Erreur chargement données:", err);
    } finally {
      setLoadingStates((prev) => ({ ...prev, all: false }));
    }
  };

  const handleSave = async (sectionKey, item, isNew) => {
    try {
      let result;
      switch (sectionKey) {
        case "typesCourrier":
          if (isNew) {
            result = await api.createTypeCourrier({ libelle: item.libelle });
            setTypesCourrier([...typesCourrier, result]);
          } else {
            await api.updateTypeCourrier(item.id, { libelle: item.libelle });
            setTypesCourrier(
              typesCourrier.map((t) => (t.id === item.id ? item : t)),
            );
          }
          break;
        case "typesTiers":
          if (isNew) {
            result = await api.createTypeTiers({ libelle: item.libelle });
            setTypesTiers([...typesTiers, result]);
          } else {
            await api.updateTypeTiers(item.id, { libelle: item.libelle });
            setTypesTiers(typesTiers.map((t) => (t.id === item.id ? item : t)));
          }
          break;
        case "tiers":
          if (isNew) {
            result = await api.createTiersParam({
              nom: item.nom,
              type_tiers_id: item.type_tiers_id,
            });
            setTiers([...tiers, result]);
          } else {
            await api.updateTiersParam(item.id, {
              nom: item.nom,
              type_tiers_id: item.type_tiers_id,
            });
            setTiers(tiers.map((t) => (t.id === item.id ? item : t)));
          }
          break;
        case "divisions":
          if (isNew) {
            result = await api.createDivisionParam({ nom: item.nom });
            setDivisions([...divisions, result]);
          } else {
            await api.updateDivisionParam(item.id, { nom: item.nom });
            setDivisions(divisions.map((d) => (d.id === item.id ? item : d)));
          }
          break;
        case "services":
          if (isNew) {
            result = await api.createServiceParam({
              nom: item.nom,
              division_id: item.division_id,
            });
            setServices([...services, result]);
          } else {
            await api.updateServiceParam(item.id, {
              nom: item.nom,
              division_id: item.division_id,
            });
            setServices(services.map((s) => (s.id === item.id ? item : s)));
          }
          break;
      }
    } catch (err) {
      console.error("Erreur sauvegarde:", err);
      throw err;
    }
  };

  const handleDelete = async (sectionKey, id) => {
    try {
      switch (sectionKey) {
        case "typesCourrier":
          await api.deleteTypeCourrier(id);
          setTypesCourrier(typesCourrier.filter((t) => t.id !== id));
          break;
        case "typesTiers":
          await api.deleteTypeTiers(id);
          setTypesTiers(typesTiers.filter((t) => t.id !== id));
          break;
        case "tiers":
          await api.deleteTiersParam(id);
          setTiers(tiers.filter((t) => t.id !== id));
          break;
        case "divisions":
          await api.deleteDivisionParam(id);
          setDivisions(divisions.filter((d) => d.id !== id));
          break;
        case "services":
          await api.deleteServiceParam(id);
          setServices(services.filter((s) => s.id !== id));
          break;
      }
    } catch (err) {
      console.error("Erreur suppression:", err);
      throw err;
    }
  };

  const sections = [
    {
      key: "typesCourrier",
      icon: Mail,
      accent: "bg-blue-100 text-blue-600",
      activeBadge: "bg-blue-500",
      label: t.sections.typesCourrier,
      data: typesCourrier,
      setData: setTypesCourrier,
    },
    {
      key: "typesTiers",
      icon: Tag,
      accent: "bg-violet-100 text-violet-600",
      activeBadge: "bg-violet-500",
      label: t.sections.typesTiers,
      data: typesTiers,
      setData: setTypesTiers,
    },
    {
      key: "tiers",
      icon: Users,
      accent: "bg-pink-100 text-pink-600",
      activeBadge: "bg-pink-500",
      label: t.sections.tiers,
      data: tiers,
      setData: setTiers,
    },
    {
      key: "divisions",
      icon: Building2,
      accent: "bg-amber-100 text-amber-600",
      activeBadge: "bg-amber-500",
      label: t.sections.divisions,
      data: divisions,
      setData: setDivisions,
    },
    {
      key: "services",
      icon: Briefcase,
      accent: "bg-emerald-100 text-emerald-600",
      activeBadge: "bg-emerald-500",
      label: t.sections.services,
      data: services,
      setData: setServices,
    },
  ];

  const active = sections.find((s) => s.key === activeSection);

  return (
    <div
      dir={dir}
      className="min-h-screen bg-gradient-to-br from-slate-100 to-indigo-50/40 p-4 md:p-8"
    >
      <div className="max-w-4xl mx-auto">
        <div
          className={`flex items-center justify-between mb-8 ${isRTL ? "flex-row-reverse" : ""}`}
        >
          <div
            className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}
          >
            <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
              <Settings2 size={20} />
            </div>
            <div className={isRTL ? "text-end" : ""}>
              <h1 className="text-2xl font-bold text-slate-900 leading-none">
                {t.appTitle}
              </h1>
              <p className="text-xs text-slate-400 mt-1">{t.appSub}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <nav className="md:col-span-1 flex flex-col gap-1.5">
            {sections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.key;
              return (
                <button
                  key={sec.key}
                  onClick={() => setActiveSection(sec.key)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all text-start w-full
                    ${
                      isActive
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                        : "bg-white border border-slate-100 text-slate-700 hover:border-indigo-200 hover:bg-indigo-50/60"
                    } ${isRTL ? "flex-row-reverse" : ""}`}
                >
                  <span
                    className={`p-1.5 rounded-lg shrink-0 ${isActive ? "bg-white/20 text-white" : sec.accent}`}
                  >
                    <Icon size={14} />
                  </span>
                  <span className="flex-1">{sec.label}</span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold
                    ${isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}
                  >
                    {sec.data.length}
                  </span>
                  <ChevronRight
                    size={13}
                    className={`opacity-40 ${isRTL ? "rotate-180" : ""} ${isActive ? "opacity-80" : ""}`}
                  />
                </button>
              );
            })}
          </nav>

          <div className="md:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            {/* Panel header */}
            <div
              className={`flex items-center gap-3 mb-5 pb-4 border-b border-slate-100 ${isRTL ? "flex-row-reverse" : ""}`}
            >
              {(() => {
                const Icon = active.icon;
                return (
                  <span className={`p-2 rounded-xl shrink-0 ${active.accent}`}>
                    <Icon size={16} />
                  </span>
                );
              })()}
              <div className={isRTL ? "text-right" : ""}>
                <h2 className="text-base font-bold text-slate-800">
                  {active.label}
                </h2>
                <p className="text-xs text-slate-400">
                  {active.data.length} {t.elements}
                </p>
              </div>
            </div>

            <SectionPanel
              t={t}
              sectionKey={activeSection}
              data={active.data}
              setData={active.setData}
              typesTiers={typesTiers}
              divisions={divisions}
              isRTL={isRTL}
              onSave={handleSave}
              onDelete={handleDelete}
              isLoading={loadingStates.all}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
