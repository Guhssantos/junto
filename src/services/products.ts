import { AppError, unwrap } from '@/lib/errors';
import { normalizeProduct } from '@/lib/productCache';
import { supabase } from '@/lib/supabase';
import type { ApprovalRequest, Category, Product, UpdateProductResult } from '@/types/models';

export async function fetchProducts(listId: string): Promise<Product[]> {
  const rows = unwrap(
    await supabase.from('products').select('*').eq('list_id', listId).is('deleted_at', null).order('created_at'),
  ) as Record<string, unknown>[];
  return rows.map(normalizeProduct);
}

export async function fetchCategories(): Promise<Category[]> {
  return unwrap(await supabase.from('categories').select('id, name, emoji, sort_order, keywords').order('sort_order')) as Category[];
}

export function validateProductInput(input: { name: string; quantity: number }) {
  if (!input.name.trim()) throw new AppError('validation', 'Digite o nome do produto.');
  if (input.name.trim().length > 120) throw new AppError('validation', 'O nome pode ter até 120 caracteres.');
  if (!(input.quantity > 0) || input.quantity > 99999) throw new AppError('validation', 'Informe uma quantidade maior que zero.');
}

export async function rpcAddProduct(listId: string, p: {
  id: string; name: string; quantity: number; unit: string | null; category_id: string | null; estimated_price: number | null; note: string | null;
}): Promise<Product> {
  const row = unwrap(
    await supabase.rpc('add_product', {
      p_list_id: listId,
      p_name: p.name,
      p_quantity: p.quantity,
      p_unit: p.unit,
      p_category_id: p.category_id,
      p_estimated_price: p.estimated_price,
      p_note: p.note,
      p_id: p.id,
    }),
  ) as Record<string, unknown>;
  return normalizeProduct(row);
}

export async function rpcUpdateProduct(productId: string, patch: Partial<Product>, base: Partial<Product>): Promise<UpdateProductResult> {
  const res = unwrap(
    await supabase.rpc('update_product', { p_product_id: productId, p_patch: patch, p_base: base }),
  ) as UpdateProductResult & { product: Record<string, unknown> };
  return { ...res, product: normalizeProduct(res.product) };
}

export async function rpcDeleteProduct(productId: string) {
  unwrap(await supabase.rpc('delete_product', { p_product_id: productId }));
}

export async function askPartner(listId: string, input: {
  id: string; name: string; price: number | null; quantity: number; unit: string | null; categoryId: string | null; message: string | null;
}) {
  validateProductInput(input);
  return unwrap(
    await supabase.rpc('ask_partner', {
      p_list_id: listId,
      p_name: input.name.trim(),
      p_price: input.price,
      p_quantity: input.quantity,
      p_unit: input.unit,
      p_category_id: input.categoryId,
      p_message: input.message?.trim() || null,
      p_id: input.id,
    }),
    'Não conseguimos enviar a pergunta. Verifique sua conexão.',
  );
}

export async function askAboutProduct(productId: string, price: number | null, message: string | null) {
  return unwrap(
    await supabase.rpc('ask_about_product', { p_product_id: productId, p_price: price, p_message: message?.trim() || null }),
    'Não conseguimos enviar a pergunta. Verifique sua conexão.',
  );
}

export async function respondApproval(requestId: string, approve: boolean, note?: string) {
  return unwrap(
    await supabase.rpc('respond_approval', { p_request_id: requestId, p_approve: approve, p_note: note?.trim() || null }),
    'Não conseguimos registrar sua resposta.',
  ) as ApprovalRequest;
}

export async function cancelApproval(requestId: string) {
  unwrap(await supabase.rpc('cancel_approval', { p_request_id: requestId }));
}

export async function fetchApprovals(listId: string): Promise<ApprovalRequest[]> {
  const rows = unwrap(
    await supabase.from('approval_requests').select('*').eq('list_id', listId).order('created_at', { ascending: false }).limit(100),
  ) as ApprovalRequest[];
  return rows.map((r) => ({ ...r, price: r.price == null ? null : Number(r.price) }));
}
