import { useState } from "react";
import {
  FilePlus, List, History, LogOut,
  ChevronLeft, ChevronRight, Menu,
} from "lucide-react";
import llLogo from "./imports/LG.png";
import BONouveauCourrier   from "./bo/BONouveauCourrier";
import BOListeCourriers    from "./bo/BOListeCourriers";
import BOHistorique        from "./bo/BOHistorique";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n, translateRole } from "../../i18n";

export default function BureauOrdre({ userConnecte, onLogout }) {
  const { t, isRTL } = useI18n();
  const [view,         setView]         = useState("liste");
  const [collapsed,    setCollapsed]    = useState(false);
  const [editCourrier, setEditCourrier] = useState(null);

  const MENU = [
    { id: "nouveau",    label: t("bo.newMail"),    icon: FilePlus },
    { id: "liste",      label: t("bo.mailList"),   icon: List },
    { id: "historique", label: t("bo.history"),    icon: History },
  ];

  const ExpandIcon = isRTL ? ChevronLeft : ChevronRight;
  const CollapseIcon = isRTL ? ChevronRight : ChevronLeft;

  const handleViewChange = (v, courierId = null) => {
    setEditCourrier(courierId);
    setView(v);
  };

  const renderView = () => {
    switch (view) {
      case "nouveau":
        return (
          <BONouveauCourrier
            userConnecte={userConnecte}
            editId={editCourrier}
            onSuccess={() => handleViewChange("liste")}
            onCancel={() => handleViewChange("liste")}
          />
        );
      case "liste":
        return (
          <BOListeCourriers
            userConnecte={userConnecte}
            onEdit={(id) => handleViewChange("nouveau", id)}
            onNouveau={() => handleViewChange("nouveau")}
          />
        );
      case "historique":
        return <BOHistorique userConnecte={userConnecte} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Top bar ── */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors lg:hidden"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
          <img
            src={llLogo}
            alt={t("app.logoAlt")}
            className="h-12 w-auto object-contain flex-shrink-0"
          />
          <div>
            <h1 className="text-sm font-bold text-gray-900 leading-tight">
              {t("bo.title")}
            </h1>
            <p className="text-[10px] text-gray-500">{t("app.title")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher compact />

          {/* User info */}
          <div className="text-end hidden sm:block">
            <p className="text-sm font-semibold text-gray-800 leading-tight">
              {userConnecte.prenom} {userConnecte.nom}
            </p>
            <p className="text-[10px] text-blue-600 font-medium">{translateRole(t, userConnecte.role)}</p>
          </div>

          <button
            onClick={onLogout}
            className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            title={t("nav.logoutTitle")}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside
          className={`bg-white border-e border-gray-200 transition-all duration-300 flex flex-col
                      ${collapsed ? "w-16" : "w-56"}`}
        >
          <nav className="flex-1 py-4 px-2 space-y-1">
            {MENU.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => { setEditCourrier(null); setView(id); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                            transition-colors text-start
                            ${view === id
                              ? "bg-blue-50 text-blue-700 font-semibold"
                              : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm">{label}</span>}
              </button>
            ))}
          </nav>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center p-4 border-t border-gray-100
                       hover:bg-gray-50 transition-colors"
          >
            {collapsed
              ? <ExpandIcon className="w-4 h-4 text-gray-400" />
              : <CollapseIcon className="w-4 h-4 text-gray-400" />}
          </button>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto p-6">
          {renderView()}
        </main>
      </div>
    </div>
  );
}
