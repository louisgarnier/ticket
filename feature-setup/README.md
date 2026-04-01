# Feature Setup — Drop-in for Existing Projects

Copy this folder's contents into the root of any existing project to add the full development workflow.

## What's included

```
docs/project/requirements/         ← read-only process templates (never modify)
docs/project/config/               ← empty output files (fill in as you build)
docs/project/testing/              ← blind test scenarios (sealed during development)
workflow/ADR.md                    ← architecture decision records
workflow/ERRORS.md                 ← known errors registry
scripts/git_ops.py                 ← git wrapper (all git commands go through this)
```

## How to use

1. Copy this folder's contents into your project root
2. Update your existing `CLAUDE.md` with any project-specific context the agent needs to build this feature (e.g. stack constraints, non-goals, modules to be aware of) — the global `~/.claude/CLAUDE.md` handles all process and skill rules automatically
3. Tell the agent: *"let's create a new feature"* — it will follow the requirements workflow from Step 1 automatically
