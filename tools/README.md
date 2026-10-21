# Tools

Reference implementations used in the two recorded runs. **They are not part of the protocol.**
`SPEC.md` defines what must happen; these files are one way to make it happen on Windows.

Both are zero-dependency: `check-contract.js` uses only Node's `fs`/`path`, and
`run-with-timeout.ps1` uses only built-in PowerShell 5.1 cmdlets.

---

## check-contract.js

Validates a Markdown contract document.

```sh
node tools/check-contract.js SPEC.md
node tools/check-contract.js --task TASK.md SPEC.md
node tools/check-contract.js --no-task history/v2.3.md
```

Checks:

1. Top-level section numbering is contiguous (`## 1`, `## 2`, …).
2. Every `§x` / `§x.y` reference resolves to an existing section.
3. Every fenced JSON block parses.
4. If a `report.json` example exists, it contains all 12 required fields
   (`REPORT.schema.json`).
5. If a `TASK.md` is present (same directory, or `--task`), its declared field count must match
   the example.

Exit codes: `0` all checks passed, `1` at least one error (each error line carries a line number).

Known limitation: the field-list extraction only recognises `- field: description` list items.
Free-form mentions of field names in prose are ignored — this was changed after a false positive
where prose mentions were treated as required fields.

---

## run-with-timeout.ps1

Runs a command and kills its **process tree** at the deadline. Exists because the harness
`timeoutMs` does not terminate commands — it only moves the wait to a background job, leaving the
process running (measured: 60.134 s elapsed with a 25 s timeout, `killed: false`).

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/run-with-timeout.ps1 `
  -Command '& .\cmd-verify.ps1' -TimeoutSec 5 -OutFile out.json
```

| Parameter | Required | Meaning |
| --- | --- | --- |
| `-Command` | yes | Command to run. Put long or quote-heavy commands in a `.ps1` file and use `& .\file.ps1` |
| `-TimeoutSec` | yes | Deadline in seconds (decimals allowed) |
| `-OutFile` | no | Where to write the result JSON (UTF-8, no BOM) |

Result contract:

- Timed out: kills the tree, prints `{"killed":true,"elapsed_s":N}`, exits **124**
- Finished: prints `{"killed":false,"elapsed_s":N,"exit_code":N}`, exits with the child's code

Measured: 30 s command with a 5 s deadline → killed at 5.16 s, grandchild confirmed dead;
3 s command with a 10 s deadline → 3.53 s, exit 0.

Implementation note: this sandbox denies `taskkill /T` and WMI/CIM (`Access denied`), so the script
snapshots descendant PIDs via Toolhelp32 and calls `Stop-Process` on each, child-first.

### Quoting caveat

Do **not** try to pass a quoted command inline:

```powershell
# Does not work: PowerShell strips one layer, the wrapper receives broken syntax
-Command 'node -e ""setTimeout(function(){},30000)""'
```

Write the command to `cmd-*.ps1` and reference it. This was tested both ways; only the file form
produced a correct kill.
