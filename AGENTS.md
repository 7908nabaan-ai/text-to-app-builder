<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Use AppShell as the shared authenticated workspace layout; role-specific navigation and mobile menus remain centralized so all account pages stay consistent.
- Reuse the customer order view in the catalogue and home page; this keeps quantity controls and submission behavior consistent without parallel ordering implementations.
- Render business-list serial numbers from display indices, with pagination offsets and shared list-number styling; keep numbering independent of stored identifiers and ordering behavior.
- Store signup usernames as non-privileged account metadata and retain email as the authentication credential; this preserves invitation email matching without exposing customer email lookup.
- Enforce customer acceptance and Sky Plus final confirmation through database triggers, with a shared customer approval control; this prevents bypasses and atomically snapshots final quantities.
- Reuse BottomTotals beneath bounded order-item scroll areas for customer and staff detail views so aggregate totals stay visible without changing calculation logic.
- Keep agent-integration (MCP) tools in src/lib/mcp/, one tool per file, using the caller's OAuth token so database access rules apply; never use admin access there.
