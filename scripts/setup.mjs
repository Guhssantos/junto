// Assistente de configuração: cria o arquivo .env pedindo só o essencial.
// Uso: npm run setup
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const rl = createInterface({ input: process.stdin, output: process.stdout });

const current = existsSync(envPath)
  ? Object.fromEntries(
      readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
    )
  : {};

async function ask(question, key, { required = false, validate } = {}) {
  for (;;) {
    const def = current[key] ? ` [${current[key]}]` : '';
    const answer = (await rl.question(`${question}${def}: `)).trim() || current[key] || '';
    if (!answer && !required) return '';
    const problem = !answer ? 'obrigatório' : validate?.(answer);
    if (!problem) return answer;
    console.log(`  ✗ ${problem}`);
  }
}

console.log('\nJunto — configuração\n');
console.log('Pegue os dados em https://supabase.com/dashboard → seu projeto → Project Settings → API.\n');

const url = await ask('URL do projeto (https://xxxx.supabase.co)', 'EXPO_PUBLIC_SUPABASE_URL', {
  required: true,
  validate: (v) => (/^https?:\/\/[^\s/]+$/.test(v.replace(/\/$/, '')) ? null : 'use o formato https://xxxx.supabase.co'),
});
const key = await ask('Chave pública (anon ou publishable)', 'EXPO_PUBLIC_SUPABASE_KEY', {
  required: true,
  validate: (v) => {
    if (v.startsWith('sb_secret_')) return 'esta é a chave SECRETA — use a anon/publishable';
    try {
      const payload = JSON.parse(Buffer.from(v.split('.')[1] ?? '', 'base64url').toString());
      if (payload.role === 'service_role') return 'esta é a service_role (secreta) — use a anon';
    } catch {
      // chave no formato novo (sb_publishable_...)
    }
    return v.length < 20 ? 'chave muito curta' : null;
  },
});
const site = await ask('Endereço do site publicado, para links de convite (opcional)', 'EXPO_PUBLIC_INVITE_BASE_URL', {
  validate: (v) => (/^https:\/\/[^\s]+$/.test(v) ? null : 'use https://...'),
});
const eas = await ask('ID do projeto EAS, para push no celular (opcional)', 'EXPO_PUBLIC_EAS_PROJECT_ID');
rl.close();

writeFileSync(
  envPath,
  [
    '# Gerado por `npm run setup`. Apenas valores públicos — nunca coloque a service_role aqui.',
    `EXPO_PUBLIC_SUPABASE_URL=${url.replace(/\/$/, '')}`,
    `EXPO_PUBLIC_SUPABASE_KEY=${key}`,
    `EXPO_PUBLIC_EAS_PROJECT_ID=${eas}`,
    `EXPO_PUBLIC_INVITE_BASE_URL=${site.replace(/\/$/, '')}`,
    '',
  ].join('\n'),
);

// Confere se o banco está acessível e com as migrações aplicadas.
try {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/keepalive`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (res.ok) console.log('\n✓ Supabase respondeu e as migrações estão aplicadas.');
  else if (res.status === 404) console.log('\n! Conectou, mas as migrações ainda não foram aplicadas (veja docs/DEPLOY_GRATUITO.md, passo 1).');
  else console.log(`\n! O Supabase respondeu ${res.status}. Confira a URL e a chave.`);
} catch {
  console.log('\n! Não foi possível falar com o Supabase agora (sem internet ou URL incorreta).');
}
console.log('✓ Arquivo .env salvo. Rode `npm run web` (navegador) ou `npm start` (celular).\n');
