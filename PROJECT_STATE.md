# Project State
## Commercial invoice: freight & handling (Oct 2026)
- invoices gained product_value, freight_charges, handling_charges (default 0, non-negative). Existing invoices backfilled product_value = total_value; totals unchanged.
- issue_invoice(..., _freight, _handling) computes server-side: total = product value + freight + handling. Proforma ignores charges.
- Issued invoice amounts are locked by trigger; corrections = re-issue (new version, old superseded).
- Balance = max(0, total − confirmed payments); overpayment = max(0, payments − total). Payments never modified.
- PDF/Excel exports include subtotal, freight, handling, total, payments, balance, overpayment.
