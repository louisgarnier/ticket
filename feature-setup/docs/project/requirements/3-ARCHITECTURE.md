# 🏗️ Stage 3 — Architecture Review & Feature Fit
> **Output →** `docs/project/config/architecture.md`
> **Instructions:** This is NOT a greenfield architecture design. The project already has a living architecture.
> The goal here is to: (1) document the existing architecture as-is, (2) assess whether the new feature fits cleanly, (3) identify what — if anything — must change.
> Adding a dependency or changing architecture mid-project requires updating this doc first.
> Status: `[ ] Draft` → `[ ] Reviewed` → `[ ] Locked`

---

## 📥 Inputs from 2-PRD.md
- **Functional Requirements** → drive the fit assessment (Section 3)
- **Data Requirements** → assess against existing data model (Section 4)
- **Interfaces & Integrations** → new external systems to plug in (Section 5)
- **Non-Functional Requirements** → flag any conflicts with existing constraints (Section 6)
- **Constraints** → must not be violated by the feature

---

## 1. Existing Architecture — Snapshot
> *Document the living architecture as it stands today. Read the codebase, don't guess.*
> *This section is descriptive — what IS, not what SHOULD BE.*

### Tech Stack (existing)

| Layer | Current Choice | Version | Notes |
|---|---|---|---|
| Language | | | |
| Framework | | | |
| Database | | | |
| ORM / Query | | | |
| Auth | | | |
| File Storage | | | |
| Hosting (frontend) | | | |
| Hosting (backend) | | | |
| Testing | | | |

### System Overview (existing)
> *How does data flow through the app today? ASCII diagram or description.*

```
[describe existing system]
```

### Key Existing Modules
> *List the modules/components most relevant to this feature. What do they do? Where do they live?*

| Module | Responsibility | File location |
|---|---|---|
| | | |

---

## 2. Feature Fit Assessment
> *For each requirement in the PRD, answer: does it fit the existing architecture cleanly, or does it create tension?*
> *Be honest. Tension is not a blocker — it just needs a decision.*

| PRD Requirement | Fits cleanly? | Tension / Risk | Decision |
|---|---|---|---|
| | ✅ Yes / ⚠️ Partial / ❌ No | | |

**Summary:** Does this feature fit the existing architecture, or does it require structural changes?

---

## 3. What Changes (if anything)
> *Only list changes that are actually required by this feature. No speculative improvements.*
> *If nothing needs to change, say so explicitly — that is valuable information.*

### New tables / schema changes
- [ ] [table or migration — describe exactly what changes]

### New API routes
- [ ] [route — describe]

### New frontend pages / components
- [ ] [page or component — describe]

### New packages required
> *Must be approved here before adding to the project.*

| Package | Purpose | Approved? |
|---|---|---|
| | | [ ] |

### Existing code touched
> *List files that will be modified. The smaller this list, the better.*

| File | Why it needs to change |
|---|---|
| | |

---

## 4. Data Model — New Additions Only
> *Only document new tables or fields being added. Do not re-document existing schema.*

### New Entity: [Name]
```
[field_name]: [type] — [description]
```

**Relationships:**
- [New entity] links to [existing entity] via [FK]

**RLS policy:**
- [describe policy — must be designed before the migration is written]

---

## 5. Integration Seams — New External Dependencies
> *For each new external system this feature adds, fill in all four columns.*
> *If a column is "unknown", that is a risk that must be resolved before locking.*

| Dependency | Format contract | Known edge cases | How to validate before coding |
|---|---|---|---|
| | | | |

---

## 6. Non-Functional Conflicts
> *Does this feature create any tension with existing NFRs or platform constraints?*
> *Check the platform gotchas below before answering.*

| NFR / Constraint | Conflict? | Resolution |
|---|---|---|
| | ✅ None / ⚠️ Partial / ❌ Yes | |

---

## 7. Key Technical Decisions for This Feature
> *Record WHY you chose things. Only decisions specific to this feature.*

| Decision | Options Considered | Choice | Rationale |
|---|---|---|---|
| | | | |

---

## 8. Platform-Specific Gotchas
> *Read these before finalising. Only the sections relevant to your stack.*

### Supabase
- **RLS must be designed before any table is created** — retrofitting row-level security onto existing tables is painful. Define policies in the migration.
- **Service key bypasses RLS entirely** — only use it in the backend, never on the frontend.
- **Storage buckets are not created by migrations** — create manually in the Supabase dashboard.
- **Migrations are append-only** — never edit a migration that has already been applied. Always create a new file.

### Railway
- **Env vars strip newlines** — any multi-line secret (PEM keys, certificates) must be stored as a single line and reconstructed at runtime.
- **Always verify secrets in Raw Editor after adding them** — trailing spaces or embedded newlines cause silent failures.
- **`PORT` is set automatically by Railway** — never set it manually.
- **Pin all dependencies explicitly** — transitive dependencies are not reliably installed. Add every package directly to `requirements.txt` with a pinned version.

### Vercel
- **Preview deployments use a different URL than production** — support comma-separated origins in `FRONTEND_URL` from day one.
- **`NEXT_PUBLIC_` prefix required for any env var used in client components** — missing it means `undefined` at runtime with no warning.
- **Build-time vs runtime env vars behave differently** — `NEXT_PUBLIC_` vars are baked in at build time.

### FastAPI (on Railway)
- **CORS middleware must be the outermost layer** — register after all `@app.middleware("http")` decorators.
- **Move all client instantiation inside try/except** — unhandled exceptions during client creation return 500 instead of a meaningful error.

---

## 9. Known Limitations Introduced by This Feature
> *Things you are knowingly cutting corners on — document them now so they are not surprises later.*

- [ ] [describe]

---

## 📤 Outputs for 5-EPICS.md

**Once ARCHITECTURE is LOCKED, these outputs feed directly into epic and story definition:**

- **What Changes (Section 3)** → one epic per major addition (new tables, new routes, new pages)
- **New packages** → Story 1.x setup task (install + approve)
- **Data Model additions** → migration story with exact schema
- **Integration Seams** → acceptance criteria for the relevant stories
- **Technical Decisions** → constraints passed to subagents when executing stories
- **Non-Functional Conflicts** → edge cases and failure tests in story acceptance criteria

---

*→ Proceed to `5-EPICS.md` once locked*
*→ Note: Stage 4 (Logging) only applies if the existing project has no logging foundation yet. For existing projects with logging already set up, skip to Stage 5.*
