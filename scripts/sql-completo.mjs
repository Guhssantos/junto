// Junta todas as migrações num único arquivo para colar no SQL Editor do Supabase.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'supabase/migrations');
const parts = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => `\n-- >>> ${f}\n${readFileSync(join(dir, f), 'utf8')}`);
mkdirSync(join(root, 'supabase/deploy'), { recursive: true });
writeFileSync(join(root, 'supabase/deploy/junto-completo.sql'), [
  '-- =============================================================================',
  '-- Junto — banco completo (todas as migrações em ordem).',
  '-- Cole TUDO no Supabase: SQL Editor → New query → Run. Use em um projeto NOVO.',
  '-- Gerado a partir de supabase/migrations/ (não edite à mão: rode npm run sql:completo).',
  '-- =============================================================================',
  ...parts,
].join('\n'));
console.log('✓ supabase/deploy/junto-completo.sql');
