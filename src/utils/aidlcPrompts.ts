const FULL_PIPELINE_STEPS = [
  'plan',
  'design',
  'test-plan',
  'implement',
  'review',
  'execute-test',
  'release',
  'monitor',
  'doc-sync',
];

export function buildFullPipelinePrompt(story: string): string {
  return `You are the AIDLC orchestrator for this workspace.

Run the full AIDLC workflow for the story below.

Workflow:
${FULL_PIPELINE_STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Operating rules:
- Read .aidlc/workspace.yaml, .aidlc/skills/*.md, .claude/agents/*.md, CLAUDE.md, and relevant repository files before acting.
- Create or update .task-board.json with concrete tasks, owner agents, dependencies, and statuses.
- Append meaningful progress events to .agent-log.jsonl.
- Use mailbox/<agent>/inbox/*.json for agent handoffs when useful.
- Keep changes scoped to the story and repository conventions.
- Run relevant verification commands when practical.
- End with a concise summary of files changed, tests run, review findings, and remaining risks.

Story:
${story.trim()}
`;
}

export function buildReviewCurrentWorkPrompt(): string {
  return `You are the AIDLC review lead for this workspace.

Review the current work in progress.

Context to inspect:
- git status and git diff
- .task-board.json
- .agent-log.jsonl
- mailbox/**/*.json
- stories/*.md
- .aidlc/workspace.yaml and .aidlc/skills/review.md
- relevant source files and tests

Review requirements:
- Validate implementation against the active story/task board and acceptance criteria.
- Identify bugs, regressions, missing tests, security issues, and unclear handoffs.
- Run relevant tests or static checks when practical.
- Update .task-board.json task outputs/statuses if the review changes the state.
- Append review events to .agent-log.jsonl.
- Produce a clear verdict: PASS, PASS WITH RISKS, or REJECT.
- Include concrete file/line references for findings.
`;
}

export function buildStoryFilePipelinePrompt(storyFilename: string): string {
  const storyPath = `stories/${storyFilename}`;
  return `You are the AIDLC orchestrator for this workspace.

Run the full AIDLC workflow for the story at: ${storyPath}

Workflow:
${FULL_PIPELINE_STEPS.map((step, index) => `${index + 1}. ${step}`).join('\n')}

Operating rules:
- Read ${storyPath} first — it is the source of truth for requirements and acceptance criteria.
- Read .aidlc/workspace.yaml, .aidlc/skills/*.md, .claude/agents/*.md, CLAUDE.md, and relevant repository files before acting.
- Create or update .task-board.json with concrete tasks, owner agents, dependencies, and statuses.
- Append meaningful progress events to .agent-log.jsonl.
- Use mailbox/<agent>/inbox/*.json for agent handoffs when useful.
- Keep changes scoped to the story and repository conventions.
- Run relevant verification commands when practical.
- End with a concise summary of files changed, tests run, review findings, and remaining risks.
`;
}

export function buildRunStepPrompt(step: string): string {
  return `You are the AIDLC ${step} agent for this workspace.

Run ONLY the "${step}" step of the AIDLC pipeline.

Context to read first:
- .aidlc/workspace.yaml (find the "${step}" agent definition)
- .aidlc/skills/${step}.md (skill instructions)
- .task-board.json (current pipeline state)
- .agent-log.jsonl (recent activity)
- stories/*.md (active story/epic)
- Relevant source files as needed

Operating rules:
- Execute only the "${step}" step — do not cascade into other steps.
- Read the skill file at .aidlc/skills/${step}.md for detailed instructions.
- Update .task-board.json: create or update the task for this step with its status and output.
- Append progress events to .agent-log.jsonl.
- Use mailbox/<agent>/inbox/ for handoffs if this step produces outputs for the next agent.
- End with a concise summary: what was produced, artifact path, and recommended next step.
`;
}

export function buildContinuePipelinePrompt(): string {
  return `You are the AIDLC orchestrator for this workspace.

Continue the current AIDLC pipeline from the existing workspace state.

Context to inspect:
- .task-board.json
- .agent-log.jsonl
- mailbox/**/*.json
- stories/*.md
- .aidlc/workspace.yaml
- .aidlc/skills/*.md
- .claude/agents/*.md
- git status and relevant source files

Operating rules:
- Do not restart completed work unless evidence shows it is incorrect.
- Pick the next pending, blocked, or failed task with the highest leverage.
- If the board is missing, create one from the active story/context.
- Update .task-board.json and .agent-log.jsonl as work progresses.
- Use mailbox handoffs for cross-agent coordination when useful.
- Run verification relevant to the task you complete.
- End with what changed, current pipeline state, and the next recommended task.
`;
}
