import { useState, useEffect, useRef, useCallback } from "react";
import { Bell, Mail, CheckCircle, Inbox, X, Trash2 } from "lucide-react";
import { useI18n, timeAgo } from "../../i18n";
import { tokenStorage } from "../../services/api";

const API = import.meta.env.VITE_API_BASE_URL;

const TYPE_CONFIG = {
  NOUVEAU_COURRIER: { color: "bg-blue-100 text-blue-700",   icon: Mail },
  AFFECTATION:      { color: "bg-purple-100 text-purple-700", icon: CheckCircle },
  TRAITEMENT:       { color: "bg-green-100 text-green-700",  icon: CheckCircle },
  SYSTEME:          { color: "bg-gray-100 text-gray-600",    icon: Bell },
};

export default function NotificationBell({ user, onNavigateToCourrier }) {
  const { t } = useI18n();
  const [open,          setOpen]          = useState(false);
  const [notifications, setNotifications] = useState([]);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const token = tokenStorage.getToken();
      const res  = await fetch(`${API}/notifications`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (Array.isArray(data)) setNotifications(data);
    } catch {}
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open) fetchNotifications();
  };

  const handleRead = async (notif) => {
    try {
      const token = tokenStorage.getToken();
      const headers = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const res  = await fetch(`${API}/notifications/${notif.id}/lire`, {
        method: "PATCH",
        headers,
        body:   JSON.stringify({}),
      });
      const data = await res.json();
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
      if (onNavigateToCourrier && (data.courrier_id || data.bo_courrier_id)) {
        onNavigateToCourrier({
          courrier_id:    data.courrier_id,
          bo_courrier_id: data.bo_courrier_id,
          type:           data.type,
        });
        setOpen(false);
      }
    } catch { /* silencieux */ }
  };

  const handleClearAll = async () => {
    try {
      const token = tokenStorage.getToken();
      await fetch(`${API}/notifications/tout-lire`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setNotifications([]);
    } catch { /* silencieux */ }
  };

  const unread = notifications.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-xl hover:bg-gray-100 transition-colors focus:outline-none"
        aria-label={t("notifications.aria")}
      >
        <Bell className={`w-5 h-5 ${unread > 0 ? "text-blue-600" : "text-gray-500"}`} />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] px-1
                           bg-red-500 text-white text-[10px] font-bold rounded-full
                           flex items-center justify-center leading-none animate-pulse">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute end-0 top-full mt-2 w-96 bg-white rounded-2xl
                         shadow-2xl border border-gray-200 z-[100] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3
                           border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-gray-800">{t("notifications.title")}</span>
              {unread > 0 && (
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px]
                                  font-bold rounded-full">
                  {unread > 1
                    ? t("notifications.unreadMany", { n: unread })
                    : t("notifications.unreadOne", { n: unread })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  onClick={handleClearAll}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50
                             rounded-lg transition text-xs flex items-center gap-1"
                  title={t("notifications.clearAll")}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700
                           hover:bg-gray-100 rounded-lg transition"
                title={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <Inbox className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500">{t("notifications.empty")}</p>
                <p className="text-xs text-gray-400">{t("notifications.emptyHint")}</p>
              </div>
            ) : (
              notifications.map((notif) => {
                const cfg  = TYPE_CONFIG[notif.type] || TYPE_CONFIG.SYSTEME;
                const Icon = cfg.icon;
                return (
                  <button
                    key={notif.id}
                    onClick={() => handleRead(notif)}
                    className="w-full text-start px-4 py-3.5 hover:bg-blue-50/40
                               transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-xl flex items-center
                                       justify-center flex-shrink-0 mt-0.5 ${cfg.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-xs font-bold text-gray-800 truncate">
                            {notif.titre}
                          </p>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                            {timeAgo(t, notif.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed line-clamp-2">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-blue-500 mt-1
                                       group-hover:text-blue-700 transition">
                          {t("notifications.clickToOpen")}
                        </p>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
