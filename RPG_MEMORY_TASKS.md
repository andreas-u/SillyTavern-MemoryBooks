# RPG Memory Roadmap

This document turns `SESSION_HANDOFF.md` into an implementation task list for evolving Memory Books into an automatic long-form RPG campaign memory extension.

## Product Goal

Turn it on, roleplay, and campaign memory maintains itself unless something needs review.

Manual Memory Books tools should remain available, but the default product path should become campaign continuity automation rather than a toolbox-first workflow.

## Current Baseline

- Existing Memory Books behavior must keep working.
- `rpg-auto-memory` already has the first RPG mode shell:
  - RPG Campaign Memory settings section.
  - Campaign dashboard with active lorebook, trigger status, interval fallback progress, latest scratchpad scene state, active arcs, offstage motion, cutaway candidate, and narrator notes.
  - Automation policy values: `silent`, `review_major`, `manual`.
  - RPG mode uses Auto-Summary as the first memory engine.
  - Content-aware RPG triggers run before the fixed interval fallback.
  - Scene Scratchpad parsing supports explicit `Memory Trigger` blocks with `State`, `Type`, `Reason`, `Memory Scope`, and `Temporal Anchor`.
  - Review policies route generated memories through preview/review without mutating the global preview setting.
- The installed extension loads `index.build.js`, so source changes need a rebuild before testing in SillyTavern.

## Milestone 1: Stabilize Automatic RPG Memory Mode

Goal: make the current RPG mode reliable enough to use in real chats without changing existing Memory Books workflows.

- [ ] Verify RPG mode settings persist across reloads.
- [ ] Verify enabling RPG mode turns on Auto-Summary and leaves existing manual Memory Books controls intact.
- [ ] Verify each automation policy:
  - [ ] `silent`: creates memories without review when normal Auto-Summary conditions are met.
  - [ ] `review_major`: sends generated memories through review before saving.
  - [ ] `manual`: asks before generation and sends generated memories through review.
- [ ] Verify each automation policy for content-triggered memories:
  - [ ] `silent`: creates high-confidence low-risk content-triggered memories without review.
  - [ ] `review_major`: reviews major/required scratchpad-triggered memories before saving.
  - [ ] `manual`: asks before content-triggered generation and sends generated memories through review.
- [x] Clarify UI copy for RPG mode so users understand it is currently powered by Auto-Summary.
- [x] Add a visible status line for RPG mode showing enabled/disabled, policy, interval, buffer, and last processed message.
- [x] Add a small smoke-test checklist for manual SillyTavern verification.

Acceptance criteria:

- Existing non-RPG Auto-Summary behavior is unchanged when RPG mode is disabled.
- No RPG setting silently changes unrelated user preferences.
- A user can enable RPG mode, pick a policy, roleplay past the interval, and see the expected automation path.

Manual smoke-test checklist:

- Open Memory Books settings, enable RPG Campaign Memory, close and reopen settings, and verify the enabled state and selected policy persist.
- With RPG mode disabled, confirm existing Auto-Summary settings and manual Memory Books actions behave as before.
- With RPG mode enabled, confirm Auto-Summary is checked, the RPG status line updates immediately, and manual Memory Books controls remain visible.
- Set policy to `silent`, roleplay past interval + buffer, and confirm a memory is created without a review popup.
- Set policy to `review_major`, roleplay past interval + buffer, and confirm the generated memory goes through preview/review.
- Set policy to `manual`, roleplay past interval + buffer, and confirm the create/postpone prompt appears before review.
- With a scratchpad `Memory Trigger` set to `State: required`, confirm the next memory includes trigger reason, scope, and temporal anchor in the generation context.
- With scratchpad `State: none`, confirm present-state scratchpad churn does not create a memory by itself.
- With scratchpad `State: candidate`, confirm the dashboard shows the candidate signal and memory creation still requires another confirming trigger or fallback.

## Milestone 2: Campaign Dashboard

Goal: replace toolbox-first orientation with a campaign-first overview.

- [x] Add a compact dashboard section near the top of settings.
- [ ] Show current campaign memory state:
  - [x] trigger readiness
  - [x] active lorebook
  - [x] memory coverage / unprocessed messages
  - [x] interval fallback progress
  - [x] recent content trigger activity
  - [x] current situation
  - [x] active arcs
  - [x] unresolved threads
  - [ ] major NPCs from entity/state memory, once that storage exists
  - [x] current location
  - [ ] party state from entity/state memory, once that storage exists
  - [ ] recent memory activity
- [x] Reuse existing lorebook/memory data first; avoid creating a new storage model until needed.
- [x] Add basic scratchpad empty states for chats without a parsed scratchpad.
- [ ] Add richer empty states that explain what will appear after memories and entity/state data exist.
- [ ] Keep old controls accessible below the dashboard or behind an Advanced Tools area.

Acceptance criteria:

