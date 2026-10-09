# Sky Plus roadmap
- [ ] Keep order cross totals visible beneath scrolling items on customer and admin sides.
- [x] Keep order-list column headers visible while scrolling; browser verified fixed header position during internal scrolling

- [x] Enforce customer acceptance followed by Sky Plus final approval; database safeguards installed, staff confirmation gating checked in browser, calculation tests pass (live customer acceptance not exercised)

- [x] Show each customer item immediately above its Sky Plus proposal in staff review and customer order details; preserved calculations and editing behavior; verified four paired items on both pages in signed-in preview

- [x] Add invited customer username/password/confirmation signup and visible Create account / Sign in choices; invitation restriction checked in browser, password matching checked in code (live account creation not tested)

- [x] Check invitation Google sign-in configuration and account selection while preserving customer records (provider enabled; actual Google consent requires customer's account)
- [x] Check invitation sign-in on desktop, tablet and phone previews

- [x] Number displayed business lists and verify numbering without changing actions (catalogue checked on desktop/mobile; app checks pass)

- [x] Promote skynaeem1010@gmail.com to staff role
- [x] Invite-only signup: staff create invite links; sign-up blocked without a valid invite
- [x] Invoice generation + versioning (PI/CI)
- [x] Payment recording and balances
- [x] Catalog bulk import (Excel/ZIP)
- [x] Repeat order
- [x] PDF/Excel exports
- [x] Spec compliance audit (no build, type or page errors)
- [x] Load Master Price List into catalog (558 products)
- [x] Invite role choice (Owner/Admin/Customer)
- [x] Owners/Admins see staff navigation
- [x] AI product finder for customers (describe needs → recommended catalog products)
- [x] Google-first sign-in page + uninvited message
- [x] Show product photos in catalogs
- [x] AI supplier price list extraction (staff import)
- [x] Role start pages: Owner / Admin / Customer
- [x] Make bulk Excel import easy to find (Products + Categories)
- [x] Owner approval of catalog order lines
- [x] Match the supplied wholesale workspace design across the app shell, catalog and order view
- [x] Verify the updated appearance and navigation
- [x] Add Food / Non-Food main categories with departments and subcategories (per uploaded catalog structure)
- [x] Show and copy the invitation link right after it is created
- [x] Arrange catalogue items as compact tiles, 5 in a row
- [ ] Customer portal: customer-only menu (Quick Order, Current Orders, Negotiation, Tracking, Payments, Favourites, Repeat)
- [ ] New Order flow: pick container (20FT / 40FT / 40FT HC) before adding products
- [ ] Quick Order single screen with instant search, add, qty change, remove
- [ ] Always-visible live order panel (CBM, weight, cartons, USD + MYR); warn, never block when over limits
- [ ] Customer Workspace for staff (list + per-customer tabs: overview, orders, shipments, invoices, payments, documents, timeline)
- [ ] Orders grouped by status; invoices split Proforma/Commercial with status + View/PDF/Excel/Print
- [ ] Configurable container settings (name, max CBM, max gross weight, warning levels); orders keep original values
- [ ] Permission check: customers blocked from every staff page
- [ ] History module (read-only): customers → completed orders, shipments, PI, CI, payments; completed order detail
- [ ] Reports module: customers, products, orders, shipments, invoices, payments, containers, sales; date range + country; PDF/Excel/Print
- [ ] Owner dashboard: orders, negotiations, outstanding, shipments, sales, customers, container utilization, quick actions
- [ ] USD/MYR display switch (display only, never changes stored prices)
- [ ] Negotiation timeline: request → Sky Plus proposal → customer response → final
- [ ] Favourite products, recently / frequently ordered in Quick Order
- [ ] Larger product images with packing, CBM, weight, USD + MYR price
- [ ] Ordering page 3-column: catalogue + categories + current order center; summary, status timeline, negotiation chat, recent changes right
- [ ] Line status colours (available / updated by Sky Plus / pre-order / unavailable) + bottom totals bar

## Status after ordering pass
- [x] Separate customer / staff menus
- [x] Container choice before ordering, quick order, live CBM/weight panel, USD/MYR switch
- [x] Order detail with negotiation chat, status timeline, line availability colours
- [x] Staff: orders grouped by stage, availability + container change, container/weight/MYR settings, product weight
- [x] Customer Workspace tabs (staff)
- [ ] Read-only History module + comprehensive Reports with print
- [ ] Owner dashboard metrics
- [x] Invoice PI/CI split with sent/paid status + print
