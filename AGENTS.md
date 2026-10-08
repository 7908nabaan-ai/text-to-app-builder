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
