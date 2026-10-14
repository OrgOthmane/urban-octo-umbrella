import { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { CourrierEntrant } from "./components/CourrierEntrant";
import { CourrierSortant } from "./components/CourrierSortant";
import { Archives } from "./components/Archives";
import { Utilisateurs } from "./components/Utilisateurs";
import { Login } from "./components/Login";
import Parametres from "./components/Parametres";
import BureauOrdre from "./components/BureauOrdre";
import Telechargements from "./components/Telechargements";
import { tokenStorage } from "../services/api";

export default function App() {
  const [activeView, setActiveView]     = useState("dashboard");
  const [userConnecte, setUserConnecte] = useState(null);

  useEffect(() => {
    const savedUser = tokenStorage.getUser();
    const savedToken = tokenStorage.getToken();

    if (savedUser && savedToken) {
      setUserConnecte(savedUser);
    }

    const savedView = sessionStorage.getItem("activeView");
    if (savedView) {
      setActiveView(savedView);
    } else if (savedUser && savedUser.role === "Agent") {
      setActiveView("courrier-entrant");
    }
  }, []);

  useEffect(() => {
    const handle401 = () => handleLogout();
    window.addEventListener("auth:unauthorized", handle401);
    return () => window.removeEventListener("auth:unauthorized", handle401);
  }, []);

  const handleViewChange = (view) => {
    setActiveView(view);
    sessionStorage.setItem("activeView", view);
  };

  const handleLoginSuccess = (user) => {
    setUserConnecte(user);
  };

  const handleLogout = () => {
    tokenStorage.clear();
    setUserConnecte(null);
    setActiveView("dashboard");
  };

  if (!userConnecte) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  if (userConnecte.role === "Agent du Bureau d'Ordre") {
    return (
      <BureauOrdre
        userConnecte={userConnecte}
        onLogout={handleLogout}
      />
    );
  }

  const renderView = () => {
    switch (activeView) {
      case "dashboard":
        return <Dashboard userConnecte={userConnecte} />;
      case "courrier-entrant":
        return <CourrierEntrant userConnecte={userConnecte} />;
      case "utilisateurs":
        return <Utilisateurs userConnecte={userConnecte} />;
      case "courrier-sortant":
        return <CourrierSortant userConnecte={userConnecte} />;
      case "archives":
        return <Archives userConnecte={userConnecte} />;
      case "parametres":
        return <Parametres />;
      case "telechargements":
        return <Telechargements userConnecte={userConnecte} />;
      case "statistiques":
      default:
        return <Dashboard />;
    }
  };

  const handleNavigateToCourrier = ({ courrier_id, bo_courrier_id, type }) => {
    handleViewChange("courrier-entrant");
  };

  return (
    <div className="size-full flex flex-col bg-gray-50">
      <Navbar
        user={userConnecte}
        onLogout={handleLogout}
        onNavigateToCourrier={handleNavigateToCourrier}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeView={activeView}
          onViewChange={handleViewChange}
          userConnecte={userConnecte}
        />
        <main className="flex-1 overflow-y-auto">{renderView()}</main>
      </div>
    </div>
  );
}
