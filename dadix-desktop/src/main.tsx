import React from "react";
import ReactDOM from "react-dom/client";
import { installDesktopGuards } from "./bridge/networkGuard";
import App from "./App";
import "./styles.css";

installDesktopGuards();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
