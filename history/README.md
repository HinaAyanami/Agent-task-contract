# History

Original files, as written at the time. No edits except path redaction.

| File | Version | Date | Nature |
| --- | --- | --- | --- |
| *(missing)* | v1.0 | 2026-10-20 | **Original lost** — see below |
| `COLLAB-v1.1.md` | v1.1 | 2026-10-20 | Full text, authored by the coordinator |
| `COLLAB-v1.2.md` | v1.2 | 2026-10-20 | Full text, patch proposed by the executor |
| `COLLAB-v1.3-proposal.md` | v1.3 | 2026-10-20 | Diff only, authored by the coordinator |
| `COLLAB-v1.4-diff.md` | v1.4 | 2026-10-20 | Diff only, authored by the executor |
| `COLLAB-v2.0.md` | v2.0 | 2026-10-20 | Full text, merge of v1.1–v1.4 |
| `COLLAB-v2.1.md` | v2.1 | 2026-10-20 | Full text, first measured results backfilled |
| `v2.3.md` | v2.3 | 2026-10-20 | Full text, authoritative source for `SPEC.md` |

## v1.0 is lost

v1.0 was a five-line document. When the project moved to a single pointer file
(`COLLAB.md` → current version), the original was overwritten. What survives is a summary in
the conversation record:

1. Task entry — five required fields: artifact path, acceptance command and expected exit code,
   hard budget in minutes, prohibitions, allowed tool surface.
2. Stop conditions — "good enough" must be written as something decidable: exit code 0, assertions ≥ N,
   character count within a range, reachable-URL count equal to source count. Each check runs once;
   visual checks get one screenshot round.
3. Budget and timeouts — single command ≤ 90 s, switch approach on timeout, no third retry; at 3/4 of
   the budget stop polishing and hand over a usable version plus a list of what is unfinished.
4. Failure and artefacts — after cancellation or timeout, artefacts stay in place; the coordinator
   checks the last file change and decides resume vs re-dispatch.
5. Rollout — try one task; then decide whether to keep or revise, based on whether rules 2 and 3
   were hit.

**This is a summary, not the original text.** It is not presented as a recovered file, and no
`v1.0.md` is included because none exists.

## v2.2 has no full text

v2.2 was merged directly from a diff (`COLLAB-v1.4-diff.md` → v2.2 changes) and its full text was
then superseded by v2.3 in the same session. `COLLAB-v1.4-diff.md` records the proposal; `v2.3.md`
contains the merged result. There is no standalone `v2.2.md`, and none was reconstructed.

## Reading order

For the evolution, read `COLLAB-v1.1.md` → `COLLAB-v1.2.md` → `COLLAB-v1.3-proposal.md` →
`COLLAB-v1.4-diff.md` → `COLLAB-v2.0.md` → `COLLAB-v2.1.md` → `v2.3.md`.
Each version's header states what triggered it.
