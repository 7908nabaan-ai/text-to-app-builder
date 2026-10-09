import { supabase } from "@/integrations/supabase/client";

export const ACTIVE_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "awaiting_customer",
  "customer_updated",
  "confirmed",
  "loading",
] as const;

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  awaiting_customer: "Awaiting your reply",
  customer_updated: "Customer updated",
  confirmed: "Confirmed",
  loading: "Loading",
  shipped: "Shipped",
  completed: "Completed",
};

export type OrderLine = {
  id: string;
  order_id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  category_name: string | null;
  image_path: string | null;
  unit: string;
  cbm_per_carton: number;
  catalog_price: number;
  negotiated_price: number;
  requested_quantity: number;
  proposed_quantity: number | null;
  current_quantity: number;
  final_quantity: number | null;
  approval_status?: string;
  gross_weight_kg?: number;
  availability?: string;
};

export async function logOrderEvent(input: {
  order_id: string;
  event_type: string;
  actor_role?: string | null;
  sku?: string | null;
  product_name?: string | null;
  previous_quantity?: number | null;
  new_quantity?: number | null;
  previous_price?: number | null;
  new_price?: number | null;
  previous_status?: string | null;
  new_status?: string | null;
  reason?: string | null;
}) {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("order_events").insert({ ...input, actor_id: auth.user?.id ?? null });
}

export async function getOrCreateDraftOrder(customerId: string) {
  const { data: existing, error } = await supabase
    .from("orders")
    .select("*")
    .eq("customer_id", customerId)
    .in("status", [...ACTIVE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (existing) return existing;

  const { data: container, error: containerError } = await supabase
    .from("container_types")
    .select("*")
    .eq("is_active", true)
    .order("capacity_cbm")
    .limit(1)
    .maybeSingle();
  if (containerError) throw containerError;
  if (!container) throw new Error("No container types configured yet.");

  const { data: created, error: createError } = await supabase
    .from("orders")
    .insert({
      customer_id: customerId,
      container_type_id: container.id,
      container_capacity_cbm: container.capacity_cbm,
    })
    .select("*")
    .single();
  if (createError) throw createError;
  await logOrderEvent({
    order_id: created.id,
    event_type: "order_created",
    actor_role: "customer",
    new_status: "draft",
  });
  return created;
}

export const COMPLETED_STATUSES = ["shipped", "completed"] as const;
export const NEGOTIATION_STATUSES = ["submitted", "under_review", "awaiting_customer", "customer_updated"] as const;

/** Starts a new draft order on the chosen container (limits are snapshotted by the database). */
export async function createOrder(customerId: string, containerTypeId: string) {
  const { data: container, error: ce } = await supabase
    .from("container_types").select("*").eq("id", containerTypeId).maybeSingle();
  if (ce) throw ce;
  if (!container) throw new Error("Container not found");
  const { data, error } = await supabase
    .from("orders")
    .insert({ customer_id: customerId, container_type_id: container.id, container_capacity_cbm: container.capacity_cbm })
    .select("*").single();
  if (error) throw error;
  await logOrderEvent({ order_id: data.id, event_type: "order_created", actor_role: "customer", new_status: "draft", reason: container.name });
  return data;
}

/** Latest editable draft for a customer, or null (customer must pick a container first). */
export async function getDraftOrder(customerId: string) {
  const { data, error } = await supabase
    .from("orders").select("*").eq("customer_id", customerId)
    .in("status", ["draft", "submitted", "under_review", "awaiting_customer", "customer_updated"]).eq("is_locked", false)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

/** Adds one carton of a product to an order (or bumps the existing line). */
export async function addProductToOrder(order: { id: string; status: string }, product: { id: string; sku: string; name: string }, step = 1) {
  const { data: existing } = await supabase
    .from("order_lines").select("*").eq("order_id", order.id).eq("sku", product.sku).maybeSingle();
  if (existing) {
    const next = existing.current_quantity + step;
    const patch: { current_quantity: number; requested_quantity?: number } = { current_quantity: next };
    if (order.status === "draft") patch.requested_quantity = next;
    const { error } = await supabase.from("order_lines").update(patch).eq("id", existing.id);
    if (error) throw error;
    await logOrderEvent({ order_id: order.id, event_type: "quantity_changed", actor_role: "customer", sku: product.sku, product_name: product.name, previous_quantity: existing.current_quantity, new_quantity: next });
    return;
  }
  // Price, CBM, weight and product details are filled in by the database from the catalogue.
  const { error } = await supabase.from("order_lines").insert({
    order_id: order.id, product_id: product.id, sku: product.sku, product_name: product.name,
    unit: "", cbm_per_carton: 0, catalog_price: 0, negotiated_price: 0,
    requested_quantity: step, current_quantity: step,
  });
  if (error) throw error;
  await logOrderEvent({ order_id: order.id, event_type: "line_added", actor_role: "customer", sku: product.sku, product_name: product.name, new_quantity: step });
}
