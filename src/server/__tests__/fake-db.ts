/**
 * Just enough of the supabase-js query builder for the agenda server, backed
 * by arrays. Emulates the two constraints the server relies on: the booking
 * overlap exclusion (23P01) and the unique LiveKit event id (23505).
 */

type Row = Record<string, any>;
type Filter = (row: Row) => boolean;

export function createFakeDb() {
  const tables: Record<string, Row[]> = { agenda_bookings: [], agenda_blocks: [], agenda_video_events: [] };

  function violates(table: string, row: Row): { code: string } | null {
    if (table === "agenda_bookings" && row.status === "confirmed") {
      const clash = tables.agenda_bookings.some(
        (b) =>
          b.id !== row.id &&
          b.status === "confirmed" &&
          b.scope === row.scope &&
          b.calendar === row.calendar &&
          Date.parse(b.starts_at) < Date.parse(row.blocked_until) &&
          Date.parse(row.starts_at) < Date.parse(b.blocked_until),
      );
      if (clash) return { code: "23P01" };
    }
    if (table === "agenda_video_events" && row.livekit_event_id) {
      if (tables.agenda_video_events.some((e) => e.livekit_event_id === row.livekit_event_id)) return { code: "23505" };
    }
    return null;
  }

  function from(table: string) {
    const filters: Filter[] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | null = null;
    let single: "one" | "maybe" | null = null;
    let order: { col: string; asc: boolean } | null = null;

    const run = () => {
      const rows = (tables[table] ??= []);
      if (op === "insert") {
        const row: Row = { created_at: new Date().toISOString(), answers: {}, ...payload };
        if (table === "agenda_video_events") row.id = rows.length + 1;
        const error = violates(table, row);
        if (error) return { data: null, error };
        rows.push(row);
        return { data: single ? { ...row } : [{ ...row }], error: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (op === "update") {
        for (const r of matched) {
          const next = { ...r, ...payload };
          const error = violates(table, next);
          if (error) return { data: null, error };
          Object.assign(r, payload);
        }
      }
      if (op === "delete") {
        tables[table] = rows.filter((r) => !matched.includes(r));
      }
      if (order) {
        const { col, asc } = order;
        matched = [...matched].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1));
      }
      const data = matched.map((r) => ({ ...r }));
      if (single === "one") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116" } };
      if (single === "maybe") return { data: data[0] ?? null, error: null };
      return { data, error: null };
    };

    const builder: any = {
      select: () => builder,
      insert: (row: Row) => ((op = "insert"), (payload = row), builder),
      update: (patch: Row) => ((op = "update"), (payload = patch), builder),
      delete: () => ((op = "delete"), builder),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), builder),
      gt: (c: string, v: string) => (filters.push((r) => r[c] > v), builder),
      gte: (c: string, v: string) => (filters.push((r) => r[c] >= v), builder),
      lt: (c: string, v: string) => (filters.push((r) => r[c] < v), builder),
      lte: (c: string, v: string) => (filters.push((r) => r[c] <= v), builder),
      order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), builder),
      limit: () => builder,
      single: () => ((single = "one"), builder),
      maybeSingle: () => ((single = "maybe"), builder),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve().then(run).then(resolve, reject),
    };
    return builder;
  }

  return { tables, from };
}
