import pg from 'pg';
import { eraseMember } from './eraseMember.ts';
import { loadConfig } from './config.ts';

const target = process.argv[2]?.trim() ?? '';
if (!target) {
  console.error('Indique l’email du compte à supprimer.');
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: loadConfig().databaseUrl });
const client = await pool.connect();
try {
  const result = await eraseMember(client, target);
  if (!result.ok) {
    console.error(result.error === 'forbidden' ? 'Suppression refusée.' : 'Compte introuvable.');
    process.exit(1);
  }
  console.log('Compte supprimé.');
} finally {
  client.release();
  await pool.end();
}
