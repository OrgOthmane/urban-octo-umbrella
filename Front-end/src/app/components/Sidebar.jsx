import {
  LayoutDashboard,
  Mail,
  Users,
  FileText,
  Archive,
  ChevronLeft,
  ChevronRight,
  Settings,
  Download,
} from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";

export function Sidebar({ activeView, onViewChange, userConnecte }) {
  const [collapsed, setCollapsed] = useState(false);
  const { t, isRTL } = useI18n();

  const isAgent = userConnecte?.role === "Agent";

  const menuItems = [
    ...(!isAgent
      ? [{ id: "dashboard", label: t("sidebar.dashboard"), icon: LayoutDashboard }]
      : []),
    { id: "courrier-entrant", label: t("sidebar.incoming"), icon: Mail },
    { id: "courrier-sortant", label: t("sidebar.outgoing"), icon: FileText },
    { id: "archives", label: t("sidebar.archives"), icon: Archive },
    { id: "telechargements", label: t("sidebar.downloads"), icon: Download },
    ...(!isAgent
      ? [{ id: "utilisateurs", label: t("sidebar.users"), icon: Users }]
      : []),
    { id: "parametres", label: t("sidebar.settings"), icon: Settings },
  ];

  const ExpandIcon = isRTL ? ChevronLeft : ChevronRight;
  const CollapseIcon = isRTL ? ChevronRight : ChevronLeft;

  return (
    <aside
      className={`bg-white border-e border-gray-200 transition-all duration-300 flex flex-col ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-2">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  activeView === item.id
                    ? "bg-blue-50 text-blue-600"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center p-4 border-t border-gray-200 hover:bg-gray-50 transition-colors"
      >
        {collapsed ? (
          <ExpandIcon className="w-5 h-5 text-gray-600" />
        ) : (
          <CollapseIcon className="w-5 h-5 text-gray-600" />
        )}
      </button>
    </aside>
  );
}
