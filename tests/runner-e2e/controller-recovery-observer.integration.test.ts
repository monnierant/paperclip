import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { agents, companies, createDb, heartbeatRunEvents, heartbeatRuns, issues, nativeRunFinalizations,
  nativeRunnerCheckpoints, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS } from "../../packages/db/src/index.js";
import { DurablePrpControlPlane } from "../../server/src/vendor/paperclip-runner/index.js";
import { registerNativeRunnerCheckpoint } from "../../server/src/services/native-runtime/native-runner-checkpoint.js";
import { recoveryPostgresSupport, startRecoveryPostgres } from "../../server/src/__tests__/helpers/recovery-postgres.js";
import { createIsolatedTestHome } from "../../server/src/__tests__/helpers/isolated-test-home.js";
import { readControllerRecoverySnapshot } from "./controller-recovery-observer.js";

afterEach(() => vi.unstubAllEnvs());
(recoveryPostgresSupport.supported ? it : it.skip)("reads real UUID runner ownership and text event identity in one read-only snapshot", async () => {
  const database = await startRecoveryPostgres("controller-observer-");
  const db = createDb(database.connectionString);
  const home = createIsolatedTestHome();
  vi.stubEnv("PAPERCLIP_HOME", home.home);
  const binding = { companyId: randomUUID(), issueId: randomUUID(), runId: randomUUID() };
  const agentId = randomUUID(), runnerInstanceId = randomUUID(), normalizedSessionId = randomUUID();
  const authority = new DurablePrpControlPlane({ stateDirectory: path.join(home.home, "authority"),
    identity: { runnerInstanceId, normalizedSessionId, runId: binding.runId,
      environmentLeaseId: randomUUID(), turnId: randomUUID(), itemId: randomUUID() },
    expectedRunnerVersion: "observer-fixture", expectedRunnerDigest: `sha256:${"a".repeat(64)}` });
  try {
    await db.insert(companies).values({ id: binding.companyId, name: "Qualification observer" });
    await db.insert(agents).values({ id: agentId, companyId: binding.companyId, name: "Observer fixture", adapterType: "paperclip_runner" });
    await db.insert(issues).values({ id: binding.issueId, companyId: binding.companyId, title: "Observe original execution" });
    await db.insert(heartbeatRuns).values({ id: binding.runId, companyId: binding.companyId, agentId,
      invocationSource: "manual", status: "running", runtimeMode: "native", nativeIssueId: binding.issueId,
      runnerInstanceId, nativeSessionId: normalizedSessionId });
    await db.insert(nativeRunFinalizations).values({ ...binding, phase: "observed", controllerBootId: "observer-controller",
      controllerGeneration: 1, leaseOwner: "observer-owner", leaseExpiresAt: new Date(Date.now() + 60_000) });
    await registerNativeRunnerCheckpoint({ db, binding, authority, bootId: "observer-controller" });
    await db.insert(heartbeatRunEvents).values([runnerInstanceId, randomUUID()].map((sourceInstanceId, index) => ({
      companyId: binding.companyId, runId: binding.runId, agentId, seq: index + 1,
      eventType: "fixture", sourceSeq: index === 0 ? 7 : 99, sourceInstanceId,
    })));
    const checkpointBefore = await db.select().from(nativeRunnerCheckpoints);
    expect(await readControllerRecoverySnapshot(db, binding)).toMatchObject({
      runId: binding.runId, runnerInstanceId, nativeSessionId: normalizedSessionId,
      bootId: "observer-controller", generation: 1, sourceSeq: 7, authenticatedConnectionCount: 0,
    });
    expect(await db.select().from(nativeRunnerCheckpoints)).toEqual(checkpointBefore);
    await expect(readControllerRecoverySnapshot(db, { ...binding, companyId: randomUUID() }))
      .rejects.toThrow("no admitted native owner");
  } finally {
    await authority.stop();
    await database.cleanup();
    home.cleanup();
  }
}, EMBEDDED_POSTGRES_TEST_TIMEOUT_MS);
