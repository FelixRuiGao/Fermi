---
name: log-analysis
description: Triage application or system logs to find the root cause of an incident — parse, filter, correlate by time/trace, and surface the smoking gun. Use when investigating logs for an error, outage, or anomaly.
license: original (see skills/ATTRIBUTIONS.md)
source: original clean-room; standard log-triage practice (no text reused)
---

# Log Analysis

Logs are huge and mostly noise. Find the first real failure, not the loudest
symptom.

## 1. Frame the incident

What is the symptom and the time window? `$ARGUMENTS` may point at the log
file/command/service. Identify the log format (plain, JSON-lines, syslog,
logfmt) and where logs come from (`journalctl`, `docker logs`, `kubectl logs`,
a file, an aggregator query).

## 2. Narrow with the right tools

Don't read it all. Filter hard:

```bash
rg -n 'ERROR|FATAL|panic|exception|traceback' app.log | tail
# JSON logs:
jq -c 'select(.level=="error" and (.ts >= "<start>" and .ts <= "<end>"))' app.jsonl
```

Scope to the window first, then by level/keyword/request-id.

## 3. Find the *first* cause, then correlate

- The first error in the window usually causes the cascade that follows;
  later errors are often downstream noise. Work backward from the symptom to the
  earliest anomaly.
- **Correlate by a key**: trace/request/correlation ID, PID, host. Follow one
  failing request end-to-end across services rather than reading each service
  in isolation.
- Look for what's *missing* too: a request that starts and never completes, a
  health check that stopped, a sudden gap.
- Note rates/patterns: a spike, a deploy/restart timestamp, a config change,
  resource exhaustion (OOM, FD/conn limits, disk), timeouts clustering.

## 4. Conclude

State: the timeline, the root-cause log line(s) (quote them with timestamps),
the causal chain to the symptom, and the fix or the next diagnostic step. Be
explicit about confidence and what the logs do **not** show (don't infer a cause
the evidence doesn't support). Recommend the log/metric that would have made
this obvious, if missing.
