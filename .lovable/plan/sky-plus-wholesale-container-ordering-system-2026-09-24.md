# Sky Plus — Wholesale Container Ordering System

Build the Sky Plus web app from the master specification: a mobile-first ordering
and shipment system for wholesale container orders, with customer and staff roles,
negotiation, invoices, payments, shipment history and reports.

Because the spec is large, the build runs in stages. Each stage ends with a working
app you can use — nothing is a throwaway mock.

## Foundation (stage 1, this plan's first delivery)

- Turn on Lovable Cloud (database, logins, file storage, server logic).
- Full database design in one migration: users and roles, customer profiles,
  categories, products, container types, orders, order lines, order revisions and
  change history, invoices and invoice versions, payments, shipments,
  notifications, audit log, Sky Plus contact settings.
- Security rules so each customer sees only their own data and staff access is
  checked on the server, never just hidden in the screen.
- Shared calculation service (CBM, remaining capacity, utilisation, order value,
  advance, balance) with automated tests, used everywhere.
- Sign up / log in with email and password plus Google, password reset,
  role-based menus, mobile-first design system, installable web app setup.

## Stage 2 — Catalog

- Staff screens for categories and products (image, SKU, carton size, CBM, price,
  active flag).
- Customer browsing: large product images, category tabs, search, quantity
  controls.
- ZIP catalog import (spreadsheet + images) with validation, duplicate SKU and
  missing image detection, preview before import, and a result summary.

## Stage 3 — Orders and negotiation

- Create a container order, pick 20 FT / 40 FT, add products, live CBM,
  remaining capacity, utilisation, total value, compact order list with thumbnails.
- Customer request quantity, Sky Plus proposed quantity, current quantity and final
  quantity kept separately; the original request is never overwritten.
- Staff proposal editing (quantity, customer price, add/remove products), customer
  accept or reduce, full change history, order statuses and in-app notifications.
- Finalise and lock, authorised reopen with recorded reason.

## Stage 4 — Money and shipment

- Proforma invoice from the order, with advance as a percentage or fixed amount.
- Manual payment records; actual amounts paid are never recalculated when the
  shipment value changes.
- Loading stage changes, final shipment confirmation, commercial invoice showing
  total value, advance paid and balance due.
- Invoice versioning: old versions stay visible and marked superseded.
  Overpayment is flagged, not auto-resolved.

## Stage 5 — History, reports, contact, polish

- Shipment history (immutable), repeat order creating a new draft.
- Reports by customer, date range, shipment, product and payment status.
- PDF and Excel exports for orders, invoices and reports.
- Central Sky Plus contact settings powering WhatsApp and Viber buttons with
  copyable fallback.
- Mobile polish, empty/loading/error states, requirements audit against the spec.

## Technical notes

- React + TypeScript on TanStack Start, Tailwind, Lovable Cloud (Postgres + auth +
  storage), Zod validation, server functions for all business logic.
- Order lines and shipments store price/CBM snapshots so changing the catalog never
  alters historical records.
- Row-level security on every table; role checks via a separate roles table.
- PDF and Excel generated server-side; catalog ZIP parsed server-side.
- No Android build in V1; code stays Capacitor-compatible.

## Open business questions (not invented)

1. Currency — assumed USD everywhere unless you say otherwise.
2. Invoice number format — assumed PI-#### / CI-#### with a shared sequence.
3. Whether a customer can have more than one active order at a time.
