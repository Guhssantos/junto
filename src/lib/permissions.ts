import type { Permission, RoleId } from '@/types/models';

// Espelho local de public.role_permissions, usado só para esconder botões.
// A autorização de verdade acontece no banco (RLS + RPC); o app carrega a tabela
// do servidor e usa este mapa apenas enquanto ela não chegou ou offline.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    'list.update', 'list.close', 'list.delete', 'member.invite', 'member.remove', 'member.manage',
    'product.create', 'product.update', 'product.delete', 'product.price', 'product.purchase',
    'chat.send', 'approval.request', 'approval.respond',
  ],
  participant: [
    'product.create', 'product.update', 'product.price', 'product.purchase',
    'chat.send', 'approval.request', 'approval.respond',
  ],
};

export type RolePermissionMap = Record<string, ReadonlySet<Permission>>;

export function buildRoleMap(rows: { role_id: string; permission_id: string }[] | undefined): RolePermissionMap {
  const source: Record<string, Permission[]> = rows?.length
    ? rows.reduce<Record<string, Permission[]>>((acc, r) => {
        (acc[r.role_id] ??= []).push(r.permission_id as Permission);
        return acc;
      }, {})
    : DEFAULT_ROLE_PERMISSIONS;
  return Object.fromEntries(Object.entries(source).map(([k, v]) => [k, new Set(v)]));
}

export function can(role: RoleId | null | undefined, perm: Permission, map: RolePermissionMap): boolean {
  if (!role) return false;
  return map[role]?.has(perm) ?? false;
}

export const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', participant: 'Participante' };
