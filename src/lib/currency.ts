import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Display-currency switch. Stored prices are always USD; switching to MYR
 * only converts what is shown, using the rate Owners set in Settings.
 */
export type DisplayCurrency = "USD" | "MYR";
const KEY = "skyplus-display-currency";
let current: DisplayCurrency = "USD";
const listeners = new Set<() => void>();

export function setDisplayCurrency(next: DisplayCurrency) {
  current = next;
  try { window.localStorage.setItem(KEY, next); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useMyrRate() {
  const { data } = useQuery({
    queryKey: ["myr-rate"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("myr_rate").maybeSingle();
      return Number(data?.myr_rate ?? 3.95);
    },
  });
  return data ?? 3.95;
}

const fmt = (amount: number, currency: DisplayCurrency) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);

export function useCurrency() {
  const { role } = useAuth();
  const raw = useSyncExternalStore(subscribe, () => current, () => "USD" as DisplayCurrency);
  // Customers always see US dollars; only staff can switch the display to MYR.
  const currency: DisplayCurrency = role === "customer" ? "USD" : raw;
  useEffect(() => {
    const saved = window.localStorage.getItem(KEY);
    if ((saved === "USD" || saved === "MYR") && saved !== current) setDisplayCurrency(saved);
  }, []);
  const rate = useMyrRate();
  return {
    currency,
    rate,
    isCustomer: role === "customer",
    setCurrency: role === "customer" ? () => undefined : setDisplayCurrency,
    /** Format a stored USD amount in the selected display currency. */
    money: (usd: number) => fmt(currency === "MYR" ? usd * rate : usd, currency),
    usd: (usd: number) => fmt(usd, "USD"),
    myr: (usd: number) => fmt(usd * rate, "MYR"),
  };
}
