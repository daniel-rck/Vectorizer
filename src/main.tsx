import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import "./app/index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root fehlt in index.html");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
