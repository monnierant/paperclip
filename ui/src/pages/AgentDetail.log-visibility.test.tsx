// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { HeartbeatRun, HeartbeatRunEvent, LiveEvent } from "@paperclipai/shared";
import { afterEach, expect, it, vi } from "vitest";
import { __liveUpdatesTestUtils, type CompanyLiveEventHandler } from "../context/LiveUpdatesProvider";
import { LiveTranscriptInterests } from "../lib/live-transcript-interests";
import { LogViewer } from "./AgentDetail";
import { LogViewer as ProductionLogViewer } from "./AgentDetail.production";

const { log, events, empty } = vi.hoisted(() => ({ log: vi.fn(), events: vi.fn(async (): Promise<import("@paperclipai/shared").HeartbeatRunEvent[]> => []), empty: [] }));
vi.mock("../api/heartbeats", () => ({ heartbeatsApi: { log, events } }));
vi.mock("@tanstack/react-query", async (original) => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: () => ({ data: empty }),
}));
vi.mock("../adapters", () => ({
  getUIAdapter: () => null,
  onAdapterChange: () => () => {},
  buildTranscript: (lines: unknown[]) => lines,
}));
vi.mock("../components/transcript/RunTranscriptView", () => ({
  RunTranscriptView: ({ entries }: { entries: Array<{ chunk: string }> }) => <div>{entries.map(line => line.chunk).join(" ")}</div>,
}));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); log.mockReset(); events.mockReset(); events.mockResolvedValue([]); });

