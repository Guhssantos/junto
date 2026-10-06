import { describeActivity } from '@/lib/activity';
import { categoryById, suggestCategory } from '@/lib/categories';
import { initials, joinNames, parseBRDate, timeAgo } from '@/lib/format';
import { buildInviteLink, normalizeInviteCode, parseInvite, safeNext } from '@/lib/invite';
import { buildRoleMap, can } from '@/lib/permissions';
import type { ActivityEntry } from '@/types/models';

describe('convites', () => {
  it('normaliza o código digitado', () => {
    expect(normalizeInviteCode('abcd1234')).toBe('ABCD-1234');
    expect(normalizeInviteCode(' abcd-1234 ')).toBe('ABCD-1234');
    expect(normalizeInviteCode('ABC-1234')).toBeNull();
    expect(normalizeInviteCode('1234-ABCD')).toBeNull();
  });
  it('lê código de link, QR Code ou texto', () => {
    expect(parseInvite('junto://join/ABCD-1234')).toBe('ABCD-1234');
    expect(parseInvite('https://junto.app/join/abcd-1234?utm=x')).toBe('ABCD-1234');
    expect(parseInvite('https://x.com/?code=ABCD1234')).toBe('ABCD-1234');
    expect(parseInvite('https://golpe.com/qualquer')).toBeNull();
  });
  it('monta link com esquema do app ou domínio', () => {
    expect(buildInviteLink('ABCD-1234', undefined)).toBe('junto://join/ABCD-1234');
    expect(buildInviteLink('ABCD-1234', 'https://junto.app/')).toBe('https://junto.app/join/ABCD-1234');
  });
  it('só redireciona para rotas de convite (sem redirecionamento aberto)', () => {
    expect(safeNext('/join/ABCD-1234')).toBe('/join/ABCD-1234');
    expect(safeNext('https://evil.com')).toBeNull();
    expect(safeNext('/profile')).toBeNull();
  });
});

describe('categorias', () => {
  it.each([
    ['Leite integral', 'laticinios'],
    ['Arroz 5 kg', 'alimentos'],
    ['Picanha', 'carnes'],
    ['Pão de queijo', 'padaria'],
    ['Detergente', 'limpeza'],
    ['Ração gato', 'pets'],
    ['Pilhas AA', 'outros'],
  ])('%s → %s', (name, cat) => expect(suggestCategory(name)).toBe(cat));

  it('categoria desconhecida cai em Outros', () => {
    expect(categoryById('nao-existe').id).toBe('outros');
  });
});

describe('formatação', () => {
  it('converte data brasileira', () => {
    expect(parseBRDate('05/10/2026')).toBe('2026-10-05');
    expect(parseBRDate('31/02/2026')).toBeNull();
    expect(parseBRDate('2026-10-05')).toBeNull();
  });
  it('tempo relativo', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    expect(timeAgo('2026-10-05T11:59:30Z', now)).toBe('agora');
    expect(timeAgo('2026-10-05T11:55:00Z', now)).toBe('há 5 min');
    expect(timeAgo('2026-10-04T11:00:00Z', now)).toBe('ontem');
  });
  it('nomes e iniciais', () => {
    expect(joinNames(['Gustavo', 'Larissa'])).toBe('Gustavo + Larissa');
    expect(joinNames(['A', 'B', 'C', 'D'])).toBe('A, B +2');
    expect(initials('Gustavo Santos')).toBe('GS');
    expect(initials('')).toBe('?');
  });
});

describe('histórico', () => {
  const entry = (action: string, details = {}): ActivityEntry => ({
    id: 1, list_id: 'l', actor_id: 'u', action, product_id: 'p', product_name: 'Arroz', details, created_at: '2026-10-05T12:35:00Z',
  });
  it('descreve as ações', () => {
    expect(describeActivity(entry('product_added'), 'Gustavo')).toBe('Gustavo adicionou “Arroz”.');
    expect(describeActivity(entry('price_changed', { actual_to: 27.9 }), 'Larissa')).toBe('Larissa alterou o preço de “Arroz” para R$ 27,90.');
    expect(describeActivity(entry('product_purchased'), 'Gustavo')).toBe('Gustavo marcou “Arroz” como comprado.');
  });
});

describe('permissões (interface)', () => {
  it('usa o mapa local quando o servidor ainda não respondeu', () => {
    const map = buildRoleMap(undefined);
    expect(can('admin', 'member.remove', map)).toBe(true);
    expect(can('participant', 'member.remove', map)).toBe(false);
    expect(can('participant', 'product.price', map)).toBe(true);
    expect(can(null, 'product.price', map)).toBe(false);
  });
  it('aceita papéis novos vindos do banco', () => {
    const map = buildRoleMap([{ role_id: 'viewer', permission_id: 'chat.send' }]);
    expect(can('viewer', 'chat.send', map)).toBe(true);
    expect(can('viewer', 'product.create', map)).toBe(false);
  });
});
