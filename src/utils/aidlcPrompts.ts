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

Read and follow the instructions in \`.claude/agents/orchestrator.md\` to run the full AIDLC pipeline for the story below.

Key files to read first (in order):
1. \`.claude/agents/orchestrator.md\` — your complete operating instructions, step routing table, and execution loop
2. \`.aidlc/workspace.yaml\` — pipeline definition, agent assignments, skill file paths, on_failure policy
3. \`.task-board.json\` — resume state; skip any step already marked done
4. \`stories/*.md\` (if present) — active story/epic; use as the source of truth for requirements

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

export function buildRunStepPrompt(step: string, feedback?: string): string {
  return `You are the AIDLC ${step} agent for this workspace.

Run ONLY the "${step}" step of the AIDLC pipeline.

Context to read first:
- .aidlc/workspace.yaml (find the "${step}" agent definition)
- .aidlc/skills/${step}.md (skill instructions)
- .task-board.json (current pipeline state)
- .agent-log.jsonl (recent activity)
- stories/*.md (active story/epic)
- Relevant source files as needed
${feedback ? `
## Feedback from previous run
${feedback}

Address this feedback explicitly in your output.
` : ''}
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

Read and follow the instructions in \`.claude/agents/orchestrator.md\` to resume the current AIDLC pipeline from the existing workspace state.

Key files to read first (in order):
1. \`.claude/agents/orchestrator.md\` — your complete operating instructions, including the resume logic
2. \`.task-board.json\` — current pipeline state; identify the next pending, blocked, or failed step
3. \`.aidlc/workspace.yaml\` — pipeline definition and agent assignments
4. \`.agent-log.jsonl\` (tail) — recent activity for situational awareness
5. \`mailbox/pipeline/*/\` — artifacts produced by completed steps (pass as context to the next step)

Do not restart steps already marked done. Pick up from the first step that is not done.
`;
}
