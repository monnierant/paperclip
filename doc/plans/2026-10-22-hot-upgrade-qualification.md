# Hot-upgrade qualification

Date: 2026-10-22. Owner: the existing Runner protocol, native runtime integration,
and Product E2E harnesses. Related implementation: [hot upgrades](2026-10-21-daytona-hot-upgrades.md),
[continuity runbook](../testing-native-remote-continuity.md), PR #17097.

## Acceptance contract

An admitted remote agent keeps its sandbox, runner process, provider session and
active turn while the control plane is unavailable for up to 300 seconds.
Server-dependent calls wait and reconnect. After HTTP returns, admitted work and
queued launches recover automatically and new work can launch without an operator
drain. The runner's existing 420-second reconnect grace includes server startup
and ownership acquisition; tests must not reset that deadline on each retry.

Postgres, the instance encryption key and the sandbox survive. This does not
promise HTTP availability while the only web server is offline, survival of a
destroyed sandbox, retroactive support in older running binaries, or reconstruction
of an acknowledged display-only log tail. Never repeat a provider turn or external
effect to fill a display gap.

## Review stack and ownership (2026-10-24)

Four PRs, reviewed in this order. PR #17097 is reused for the runner slice.
The full pre-split branch is retained as `codex/hot-upgrades-reference-2026-10-24`
at `858cfd1fdf621c56a8ce7615bdf5aecc9cf1bb61`.

| Slice | Owns | Acceptance evidence |
| --- | --- | --- |
| Runner contract | Optional opaque checkpoints, authenticated cursors, durability barriers, retention and deadlines; one-process scripted executor fixture | Outage progress, waiting, replay, persistence failures and backpressure; consumer compatibility and protocol/dependency checks |
| Server adoption | Postgres migration/encryption, transactional fencing, startup/expired-owner recovery, tool authority, detach/Stop/finalization and bounded retention | Real Postgres races, empty disk, uncertain mutations with independent effect ledger, admission and SQL gates |
| Upgrade qualification | Existing supervisor and installed-artifact verification; immutable A/B upgrade and compatible rollback, phase receipts and hosted paths | Natural lease acquisition, original execution identity, exact artifacts, short/full outages, cleanup and admission within 420 seconds |
| Transcript delivery | Additive WebSocket negotiation and run interests; shared visible browser subscriptions, catch-up and bounded delivery | Native/legacy journeys, subscription races, reconnect, congestion, company/access changes and measured viewer costs |

Tests and documentation ship with their owning behavior. Qualification defects
are fixed in the owning earlier slice. Transcript delivery is functionally
independent and has no migration. Browser interest never changes harness execution,
PRP ACKs, checkpoints, accounting or canonical logs.

The deterministic fixture links the production runner core and a scripted
`CommandExecutor` in one process. Its counter records completed workload steps;
no auxiliary daemon, HTTP service, production test endpoint or fake-provider
admission option is introduced. It distinguishes useful progress from waiting
on control-plane results and from bounded output backpressure. Synthetic execution
never qualifies an underlying harness.

Compatibility starts at the first hot-upgrade-capable protocol release. Test the
oldest supported artifact and previous release, as well as compatible rollback.
A frozen branch artifact is explicitly development-build evidence until releases
exist; HTTP readiness or a replacement task is insufficient evidence of continuity.

## Current execution evidence (2026-10-24)