it.each([LogViewer, ProductionLogViewer])("retains legacy history and reads only the next offset on visibility recovery (%#)", async (Viewer) => {
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const row = (seq: number, chunk: string) => JSON.stringify({ seq, ts: `2026-09-10T12:00:0${seq}Z`, stream: "stdout", chunk }) + "\n";
  const first = row(1, "retained history");
  const second = row(2, "new output");
  log.mockResolvedValueOnce({ content: first, nextOffset: first.length });
  const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", status: "succeeded", logRef: "log" } as HeartbeatRun;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Viewer run={run} adapterType="codex_local" />));
    expect(container.textContent).toContain("retained history");
    await act(async () => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(log).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("retained history");
    let complete!: (value: { content: string; nextOffset: number }) => void;
    log.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    await act(async () => {
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(container.textContent).toContain("retained history");
    expect(log).toHaveBeenLastCalledWith("run-1", first.length, expect.any(Number), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await act(async () => complete({ content: second, nextOffset: first.length + second.length }));
    expect(container.textContent).toContain("retained history new output");
    log.mockResolvedValueOnce({ content: first, nextOffset: first.length });
    await act(async () => root.render(<Viewer run={{ ...run, id: "run-2" }} adapterType="codex_local" />));
    expect(log).toHaveBeenLastCalledWith("run-2", 0, expect.any(Number), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(container.textContent).not.toContain("new output");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each([LogViewer, ProductionLogViewer])("uses shared streaming and retains fallback reads until negotiation (%#)", async (Viewer) => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  const socket = vi.fn();
  vi.stubGlobal("WebSocket", class { constructor() { socket(); } });
  log.mockResolvedValue({ content: "", nextOffset: 0 });
  const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", status: "running", logRef: "log" } as HeartbeatRun;
  const root = createRoot(document.createElement("div"));
  const transcripts = new LiveTranscriptInterests();
  const messages: Array<{ revision?: number; runIds?: string[] }> = [];
  const subscription = { companyId: "company-1", transcripts, subscribe: () => () => {} };
  const { LiveEventSubscriptionContext } = __liveUpdatesTestUtils;
  try {
    await act(async () => root.render(<LiveEventSubscriptionContext.Provider value={subscription}><Viewer run={run} adapterType="codex_local" /></LiveEventSubscriptionContext.Provider>));
    const initialReads = log.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(log.mock.calls.length).toBeGreaterThan(initialReads);
    expect(events).toHaveBeenCalled();
    await act(async () => {
      transcripts.open({ send: text => messages.push(JSON.parse(text)) });
      transcripts.receive({ type: "live.capabilities", version: 1, capabilities: ["run-interests"] });
      transcripts.receive({ type: "live.subscribed", version: 1, revision: messages.at(-1)?.revision });
    });
    expect(messages.at(-1)?.runIds).toEqual([run.id]);
    const readsWhenConnected = log.mock.calls.length;
    const eventReadsWhenConnected = events.mock.calls.length;
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(log).toHaveBeenCalledTimes(readsWhenConnected);
    expect(events).toHaveBeenCalledTimes(eventReadsWhenConnected);
    expect(socket).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); }
  expect(messages.at(-1)?.runIds).toEqual([]);
});

// Rendering thousands of real event rows is part of this proof, not a five-second latency gate.
it.each([LogViewer, ProductionLogViewer])("bounds automatic event history and pages further only on request (%#)", async Viewer => {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  log.mockResolvedValue({ content: "", nextOffset: 0 });
  const rows = Array.from({ length: 2_001 }, (_, index) => ({ id: index + 1, seq: index + 1,
    runId: "run-1", companyId: "company-1", agentId: "agent-1", createdAt: new Date(),
    eventType: index === 0 ? "adapter.invoke" : "output", stream: "system" as const, level: "info" as const,
    color: null, message: null, payload: index === 0 ? { command: "invocation-retained-proof", args: [], cwd: "/workspace" } : null }));
  events.mockImplementation(async (_runId?: string, cursor = 0) => rows.filter(row => row.seq > cursor).slice(0, 1000));
  const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", status: "succeeded" } as HeartbeatRun;
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Viewer run={run} adapterType="codex_local" />));
    expect(events).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("invocation-retained-proof");
    const more = [...container.querySelectorAll("button")].find(button => button.textContent === "Load more events");
    expect(more).toBeDefined();
    events.mockRejectedValueOnce(new Error("history unavailable"));
    await act(async () => more!.click());
    expect(container.textContent).toContain("Could not load events. Try again.");
    expect(container.textContent).toContain("invocation-retained-proof");
    await act(async () => more!.click());
    expect(events).toHaveBeenCalledTimes(3);
    expect(container.textContent).not.toContain("Could not load events. Try again.");
    expect(events).toHaveBeenLastCalledWith(run.id, 1000, 1000, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(container.textContent).toContain("invocation-retained-proof");
  } finally { await act(async () => root.unmount()); }
}, 30_000);

it.each([LogViewer, ProductionLogViewer])("preserves saved event details and catches up payload-free commit signals (%#)", async Viewer => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  log.mockResolvedValue({ content: "", nextOffset: 0 });
  const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", status: "running" } as HeartbeatRun;
  const row = (seq: number, message: string): HeartbeatRunEvent => ({ id: seq, seq, runId: run.id,
    companyId: run.companyId, agentId: run.agentId, eventType: "item.completed", message,
    stream: null, level: null, color: null, payload: { detail: message }, createdAt: new Date() });
  events.mockResolvedValue([row(1, "saved event details")]);
  const transcripts = new LiveTranscriptInterests();
  const listeners = new Set<CompanyLiveEventHandler>();
  const messages: Array<{ revision?: number }> = [];
  const subscription = { companyId: run.companyId, transcripts,
    subscribe(fn: CompanyLiveEventHandler) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
  const emit = (seq: number, details?: HeartbeatRunEvent) => {
    const event: LiveEvent = { id: seq, companyId: run.companyId, type: "heartbeat.run.event",
      createdAt: new Date().toISOString(), payload: details ? { ...details } : {
        runId: run.id, agentId: run.agentId, eventType: "item.completed", seq,
      } };
    for (const listener of listeners) listener(event);
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  const { LiveEventSubscriptionContext } = __liveUpdatesTestUtils;
  try {
    await act(async () => root.render(<LiveEventSubscriptionContext.Provider value={subscription}><Viewer run={run} adapterType="paperclip_runner" /></LiveEventSubscriptionContext.Provider>));
    await act(async () => {
      transcripts.open({ send: text => messages.push(JSON.parse(text)) });
      transcripts.receive({ type: "live.capabilities", version: 1, capabilities: ["run-interests"] });
      transcripts.receive({ type: "live.subscribed", version: 1, revision: messages.at(-1)?.revision });
    });
    const initialReads = events.mock.calls.length;
    expect(container.textContent).toContain("saved event details");
    await act(async () => emit(1));
    expect(container.textContent).toContain("saved event details");
    expect(events).toHaveBeenCalledTimes(initialReads);
    events.mockResolvedValueOnce([row(2, "new canonical event details")]);
    await act(async () => emit(2));
    expect(container.textContent).toContain("new canonical event details");
    expect(events).toHaveBeenLastCalledWith(run.id, 1, 1000, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const caughtUpReads = events.mock.calls.length;
    await act(async () => { emit(2); emit(3, row(3, "complete live event details")); });
    expect(container.textContent).toContain("complete live event details");
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(events).toHaveBeenCalledTimes(caughtUpReads);
    expect(container.textContent).toContain("saved event details");
    expect(container.textContent).toContain("new canonical event details");
    await act(async () => {
      for (let seq = 4; seq <= 2_205; seq++) emit(seq, row(seq, `live row ${seq}`));
    });
    expect(container.textContent).toContain("saved event details");
    expect(container.textContent).toContain("live row 2205");
    expect(container.textContent).toContain("Events (2200)");
    await act(async () => root.render(<LiveEventSubscriptionContext.Provider value={subscription}><Viewer run={{ ...run, status: "succeeded" }} adapterType="paperclip_runner" /></LiveEventSubscriptionContext.Provider>));
    expect(container.textContent).toContain("saved event details");
    expect(container.textContent).toContain("live row 2205");
  } finally { await act(async () => root.unmount()); }
}, 30_000);

it.each([
  { Viewer: LogViewer, stalled: "log" }, { Viewer: ProductionLogViewer, stalled: "log" },
  { Viewer: LogViewer, stalled: "events" }, { Viewer: ProductionLogViewer, stalled: "events" },
])("finishes a slow $stalled page while the other reader catches up (%#)", async ({ Viewer, stalled }) => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  log.mockResolvedValue({ content: "" });
  const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", status: "running", logRef: "log" } as HeartbeatRun;
  const row = (seq: number): HeartbeatRunEvent => ({ id: seq, seq, runId: run.id,
    companyId: run.companyId, agentId: run.agentId, eventType: "item.completed", message: `event ${seq}`,
    stream: null, level: null, color: null, payload: {}, createdAt: new Date() });
  const logRow = (seq: number) => JSON.stringify({ seq, ts: "2026-10-24T00:00:00Z", stream: "stdout", chunk: `shell ${seq}` }) + "\n";
  const transcripts = new LiveTranscriptInterests();
  const listeners = new Set<CompanyLiveEventHandler>();
  const messages: Array<{ revision?: number }> = [];
  const subscription = { companyId: run.companyId, transcripts,
    subscribe(fn: CompanyLiveEventHandler) { listeners.add(fn); return () => { listeners.delete(fn); }; } };
  const emit = (type: LiveEvent["type"], seq: number) => {
    for (const listener of listeners) listener({ id: seq, companyId: run.companyId, type,
      createdAt: new Date().toISOString(), payload: { runId: run.id, agentId: run.agentId, seq, eventType: "item.completed", truncated: true, status: "succeeded" } });
  };
  const container = document.createElement("div");
  const root = createRoot(container);
  const { LiveEventSubscriptionContext } = __liveUpdatesTestUtils;
  let finishLog!: (value: { content: string }) => void;
  let finishEvents!: (value: HeartbeatRunEvent[]) => void;
  const held = stalled === "log" ? log : events;
  try {
    await act(async () => root.render(<LiveEventSubscriptionContext.Provider value={subscription}><Viewer run={run} adapterType="paperclip_runner" /></LiveEventSubscriptionContext.Provider>));
    await act(async () => {
      transcripts.open({ send: text => messages.push(JSON.parse(text)) });
      transcripts.receive({ type: "live.capabilities", version: 1, capabilities: ["run-interests"] });
      transcripts.receive({ type: "live.subscribed", version: 1, revision: messages.at(-1)?.revision });
    });
    if (stalled === "log") log.mockImplementationOnce(() => new Promise(resolve => { finishLog = resolve; }));
    else events.mockImplementationOnce(() => new Promise(resolve => { finishEvents = resolve; }));
    await act(async () => emit(stalled === "log" ? "heartbeat.run.log" : "heartbeat.run.event", 1));
    const calls = held.mock.calls as unknown as Array<[string, number, number, { signal: AbortSignal }]>;
    const heldCount = calls.length;
    const signal = calls.at(-1)![3].signal;
    for (let seq = 1; seq <= 3; seq++) {
      if (stalled === "log") events.mockResolvedValueOnce([row(seq)]);
      else log.mockResolvedValueOnce({ content: logRow(seq) });
      await act(async () => emit(stalled === "log" ? "heartbeat.run.event" : "heartbeat.run.log", seq));
    }
    expect(held).toHaveBeenCalledTimes(heldCount);
    expect(signal.aborted).toBe(false);
    expect(container.textContent).toContain(stalled === "log" ? "event 3" : "shell 3");
    await act(async () => { emit("heartbeat.run.status", 4); emit("heartbeat.run.status", 5); });
    expect(held).toHaveBeenCalledTimes(heldCount);
    expect(signal.aborted).toBe(false);
    await act(async () => {
      if (stalled === "log") finishLog({ content: logRow(1) });
      else finishEvents([row(1)]);
    });
    expect(held).toHaveBeenCalledTimes(heldCount + 1);
    expect(container.textContent).toContain(stalled === "log" ? "shell 1" : "event 1");
    const settled = [events.mock.calls.length, log.mock.calls.length];
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect([events.mock.calls.length, log.mock.calls.length]).toEqual(settled);
  } finally { await act(async () => root.unmount()); }
});

it.each([LogViewer, ProductionLogViewer])("shows and retries an initial event-history failure instead of claiming empty history (%#)", async Viewer => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  log.mockResolvedValue({ content: "", nextOffset: 0 });
  events.mockRejectedValue(new Error("history unavailable"));
  const run = { id: "run-1", companyId: "company-1", agentId: "agent-1", status: "succeeded" } as HeartbeatRun;
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(async () => root.render(<Viewer run={run} adapterType="paperclip_runner" />));
    expect(container.textContent).toContain("Could not load events. Try again.");
    expect(container.textContent).not.toContain("No log events.");
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    expect(events).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Could not load events. Try again.");
    events.mockResolvedValueOnce([{ id: 1, seq: 1, runId: run.id, companyId: run.companyId, agentId: run.agentId,
      eventType: "item.completed", message: "Recovered history", payload: {}, stream: null, level: null,
      color: null, createdAt: new Date() }]);
    const retry = [...container.querySelectorAll("button")].find(button => button.textContent === "Retry events");
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(container.textContent).toContain("Recovered history");
    expect(container.textContent).not.toContain("Could not load events. Try again.");
    await act(async () => vi.advanceTimersByTimeAsync(90_000));
    expect(events).toHaveBeenCalledTimes(3);
  } finally { await act(async () => root.unmount()); }
});
