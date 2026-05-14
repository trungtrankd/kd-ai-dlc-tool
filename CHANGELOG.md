# Changelog

## [1.0.0] — 2026-05-08

### Added
- Full 9-step AIDLC pipeline: Plan → Design → Test Plan → Implement → Review → Execute Test → Release → Monitor → Doc Sync
- **▶ RUN** button on every AIDLC skill and agent card to run individual pipeline steps
- **✏ DRAFT STORY** — built-in story creation form (Title, Description, Acceptance Criteria) in the Epics tab
- **SAVE TEMPLATE** — export current `.aidlc/` workspace config to any folder for reuse across projects
- **SWITCH PROJECT** — open a different workspace folder directly from the Builder
- Builder panel with Workflows, Agents, Skills, and Epics tabs
- Story Library panel — browse, run, and delete saved stories
- Activity Feed panel — real-time event stream from `.agent-log.jsonl`
- Import from Taiga — pull user stories via Taiga REST API (public and authenticated)
- Import Template — copy built-in `.aidlc/` scaffolding into any workspace
- Live task board and activity feed auto-refresh via file watchers
- Pipeline status bar indicator