The review stack is [Runner #17097](https://github.com/paperclipai/paperclip/pull/17097)
→ [Server #17439](https://github.com/paperclipai/paperclip/pull/17439)
→ [Qualification #17455](https://github.com/paperclipai/paperclip/pull/17455)
→ [Transcript delivery #17456](https://github.com/paperclipai/paperclip/pull/17456).
None is deployed. The remaining acceptance gates below are not waived.

The final security review found that cache-independent adoption skipped a
preparation callback which also checked managed-project grants. The correction
keeps policy in the plugin adapter: Runner retains at most two opaque configuration
IDs bound to exact execution identities and calls an optional authorization hook
before registration. The adapter calls existing `check_project_auth` with current
project IDs. Existing consumers without the hook keep the preparation callback;
missing cache or bindings fail closed. No extra process, periodic check, or text
checkpoint is introduced. Four transport regressions fail on the previous code;
28 focused runner tests, the complete 429-test controller/transport suites, all
34 plugin-owner tests and three real-Postgres SDK integration cases pass with the
correction. The SDK regression exercises current-grant revocation through the
actual runtime and plugin serialization, with synthetic provider resources.
One warm-handoff case timed out during concurrent server compilation; the isolated
rerun passed. The first Postgres attempt failed before tests because Docker
returned an engine startup error and no database was listening; after engine and
database readiness were confirmed, the integration rerun passed. Runner/server typechecks and protocol/dependency checks pass. Current
CI and review status remain on the linked PRs rather than treating older heads as
proof of this correction.

The next review found a stale Copilot source identity and a checkpoint fence that
sampled database time before waiting for a row lock. The generated active profile
and existing controller mocks are updated; all 90 affected runner compatibility
and permission tests pass. The writer now locks in a CTE and samples wall time in
the outer query, retaining one SQL statement and round trip. Its real-Postgres
regression fails on the prior writer and passes with the fix, without changing
stored checkpoints after expiry. The full recovery run passed 38 cases and skipped
five optional profiles; two unchanged renewal cases failed while Docker became
unavailable. After restoring the daemon and a confirmed-ready database, both
renewal cases and the new lock-expiry test pass together with natural lease timing.
The repeated 8/512-chunk SQL gate still records eight checkpoint writes, seven
transactions, fourteen changed rows, zero streaming SQL and zero idle SQL. WAL
was 37,424/37,720 bytes (diagnostic only). Runner identity checks and server
typecheck pass. The first CTE implementation failed typecheck on a nested subquery
projection; selecting its three needed fields explicitly fixed it before testing.

The next server review found that instruction update/restore receipts use call
IDs rather than generic idempotency keys. Recovery now reuses their existing
locked receipt and current target-authorization checks in a mode that cannot
reserve or repeat a write. Both lost-commit-acknowledgement regressions fail on
the prior code. All 13 real-Postgres/filesystem instruction tests and 29 existing
tool-authority tests pass, including unchanged bytes and one audit effect,
conflicting arguments, revoked permissions, Stop, unknown outcomes and a receipt
removed before locked replay. An initial companion-suite attempt exhausted macOS
Postgres semaphores before tests; both suites then used the same disposable-host
helper with independent databases. Server typecheck passes.

Transcript review also found legacy catch-up restarting sibling reads and an
interest acknowledgement clearing a stalled delivery deadline. Two legacy
regressions and the blocked-delivery deadline regression fail on the prior code.
The corrected hooks pass 31 focused tests; all 12 delivery tests, UI typecheck
and token gates pass. Terminal refreshes coalesce per run, and resubscription
cannot extend the original five-second backlog deadline. Existing protocol,
checkpoint and canonical-log ownership is unchanged. Updated CI, review and
browser evidence remain attributed to their candidate revisions on the PRs.

The separate Paperclip review found premature local expiry after a delayed
successful renewal and unlimited retries in opportunistic startup retention.
The renewal owner now samples a monotonic deadline immediately before UPDATE,
after acquiring the connection and row lock, while still deducting UPDATE/commit
response time. Its public void-returning API and SQL work are unchanged. Startup
retention stops after three failed passes, including query failures, and defers
remaining rows until the next startup. The delayed-success and both retention
regressions fail on the prior implementation. All 44 renewal/retention tests pass,
including quiet time after the retry cap and successful cleanup at the next
startup. Two real-Postgres renewal cases also pass in 107.45 seconds: one saturates
the liveness pool through two delayed successful renewals with natural 60-second
lease timing; the other retains application-pool isolation, SQL timeout and
expiry-during-lock checks. Server typecheck passes. Final review and CI status
remain attached to the exact candidate revisions on the PRs.

The final runner review found that a rejected persistence callback permanently
poisoned later flushes, and an adoption authorization hook could be silently
ignored without launch preparation. The runner now rejects that invalid option
combination before registration. Persistence keeps the last successful revision,
resets the next write after an uncertain outcome, and calculates queued deltas
against successful state. Three persistence regressions cover failure before
commit, a lost commit response, reconnection with the same lease and command,
and a queued successor. Those tests and the adoption-option regression fail on
the preceding implementation. The corrected controller/transport run passed
432 of 433 tests; the unchanged child-diagnostics test exceeded its five-second
timeout and passed a bounded isolated retry without changes. The failed attempt
is retained. All 39 focused profile tests, both Runner TypeScript checks,
protocol manifest/schema and module-boundary checks pass. The refreshed source
profile is `sha256:fac29e13622eadf9ab6f6dd1c47b2384ffa6307a2edb942dd78d3aae8e8d501f`.
This identity refresh is not new live-provider qualification.

CI 40141476713 found a race in the new persistent-retention regression: an empty
next-deadline value could mean a retry was still running. The test now waits for
the owner's final deferral warning and exactly three failed attempts before
checking three hours of simulated quiet time. All 39 retention tests pass with
disposable Postgres. The first local run timed out in database setup; a warm retry
passed with the same setup timeout. Product retry limits and quiet-time assertions
are unchanged. The runner fixes belong to PR 1 and this test fix belongs to PR 2.
Final CI/review results remain attached to each exact PR candidate.

CI 40144348549 then caught two test issues. The regenerated Copilot identity
still had an old pinned digest in the installation test; the corrected pin
passes all 95 installation/profile/permission tests. The in-process recovery
fixture observed all 64 events at the controller before the last eight
acknowledgements reached the runner. It now waits for the independent runner
receipt to report 64 acknowledged events and zero retained events. All three
fixture cases pass in 16.18 seconds, including filesystem-only compatibility
and deadline expiry. This strengthens the settlement witness without changing
production behavior, the workload count or the reconnect deadline. Both failed
CI shards remain retained; fresh CI is required for the corrected candidate.

| Layer | Latest evidence | Limit / next gate |
| --- | --- | --- |
| Runner | Initial split: 191 controller/profile, 96 Rust, 11 parity tests and three one-process fixture cases passed. After refresh onto master, protocol manifest/schema/replay and dependency-boundary checks pass. `2d72e827c991feb0f88d178aaf1ad1e0628f3e83` has Greptile 5/5 and passing unit, Rust, typecheck and build lanes. | The scoped rerun passed after an earlier browser fixture cancellation hit a lock timeout; CI is green for this revision. Synthetic execution does not qualify Codex/Claude. |
| Server | Refreshed recovery, renewal and plugin-adoption suites: 43 passed, five optional profiles skipped. The subsequent liveness-pool fix passed all 822 native executor/renewal tests with real Postgres. Saturated application-pool, cancelled row-lock wait, expiry-during-lock and natural 60-second claim-lifetime regressions passed. | `57278aa4aa11e3106d645615632571a33764eff5` has passing CI and Greptile 5/5 with no unresolved findings. An earlier unchanged cleanup-page failure is retained. Hosted admission/continuity remains outstanding. |
| Qualification | 80 focused tests, the separately executed real-Postgres observer and both embedded-database ownership tests in Linux pass. `29606367add9d6bc0fbc5ae86f8b41ac9392cb61` has passing CI and Greptile 5/5. Short and full 300-second immutable A→B→A startup smokes passed, with zero agent turns. | Active A/B/A, real migration change, natural stale-owner partition, representative concurrent admission and hosted proof remain outstanding. Local Linux ownership proof does not qualify a hosted agent. |
| Transcript delivery | Native notification and per-run catch-up isolation corrections pass 75 focused tests, UI typecheck, token gates and the native two-view/reconnect/reload journey. Earlier native and legacy browser journeys and 37 delivery regressions pass. | An earlier CI attempt failed the unchanged cleanup-pagination timing test; the unchanged suite passes all 14 tests in local Linux and passes the next CI run. Final revision checks and review remain the PR gate. Deterministic browser dependencies are not live-harness evidence. |

The supervisor observes HTTP readiness, natural ownership acquisition,
authenticated attachment, resumed canonical ingestion, and backlog settlement
separately. The read-only observer uses one repeatable-read database snapshot and
the Runner-owned checkpoint evidence projection. A new durable authentication
count and new canonical source sequence are both required; replaying saved events
cannot pass. The observer never renews or edits a lease or invokes recovery.
Its SQL is qualification overhead, excluded from product SQL cost measurements.
Postgres belongs to the supervisor rather than the killed serving process;
external Postgres is left alone, while an owned embedded database starts empty.
Each serving artifact applies its own migrations.

The credential-free startup smoke used these **development builds**, both 0.3.1:

| Artifact | Serving revision | Complete installation SHA-256 |
| --- | --- | --- |
| A | `f695ca7faac27d055441bb60bf377831bda85622` | `af894bdc71e390f11cfdd9128c828007e94095c0ba7bdab34c0ba1a7ecd01284` |
| B | `5ff132042f1071fdbc45624f6ab1e4d1bfac6598` | `bc3dd69e2c704a6c7c98804a1653d3b8a4e8fd8b88676c043dad891c0e506d15` |

The short smoke held the server down for 1,000 ms per replacement. Readiness
arrived after 25,305.985 and 33,658.933 ms. The full smoke held it down for 300,000 ms
per replacement; readiness arrived after 327,622.436 and 327,668.142 ms, within
420 seconds. Both preserved the database, read existing data, accepted a fresh
company mutation after each replacement, and cleaned up successfully. Receipts
explicitly record `providerTurns: 0` and `activeAgentContinuityQualified: false`.
A/B have identical migration journals: this establishes compatible startup and
rollback, not a nontrivial forward migration. These builds predate the final
server claim-renewal fix, so they cannot qualify that candidate's active recovery.

Private receipt locations: `paperclip-runner-e2e-k6aRaI/replacement-evidence.json`
(short) and `paperclip-runner-e2e-EXG9cW/replacement-evidence.json` (300 seconds)
under the host temporary directory. Harness revisions were respectively
`faaf31890e5ae96227bcfc0270bd5d94a92a2641` and
`446d89245bad472abe6b5a793365004858df1e63`.

Real Postgres cost comparison: 8 and 512 text chunks each produced 8 checkpoint
writes, 7 transactions and 14 changed rows for the same control operations.
Both measured zero streaming checkpoint SQL/transactions/rows and zero idle SQL.
WAL was 37,408 and 37,528 bytes; this diagnostic is not a production capacity
estimate. Receipt: `/tmp/paperclip-hot-upgrade-pr2-sql-cost-20261024-2.json`.
Independent mutation tests covered a lost HTTP response after the business row
committed and a lost runner response after its API receipt was saved. Both
checked the business table independently and counted one dispatch.

Failed attempts remain distinct from evidence: plain `pnpm deploy` omitted
public manifests, bundled dependencies and runtime skills; the existing release
preparers fixed the artifact before it was frozen. An initial 300-second smoke
could not connect to stopped Docker and launched no agents. Native macOS Postgres
setup repeatedly exhausted host semaphores; integration checks moved to a
throwaway Docker database without changing product recovery. The earlier hosted
attempt exhausted BuildKit disk during image export, before launching a sandbox.
No expensive retry should proceed without resolving its infrastructure cause.
The current trusted hosted workflow has no per-run disk-capacity override or
upgrade-manifest input. No local Daytona/model credentials are configured.
Workflow changes on this branch cannot replace its required default-branch
workflow authorization. Hosted continuity remains unqualified until an authorized
path can build the image and consume the immutable A/B artifacts.

After refreshing the stack onto master, workspace typecheck and all 43 targeted
recovery, renewal and plugin-adoption tests passed (five optional profiles skipped).
Master already fixed the stale stylesheet-preload browser fixture. Runner, server
and qualification CI pass at the revisions above. The older broad Linux source
verification of `c7bdc72416c98b6781b11452eba878036a9f862a`,
[run 40127795703](https://github.com/paperclipai/paperclip/actions/runs/40127795703),
was cancelled after the missing embedded-database tests passed directly in Linux.
It is not a full-source pass. Current revision CI remains required.

### Transcript delivery measurements

The fixed workload emits 1,024 events of 2,048 characters in bursts of 16. These
are measurements of the in-process delivery boundary with simulated sockets.
They exclude canonical persistence, real network behavior, browser rendering,
and production capacity. Heap deltas depend on garbage collection.

| Views | Full transcript deliveries | Encoded bytes | Authorization calls | Elapsed ms | CPU ms | Heap delta (bytes) | p95 delivery ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Zero interested views | 0 | 230 | 1 | 2.310 | 3.014 | +1,364,856 | — |
| One view | 1,024 | 2,259,853 | 1,024 | 8.205 | 18.437 | +2,254,512 | 0.082334 |
| Three browser connections | 3,072 | 6,779,559 | 3,072 | 12.543 | 12.780 | −2,520,744 | 0.124167 |
| Congested connection | 464 | 1,023,959 | 465 | 2.954 | 2.903 | −2,499,248 | 0.038083 |

The zero-interest case coalesced one lightweight activity notification. The
normal one-view peak retained queue was 16 items / 35,344 bytes. The congested
case requested resynchronization while staying inside the delivery bound.
Private receipt: `/tmp/paperclip-live-delivery-cost-20261024.json`.

The native Playwright journey passed in 39.5 seconds (50.8 including setup) on
`267d221f4659ff17d95c99ad5fac5e77f37c8538` plus its test-only transport fault
injection and document-scoped connection accounting. It used a real runner,
disposable Docker Postgres, and the deterministic Codex app-server. The run
`efd7ca4d-7b63-4b02-8312-44bbcad32f91` completed once; both views retained the
final output through reload and the business comment table contained one final
comment. There were zero transcript history requests during a settled 2.5-second
streaming interval, exceeding the fallback's 2-second poll interval. Earlier
attempts exposed obsolete test selectors, provider-discovery precedence, and
Chromium's failure to close existing sockets during offline emulation; none was
recorded as a passing reconnect check.

## Evidence layers

| Layer | Execution and owner | What it proves | Cadence |
| --- | --- | --- | --- |
| Protocol | Runner tests; controlled ACK/persistence/effect faults | Replay, authenticated sparse cursors, durable barriers, bounded queues | Every relevant PR |
| Recovery integration | Real Postgres and Rust runner; deterministic provider | Ownership races, encryption, empty cache, side-effect settlement, same turn | Every relevant PR |
| Server replacement | Product E2E wrapper kills/replaces the actual main server; production HTTP workflow | Startup adoption, natural lease timing, same sandbox/run, finalization and admission | Relevant PR; exact hosted cell before release |
| Version compatibility | Immutable server A then B, admitted runner digest, real migrations; compatible rollback | Upgrade contract across different artifacts | Before release |
| Efficiency | Identical scripted workload with and without checkpoints, plus restart burst | Incremental DB work, latency, throughput, backlog and resource bounds | Relevant PR; capacity campaign before release |

Keep these claims separate. A scripted provider is a reproducible correctness
instrument, not a qualification of the real provider or Daytona. A same-version
restart is not an A-to-B upgrade. A wrapper test is not an agent continuity test.

## Fault and workload matrix

Start with one server replacement and one cost comparison; extend the same harness
rather than create parallel recovery implementations or production test switches.

| Axis | Required cases |
| --- | --- |
| Fault | Graceful stop; SIGKILL; transport partition with old owner alive |
| Unavailability | Short; around the natural lease expiry; full 300 seconds |
| Work at boundary | Streaming; server read waiting; mutation committed with response lost; completion during outage; queued launch |
| Competition | Two successors; stale owner resumes; Stop/authority change; second restart during recovery |
| Versions | A to B plus migrations; B to compatible A; unsupported runner fails explicitly |
| Load | Expected peak; twice peak; synchronized reconnects; idle with retained history |

The harness records that the original run was active at injection. An unexercised
boundary fails, even if a later task succeeds. Use deterministic gates for the
scripted workload; wall-clock sleeps alone cannot establish where an effect was.
Never edit lease timestamps or recovery state in a server-replacement journey.

## Hard correctness gates

- Preserve sandbox lease, runner PID **and process start identity**, provider
  session and active turn. The provider call ledger must show one turn start.
- Check an external fixture's effect ledger independently: a write occurs once,
  including when its response is lost. Tool-ID deduplication alone is insufficient.
- An uncertain write is visibly held; an ordinary read can retry under current
  authority. A stale owner cannot write a command or acknowledge an event.
- The original run commits once, including accounting and workspace finalization;
  no stranded operation or recovery action remains.
- Queued/admitted work resumes and a newly submitted task launches after readiness.
- Record fault receipt, actual elapsed outage, server readiness, natural ownership
  eligibility, reattachment and backlog-drained times separately. Recovery must
  fit the original 420-second grace. A healthy HTTP endpoint alone cannot pass.
- Missing provenance, missing boundary evidence, unexpected skips, cleanup failure
  and automatic retry do not qualify an attempt.

## Efficiency gates and measurements

The lean design keeps control state, not a second transcript. The existing run
log, business writes and 20-second lease renewals remain baseline work.

1. **Zero checkpoint writes for ordinary text chunks.** Compare a small stream
   and a much larger stream with the same control operations. Assert callback,
   SQL and changed-row counts, not just final table size. Updates to one row are
   still load. Calibration must make a deliberate extra write fail the gate.
2. **Zero added checkpoint SQL while idle after startup.** Exercise both empty
   and retained history. Retention may do its bounded startup pass; the existing
   filesystem cleanup timer must not query checkpoint rows.
3. **Measure each control boundary.** Capture checkpoint transactions, inserted/
   updated/deleted rows, payload bytes, WAL bytes and lock waits in an isolated
   Postgres database. Report measurement-query overhead separately. Never count
   a mocked persistence callback as a WAL measurement.
4. **Compare normal-operation cost first**, then restart cost: same fixed seed,
   concurrent agents, output rate, tool mix and duration; warmup plus repeated
   paired samples. Report throughput, CPU, peak RSS and p50/p95/p99 control latency.
   Provisional acceptance is at most 5% throughput regression at expected peak;
   establish the baseline and expected peak before treating that as a release gate.
5. **Bound backlog and recovery pressure.** A five-minute outage must fit the
   configured runner outbox budget and drain without starving new commands or
   fresh admissions. At twice peak, pressure must remain bounded and explicit.

Do not infer production dollars or capacity from a laptop timing result. Persist
raw sample counts and distributions; noisy timing is diagnostic, not a flaky
single-sample CI assertion. Structural zero-write checks are deterministic gates.

## Attempt record and implementation order

Every attempt retains the two server revisions/artifact digests, runner digest,
workload configuration, fault receipt, monotonic elapsed times, independent effect
ledger, recovery identity, database measurements and cleanup outcome. Store private
logs under the existing harness private-artifact policy; publish only sanitized
receipts. Keep failed attempts alongside subsequent successes; no automatic retries.

1. Add a bounded, cancellable actual-server outage to the existing restart wrapper,
   with a receipt the remote continuity grader requires. Test missing/incorrect
   receipts and real process replacement. Leave the existing finalization fault
   and local process ownership contracts intact.
2. Add repeatable Postgres checkpoint-write measurements to the existing native
   integration suite, including the zero-stream-write gate and a positive control.
3. Run the exact hosted remote continuity cell at short and full-contract outages.
   Resolve the image-builder disk failure before another paid attempt. Do not
   promote a suite that failed before sandbox launch.
4. Extend to pinned A/B artifacts, deterministic mixed workload/effect faults,
   two-owner contention, outbox pressure and the paired peak-load benchmark.

## Evidence status at the start of this slice

- Existing tests cover authenticated sparse replay, transactional checkpoint
  fencing, uncertain tool recovery, delta updates and idle/retention behavior.
- The 300-second integration proof uses real Postgres/Rust and a scripted provider,
  deletes controller files, and retains the active turn. It **manually expires a
  lease and does not replace the main server**; it is not the server-upgrade gate.
- The hosted `everyday-workflows.runner-codex.daytona.recover-controller` cell
  already replaces the server and grades original-run identity and finalization,
  but needs an explicit outage receipt and configurable crash/outage duration.
- Hosted attempts 39613279281 and 39616972414 failed in image preparation with
  ENOSPC before sandbox launch. No Daytona continuity pass is claimed.
- Different server versions, independent external-effect counting, mixed-load
  capacity/WAL measurements and production cost estimates are not yet qualified.

Implementation results and exact commands belong below, with their limitations.

## Implemented qualification slice

- `tests/runner-e2e/controller-outage.ts` owns bounded fault injection and
  monotonic phase receipts. The actual server wrapper uses it only for the
  explicit remote cache-replacement cell. Signal, minimum hold (0..300000 ms),
  old/new process IDs and incomplete attempts are inspectable. Cancellation
  prevents a successor launch. Missing/short/foreign fault receipts fail grading.
- The existing hosted cell defaults to SIGKILL and a 1000 ms hold, requires this
  receipt, and forbids automatic retries. Its definition version and harness
  fingerprint changed. The full hold is selectable using
  `PAPERCLIP_RUNNER_E2E_CONTROLLER_OUTAGE_MS=300000`; SIGTERM is also selectable.
- `controller-replacement-smoke.ts` is a credential-free actual-main-server
  probe with Postgres owned by the test driver. It checks unchanged Postgres
  start time, existing HTTP data, new HTTP mutations and complete process cleanup.
  It deliberately reports `activeAgentContinuityQualified: false`.
- The native restart integration suite now measures actual checkpoint SQL through
  postgres.js, checkpoint transactions/changed rows/bytes, diagnostic cluster WAL,
  and elapsed time for identical control operations with 8 versus 512 text chunks.
  The fixture holds text until control setup settles, then each released stream
  must add zero SQL statements, transactions or changed rows. Total control setup
  counts remain diagnostic because batching can vary. A subsequent real control
  write calibrates the observer. A settled-stream interval must issue zero SQL. Broader
  idle cleanup remains covered by the existing retention tests. These timings and
  WAL values are not a paired capacity benchmark or production cost estimate.

Commands (run from the repository root):

```sh
pnpm test:e2e:runner:typecheck
pnpm test:e2e:runner:unit -- --maxWorkers=2
node cli/node_modules/tsx/dist/cli.mjs tests/runner-e2e/controller-replacement-smoke.ts
PAPERCLIP_TEST_CHECKPOINT_COST_REPORT=/tmp/checkpoint-cost-attempt-1.json pnpm exec vitest run server/src/services/native-runtime/native-runner-restart-recovery.integration.test.ts -t 'keeps checkpoint SQL independent' --maxWorkers=1
```

Choose a new cost-report filename for each attempt; existing evidence is never
overwritten. Build the existing Rust fake provider after changing its fixture
flags (`cargo build --manifest-path packages/paperclip-runner/runner/Cargo.toml
--locked -p paperclip-runner-core --bin fake-codex-app-server`). No LLM credentials
are needed for these local probes.

Initial evidence on 2026-10-22:

- 50 focused fault/oracle tests passed. Server typecheck passed.
- Actual-main-server SIGKILL smoke passed: a 1000 ms confirmed-down hold, readiness
  62.82 seconds after injection, unchanged Postgres start time, data continuity,
  new mutation and confirmed cleanup. This used source revision 436b2ce12 plus
  the working changes, not two released artifacts.
- The real Postgres/Rust cost gate passed with 64 times as many text chunks.
  Earlier 4096-chunk attempts exceeded the original ten-second observation bound;
  they did not establish a DB regression or pass. The fast gate now uses 8/512
  and a bounded 60-second observation window. Large backlog capacity remains a
  separate gate, not silently qualified by this smaller sample.
- The first smoke launcher attempt failed on workspace package imports before
  server launch. Direct source imports fixed the standalone entrypoint.
- The first complete support-suite run had 3571 passing tests, two explicit skips,
  and five failures in existing catalog version/count and Daytona image-input
  assertions. These must be reconciled before calling this slice PR-ready.

Follow-up validation on the merged branch (`d0a0b830e7`, plus the request-receipt
correlation check):

- The full **300000 ms** actual-main-server SIGKILL smoke passed with Postgres
  continuously alive, old controller cache unavailable, existing data readable,
  a new HTTP mutation accepted and cleanup confirmed. This remains a zero-provider
  startup/DB proof; it does not upgrade the hosted agent result to a pass.
- The complete native restart integration file passed **34 tests**, with five
  Docker-dependent cases skipped. The focused protocol and Copilot identity
  suites passed **191 tests**. Fault/oracle tests passed **50 tests**.
- Workspace `pnpm -r typecheck` and `pnpm build` passed. Earlier typecheck attempts
  found a sandbox IPC restriction and Rust fixture formatting; the permitted,
  formatted rerun passed. The merged source preserves master's Copilot v58 and
  declares the combined recovery transport as v59, including Docker image inputs.
- The reconciled Product E2E support run passed 3573 tests and skipped two, but one
  file's worker failed to start. Its separate rerun passed all three tests, and
  the follow-on Node suite passed 128 tests. The full invocation remains recorded
  as incomplete; it is not relabeled a clean full-suite run.

Measured control-checkpoint cost for one scripted turn:

| Text chunks | Transactions | SQL writes | Changed rows | Plaintext checkpoint bytes | Cluster WAL bytes | Settled-stream idle SQL |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 | 7 | 8 | 14 | 13618 | 37224 | 0 |
| 512 | 7 | 8 | 14 | 13636 | 37632 | 0 |

Control operations are included; the output stream adds no checkpoint writes.
WAL is a diagnostic cluster-level observation, including possible background
work, not an exact attribution or threshold. This is not the promised paired
peak-capacity campaign. A new control command after each sample produced a real
SQL write, establishing that the observer was active.

Still outstanding: hosted active-agent proof (including the full 300-second
outage), version A/B artifacts and migration/rollback, deterministic mixed
work/effect ledger, natural-lease race matrix, and paired peak/overload measurements.
The hosted blocker was confirmed in the retained build log: BuildKit exhausted
disk while exporting the image, before the workflow could launch any sandbox.

Review found a read-recovery gap: the copied retry list omitted identity, people,
skill and workspace reads. Their saved inputs could remain pending after a lost
response. Recovery now consumes the Runner's existing canonical side-effect
classification, plus read/mutation metadata on server bridge definitions. The
server shim exposes that existing Runner metadata; it adds no alternate authority.
Read replay calls the normal executor and therefore rechecks advertisement,
company/run scope, current grants and file confinement. External tool annotations
never authorize uncertain-effect replay. Four focused Postgres regressions passed,
including actual file reads, company isolation, missing-file settlement, revoked
workspace grants, stale leases and cancellation. Initial attempts used the wrong
catalog projection and lacked the shim export; existing read tests and typecheck
caught both before the corrected run passed.

Master advanced during final verification. The merge preserves its released
0372 workspace-restore migration and regenerates the combined checkpoint table
and header index as 0373_powerful_mentor from the complete master snapshot. The
checkpoint SQL retains its idempotent guards; the latest five snapshots remain.
This supersedes the earlier 0372/0373 checkpoint numbering in the historical plan.

The merged CI run caught a timing assumption in the initial cost comparison:
control messages coalesced into seven SQL writes in one sample and eight in the
other. That is a failed attempt, not a zero-write proof. The fixture now holds
text behind an explicit release file until turn-start events and command results
are durably settled. Each text-only interval must independently cause zero SQL,
transactions and changed rows; total control counts are measurements, not equality
assertions. The existing positive control still verifies the SQL observer.
The first gated local attempt passed: both 8 and 512 chunks added zero SQL,
transactions and changed rows, with zero idle SQL and a successful positive
control. The full merged restart suite passed 36 tests (five Docker-only skips),
and all 29 tool-authority tests passed on a serial rerun after an initial database
setup timeout. Workspace typecheck also passed after the migration merge.

### Final review corrections (2026-10-24)

Completed plugin runs may clear their dispatch flag during normal cleanup. The
qualification boundary accepts that state only for the original succeeded run
with its saved task identity and persisted provider-stop confirmation. Active
runs still require dispatch. Missing stop proof and replacement identities fail.

The server's native renewals now share the existing liveness pool with legacy
renewals. Each active remote lease attempts renewal every 20 seconds, with one
row lock and fenced update inside a transaction and a local 10-second statement
timeout. Expiry is checked after acquiring the row lock. A cancelled attempt
can retry within the original deadline, but a lost or late response cannot
restore expired authority. This adds active-run SQL around renewal; it does not
change the zero-per-text-checkpoint-write or idle-SQL gates. The text-chunk cost
measurement above excludes periodic renewal overhead.

### Restacked candidate and hands-on browser evidence (2026-10-24)

Candidate `54fc7c6494470a9d553ef7bce7d57b3f5a57d7ba` passed full workspace
typecheck and build, 80 focused qualification tests, and the separately executed
real-Postgres recovery observer. This includes server renewal fix
`57278aa4aa11e3106d645615632571a33764eff5` and qualification fixes through
`29606367add9d6bc0fbc5ae86f8b41ac9392cb61`. Final-head CI remains the PR gate;
these local results do not replace it.

A hands-on in-app-browser journey used that candidate, the real runner, the
deterministic Codex app-server and a disposable Docker database. Starting at the
dashboard, the operator created TRA-1 through New Task, opened it from Recent
Tasks, observed live commentary, navigated to Tasks while it was running, returned
to its completed answer and reloaded it. The result and source link remained
visible. API inspection confirmed one successful run
`09cff1ec-5340-48e4-97f0-12334052e4aa` and one final business comment.

Functional outcome: passed. The observed desktop experience was usable, with no
error banner, duplicate result or lost output. A normal loading skeleton appeared
on navigation; an unrelated announcement overlay was dismissed. The screenshots
do not establish smoothness between every sampled frame. No mobile or live-model
claim is made. Final screenshot: `/tmp/paperclip-transcript-manual-completed-20261024.jpg`.

### Native notification catch-up correction (2026-10-24)

Review found that a consecutive native commit notification could be mistaken for
a complete transcript row. The notification contains no PRP body. Native views
now request canonical history through its sequence and never merge the empty
notification over text. The 73 focused hook, projection and sequence tests pass,
including consecutive notifications, delayed duplicates, a notification racing
an older read, failed-read recovery and zero recurring reads for complete live
PRP rows. These tests use the real native transcript projection. Token gates pass.
Payload-free notifications cause event-driven history reads; this is distinct
from the zero recurring reads during settled negotiated streaming.
UI typecheck and the native two-view browser journey also pass after this fix
(39.1-second journey, 53.4 seconds total). That journey rebuilds the shipped UI,
uses the real runner with the deterministic Codex app-server, and verifies socket
reconnect, company changes, terminal catch-up, reload and one final business
comment. It does not qualify a live provider or hosted upgrade.

### Linux ownership proof and retained CI failure (2026-10-24)

The previously blocked embedded-Postgres ownership test passes in a disposable
Linux ARM64 container: both tests in `controller-database.test.ts` pass. Killing
the serving client preserves the same database start time and subsequent writes;
the second test rejects paths outside the fixture and leaves external database
configuration untouched. The source checkout is read-only. A temporary dependency
overlay supplies the matching Linux native packages and an unchanged copy of the
repository's patched embedded-Postgres package. No test or production behavior
was changed for this proof. Initial container attempts failed on missing platform
bindings, Vite cache writes, resolver recursion and misplaced native libraries;
their logs are retained with the passing attempt. This is local Linux evidence,
not hosted Daytona evidence.

CI run 40130375278 on code revision `09d1590432` passed every check except the
unchanged historical-cleanup pagination test: it observed 32 inspections where
33 were expected. Its fixed clock advances can precede completion of asynchronous
database work and registration of the following deadline. The same unchanged
suite passes all 14 tests in the isolated Linux container. The failed CI attempt
is retained and a bounded shard retry was requested; neither test assertions nor
production scheduling were weakened. Final CI status remains visible on the PR.

### Independent native catch-up (2026-10-24)

Review subsequently found that a run's live notifications restarted the shared
history effect, aborting slow historical reads for sibling runs. Live catch-up
now addresses only the affected run. In-flight reads and retry timers are bounded
per run; terminal notifications coalesce into one follow-up read without aborting
the current request. Both regression tests fail against the preceding code and
pass after the correction. One holds two historical pages while a sibling receives
repeated commit and terminal notifications; the other verifies terminal catch-up
does not abort or overlap a request. All 75 focused tests, UI typecheck and token
gates pass. The native browser journey passes again (39.6 seconds, 51.9 seconds
including setup), including two views, company changes, socket recovery, terminal
catch-up, reload and exactly one business comment.

### Agent Detail event preservation (2026-10-24)

A delayed native commit signal could overwrite a full saved event in Agent
Detail. Both page variants now keep signals out of the merge and require canonical
history only when their persisted cursor does not cover the signal. Both new
regressions fail on the prior merge; all eight page regressions, UI typecheck and
token gates pass. Full live rows still merge without recurring history reads.
The extended browser journey passes (42.3 seconds; 56.7 seconds including setup),
covering the existing two-view/reconnect/completion flow plus the agent's run-event
view and reload. It uses the real runner, deterministic Codex app-server and owned
Postgres. Run `7fcdcc41-e035-4bca-88ea-0bc079083b03` completed once. This remains
browser evidence, not live-harness or hosted-upgrade qualification.

### Agent Detail reader isolation (2026-10-24)

The next transcript review found that one native commit signal restarted both
Agent Detail history readers. Event history and shell logs now refresh separately
in both page variants. Each reader finishes its current page and coalesces
terminal notifications into one follow-up. Four regressions hold either reader
while the other receives repeated updates; all fail on the preceding code and
pass with the correction. The first fixture omitted the required agent ID; the
corrected fixture was replayed against both implementations before acceptance.
All 43 focused page/transcript tests, UI typecheck and token gates pass. The actual
native two-view/reconnect/reload and Agent Detail journey passes in 46.1 seconds,
with real Runner, deterministic Codex app-server and disposable Postgres. Run
`b7259b33-bdae-402c-aa25-cc2d827ff454` completed once with one final business comment.
This result remains distinct from hosted upgrade qualification.


### Fresh admission renewal and fixture-key isolation (2026-10-24)

Review found that fresh remote admission acquired its lease before tracing,
accounting-history reads and retained-session preparation, but started renewal
only afterward. The startup owner now starts the existing renewal immediately
after the claim transaction commits and drains it on preparation failure. No new
renewal cadence or idle work is introduced. The controlled preparation-failure
regression fails on the previous implementation. A real-Postgres experiment holds
the claim trace sink until two seconds beyond the original 60-second lease and
confirms the same owner, same attempt and a naturally extended deadline; it
passes in 74.17 seconds. All 824 executor/renewal tests and server typecheck pass.

The first Postgres fixture used a non-UUID lease identifier; the lease assertions
passed but fixture cleanup failed. The corrected fixture passes. An earlier full
suite could not start embedded Postgres because of host semaphore exhaustion.
The external disposable-Postgres run exposed a cleanup-order regression: awaiting
renewal shutdown before removing the settled startup let detachment reacquire the
old session. Removing the startup synchronously before yielding fixes it; the
preceding 823/824 result is retained alongside the final 824/824 result. The final
run took 625.56 seconds while performing fresh migrated databases for the warm
ownership cases; database activity confirmed progress during that run.

The qualification supervisor now removes ambient inline/file master-key overrides
at its existing process-launch boundary, matching the serving child's fixture
configuration. A separate observer child decrypts the actual stored checkpoint
under each hostile ambient override using the same fixture key, without changing
any observed rows. This regression fails with the previous launcher and passes
with the fix (6.39 seconds); 134 observer/support/installed-artifact tests pass.
No recovery or cryptography implementation was added to the observer.

CI attempts 40146472407 and 40146502737 are retained: the former hit the unchanged
agent-device-login route timeout and a following session conflict; the latter
hit EADDRINUSE on port 46274 in the unchanged workspace-runtime HTTPS test. These
are distinct from the fixed lease/observer findings; final candidate CI must run
again rather than deleting the failed attempts or weakening those assertions.

Hosted acceptance remains open. The trusted workflow was rechecked against master:
it has no per-run image-build capacity override or immutable A/B artifact-manifest
input and still selects the same public-pr fleet used by the earlier BuildKit
ENOSPC failure. No repeat paid image build was launched against unchanged capacity.
The outstanding hosted upgrade/rollback evidence still requires that infrastructure
and artifact-input path; local/CI success does not close this acceptance gap.


### Bounded event browsing and stable shared interests (2026-10-24)

The subsequent transcript review found three presentation defects: Agent Detail
automatically drained every saved event, live retention dropped opening details,
and unrelated interest replacements aborted active history readers. Agent Detail
now automatically reads one 1,000-row page, then offers explicit pagination while
full live delivery continues. The live window retains the first 200 events plus
the latest 2,000, preserving opening details through completion. Explicit page
failures keep existing rows and expose an error with retry. Task transcript
recovery still drains its canonical history normally.

The shared interest owner now tracks acknowledged run IDs independently of the
connection's recovery generation. Existing interests remain healthy through
unrelated replacements; new interests require their own ACK. Connection changes
and explicit overflow resynchronization still trigger catch-up. An additional
regression covers overflow from the previous revision while a new interest ACK
is pending, so that optimization cannot hide a real gap.

All seven review regressions fail on the preceding source for their expected
assertions: automatic page count, retained opening details, interrupted native
and legacy reads, and acknowledgement scope. The additional overflow-race test
fails before its correction. All 48 focused transcript tests, final UI typecheck
and token gates pass. Initial large-DOM runs exceeded the five-second test budget;
the two expanded rendering cases now have explicit 30-second budgets, with their
original behavioral assertions unchanged. The final suite took 16.64 seconds.
The earlier partial runs and the corrected before/after replay are retained.

The final native browser journey passes on source commit `a1f75df8a5` in 59.2
seconds (1.2 minutes including setup), rebuilding the shipped UI and using the
real runner, deterministic Codex app-server and owned disposable Postgres. Run
`766f50cd-e0a1-48ff-afed-b779c6abd29a` completes once with one business comment;
two views, company switching, socket recovery, terminal catch-up, reload and Agent
Detail events pass. A preceding browser run also passed in 58.5 seconds before
the extra overflow-race correction. These are browser/presentation results, not
live-provider or hosted-upgrade evidence.


### Supervisor isolation and initial history errors (2026-10-25)

The final launcher check still required embedded database mode, although upgrade
qualification correctly moves its fixture Postgres into the supervisor's process
tree and connects the serving child through normal Postgres mode. This could
reclassify a successful recovery as a permanent infrastructure failure. The
supervisor now records its fixture ownership only after starting the database;
the existing isolation check accepts that exact local connection after verifying
the fixture/config/physical data-directory identity, configured port and database
marker. Missing receipts, foreign connections/owners, mismatched ports and a
symlink escaping the fixture remain rejected. The valid owned-connection regression
fails before the fix; the five rejection cases already pass.

All 117 local isolation/support tests and runner-E2E typecheck pass. A disposable
Linux container runs the real Postgres ownership experiment plus isolation cases:
all eight pass in 2.24 seconds. The actual database remains unchanged when its
serving client is killed, and the launcher check also passes after the supervisor
stops the database. The first Linux attempt lacked a writable Vite cache at the
actual test-local path; mounting only that temporary cache fixes the environment
while keeping repository source read-only. This proves fixture ownership, not
hosted agent continuity.

Review also found that Agent Detail's empty-state return hid a first history-read
error before the error panel could render. Both variants now display that failure
and an explicit Retry events action even with no existing rows. Both new page
regressions fail before the correction. All 50 focused transcript tests, UI
typecheck and token gates pass. The extended native browser journey passes in
43.9 seconds (58.3 seconds including setup): it forces a 503 for initial event
history while presenting an empty shell log, verifies the error rather than an
empty-state claim, then restores the real route and clicks Retry events to recover
canonical output. Run `1c345f26-0acb-47af-aa76-8f6e2e05ca4d` still completes once
with one business comment. The initial database container launch found its chosen
port occupied; that listener was left alone and a dynamically assigned port was
used for the owned fixture. The prior healthy-streaming and reconnect assertions
remain in this same journey. No hosted qualification claim is added.
