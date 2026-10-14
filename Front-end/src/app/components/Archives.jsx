import React, { useState, useEffect } from "react";
import { 
  Archive, 
  Search, 
  RotateCcw, 
  Eye, 
  Download, 
  Loader2, 
  Mail, 
  FileText,
  User,
  CalendarClock,
  X,
  Printer,
} from "lucide-react";
import { api } from "../../services/api";
import { useI18n } from "../../i18n";
import { removeBOPrefix } from "../../i18n/helpers";
import PrintService from "../../services/PrintService";

export function Archives({ userConnecte }) {
  const { t, locale } = useI18n();
  const [activeTab, setActiveTab] = useState("entrant");
  const [courriers, setCourriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedCourrier, setSelectedCourrier] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, per_page: 25, total: 0, total_pages: 0 });

  const fetchArchives = async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        role: userConnecte.role,
        service_id: userConnecte.service_id,
        division_id: userConnecte.division_id,
        page: page,
        per_page: pagination.per_page,
      };
      
      let response;
      if (activeTab === "entrant") {
        response = await api.getArchivedCourriersEntrants(params);
      } else {
        response = await api.getArchivedCourriersSortants(params);
      }
      
      // Gérer la nouvelle structure de réponse avec pagination
      const courriersData = response.data || response || [];
      setCourriers(courriersData);
      setPagination({
        page: response.page || page,
        per_page: response.per_page || pagination.per_page,
        total: response.total || 0,
        total_pages: response.total_pages || 1,
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des archives:", error);
      setCourriers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArchives();
  }, [activeTab]);

  const handleRestore = async (id) => {
    if (!window.confirm(t("archives.restoreConfirm"))) return;
    
    try {
      if (activeTab === "entrant") {
        await api.archiveCourrierEntrant(id, false);
      } else {
        await api.archiveCourrierSortant(id, false);
      }
      fetchArchives();
    } catch (error) {
      alert(t("archives.restoreError", { message: error.message }));
    }
  };

  const formatDateArchivage = (dateStr) => {
    if (!dateStr) return t("common.na");
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const filteredCourriers = courriers.filter(c => 
    c.numero?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.objet?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.expediteur?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.destinataire?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 space-y-6 bg-gray-50/50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight flex items-center gap-3">
            <Archive className="w-8 h-8 text-indigo-600" />
            {t("archives.title")}
          </h2>
          <p className="text-gray-500 text-sm font-medium mt-1">{t("archives.subtitle")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1 bg-gray-200/50 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("entrant")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "entrant" 
            ? "bg-white text-indigo-600 shadow-sm" 
            : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Mail className="w-4 h-4" /> {t("archives.incomingTab")}
        </button>
        <button
          onClick={() => setActiveTab("sortant")}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === "sortant" 
            ? "bg-white text-indigo-600 shadow-sm" 
            : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <FileText className="w-4 h-4" /> {t("archives.outgoingTab")}
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t("archives.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full ps-11 pe-4 py-3 bg-gray-50 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
              <p className="text-sm font-black text-gray-400 uppercase tracking-widest">{t("archives.loading")}</p>
            </div>
          ) : filteredCourriers.length === 0 ? (
            <div className="py-24 text-center">
              <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Archive className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-gray-800 font-bold">{t("archives.emptyTitle")}</h3>
              <p className="text-gray-400 text-sm">{t("archives.emptyHint")}</p>
            </div>
          ) : (
            <table className="w-full text-start">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">{t("archives.identification")}</th>
                  <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">{t("archives.correspondent")}</th>
                  <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">{t("common.observation")}</th>
                  <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest">{t("archives.archivedBy")}</th>
                  <th className="px-6 py-4 text-[11px] font-black text-gray-400 uppercase tracking-widest text-center">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredCourriers.map((courrier) => (
                  <tr key={courrier.dbId ?? courrier.id} className="hover:bg-indigo-50/30 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-indigo-700">{courrier.reference || t("common.na")}</span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{t("common.numberShort", { value: courrier.numero })}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-gray-700">
                          {activeTab === "entrant" ? courrier.expediteur : courrier.destinataire}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium">{courrier.date}</span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <p className="text-sm text-gray-600 max-w-xs truncate">{courrier.observation || "—"}</p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        {/* Nom de l'agent qui a archivé */}
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-amber-500 flex-shrink-0" />
                          <span className="text-xs font-semibold text-gray-700">
                            {courrier.archive_par_nom
                              ? `${courrier.archive_par_prenom || ""} ${courrier.archive_par_nom}`.trim()
                              : t("common.na")}
                          </span>
                        </div>
                        {/* Date d'archivage */}
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                          <span className="text-[10px] text-gray-400 font-medium">
                            {formatDateArchivage(courrier.date_archivage)}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          onClick={() => { setSelectedCourrier(courrier); setShowDetailModal(true); }}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all shadow-sm"
                          title={t("common.details")}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={async () => {
                            try {
                              await api.exportCourrier(courrier.dbId, userConnecte?.id, courrier.numero);
                            } catch (err) {
                              alert(t("common.exportError", { message: err.message }));
                            }
                          }}
                          className="p-2 text-blue-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                          title={t("common.exportPdf")}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              await PrintService.printById(courrier.dbId, userConnecte?.id);
                            } catch (err) {
                              alert(t("common.printError", { message: err.message }));
                            }
                          }}
                          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                          title={t("common.print")}
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleRestore(courrier.dbId ?? courrier.id)}
                          className="p-2 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                          title={t("archives.restore")}
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {showDetailModal && selectedCourrier && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-gray-800 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Archive className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-lg font-bold">{t("archives.detailTitle")}</h3>
                  <p className="text-xs text-gray-300">
                    {t("common.refShort", { value: selectedCourrier.reference || t("common.na") })} | {t("common.numberShort", { value: selectedCourrier.numero })}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="hover:bg-white/10 p-1 rounded-lg transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-4">
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b pb-2">{t("archives.info")}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("archives.correspondent")}</label>
                      <p className="text-sm font-semibold text-gray-900">
                        {activeTab === "entrant" ? selectedCourrier.expediteur : selectedCourrier.destinataire}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("archives.mailType")}</label>
                      <p className="text-sm text-gray-700 font-medium">{selectedCourrier.type || t("common.na")}</p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("common.date")}</label>
                      <p className="text-sm text-gray-700">{selectedCourrier.date}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-4">
                  <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b pb-2">{t("archives.routing")}</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("archives.internalStructure")}</label>
                      <p className="text-sm font-semibold text-gray-900">
                        {activeTab === "entrant" ? selectedCourrier.Destinataire : selectedCourrier.expediteur}
                      </p>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-gray-400 uppercase">{t("archives.enteredBy")}</label>
                      <p className="text-sm text-gray-700 font-medium">{selectedCourrier.saisi_par || selectedCourrier.redacteur || "N/A"}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg shadow-sm">
                <h4 className="text-xs font-bold text-amber-700 uppercase tracking-wider border-b border-amber-200 pb-2 mb-3 flex items-center gap-2">
                  <Archive className="w-3.5 h-3.5" />
                  {t("archives.info")} d'archivage
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-amber-600 uppercase">{t("archives.archivedBy")}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <User className="w-3.5 h-3.5 text-amber-600" />
                      </div>
                      <p className="text-sm font-semibold text-gray-800">
                        {selectedCourrier.archive_par_nom
                          ? `${selectedCourrier.archive_par_prenom || ""} ${selectedCourrier.archive_par_nom}`.trim()
                          : "N/A"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-amber-600 uppercase">{t("archives.archiveDate")}</label>
                    <div className="flex items-center gap-2 mt-1">
                      <CalendarClock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <p className="text-sm font-semibold text-gray-800">
                        {formatDateArchivage(selectedCourrier.date_archivage)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b pb-2 mb-3">{t("common.object")}</h4>
                <p className="text-sm text-gray-800 font-bold leading-relaxed whitespace-pre-line">{selectedCourrier.objet}</p>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b pb-2 mb-3">{t("common.observations")}</h4>
                <p className="text-sm text-gray-600 italic whitespace-pre-wrap">
                  {selectedCourrier.observation || t("common.noObservation")}
                </p>
              </div>
              {selectedCourrier.fichier && (
                <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-4 h-4 text-indigo-600" />
                    <span className="text-sm font-bold text-gray-700">{removeBOPrefix(selectedCourrier.fichier)}</span>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        // Pièce jointe issue du Bureau d'Ordre : elle n'existe pas
                        // dans la table `documents`, il faut l'endpoint BO dédié.
                        if (selectedCourrier.fichier_source === "bo" && selectedCourrier.fichier_bo_id) {
                          await api.boDownloadDocument(
                            selectedCourrier.fichier_bo_id,
                            userConnecte?.id,
                            selectedCourrier.fichier
                          );
                        } else {
                          await api.downloadFichier(selectedCourrier.fichier);
                        }
                      } catch (err) {
                        alert(t("archives.downloadError", { message: err.message }));
                      }
                    }}
                    className="text-blue-600 hover:text-blue-800 font-bold text-xs flex items-center gap-1">
                    <Download className="w-4 h-4" /> {t("common.download")}
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button 
                  onClick={async () => {
                    try {
                      await api.exportCourrier(selectedCourrier.dbId, userConnecte?.id, selectedCourrier.numero);
                    } catch (err) {
                      alert(t("common.exportError", { message: err.message }));
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" /> {t("common.exportPdf")}
                </button>
                <button
                  onClick={async () => {
                    try {
                      await PrintService.printById(selectedCourrier.dbId, userConnecte?.id);
                    } catch (err) {
                      alert(t("common.printError", { message: err.message }));
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <Printer className="w-4 h-4" /> {t("common.print")}
                </button>
              </div>
              <button 
                onClick={() => setShowDetailModal(false)}
                className="px-6 py-2 bg-gray-800 text-white rounded-lg text-sm font-bold hover:bg-gray-700 transition-colors"
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}