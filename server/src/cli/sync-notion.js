// Synchronisation Notion en ligne de commande (utile en tâche cron du NAS) :
//   NOTION_TOKEN=secret_xxx npm run sync:notion [-- --force]
import { openDb } from '../db.js';
import { synchroniser } from '../services/notionSync.js';

const db = openDb();
try {
  const r = await synchroniser(db, { force: process.argv.includes('--force'), declencheur: 'ligne de commande' });
  console.log('Synchronisation terminée :', JSON.stringify(r, null, 2));
} catch (e) {
  console.error('Échec de la synchronisation :', e.message);
  process.exitCode = 1;
}
