# Session Handoff

This fork is intended to evolve `SillyTavern-MemoryBooks` toward an automatic long-form RPG campaign memory extension.

## Product Assessment

The original MemoryBooks project is a mature SillyTavern extension with strong existing functionality:

- Scene memories
- Auto-summary
- Clips and Topical Clips
- Side Prompts / trackers
- Consolidation tiers
- Compaction
- Lorebook binding and auto-creation
- Group chat support
- Profile management
- Hide / unhide token saving
- Optional job queue integration
- Localization and extensive docs

It is well aligned with long-form RPG memory because it treats memory as multiple jobs: chronological scene summaries, pinned facts, mutable trackers, topical recaps, and high-level consolidation.

Its main limitation is product shape. It is currently a flexible memory toolbox / power-user workshop rather than an opinionated campaign continuity manager.

## Direction

The desired product direction is automatic long-form RPG memory:

> Turn it on, roleplay, and the campaign memory maintains itself unless something needs review.

Manual tools should still exist, but they should be advanced controls rather than the main workflow.

## Fork vs Greenfield Decision

Recommendation: fork, do not greenfield.

Use MemoryBooks as the working SillyTavern / lorebook engine, not necessarily as the final product model.

Reasons to fork:

- Existing SillyTavern extension shell
- Existing lorebook creation / binding behavior
- Existing scene memory and auto-summary behavior
- Existing hide / unhide token management
- Existing side prompt and consolidation systems
- Existing group chat and profile support
- Existing user-tested workflows and docs

Avoid rewriting SillyTavern integration early. The host-app glue likely contains hard-won edge-case handling.

## Product Improvements To Build Toward

- Campaign dashboard: current situation, active arcs, unresolved threads, major NPCs, current location, party state, stale trackers, and recent memory activity.
- Automation policy: silent mode, review major changes, review everything/manual.
- Memory inbox: uncertain or high-risk updates go to review instead of interrupting roleplay.
- Entity/state memory: first-class NPC, place, faction, item, and quest entries.
- RPG presets: fantasy campaign, mystery, romance drama, survival/inventory, political intrigue, sandbox.
- Session recap / briefing: compact "what matters now" packet before continuing play.
- Memory health / audit: stale, duplicate, oversized, contradictory, never-triggering, or superseded entries.
- Continuity conflict detection: flag contradictions or major canon changes.
- Undo / history: essential for trusting automation.
- Importance / permanence levels: permanent canon, current arc, temporary session state, flavor, obsolete/superseded.

## Suggested Implementation Strategy

1. Preserve existing behavior.
2. Add an automatic campaign-memory layer.
3. Demote the old toolbox UI into "Advanced Tools" over time.
4. Refactor internals only where the new product layer keeps fighting the old architecture.

Potential future concepts/modules:

- `CampaignState`
- `EntityMemory`
- `MemoryAudit`
- `RpgPreset`
- `SessionBriefing`
- `ContinuityCheck`
- `AutomationPolicy`
- `MemoryInbox`

## Current Fork State

Fork path:

```txt
/mnt/110-docker/gaming-sillytavern/data/default-user/extensions/memories
```

Observed state:

- Repo exists with `.git`.
- Branch was `main`.
- `git status --short` was clean.
- `git config core.filemode` was `false`.

Recommended first branch:

```sh
git checkout -b rpg-auto-memory
```

## Recommended First Milestone

First milestone: **Automatic RPG Memory Mode**

Initial scope:

- Add a new settings/product section for RPG automatic memory.
- Introduce automation levels:
  - Silent
  - Review major changes
  - Manual / review everything
- Keep existing auto-summary underneath.
- Do not remove old MemoryBooks behavior.
- Begin with product wiring and UI.
- Later connect this to side prompt sets, RPG presets, and inbox behavior.

## Working Principle

Do not start with broad refactors.

First map relevant files, then add a narrow working product slice that proves the new direction while preserving existing functionality.
