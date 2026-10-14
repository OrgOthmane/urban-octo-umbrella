
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const _getToken = () => sessionStorage.getItem("auth_token");

const IFRAME_TTL = 120_000;

function _printViaIframe(src) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden;";
    iframe.src = src;

    const cleanup = () => {
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        resolve();
      } catch (err) {
        cleanup();
        reject(err);
      } finally {
        setTimeout(cleanup, IFRAME_TTL);
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("Impossible de charger le document PDF pour l'impression."));
    };

    document.body.appendChild(iframe);
  });
}

const PrintService = {
  async printById(id, userId = null) {
    const token = _getToken();
    const url = `${API_BASE_URL}/export/${encodeURIComponent(id)}`;

    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error(`Erreur lors de la génération du PDF (${response.status})`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    try {
      await _printViaIframe(blobUrl);
    } finally {
      window.URL.revokeObjectURL(blobUrl);
    }
  },

  async printByUrl(pdfUrl) {
    const token = _getToken();
    const response = await fetch(pdfUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      throw new Error(`Impossible de récupérer le document PDF (${response.status})`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    try {
      await _printViaIframe(blobUrl);
    } finally {
      window.URL.revokeObjectURL(blobUrl);
    }
  },
};

export default PrintService;
