import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function CustomerApproval({ order, disabled = false }: { order: { id: string; status: string; customer_approved_at?: string | null }; disabled?: boolean }) {
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("orders").update({
        status: "customer_updated", customer_approved_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "awaiting_customer").select("id").single();
      if (error) throw error;
      if (!data) throw new Error("The proposal changed. Reload the order and review it again.");
    },
    onSuccess: () => { toast.success("Approved — awaiting Sky Plus final approval"); void qc.invalidateQueries(); },
    onError: (error: Error) => toast.error(error.message),
  });
  if (order.customer_approved_at && order.status === "customer_updated") return <p className="text-sm font-semibold text-primary" role="status">Customer approved · Awaiting Sky Plus final approval</p>;
  if (order.status !== "awaiting_customer") return null;
  return <Button disabled={disabled || approve.isPending} onClick={() => approve.mutate()}>Approve negotiated order</Button>;
}