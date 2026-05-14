# AIDLC — AI Development Lifecycle

Run a full AI-powered software development lifecycle inside VS Code.
AIDLC orchestrates a team of Claude Code agents — Product Owner, Designer, Developer, QA, and more — through every phase of your project: from writing the PRD all the way to release and doc-sync.

---

## Requirements

- **VS Code** 1.85.0 or later
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** installed and authenticated (`claude` available in your PATH)

---

## Quick Start

1. Install this extension.
2. Open a project folder in VS Code.
3. Open the **AIDLC** panel in the Activity Bar (circuit-board icon).
4. Click **LOAD TEMPLATE** to initialise `.aidlc/` in your workspace.
5. Click **▶ START EPIC**, describe your feature, and the pipeline runs automatically.

---

## The Pipeline

AIDLC runs 9 sequential steps, each handled by a specialised agent:

| Step | Agent | Output |
|------|-------|--------|
| **Plan** | Product Owner | `PRD.md` — user stories + acceptance criteria |
| **Design** | Tech Lead | `TECH-DESIGN.md` — architecture + API contracts |
| **Test Plan** | QA | `TEST-PLAN.md` — unit, integration, UI test cases |
| **Implement** | Developer | Code + unit tests on feature branch |
| **Review** | Senior Dev | `APPROVAL.md` — diff review vs PRD + design |
| **Execute Test** | QA | `TEST-SCRIPT.md` — test execution report |
| **Release** | DevOps | Version tag + changelog notes |
| **Monitor** | DevOps | `HEALTH-REPORT.md` — post-release health check |
| **Doc Sync** | Tech Writer | Reverse-sync docs to match shipped code |

---

## Features

### Builder Panel
The control centre for your AIDLC workspace. Four tabs:

- **Workflows** — view and run pipelines with a single click
- **Agents** — browse PROJECT and AIDLC built-in agents; each has a **▶ RUN** button to run that agent's step individually
- **Skills** — skill definitions with **▶ RUN** to trigger a single step directly
- **Epics** — your story backlog; **✏ DRAFT STORY** to write a story from scratch; **▶ START EPIC** to run the full pipeline

### Story Management
- **Draft Story** — built-in form with Title, Description, and Acceptance Criteria fields; saves a `.md` file in `stories/`
- **Import from Taiga** — pull a user story directly from your Taiga project (supports API token authentication)
- **Story Library** — browse, run, or delete saved stories

### Pipeline Controls
| Button / Command | Action |
|---|---|
| **▶ START EPIC** | Enter a story → run all 9 steps |
| **▶ RUN** (on skill card) | Run a single AIDLC step |
| **CONTINUE** | Resume a pipeline from where it left off |
| **REVIEW** | Run the Review agent on the current workspace state |
| **CLEAR BOARD** | Reset `.task-board.json` and logs to start fresh |

### Template Management
- **LOAD TEMPLATE** — copy the built-in `.aidlc/` config into your workspace
- **SAVE TEMPLATE** — export your customised skills + agents to a folder for reuse across projects
- **SWITCH PROJECT** — open a different workspace folder

### Live Activity Feed
Streams events from `.agent-log.jsonl` in real time as agents run. Also available as a full-page panel via **AIDLC: Open Activity Feed**.

---

## Workspace File Structure

```
<workspace>/
├── .aidlc/
│   ├── workspace.yaml        # Pipeline + agent configuration
│   └── skills/               # Skill prompt files (one per step)
├── .claude/
│   └── agents/               # Custom agent definitions
├── stories/                  # Saved story files (.md)
├── mailbox/                  # Agent handoff messages
├── .task-board.json          # Current pipeline state
└── .agent-log.jsonl          # Event log (streamed to Activity Feed)
```

### `.aidlc/workspace.yaml`

The central config file. Edit directly or via **OPEN YAML** in the Builder:

```yaml
name: my-project
version: "1.0"

agents:
  - id: plan
    skill: plan
    model: claude-opus-4-7
  # ...

pipelines:
  - id: sdlc-full
    steps: [plan, design, test-plan, implement, review, execute-test, release, monitor, doc-sync]
    on_failure: stop
```

---

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---|---|
| `AIDLC: Open Builder` | Open the Builder panel |
| `AIDLC: Open Epics` | Open the Epics / Dashboard panel |
| `AIDLC: Open Activity Feed` | Open the live event stream |
| `AIDLC: Open Story Library` | Browse and manage saved stories |
| `AIDLC: Run Full Pipeline` | Enter a story and run all 9 steps |
| `AIDLC: Continue Pipeline` | Resume a pipeline in progress |
| `AIDLC: Review Current Work` | Run the Review agent on current state |
| `AIDLC: Import from Taiga` | Pull a story from Taiga |
| `AIDLC: Import Template` | Initialise `.aidlc/` from the built-in template |
| `AIDLC: Clear Board` | Reset pipeline state and logs |

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `agentDashboard.claudePath` | `""` | Path to the `claude` CLI binary. Leave empty to auto-detect. |

---

## Contributing

Issues and pull requests welcome at [github.com/dony-omg/multi-agent](https://github.com/dony-omg/multi-agent).

---

## License

MIT
