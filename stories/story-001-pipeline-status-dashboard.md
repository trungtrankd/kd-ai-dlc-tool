---
title: "Pipeline Status Dashboard with Real-time Progress"
saved_at: "2026-05-14T08:00:00.000Z"
---

## Description

As a developer using AIDLC, I want a real-time pipeline status dashboard that shows the progress of each step (Plan → Design → Implement → ...) with live status updates, so I can monitor what the agents are doing without having to open the terminal or manually read `.task-board.json`.

The dashboard should display:
- Each pipeline step as a card with its current status (pending / in_progress / done / failed)
- The agent name responsible for each step
- A progress bar showing overall pipeline completion (e.g. 3/9 steps done)
- The latest log message from `.agent-log.jsonl` for the currently running step
- Elapsed time for each completed step

## Acceptance Criteria

- Given a pipeline is running, when I open the Builder → Workflows tab, then I can see each step card update in real-time without manually refreshing
- Given a step is `in_progress`, when I look at the step card, then it shows a spinning indicator and the latest log message from that agent
- Given a step transitions to `done`, when the card updates, then it shows a green checkmark and the elapsed time
- Given a step fails, when the card updates, then it shows a red error indicator with the failure reason from `.task-board.json`
- Given the pipeline finishes (all steps done or one failed with on_failure=stop), when the dashboard updates, then the overall progress bar shows 100% or the failure point
- The progress updates must be driven by the existing `.task-board.json` file watcher — no polling
