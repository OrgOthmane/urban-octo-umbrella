import { User, LogOut } from "lucide-react";
import { useState } from "react";
import NotificationBell from "./NotificationBell";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n, translateRole } from "../../i18n";
import llLogo from "./imports/LG.png";

export function Navbar({ user, onLogout, onNavigateToCourrier }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { t } = useI18n();

  const showBell = user && ["Chef de division", "Chef de service", "Agent"].includes(user.role);

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={llLogo}
            alt={t("app.logoAlt")}
            className="h-14 w-auto object-contain"
          />
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-tight">
              {t("app.title")}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <LanguageSwitcher compact />

          {showBell && (
            <NotificationBell
              user={user}
              onNavigateToCourrier={onNavigateToCourrier}
            />
          )}

          <div className="w-px h-8 bg-gray-200" />

          <div className="flex items-center gap-3 relative">
            <div
              className="text-end cursor-pointer"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <p className="text-sm font-bold text-gray-900 leading-tight">
                {user.prenom} {user.nom}
              </p>
              <p className="text-[11px] text-gray-500 font-medium">{translateRole(t, user.role)}</p>
              <p className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter">
                {user.role === "Chef de division"
                  ? user.division || t("common.emDash")
                  : `${user.division || t("common.emDash")} | ${user.service || t("common.emDash")}`}
              </p>
            </div>
            <div
              className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-full
                          flex items-center justify-center cursor-pointer
                          hover:bg-blue-100 transition-colors"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <User className="w-5 h-5 text-blue-600" />
            </div>

            {showUserMenu && (
              <div className="absolute top-full end-0 mt-2 w-48 bg-white rounded-xl
                               shadow-lg border border-gray-200 py-2 z-50">
                <button
                  onClick={() => { onLogout(); setShowUserMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-gray-700
                             hover:bg-gray-100 transition-colors text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  {t("nav.logout")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
