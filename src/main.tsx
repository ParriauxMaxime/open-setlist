import "@i18n";
import { seedIfEmpty } from "@db/seed";
import { applyPreferences, loadPreferences } from "@domain/preferences";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/global.css";

// Apply display preferences before render to prevent flash of default styles
applyPreferences(loadPreferences());

// Service worker: register in production, unregister + clear caches in dev
if ("serviceWorker" in navigator) {
  if (process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register(`${__BASE_PATH__}sw.js`);
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) reg.unregister();
    });
    caches.keys().then((keys) => {
      for (const key of keys) caches.delete(key);
    });
  }
}

seedIfEmpty().then(() => {
  const root = document.getElementById("root");
  if (!root) throw new Error("Missing #root element");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
