// Roda as migrações e os testes do banco num PostgreSQL embutido (PGlite/WASM).
// Funciona em Windows, macOS e Linux sem instalar PostgreSQL nem Docker.
// Para usar um PostgreSQL de verdade: `npm run test:db:pg` (scripts/test-db.sh).
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) =>
  readFileSync(join(root, p), 'utf8')
    // Comandos do psql (\set, \echo) não são SQL.
    .split(/\r?\n/)
    .filter((l) => !l.startsWith('\\'))
    .join('\n');

const db = new PGlite({ extensions: { pgcrypto } });
let notices = 0;
const onNotice = (n) => {
  const msg = String(n.message);
  if (msg.startsWith('ok - ')) {
    notices++;
    console.log(`  ✓ ${msg.slice(5)}`);
  }
};

async function run(label, file) {
  try {
    await db.exec(read(file), { onNotice });
    if (label) console.log(`→ ${label}`);
  } catch (e) {
    console.error(`✗ ${file}: ${e.message}`);
    process.exit(1);
  }
}

await run('stub do Supabase', 'supabase/tests/00_supabase_stub.sql');
for (const f of readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await run(`migração ${f}`, `supabase/migrations/${f}`);
}
await run(null, 'supabase/tests/01_security_and_flows.test.sql');
console.log(`\nTODOS OS TESTES DO BANCO PASSARAM${notices ? ` (${notices} verificações)` : ''}`);
await db.close();
