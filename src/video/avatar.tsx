function initialsOf(name: string): string {
  const parts = name.replace(/[·|,-].*$/, "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

// Same name → same hue, so a person keeps their color across tiles and calls.
function hueOf(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`agv-avatar agv-avatar-${size}`} style={{ ["--agv-avatar-hue" as string]: String(hueOf(name)) }}>
      {initialsOf(name)}
    </span>
  );
}
