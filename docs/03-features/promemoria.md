# Promemoria

Il pacchetto non ha scheduler: l'app chiama `claimDueReminders` da un cron (Vercel Cron, pg_cron, ecc.), tipicamente ogni minuto.

```ts
const due = await agenda.claimDueReminders({ leadMinutes: 20, scope: "my-project" });
for (const booking of due) {
  await sendMail(booking.email, reminderHtml({ booking, joinUrl: agenda.guestUrlFor(booking) }));
}
```

## Garanzie

- Restituisce le prenotazioni confermate che iniziano entro `leadMinutes` e **non ancora ricordate**, e le marca (`reminder_sent_at`) nella **stessa UPDATE**: due esecuzioni sovrapposte non inviano due volte.
- La marcatura avviene prima dell'invio: se l'invio fallisce, quel promemoria non viene ritentato. Scelta voluta (meglio nessun promemoria che due); da rivedere in [[backlog]] se serve un ritentativo.

## Contenuto

Stessa regola della conferma: per gli appuntamenti `video` il promemoria contiene il link personale ([[link-ospite-ed-email]]), ricostruito con `guestUrlFor`.
