import { createRoot } from "react-dom/client";
import { Component } from "react";
import App from "./app/App.jsx";
import { I18nProvider } from "./i18n";
import "./styles/index.css";

const ERROR_COPY = {
  fr: { title: "Erreur de rendu React", reload: "Recharger" },
  ar: { title: "خطأ في عرض الواجهة", reload: "إعادة التحميل" },
};

function errorCopy() {
  try {
    const lang = localStorage.getItem("app_lang") === "ar" ? "ar" : "fr";
    return ERROR_COPY[lang];
  } catch {
    return ERROR_COPY.fr;
  }
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[ErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          fontFamily: "monospace", padding: "2rem", maxWidth: "900px",
          margin: "2rem auto", background: "#fff5f5", border: "2px solid #f87171",
          borderRadius: "12px"
        }}>
          <h1 style={{ color: "#dc2626", fontSize: "1.25rem" }}>
            {errorCopy().title}
          </h1>
          <pre style={{
            background: "#1e1e1e", color: "#f8f8f2", padding: "1rem",
            borderRadius: "8px", overflow: "auto", fontSize: "0.8rem",
            marginTop: "1rem", whiteSpace: "pre-wrap"
          }}>
            {this.state.error?.toString()}
            {"\n\n"}
            {this.state.info?.componentStack}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1rem", padding: "0.5rem 1.5rem",
              background: "#dc2626", color: "white", border: "none",
              borderRadius: "8px", cursor: "pointer", fontWeight: "bold"
            }}
          >
            {errorCopy().reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <I18nProvider>
      <App />
    </I18nProvider>
  </ErrorBoundary>
);
