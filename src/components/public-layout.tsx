import { Link } from "@tanstack/react-router";
import { Ship } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About Us" },
  { to: "/products", label: "Products" },
  { to: "/contact", label: "Contact" },
] as const;

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2 text-primary">
            <Ship className="h-5 w-5 text-gold" />
            <span className="font-display text-lg font-bold tracking-wide">SKY PLUS</span>
          </Link>
          <nav className="ml-6 hidden gap-5 text-sm md:flex">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                activeOptions={{ exact: true }}
                className="text-muted-foreground hover:text-foreground"
                activeProps={{ className: "font-semibold text-foreground" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <Button asChild size="sm" className="ml-auto">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
        <nav className="flex justify-around border-t border-border py-2 text-sm md:hidden">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: true }}
              className="text-muted-foreground"
              activeProps={{ className: "font-semibold text-foreground" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm sm:flex-row sm:justify-between">
          <span className="font-display font-bold tracking-wide">
            SKY PLUS <span className="text-gold">·</span> Wholesale container supply
          </span>
          <span className="opacity-70">© {new Date().getFullYear()} Sky Plus</span>
        </div>
      </footer>
    </div>
  );
}
