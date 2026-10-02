import { createRoot } from "react-dom/client";
import { AgendaVideoCall } from "../src/video/react";

// Dev-only harness: ?name=…&role=guest|host&room=… joins a local LiveKit
// (`livekit-server --dev`) with a token minted by serve.mjs.
const params = new URLSearchParams(location.search);
const name = params.get("name") ?? "Ada Lovelace · Analytical Engines";
const role = params.get("role") ?? "guest";
const room = params.get("room") ?? "agenda-playground";

function App() {
  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: "0 16px" }}>
      <p style={{ opacity: 0.6, fontSize: 13 }}>agendaapp playground · {role} · {room}</p>
      <AgendaVideoCall
        displayName={name}
        title="Intro call · 20 min"
        getAccess={async () => {
          const res = await fetch(`/token?${new URLSearchParams({ name, role, room })}`);
          return res.json();
        }}
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
