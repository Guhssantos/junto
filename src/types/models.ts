// Tipos do domínio — espelham as tabelas em supabase/migrations.

export type UUID = string;

export type ListStatus = 'active' | 'completed' | 'archived';
export type MemberStatus = 'pending' | 'active' | 'rejected' | 'left' | 'removed';
export type RoleId = 'admin' | 'participant' | (string & {});
export type Permission =
  | 'list.update'
  | 'list.close'
  | 'list.delete'
  | 'member.invite'
  | 'member.remove'
  | 'member.manage'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'product.price'
  | 'product.purchase'
  | 'chat.send'
  | 'approval.request'
  | 'approval.respond';

export type ProductStatus =
  | 'pending'
  | 'in_review'
  | 'awaiting_confirmation'
  | 'approved'
  | 'rejected'
  | 'purchased'
  | 'unavailable'
  | 'cancelled';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** Unidade opcional: uma das sugeridas (lib/units.ts), texto livre curto ou null. */
export type Unit = string | null;

export interface Profile {
  id: UUID;
  name: string;
  avatar_url: string | null;
  push_enabled?: boolean;
  created_at?: string;
}

export interface Category {
  id: string;
  name: string;
  emoji: string;
  sort_order: number;
  keywords: string[];
}

export interface ShoppingList {
  id: UUID;
  name: string;
  description: string | null;
  note: string | null;
  purchase_date: string | null;
  owner_id: UUID | null;
  status: ListStatus;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ListMember {
  id: UUID;
  list_id: UUID;
  user_id: UUID;
  role_id: RoleId;
  status: MemberStatus;
  joined_at: string | null;
  created_at: string;
  profile?: Profile | null;
}

export interface Product {
  id: UUID;
  list_id: UUID;
  name: string;
  category_id: string;
  quantity: number;
  unit: Unit;
  estimated_price: number | null;
  actual_price: number | null;
  note: string | null;
  status: ProductStatus;
  added_by: UUID | null;
  assigned_to: UUID | null;
  updated_by: UUID | null;
  purchased_by: UUID | null;
  purchased_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  /** Somente no cliente: alteração ainda na fila offline. */
  _pending?: boolean;
}

export interface ApprovalRequest {
  id: UUID;
  list_id: UUID;
  product_id: UUID;
  requested_by: UUID | null;
  status: ApprovalStatus;
  is_new_product: boolean;
  price: number | null;
  message: string | null;
  responded_by: UUID | null;
  response_note: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface Message {
  id: UUID;
  list_id: UUID;
  product_id: UUID | null;
  sender_id: UUID | null;
  body: string;
  kind: 'text' | 'system';
  created_at: string;
  /** Foto (chat-images/<list_id>/<uuid>.jpg, bucket privado) — opcional. */
  image_path?: string | null;
  image_width?: number | null;
  image_height?: number | null;
  _pending?: boolean;
  /** Foto ainda sendo enviada: mostrada a partir do aparelho. */
  _localUri?: string;
}

export type NotificationType =
  | 'product_added'
  | 'product_removed'
  | 'price_changed'
  | 'product_purchased'
  | 'member_joined'
  | 'member_left'
  | 'join_request'
  | 'join_accepted'
  | 'join_rejected'
  | 'message'
  | 'approval_request'
  | 'approval_approved'
  | 'approval_rejected'
  | 'list_completed';

export interface AppNotification {
  id: UUID;
  user_id: UUID;
  list_id: UUID | null;
  product_id: UUID | null;
  actor_id: UUID | null;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  list_id: UUID;
  actor_id: UUID | null;
  action: string;
  product_id: UUID | null;
  product_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export interface ListSummary {
  list_id: UUID;
  items_count: number;
  purchased_count: number;
  total_estimated: number;
  total_updated: number;
  total_spent: number;
  awaiting_count: number;
}

export interface PurchaseHistory {
  id: UUID;
  list_id: UUID;
  items_count: number;
  purchased_count: number;
  total_estimated: number;
  total_actual: number;
  completed_by: UUID | null;
  completed_at: string;
}

/** Lista com dados agregados para a Home. */
export interface ListOverview extends ShoppingList {
  members: ListMember[];
  summary: ListSummary;
  myRole: RoleId;
}

export interface FieldConflict {
  field: keyof Product;
  yours: unknown;
  theirs: unknown;
  base: unknown;
}

export interface UpdateProductResult {
  status: 'ok' | 'conflict';
  product: Product;
  conflicts: FieldConflict[];
}
