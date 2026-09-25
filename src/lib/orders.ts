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
    .in("status", ACTIVE_STATUSES as unknown as string[])
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
