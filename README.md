# Agent Task Contract

An experimental protocol for evidence-based collaboration between AI agents.

> **Minimal Rules · Strong Verification**
> Let agents decide how to work; let evidence decide whether the work is done.

This repository records one such experiment: two agents with different capabilities — **Hermes** (a
desktop agent acting as coordinator) and **dsh / DeepSeek Harness** (a sandboxed agent acting as
executor) — first competed on identical tasks, then started collaborating under a written contract.
The contract is now at **v2.3**. It is a record of what was tried, not a proven method.

- Protocol: [`SPEC.md`](SPEC.md) (authoritative text, in Chinese)
- Task template: [`TASK.template.md`](TASK.template.md)
- Report schema: [`REPORT.schema.json`](REPORT.schema.json)
- Real runs: [`examples/`](examples/)
- Version history: [`history/`](history/)

---

## 1. Why compare agents at all

The project started with a practical question: **when several agents are available, which one should
get a given task?**

The initial plan was a head-to-head test. Both agents would receive the same three briefs, Hermes
would verify both outputs against the same criteria, and the results would decide who gets what kind
of work next.

Three tasks were defined to cover different capabilities:

| ID | Task | What it probes |
| --- | --- | --- |
| P1 | Single-file sorting visualizer (`index.html` + `selftest.js`) | Front-end code, animation, testable structure |
| P2 | Zero-dependency CSV statistics CLI (`csvstat.js` + `test.js`) | Parsing, CLI semantics, exit codes |
| P3 | Technical brief on Node.js single-file packaging | Retrieval, citation, factual accuracy |

All three were executed once by each agent on 2026-10-20. The comparison is recorded in
[`examples/00-comparison-report.md`](examples/00-comparison-report.md).

**What the comparison actually showed** (n = 1, no repetition, no control group):

- dsh produced deeper self-verification: 354 assertions across 7 input classes for P1, its own
  headless-browser screenshots, and 19 first-party sources for P3 that survived URL checks.
- Hermes delivered faster and kept a stable schedule; dsh spent roughly 26 of its 35 minutes
  waiting on two tool calls that never returned.
- Neither result generalises. One run per task cannot separate capability from luck.

## 2. Why the project turned to collaboration

The head-to-head framing assumed the goal was to pick a winner. In practice the useful question was
different: **can the two agents split work along their strengths, with one of them verifying the
other?**

That requires something the comparison did not have: a contract. Once work is handed off, three
problems appear immediately:

1. The executor cannot see the coordinator's intent. Missing fields in a task brief get filled with
   guesses.
2. "Done" means different things to the two sides. Without a machine-checkable definition, the
   executor optimises for its own sense of completeness.
3. The executor's self-report is not evidence. In two runs the agent returned `status: done` with an
   empty summary; only the files on disk could be checked.

## 3. What the protocol tries to solve

The contract is small in ambition: make hand-offs **checkable**, and make verification
**independent of the executor's claims**.

Its rules cover:

| Area | Question it answers |
| --- | --- |
| Task definition | What must a task brief contain before work starts? |
| Budget and timeouts | How long may a task take, and what happens at the limit? |
| Stop conditions | What counts as "good enough", in a form a script can check? |
| Evidence | What must be left on disk, in what format? |
| Independent verification | How does the coordinator check work without trusting the report? |
| Isolation | What may the executor write, and in which session? |
| Failure handling | What happens on cancel, timeout, or a stuck tool call? |
| Re-assignment | When is a task resumed versus re-dispatched? |

## 4. How the contract evolved

Nothing here was designed up front. Each version came from a failure observed in the previous one.

| Version | Trigger | Change |
| --- | --- | --- |
| v1.0 | First hand-off | Five basics: paths, acceptance command, budget, prohibitions, allowed tools |
| v1.1 | Coordinator review | Added deliverable list, one retry for self-checks, timeouts split by command class, directory isolation, evidence format |
| v1.2 | Executor patch | Machine-checkable fields, default long-run quota, audit for modified tests, single source of truth for the version |
| v1.3 | Coordinator patch | Lite mode, consequences for exceeding self-check limits, resumption criterion as a time delta |
| v1.4 | Executor patch | Per-class self-check counting, timeout gate, `stop-and-report` escape hatch |
| v2.0 | Merge | All of the above consolidated; watchdog and stop-and-report trigger conditions added |
| v2.1 | First lite run | Measured results backfilled: `timeoutMs` does **not** kill, sessions cannot be created via API, evidence logs must be UTF-8 |
| v2.2 | Second run | Command-level timeout script with a call convention; watchdog scaled by budget; field count fixed at 12; cross-contamination check |
| v2.3 | Coordinator | Three budget tiers; complex tasks must be staged; "not finished" ≠ "failed" |

