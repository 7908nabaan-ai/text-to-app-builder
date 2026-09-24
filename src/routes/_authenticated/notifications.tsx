import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Sky Plus" },
      { name: "description", content: "Updates about your orders, invoices and shipments." },
      { property: "og:title", content: "Notifications — Sky Plus" },
      { property: "og:description", content: "Updates about your orders, invoices and shipments." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <Page title="Notifications">
      {() => <NotificationList />}
    </Page>
  );
}

function NotificationList() {
  const queryClient = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  if (data.length === 0) {
    return <EmptyState title="Nothing yet" description="Order updates will appear here." />;
  }

  return (
    <div className="space-y-3">
      {data.some((n) => !n.is_read) && (
        <Button variant="outline" className="h-11" onClick={() => markAll.mutate()}>
          Mark all as read
        </Button>
      )}
      {data.map((item) => (
        <Card key={item.id} className={item.is_read ? "opacity-70" : "border-accent"}>
          <CardContent className="pt-5">
            <p className="font-medium">{item.title}</p>
            {item.body && <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>}
            <p className="stat-label mt-2">{new Date(item.created_at).toLocaleString()}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
