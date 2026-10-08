import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCbm, formatMoney } from "@/lib/calc";
import { downloadExcel } from "@/lib/exports";
import { Input } from "@/components/ui/input";
import { Sparkles } from "lucide-react";
import { extractPriceList } from "@/lib/pricelist.functions";

export const Route = createFileRoute("/_authenticated/staff/import")({
  head: () => ({
    meta: [
      { title: "Import catalog — Sky Plus" },
      { name: "description", content: "Bulk import products from a spreadsheet or ZIP with photos." },
      { property: "og:title", content: "Import catalog — Sky Plus" },
      { property: "og:description", content: "Bulk import products from a spreadsheet or ZIP." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportPage,
});

type Row = {
  line: number;
  sku: string;
  name: string;
  category: string;
  cbm: number;
  price: number;
  unit: string;
  description: string;
  length: number | null;
  width: number | null;
  height: number | null;
  imageName: string;
  image: Blob | null;
  errors: string[];
  warnings: string[];
  exists: boolean;
};

const HEAD = ["sku", "name", "category", "length_cm", "width_cm", "height_cm", "cbm_per_carton", "price", "unit", "description", "image"];

function ImportPage() {
  return (
    <Page title="Import catalog" description="Upload a spreadsheet, or a ZIP with a spreadsheet and product photos.">
      {({ isStaff }) =>
        isStaff ? <ImportBody /> : <EmptyState title="Staff only" description="This page is for Sky Plus staff." />
      }
    </Page>
  );
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

async function buildRows(norm: Record<string, unknown>[], images: Map<string, Blob>): Promise<Row[]> {
      const { data: existing } = await supabase.from("products").select("sku");
      const existingSkus = new Set((existing ?? []).map((p) => p.sku.toLowerCase()));
      const seen = new Map<string, number>();
      return norm.map((r, i) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const sku = String(r["sku"] ?? "").trim();
        const name = String(r["name"] ?? "").trim();
        const length = num(r["length_cm"]);
        const width = num(r["width_cm"]);
        const height = num(r["height_cm"]);
        let cbm = num(r["cbm_per_carton"] ?? r["cbm"]);
        if ((cbm === null || cbm === 0) && length && width && height) cbm = Number(((length * width * height) / 1_000_000).toFixed(4));
        const price = num(r["price"]);
        if (!sku) errors.push("Missing product code");
        if (!name) errors.push("Missing name");
        if (cbm === null || Number.isNaN(cbm) || cbm <= 0) errors.push("Invalid volume");
        if (price === null || Number.isNaN(price) || price < 0) errors.push("Invalid price");
        if (sku) {
          const key = sku.toLowerCase();
          if (seen.has(key)) errors.push(`Duplicate code (also row ${seen.get(key)})`);
          else seen.set(key, i + 2);
        }
        const imageName = String(r["image"] ?? "").trim();
        const image = imageName ? images.get(imageName.split("/").pop()!.toLowerCase()) ?? null : null;
        if (imageName && !image) warnings.push("Photo not found in ZIP");
        const exists = existingSkus.has(sku.toLowerCase());
        if (exists) warnings.push("Will update existing product");
        return {
          line: i + 2, sku, name, category: String(r["category"] ?? "").trim(),
          cbm: cbm ?? 0, price: price ?? 0, unit: String(r["unit"] ?? "").trim() || "Carton",
          description: String(r["description"] ?? "").trim(), length, width, height,
          imageName, image, errors, warnings, exists,
        };
      });
}

function revalidate(rows: Row[], existingSkus: Set<string>): Row[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const errors: string[] = [];
    const warnings = r.warnings.filter((w) => !w.startsWith("Will update"));
    if (!r.sku) errors.push("Missing product code");
    if (!r.name) errors.push("Missing name");
    if (!(r.cbm > 0)) errors.push("Invalid volume");
    if (!(r.price >= 0) || Number.isNaN(r.price)) errors.push("Invalid price");
    const key = r.sku.toLowerCase();
    if (r.sku) {
      if (seen.has(key)) errors.push(`Duplicate code (also row ${seen.get(key)})`);
      else seen.set(key, r.line);
    }
    const exists = existingSkus.has(key);
    if (exists) warnings.push("Will update existing product");
    return { ...r, errors, warnings, exists };
  });
}

function ImportBody() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const onFile = async (file: File) => {
    setResult(null);
    setBusy(true);
    try {
      let sheetData: ArrayBuffer;
      const images = new Map<string, Blob>();
      if (file.name.toLowerCase().endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.includes("__MACOSX"));
        const sheet = entries.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
        if (!sheet) throw new Error("The ZIP has no spreadsheet (.xlsx or .csv) inside.");
        sheetData = await sheet.async("arraybuffer");
        for (const e of entries) {
          if (/\.(jpe?g|png|webp)$/i.test(e.name)) {
            images.set(e.name.split("/").pop()!.toLowerCase(), await e.async("blob"));
          }
        }
      } else {
        sheetData = await file.arrayBuffer();
      }
      const wb = XLSX.read(sheetData);
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: "" });
      const norm = raw.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase().replace(/\s+/g, "_"), v])),
      );
      const parsed = await buildRows(norm, images);
      if (parsed.length === 0) throw new Error("No rows found in the spreadsheet.");
      setRows(parsed);
    } catch (e) {
      toast.error((e as Error).message);
      setRows([]);
    } finally {
      setBusy(false);
    }
  };

  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [skuSet, setSkuSet] = useState<Set<string>>(new Set());

  const onAiFile = async (file: File) => {
    setResult(null);
    setBusy(true);
    try {
      let lines: string[];
      if (/\.(txt|csv)$/i.test(file.name)) {
        lines = (await file.text()).split(/\r?\n/);
      } else {
        const wb = XLSX.read(await file.arrayBuffer());
        lines = wb.SheetNames.flatMap((n) => [`### Sheet: ${n}`, ...XLSX.utils.sheet_to_csv(wb.Sheets[n]!, { blankrows: false }).split("\n")]);
      }
      lines = lines.map((l) => l.replace(/,+$/, "").trim()).filter((l) => l.replace(/[,\s]/g, "").length > 0);
      if (lines.length === 0) throw new Error("The file looks empty.");
      const header = lines.slice(0, 6).join("\n");
      const chunks: string[] = [];
      for (let i = 0; i < lines.length; i += 120) chunks.push(i === 0 ? lines.slice(0, 120).join("\n") : `(Context — top of file)\n${header}\n(Continue)\n${lines.slice(i, i + 120).join("\n")}`);
      const out: Record<string, unknown>[] = [];
      for (let i = 0; i < chunks.length; i++) {
        setAiStatus(`Reading part ${i + 1} of ${chunks.length}…`);
        const { rows: got } = await extractPriceList({ data: { text: chunks[i]!.slice(0, 60000) } });
        for (const r of got) {
          const notes = [r.description, r.currency && r.currency !== "USD" ? `Price in ${r.currency}` : ""].filter(Boolean).join(" · ");
          out.push({ ...r, price: r.price ?? "", cbm_per_carton: r.cbm_per_carton ?? "", length_cm: r.length_cm ?? "", width_cm: r.width_cm ?? "", height_cm: r.height_cm ?? "", description: notes, image: "" });
        }
      }
      if (out.length === 0) throw new Error("No products were found in this file.");
      const built = await buildRows(out, new Map());
      const { data: existing } = await supabase.from("products").select("sku");
      setSkuSet(new Set((existing ?? []).map((p) => p.sku.toLowerCase())));
      setRows(built.map((r) => (r.description.includes("Price in ") ? { ...r, warnings: [...r.warnings, "Price is not in USD — check before importing"] } : r)));
      toast.success(`Found ${built.length} products. Review and fix the rows before importing.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAiStatus(null);
      setBusy(false);
    }
  };

  const editRow = (line: number, patch: Partial<Row>) =>
    setRows((prev) => revalidate(prev.map((r) => (r.line === line ? { ...r, ...patch } : r)), skuSet));

  const loadMaster = async () => {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/data/master-price-list.json");
      if (!res.ok) throw new Error("The master price list file is not available.");
      const list = (await res.json()) as [string, string, string, number | null, number | null, number | null, number, number, string][];
      const { data: cats } = await supabase.from("categories").select("id, name");
      const catMap = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
      for (const name of ["Food", "Non Food"]) {
        if (catMap.has(name.toLowerCase())) continue;
        const { data, error } = await supabase.from("categories").insert({ name, slug: name.toLowerCase().replace(/\s+/g, "-") }).select("id").single();
        if (error) throw error;
        catMap.set(name.toLowerCase(), data.id);
      }
      for (let i = 0; i < list.length; i += 200) {
        const payload = list.slice(i, i + 200).map(([sku, name, cat, l, w, h, cbm, price, unit]) => ({
          sku, name, category_id: catMap.get(cat.toLowerCase()) ?? null, carton_length: l, carton_width: w, carton_height: h,
          cbm_per_carton: cbm, default_price: price, unit,
        }));
        const { error } = await supabase.from("products").upsert(payload, { onConflict: "sku" });
        if (error) throw error;
      }
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({ actor_id: auth.user?.id ?? null, action: "catalog_import", entity_type: "product", entity_id: null, details: { source: "Master Price List Maldives 2026", imported: list.length } });
      setResult(`Loaded ${list.length} products from the Master Price List.`);
      void qc.invalidateQueries({ queryKey: ["products-admin"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const valid = rows.filter((r) => r.errors.length === 0);

  const commit = async () => {
    setBusy(true);
    try {
      const { data: cats } = await supabase.from("categories").select("id, name");
      const catMap = new Map((cats ?? []).map((c) => [c.name.toLowerCase(), c.id]));
      for (const name of new Set(valid.map((r) => r["category"]).filter(Boolean))) {
        if (catMap.has(name.toLowerCase())) continue;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);
        const { data, error } = await supabase.from("categories").insert({ name, slug }).select("id").single();
        if (error) throw error;
        catMap.set(name.toLowerCase(), data.id);
      }
      let photos = 0;
      const payload = [];
      for (const r of valid) {
        let image_path: string | undefined;
        if (r["image"]) {
          const ext = r.imageName.split(".").pop()!.toLowerCase();
          const path = `products/${r["sku"].replace(/[^a-zA-Z0-9_-]/g, "_")}-${Date.now()}.${ext}`;
          const { error } = await supabase.storage.from("product-images").upload(path, r["image"], { upsert: true });
          if (!error) { image_path = path; photos++; }
        }
        payload.push({
          sku: r["sku"], name: r["name"], category_id: r["category"] ? catMap.get(r["category"].toLowerCase()) ?? null : null,
          cbm_per_carton: r["cbm"], default_price: r["price"], unit: r["unit"], description: r["description"] || null,
          carton_length: r.length, carton_width: r.width, carton_height: r.height,
          ...(image_path ? { image_path } : {}),
        });
      }
      const { error } = await supabase.from("products").upsert(payload, { onConflict: "sku" });
      if (error) throw error;
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("audit_log").insert({
        actor_id: auth.user?.id ?? null, action: "catalog_import", entity_type: "product", entity_id: null,
        details: { imported: valid.length, skipped: rows.length - valid.length, photos },
      });
      const updated = valid.filter((r) => r.exists).length;
      setResult(`Imported ${valid.length - updated} new, updated ${updated}, skipped ${rows.length - valid.length} with errors, uploaded ${photos} photos.`);
      setRows([]);
      void qc.invalidateQueries({ queryKey: ["products-admin"] });
      void qc.invalidateQueries({ queryKey: ["catalog-products"] });
      void qc.invalidateQueries({ queryKey: ["categories"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <p className="text-sm text-muted-foreground">
            Columns: sku, name, category, length_cm, width_cm, height_cm, cbm_per_carton, price, unit, description, image
            (photo file name inside the ZIP). Volume is worked out from the size when left empty.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadExcel("sky-plus-catalog-template.xlsx", [{ title: "Products", head: HEAD, rows: [["SKU-001", "Sample chair", "Furniture", 60, 50, 90, "", 25, "Carton", "Stackable", "SKU-001.jpg"]] }])}>
              Download template
            </Button>
            <Button onClick={() => void loadMaster()} disabled={busy}>Load Master Price List (558 products)</Button>
            <Button asChild variant="ghost"><Link to="/staff/products">Back to products</Link></Button>
          </div>
          <input
            type="file"
            accept=".zip,.xlsx,.xls,.csv"
            disabled={busy}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            <p className="font-medium">Read a supplier price list with AI</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Upload any supplier list (Excel, CSV or text) in its own layout. The AI picks out product codes, names,
            categories and prices so you can review and fix them before importing. Each part read uses AI credits.
          </p>
          <input
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            disabled={busy}
            aria-label="Supplier price list"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-4 file:py-2 file:text-secondary-foreground"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onAiFile(f); e.target.value = ""; }}
          />
          {aiStatus && <p className="text-sm font-medium text-primary">{aiStatus}</p>}
        </CardContent>
      </Card>

      {result && <Card><CardContent className="pt-5 font-medium">{result}</CardContent></Card>}

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">{valid.length} ready · {rows.length - valid.length} with errors (skipped)</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setRows([])} disabled={busy}>Cancel</Button>
              <Button onClick={() => void commit()} disabled={busy || valid.length === 0}>
                {busy ? "Importing…" : `Import ${valid.length} products`}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {rows.map((r) => (
              <Card key={r.line} className={r.errors.length ? "border-destructive" : ""}>
                <CardContent className="space-y-1 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r["name"] || "(no name)"}</p>
                      <p className="stat-label">Row {r.line} · {r["sku"] || "—"} · {r["category"] || "No category"} · {formatCbm(r["cbm"])} · {formatMoney(r["price"])}</p>
                    </div>
                    {r["image"] && <Badge variant="secondary">Photo</Badge>}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <Input aria-label="Code" placeholder="Code" value={r.sku} onChange={(e) => editRow(r.line, { sku: e.target.value.trim() })} />
                    <Input aria-label="Name" placeholder="Name" className="col-span-2" value={r.name} onChange={(e) => editRow(r.line, { name: e.target.value })} />
                    <Input aria-label="Category" placeholder="Category" value={r.category} onChange={(e) => editRow(r.line, { category: e.target.value })} />
                    <Input aria-label="Price" placeholder="Price" inputMode="decimal" value={String(r.price)} onChange={(e) => editRow(r.line, { price: Number(e.target.value) })} />
                    <Input aria-label="Volume (CBM)" placeholder="CBM / carton" inputMode="decimal" value={r.cbm ? String(r.cbm) : ""} onChange={(e) => editRow(r.line, { cbm: Number(e.target.value) || 0 })} />
                    <Input aria-label="Packing" placeholder="Packing" value={r.unit} onChange={(e) => editRow(r.line, { unit: e.target.value })} />
                  </div>
                  {r.errors.map((e) => <p key={e} className="text-sm text-destructive">{e}</p>)}
                  {r.warnings.map((w) => <p key={w} className="text-sm text-muted-foreground">{w}</p>)}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
