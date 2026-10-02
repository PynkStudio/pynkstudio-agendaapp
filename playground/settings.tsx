import { createRoot } from "react-dom/client";
import { AgendaSettingsPanel } from "../src/settings/react";

createRoot(document.getElementById("root")!).render(
  <main style={{ maxWidth: 960, margin: "32px auto", padding: "0 16px" }}>
    <h1 style={{ fontSize: 24, fontWeight: 600 }}>Agenda — impostazioni</h1>
    <AgendaSettingsPanel
      endpoints={{ settings: "/api/settings", host: "/api/host", calendars: "/api/calendars", oauthStart: "/api/oauth/start" }}
      returnTo="/settings"
      locale="it"
    />
  </main>,
);