- Opening Memory Books immediately answers "what does the campaign memory know right now?"
- Dashboard works with existing lorebooks and does not require a migration.

## Milestone 3: RPG Presets

Goal: provide opinionated setup paths for common RPG campaign types.

- [ ] Define preset schema for RPG memory behavior.
- [ ] Add built-in presets:
  - [ ] fantasy campaign
  - [ ] mystery
  - [ ] romance drama
  - [ ] survival/inventory
  - [ ] political intrigue
  - [ ] sandbox
- [ ] Map presets to existing prompt/profile/side-prompt/consolidation settings where possible.
- [ ] Add UI for selecting a preset when RPG mode is enabled.
- [ ] Add preset descriptions and expected memory emphasis.

Acceptance criteria:

- A user can select a preset and get a sensible memory configuration without manually tuning every Memory Books subsystem.
- Presets are reversible and do not destroy custom user profiles.

## Milestone 4: Content-Aware Memory Triggers

Goal: trigger RPG memory generation from meaningful campaign events rather than only from a fixed message count.

- [x] Define trigger classifier output schema:
  - [x] should create memory
  - [x] confidence
  - [x] urgency
  - [x] reason
  - [x] memory type
  - [x] suggested message range
  - [x] review required
- [x] Add first-pass heuristic trigger types:
  - [x] scene boundary
  - [x] canon event
  - [x] entity update
  - [x] quest/thread progress
  - [x] relationship shift
  - [x] location/time transition
  - [x] user importance signal
- [x] Add first-pass Scene Scratchpad delta triggers:
  - [x] scene state changes
  - [x] active thread changes
  - [x] parallel storyline changes
  - [x] character knowledge changes
  - [x] relationship/read-of-user changes
  - [x] cutaway and narrator note changes
- [x] Add explicit Scene Scratchpad `Memory Trigger` support:
  - [x] `State: required` creates a memory even during cooldown unless it duplicates the last required trigger
  - [x] `State: candidate` is exposed to dashboard/status and can be confirmed by existing heuristics
  - [x] `State: none` suppresses scratchpad-delta memory creation for unresolved present-state work
  - [x] `Memory Scope` and `Temporal Anchor` are passed into memory generation
- [x] Add a parser/debug harness for real scratchpad examples:
  - [x] parse top-level scene state, active threads, and deeper notes from HTML details blocks
  - [x] parse explicit `Memory Trigger` fields for `none`, `candidate`, and `required`
  - [x] verify dashboard snapshot text is readable after HTML cleanup
  - [x] verify duplicate required triggers do not bypass cooldown repeatedly
- [x] Store last content-trigger check position per chat.
- [x] Add minimum cooldown so trigger checks cannot spam memory generation.
- [x] Keep fixed interval as a fallback max interval.
- [x] Route trigger decisions through RPG automation policy:
  - [x] `silent`: auto-save high-confidence low-risk updates
  - [x] `review_major`: review major canon changes
  - [x] `manual`: ask before generation
- [x] Add settings for content-aware triggering:
  - [x] enabled/disabled
  - [x] check cadence
  - [x] fallback interval
  - [ ] review sensitivity
- [x] Add concise status/UI feedback showing why a memory was triggered.
- [ ] Add manual verification cases for content-triggered memories:
  - [ ] explicit required scratchpad trigger
  - [ ] candidate scratchpad trigger plus confirming prose event
  - [ ] none scratchpad trigger with noisy scratchpad edits
  - [ ] cooldown duplicate suppression
  - [ ] fallback interval after quiet play

Acceptance criteria:

- RPG mode can create memory after meaningful story events even before the fixed interval is reached.
- Quiet or repetitive chat does not produce unnecessary memories.
- Fixed interval still prevents long stretches from going unsummarized.
- Trigger decisions remain auditable through status, preview, inbox, or history depending on policy.

## Milestone 5: Memory Inbox

Goal: handle uncertain or high-risk memory updates without interrupting roleplay.

- [ ] Define inbox item model:
  - [ ] generated memory candidate
  - [ ] entity/state update candidate
  - [ ] contradiction warning
  - [ ] stale/duplicate warning
- [ ] Add inbox storage using existing extension settings or lorebook-adjacent metadata.
- [ ] Route `review_major` updates into the inbox when they are not urgent.
- [ ] Add review actions:
  - [ ] accept
  - [ ] edit and accept
  - [ ] reject
  - [ ] postpone
  - [ ] mark obsolete/superseded
- [ ] Add badge/count in dashboard.

Acceptance criteria:

- RPG mode can continue quietly while reviewable items accumulate.
- Users can resolve pending memory decisions in batches.

## Milestone 6: Entity And State Memory

Goal: promote important RPG entities from generic summaries into first-class campaign memory.

- [ ] Define entity types:
  - [ ] NPC
  - [ ] place
  - [ ] faction
  - [ ] item
  - [ ] quest/thread
  - [ ] party/player state
