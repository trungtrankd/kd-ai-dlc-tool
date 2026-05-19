<!-- Step: monitor — handled by developer-devops agent -->
# Monitor

## Purpose
Watch production health signals after the release and issue a Go / Hotfix decision based on observed data.

## Agent
`developer-devops`

## Inputs (provided by orchestrator)
- Release notes artifact from the `release` step (what shipped and when)
- PRD artifact from the `plan` step (success metrics and rollout strategy)
- Project monitoring docs / runbooks if present (use Glob)
- Available observability signals: crash reports, error monitoring, analytics, support tickets

## Process

1. Read the release notes to understand what shipped and the stated success metrics.
2. Read the PRD rollout strategy and success/guardrail metrics.
3. Collect health signals from available sources:
   - Error / crash rate (Sentry, Crashlytics, or equivalent)
   - Core SLIs: latency p50/p95, error rate, throughput
   - Analytics: activation, conversion, or feature-specific events
   - Support signal: tickets, app-store reviews, user reports
4. Compare each signal against the pre-defined thresholds from the PRD and tech design.
5. Correlate any anomaly with the deploy timestamp to confirm causation vs coincidence.
6. Issue severity classification for any issue found (P0 / P1 / P2 / P3).
7. Issue verdict: GO / HOTFIX NEEDED / ROLLBACK.

## Output Artifact
`HEALTH-REPORT.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Health Report: vX.Y.Z — [feature name]
## Observation Window: [start] → [end]
## Rollout State: [% of users / flag state]

### Key Health Indicators
| Signal | Threshold | Observed | Status |
|--------|-----------|----------|--------|
| Error rate | < X% | Y% | ✅ / 🔴 |
| Crash-free sessions | > X% | Y% | ✅ / 🔴 |
| Latency p95 | < Xms | Yms | ✅ / 🔴 |
| Feature activation | > X% | Y% | ✅ / 🔴 |

### Issues Found
| # | Severity | Description | First Seen | Affected Users |
|---|----------|-------------|------------|----------------|

### Anomaly Correlation
[Any spike correlated with deploy timestamp? Evidence for/against.]

### Support Signal
[Tickets, reviews, reports — any new pattern?]

### Verdict
✅ GO — health signals nominal, continue rollout
⚠️ HOTFIX NEEDED — [issue], rollout paused
🔴 ROLLBACK — [reason], immediate action required

### Recommended Next Actions
- [Specific action with owner and timeline]
```

## Quality Gates
- [ ] Every success metric from the PRD has an observed value
- [ ] Any signal above threshold has a severity classification
- [ ] Verdict is explicit: GO / HOTFIX NEEDED / ROLLBACK
- [ ] Anomalies correlated (or ruled out) against deploy timestamp
- [ ] Recommended actions are specific (not "monitor more")
