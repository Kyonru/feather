import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "./providers";
import { Router } from "./router";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppProvider>
      <Router />
    </AppProvider>
  </React.StrictMode>
);
