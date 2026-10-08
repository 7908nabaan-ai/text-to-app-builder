import { useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BackButton({ fallback = "/", className }: { fallback?: string; className?: string }) {
  const router = useRouter();
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else router.navigate({ to: fallback });
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={goBack}
      aria-label="Go back"
      className={cn("h-9 w-9 shrink-0", className)}
    >
      <ArrowLeft className="h-5 w-5" />
    </Button>
  );
}
