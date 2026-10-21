# Examples

Everything here comes from real runs. Nothing is a mock-up.

| Directory | What it is | Status |
| --- | --- | --- |
| `00-comparison-report.md` | Head-to-head comparison of both agents on P1–P3 | Real, n = 1, no control group |
| `01-sortlab-visualizer/` | P1: single-file sorting visualizer, both agents | Real deliverables |
| `02-csv-stat-cli/` | P2: zero-dependency CSV statistics CLI, both agents | Real deliverables |
| `03-node-packaging-brief/` | P3: technical brief on Node.js single-file packaging | Real deliverables |
| `04-contract-check-lite-run/` | Lite run: build a contract checker, then verify it | Real run + evidence |
| `05-timeout-guard-run/` | Run: prove `timeoutMs` does not kill, then build a wrapper that does | Real run + evidence |

## What "real" means here

- The code in `01`–`03` was produced by the two agents from identical briefs (`TASK.md` in each
  directory). It was not edited afterwards except for path redaction.
- Absolute paths were replaced with `<workspace>`, `<home>` and `<node>`. Nothing else in the files
  was changed.
- Evidence files under `_evidence/` are the original logs and JSON reports. Where a log was written
  as UTF-16LE by PowerShell, it is kept as-is so the defect remains visible.

## Known gaps

- **P1 screenshots from dsh are missing.** The executor deleted temporary artefacts before delivery,
  as its own rules required. Only the coordinator's two screenshots remain
  (`01-sortlab-visualizer/hermes/_shot-*.png`).
- **P1 from dsh was cancelled mid-run.** Its three deliverables and `selftest.js` were complete and
  pass on re-execution; the run was stopped while it was doing a second round of headless-browser
  checks. This is recorded in the comparison report.
- **No raw timing traces.** Per-run token and wall-clock numbers exist only where the harness
  reported them; the rest are estimates and are labelled as such.
- **Run 05 has no `TASK.md`.** Its brief was delivered as a message through the MCP bridge and was
  never written to disk. `v2.2-diff.md` in that directory is the executor's output, not the brief.

## Reproducing a run

Each example directory is self-contained. For `04` and `05`:

```sh
node tools/check-contract.js SPEC.md          # expect exit 0
node tools/check-contract.js <broken>.md      # expect exit 1 with line numbers
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-with-timeout.ps1 `
  -Command '& .\cmd-verify.ps1' -TimeoutSec 5 -OutFile out.json
```
