const STATUS_KEYS = {
  URGENT: "status.urgent",
  EN_ATTENTE: "status.pending",
  "EN ATTENTE": "status.pending",
  "En attente": "status.pending",
  EN_COURS: "status.inProgress",
  "EN COURS": "status.inProgress",
  "En cours": "status.inProgress",
  TRAITE: "status.processed",
  TRAITÉ: "status.processed",
  Traité: "status.processed",
  "Non affecté": "status.unassigned",
  Affecté: "status.assigned",
  "Affecté au service": "status.assignedToService",
};

const ROLE_KEYS = {
  "Chef de division": "roles.divisionHead",
  "Chef de service": "roles.serviceHead",
  Agent: "roles.agent",
  "Agent du Bureau d'Ordre": "roles.boAgent",
};

const ACTION_KEYS = {
  Création: "bo.actions.create",
  Modification: "bo.actions.update",
  Suppression: "bo.actions.delete",
  Affectation: "bo.actions.assign",
  Annulation: "bo.actions.cancel",
};

const NOTIF_TYPE_KEYS = {
  NOUVEAU_COURRIER: "notifications.types.newMail",
  AFFECTATION: "notifications.types.assignment",
  TRAITEMENT: "notifications.types.processing",
  SYSTEME: "notifications.types.system",
};

export function translateStatus(t, statut) {
  if (!statut) return t("common.emDash");
  const key = STATUS_KEYS[statut] || STATUS_KEYS[String(statut).toUpperCase()];
  return key ? t(key) : statut;
}

export function translateRole(t, role) {
  if (!role) return t("common.emDash");
  return ROLE_KEYS[role] ? t(ROLE_KEYS[role]) : role;
}

export function translateAction(t, action) {
  if (!action) return t("common.emDash");
  return ACTION_KEYS[action] ? t(ACTION_KEYS[action]) : action;
}

export function translateNotifType(t, type) {
  return NOTIF_TYPE_KEYS[type] ? t(NOTIF_TYPE_KEYS[type]) : t("notifications.types.system");
}

export function formatFileSize(t, octets) {
  if (!octets) return null;
  if (octets > 1048576) return t("common.megabytes", { n: (octets / 1048576).toFixed(1) });
  if (octets >= 1024) return t("common.kilobytes", { n: (octets / 1024).toFixed(0) });
  return t("common.bytes", { n: octets });
}

export function timeAgo(t, dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("notifications.justNow");
  if (m < 60) return t("notifications.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("notifications.hoursAgo", { n: h });
  return t("notifications.daysAgo", { n: Math.floor(h / 24) });
}

export function removeBOPrefix(filename) {
  if (!filename) return filename;
  // Supprime le préfixe technique "bo_<id>_" (ex: bo_2_description.pdf -> description.pdf)
  // ainsi que l'ancien format "bo_" seul.
  return filename.replace(/^bo_\d+_/, "").replace(/^bo_/, "");
}
