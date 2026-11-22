---
name: venue-onboarding
description: Add or update a conference/journal source in CV Venue Radar using official evidence, dry-run extraction, and deterministic validation. Use when the user asks to onboard a venue, create a field pack, repair an adapter, or refresh official deadlines.
---

# Venue Onboarding

Work from the repository root. Read `AGENTS.md`, `docs/PACKS.md`, and `docs/AGENT_ONBOARDING.md` before changing data.

## Hard rules

- Never invent a date, timezone, UTC instant, qualification, or source URL.
- Use official pages as evidence. Search results and aggregators are discovery hints only.
- Do not hand-edit `data/venues/*.yaml` to manufacture dates; use `update` after registering the source.
- Do not bypass or weaken schema, timezone, snapshot, or quote validation.
- Rolling journals have no fixed deadlines.
- Preview by default. Ask for confirmation before `--write` unless the user already explicitly authorized writes.
- Never commit API keys, cookies, local paths, or private notes.

## Procedure

1. Identify the venue, target pack, official entry URL, and whether writes are authorized.
2. Inspect existing candidates:

   ```bash
   node cmd/discover.ts --field <pack-id> --all
   node cmd/discover.ts --field <pack-id> <query>
   ```

3. Confirm the official Dates/CFP page. If none is published, report that fact and stop before date extraction.
4. Preview the skeleton:

   ```bash
   node cmd/add-venue.ts <official-dates-url> --field <pack-id> --id <id> --short <short> --full "<full name>"
   ```

5. After confirmation, repeat with `--write`.
6. Inspect extraction without writing:

   ```bash
   node cmd/update.ts --venue <id> --dry-run
   ```

   Review warnings, skipped nodes, timezone evidence, and removals. If the page structure is unsupported, draft a tested adapter instead of forcing another adapter to parse it.
7. After reviewing the diff, write and verify. Only `--write` appends real changes to `data/changelog.yaml`; dry-run must not create events.

   ```bash
   node cmd/update.ts --venue <id> --write
   npm run validate
   npm run test:all
   npm run build
   ```

8. Show the final diff and summarize:
   - venue and pack
   - source URL and adapter
   - deadlines added/changed/removed, including the changelog entries
   - skipped or unpublished information
   - validation/test results
   - remaining manual decisions

If any evidence gate fails, leave the data unchanged and report the exact failure. Do not patch the expected answer merely to make tests pass.
