import { openDb } from './db.js';
import { createApp } from './app.js';
import { cloturerTout } from './services/recompenses.js';
import { notionConfig, synchroniser } from './services/notionSync.js';

const db = openDb();
const app = createApp(db);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';

app.listen(port, host, () => {
  console.log(`Scolario démarré sur http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});

// Tâches planifiées légères (pas de dépendance externe) :
// - clôture horaire des périodes de récompense échues ;
// - synchronisation Notion périodique si NOTION_SYNC_INTERVAL_HOURS > 0.
setInterval(() => {
  try { cloturerTout(db); } catch (e) { console.error('[récompenses]', e); }
}, 60 * 60 * 1000).unref();

const cfg = notionConfig();
if (cfg.token && cfg.intervalHeures > 0) {
  const lancer = () => synchroniser(db, { declencheur: 'planifié' })
    .then((r) => console.log(`[sync] OK : ${r.notions} notions, ${r.exercices} exercices, ${r.cours_telecharges} cours mis à jour`))
    .catch((e) => console.error('[sync] échec :', e.message));
  setTimeout(lancer, 30 * 1000).unref();
  setInterval(lancer, cfg.intervalHeures * 3600 * 1000).unref();
  console.log(`Synchronisation Notion planifiée toutes les ${cfg.intervalHeures} h`);
}

// Purge des sessions expirées
setInterval(() => db.prepare('DELETE FROM session WHERE expires_at < ?').run(new Date().toISOString()), 24 * 3600 * 1000).unref();
