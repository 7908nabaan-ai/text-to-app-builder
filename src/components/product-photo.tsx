import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export function ProductPhoto({ path, alt, className }: { path: string | null | undefined; alt: string; className?: string }) {
  const { data: url } = useQuery({
    queryKey: ["product-photo", path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("product-images").createSignedUrl(path!, 3600);
      return data?.signedUrl ?? null;
    },
  });
  return (
    <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted", className ?? "h-16 w-16")}>
      {url ? (
        <img src={url} alt={alt} loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <Package className="h-6 w-6 text-muted-foreground" />
      )}
    </div>
  );
}