- [ ] Decide storage mapping to lorebook entries.
- [ ] Add extraction/update prompt for entity state.
- [ ] Add conflict-aware merge behavior for existing entities.
- [ ] Add UI for viewing and editing entity entries.
- [ ] Add importance/permanence levels:
  - [ ] permanent canon
  - [ ] current arc
  - [ ] temporary session state
  - [ ] flavor
  - [ ] obsolete/superseded

Acceptance criteria:

- Recurring NPCs, places, factions, items, and quests can be updated without relying only on chronological scene summaries.
- Entity updates preserve user edits and do not overwrite canon without review when policy requires it.

## Milestone 7: Session Briefing

Goal: provide a compact "what matters now" packet before continuing play.

- [ ] Generate briefing from recent summaries, active entities, arcs, unresolved threads, and current location.
- [ ] Add button/action to create or refresh briefing.
- [ ] Add optional automatic briefing after chat load or after long inactivity.
- [ ] Add copy/send-to-context behavior if compatible with SillyTavern extension APIs.
- [ ] Keep briefing concise enough to use as prompt context.

Acceptance criteria:

- A returning user can quickly understand campaign state without rereading old chat.
- Briefing can be regenerated without corrupting underlying memory.

## Milestone 8: Memory Health And Audit

Goal: make long-running campaign memory trustworthy.

- [ ] Add audit checks for:
  - [ ] stale entries
  - [ ] duplicate entries
  - [ ] oversized entries
  - [ ] contradictory entries
  - [ ] never-triggering entries
  - [ ] superseded entries
- [ ] Add dashboard warnings for audit findings.
- [ ] Add repair actions where low risk.
- [ ] Route high-risk repairs to Memory Inbox.
- [ ] Add continuity conflict detection for major canon changes.

Acceptance criteria:

- Users can see when campaign memory quality is degrading.
- Automated repair does not silently rewrite important canon.

## Milestone 9: Undo And History

Goal: make automation safe enough to trust.

- [ ] Capture before/after snapshots for automated memory changes.
- [ ] Add history view for RPG memory actions.
- [ ] Add undo for:
  - [ ] newly created memories
  - [ ] edited memories
  - [ ] entity/state updates
  - [ ] inbox decisions
- [ ] Add confirmation around destructive undo operations.

Acceptance criteria:

- A bad automation decision can be traced and reverted.
- History records enough context to understand why an update happened.

## Milestone 10: Advanced Tools Reorganization

Goal: keep Memory Books power-user features while making RPG automation the primary workflow.

- [ ] Identify controls that belong in Advanced Tools.
- [ ] Move low-frequency controls below a collapsible advanced section.
- [ ] Keep high-frequency RPG controls visible:
  - [ ] enabled/disabled
  - [ ] policy
  - [ ] preset
  - [ ] inbox
  - [ ] dashboard
  - [ ] briefing
- [ ] Preserve existing selectors, prompt managers, consolidation tools, and manual commands.

Acceptance criteria:

- New users see an RPG campaign memory product first.
- Existing Memory Books users can still reach the old tools.

## Engineering Tasks

- [ ] Keep changes branch-scoped on `rpg-auto-memory`.
- [ ] Rebuild after source changes with `npx --yes bun run build`.
- [ ] Commit source files and generated `index.build.js` / `index.build.js.map` together.
- [ ] Avoid broad refactors unless a milestone repeatedly fights existing architecture.
- [ ] Add small helpers/modules only when they remove concrete complexity.
- [ ] Prefer existing lorebook/profile/side-prompt/consolidation APIs before adding new storage.
- [ ] Preserve localization fallback behavior; add English strings first, then expand translation coverage when UI stabilizes.
- [ ] Maintain manual verification notes for SillyTavern behavior that cannot be tested headlessly.

## Open Design Questions

- Should RPG campaign state be stored as ordinary lorebook entries, extension metadata, or a hybrid?
- What threshold makes a change "major" for `review_major` when it comes from an explicit scratchpad trigger?
- Should Memory Inbox be per-chat, per-lorebook, or global?
- How should group chats attribute party/player state?
- Which entity updates are safe to apply silently?
- How much generated reasoning/context should be stored for auditability?
- Should the LLM-authored scratchpad be treated as a trusted trigger source only when the user has opted into a compatible preset/instruction?
- How should temporal continuity conflicts be reconciled when scratchpad scene state and existing memory disagree?

## Near-Term Next Commit

Recommended next implementation commit:

1. Add manual verification cases for content-triggered memories:
   - explicit required scratchpad trigger
   - candidate scratchpad trigger plus confirming prose event
   - none scratchpad trigger with noisy scratchpad edits
   - cooldown duplicate suppression
   - fallback interval after quiet play
2. Add review sensitivity settings for borderline content-trigger decisions.
3. Start Memory Inbox design and storage once manual verification confirms trigger behavior.