The full diff history is in [`history/`](history/).

## 5. What the two real runs established

Two lite runs were executed, both against the contract itself. They are the only empirical evidence
in this repository.

**Run 1 — contract checker (`examples/04-contract-check-lite-run/`)**

Built a zero-dependency Markdown checker that validates section numbering, `§` references, JSON
blocks, and the `report.json` field count. It passed independent re-execution (exit 0), and a
deliberately broken document produced 5 accurate errors with line numbers (exit 1). The run also
produced two negative findings:

- `task_result` returned an empty `assistantText` and empty `stats`; acceptance had to rely on files.
- The evidence log was written as UTF-16LE by PowerShell redirection and was unreadable as text
  until the contract required UTF-8.

**Run 2 — timeout guard (`examples/05-timeout-guard-run/`)**

A probe showed that the harness `timeoutMs` **does not terminate** a command: a 60-second command
with a 25-second timeout ran to completion (`killed: false`). The executor then wrote a wrapper that
kills the process tree at the deadline. Measured: 5.16 s for a 30-second command with a 5-second
timeout, with the grandchild process confirmed dead; 3.53 s for a 3-second command with a 10-second
timeout, exit 0. The coordinator re-ran the wrapper independently and reproduced the result at
5.152 s.

These two runs show that **specific mechanisms work**. They do not show that the protocol as a whole
improves outcomes — there is no comparison against a baseline.

## 6. What v2.3 is, and what it is not

**It is** a working, admittedly oversized contract that has survived two real hand-offs and one
debugging cycle. Its rules are specific enough to be executed by an agent and checked by a script.

**It is not** a validated method, a framework, or a product. Specifically:

- No control group. There is no measurement of tasks run without a contract.
- n = 1. Every task and every run happened once.
- Single environment: one Windows machine, one model per agent, one harness version.
- Implementation-bound. Several rules assume this pairing's tools: a PowerShell sandbox, an MCP
  bridge, `sessionId` semantics. `SPEC.md` marks these as implementation notes, but they are not
  portable as written.
- Unverified rules. The watchdog timing has never fired in a real stall; its parameters are still
  marked "to be calibrated".

## 7. Why more rules may be the wrong move

The contract grew from 329 tokens to roughly 1,200. That growth has a cost:

- Every dispatch must fill six or seven fields; every acceptance must check twelve report fields.
- Small tasks spend more context on the contract than on the work.
- Rules that are never exercised (the watchdog) look like guarantees but are untested.
- Several rules exist because of a single incident. One incident is weak evidence for a permanent
  rule.

The next stage of the project is therefore **subtraction**, not addition: find which rules actually
change outcomes, and delete the rest.

## 8. Next: an experiment, not a conclusion

The plan is to compare three configurations on the same task set:

| Configuration | Description |
| --- | --- |
| No protocol | Agents receive the task and nothing else |
| Minimal protocol | Task definition and result verification only |
| v2.3 | The current full contract |

Measured per task: success rate, error rate, rework count, completion time, token usage, human
interventions, re-assignments, and defects found at acceptance.

The goal is not to prove v2.3 right. It is to identify **which rules carry their weight**. A rule
that adds little but costs complexity should be removed.

None of this has been run yet. It is a plan.

## 9. Repository layout

```
.
├── README.md                  This file (English)
├── README.zh-CN.md            Chinese version
├── SPEC.md                    Protocol v2.3, authoritative text (Chinese)
├── TASK.template.md           Task brief template derived from SPEC §1
├── REPORT.schema.json         JSON Schema for the 12-field report
├── examples/
│   ├── 00-comparison-report.md
│   ├── 01-sortlab-visualizer/     P1, both agents
│   ├── 02-csv-stat-cli/           P2, both agents
│   ├── 03-node-packaging-brief/   P3, both agents
│   ├── 04-contract-check-lite-run/
│   └── 05-timeout-guard-run/
├── history/                   v1.1 … v2.3 (v1.0 original lost)
└── tools/                     Reference implementations, not part of the protocol
```

## 10. Known gaps

- **v1.0 original is lost.** Only a five-line summary survives in the conversation record; the file
  was overwritten when the contract moved to a pointer scheme. `history/` starts at v1.1.
- **dsh's P1 screenshots are gone.** The executor deleted temporary artefacts before delivery, as
  its own rules required. Only the coordinator's two screenshots remain.
- **No baseline.** Nothing was measured without a contract.
- **License undecided.** No license file is included on purpose; see `SPEC.md` §0.3.

## License

TBD. The project has not chosen a license yet; this is recorded as an open decision rather than
silently defaulting to one.

---

Maintained by [@HinaAyanami](https://github.com/HinaAyanami).
