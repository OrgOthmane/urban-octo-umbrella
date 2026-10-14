import { useState, useEffect } from "react";
import { Clock, RefreshCw, Search, Info, Pencil, Trash2, Send, FilePlus } from "lucide-react";
import { api } from "../../../services/api";
import { useI18n } from "../../../i18n";
import { translateAction } from "../../../i18n/helpers";

const ACTION_ICONS = {
  "Création":     FilePlus,
  "Modification": Pencil,
  "Suppression":  Trash2,
  "Affectation":  Send,
};
const ACTION_COLORS = {
  "Création":     "bg-green-100 text-green-700",
  "Modification": "bg-yellow-100 text-yellow-700",
  "Suppression":  "bg-red-100 text-red-700",
  "Affectation":  "bg-blue-100 text-blue-700",
};

export default function BOHistorique({ userConnecte }) {
  const { t } = useI18n();
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState("");

  const load = () => {
    setLoading(true);
    api.boGetHistorique(userConnecte.id)
      .then(setRows)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    const q = search.toLowerCase();
    return !q ||
      r.numero?.toLowerCase().includes(q) ||
      r.action?.toLowerCase().includes(q) ||
      r.details?.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold text-gray-800">{t("bo.historyActions")}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{t("bo.entries", { n: filtered.length })}</p>
        </div>
        <button onClick={load}
          className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          title={t("common.refresh")}>
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={t("bo.historyFilter")} />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("bo.noHistory")}</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="relative">
            <div className="absolute left-[2.75rem] top-0 bottom-0 w-px bg-gray-100 z-0" />
            <div className="divide-y divide-gray-100">
              {filtered.map((h, i) => {
                const Icon  = ACTION_ICONS[h.action] || Info;
                const color = ACTION_COLORS[h.action] || "bg-gray-100 text-gray-600";
                return (
                  <div key={i} className="flex gap-4 px-5 py-4 hover:bg-gray-50 transition-colors relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                     flex-shrink-0 z-10 ${color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color}`}>
                          {translateAction(t, h.action)}
                        </span>
                        <span className="text-xs font-mono font-semibold text-blue-700">
                          {h.numero}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{h.details}</p>
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-2">
                        <span>{t("bo.by", { name: `${h.prenom} ${h.nom}` })}</span>
                        <span>·</span>
                        <span>{h.created_at?.slice(0,16).replace("T"," ")}</span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
