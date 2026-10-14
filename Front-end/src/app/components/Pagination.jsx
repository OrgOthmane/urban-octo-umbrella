import { ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n/I18nProvider";

/**
 * Barre de pagination minimaliste (style Tailwind UI, cohérente avec le thème
 * « premium » de l'application : neutre, compacte, épurée).
 *
 * Props (inchangées) :
 *  - page            : page courante (1-indexée)
 *  - perPage         : nombre d'éléments par page
 *  - total           : nombre total d'éléments (côté serveur)
 *  - totalPages      : nombre total de pages (côté serveur)
 *  - loading         : désactive les contrôles pendant un chargement
 *  - onPageChange    : (page:number) => void
 *  - onPerPageChange : (perPage:number) => void
 *  - perPageOptions  : options du sélecteur (défaut [10, 25, 50, 100])
 *
 * Le composant n'affiche rien tant qu'il n'y a aucun élément (total === 0).
 */

const DEFAULT_OPTIONS = [10, 25, 50, 100];

// Génère la liste des pages à afficher : 1 … (courante±1) … N, avec ellipses.
function getPageItems(current, total) {
  const items = [];
  const push = (value) => items.push({ type: "page", value });
  if (total <= 7) {
    for (let i = 1; i <= total; i++) push(i);
    return items;
  }
  push(1);
  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);
  if (current <= 3) { start = 2; end = 4; }
  if (current >= total - 2) { start = total - 3; end = total - 1; }
  if (start > 2) items.push({ type: "ellipsis", key: "s" });
  for (let i = start; i <= end; i++) push(i);
  if (end < total - 1) items.push({ type: "ellipsis", key: "e" });
  push(total);
  return items;
}

export function Pagination({
  page,
  perPage,
  total,
  totalPages,
  loading = false,
  onPageChange,
  onPerPageChange,
  perPageOptions = DEFAULT_OPTIONS,
}) {
  const { t, isRTL } = useI18n();

  if (!total || total <= 0) return null;

  const pages = totalPages && totalPages > 0
    ? totalPages
    : Math.max(1, Math.ceil(total / perPage));
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  const goTo = (p) => {
    const target = Math.min(Math.max(1, p), pages);
    if (target !== page && !loading) onPageChange?.(target);
  };

  const navBtn =
    "flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors";
  const navIdle = "text-gray-600 hover:bg-gray-100";
  const navOff = "text-gray-300 cursor-not-allowed";
  const pageBtn =
    "h-8 min-w-8 px-2 rounded-lg text-xs font-medium transition-colors";

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-100 px-4 py-2.5">
      {/* ── Gauche : taille de page + résumé compact ── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-gray-400">
            {t("pagination.perPage")}
          </span>
          <select
            aria-label={t("pagination.perPage")}
            value={perPage}
            disabled={loading}
            onChange={(e) => onPerPageChange?.(Number(e.target.value))}
            className="h-7 rounded-md border border-gray-200 bg-white pl-1.5 pr-6 text-xs font-medium text-gray-600 outline-none transition-colors hover:border-gray-300 focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5 disabled:opacity-50"
          >
            {perPageOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>

        <span className="hidden h-4 w-px bg-gray-200 sm:block" />

        <span className="text-xs text-gray-400 tabular-nums">
          {t("pagination.showing", { from, to, total })}
        </span>
      </div>

      {/* ── Droite : navigation compacte ── */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => goTo(page - 1)}
          disabled={loading || page <= 1}
          aria-label={t("pagination.prev")}
          className={`${navBtn} ${page <= 1 || loading ? navOff : navIdle}`}
        >
          <PrevIcon className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t("pagination.prev")}</span>
        </button>

        {getPageItems(page, pages).map((item, idx) =>
          item.type === "ellipsis" ? (
            <span
              key={`ell-${item.key}-${idx}`}
              className="px-0.5 text-xs text-gray-300 select-none"
            >
              …
            </span>
          ) : (
            <button
              key={item.value}
              type="button"
              onClick={() => goTo(item.value)}
              disabled={loading}
              aria-current={item.value === page ? "page" : undefined}
              className={`${pageBtn} ${item.value === page
                ? "bg-gray-900 text-white"
                : loading
                  ? "text-gray-400 cursor-not-allowed"
                  : "text-gray-600 hover:bg-gray-100"}`}
            >
              {item.value}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => goTo(page + 1)}
          disabled={loading || page >= pages}
          aria-label={t("pagination.next")}
          className={`${navBtn} ${page >= pages || loading ? navOff : navIdle}`}
        >
          <span className="hidden sm:inline">{t("pagination.next")}</span>
          <NextIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
