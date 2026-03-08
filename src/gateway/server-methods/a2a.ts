import { getA2APhase1Service, isA2APhase1Enabled } from "../../a2a/phase1/service.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers, RespondFn } from "./types.js";

function requireA2AEnabled(respond: RespondFn): boolean {
  const cfg = loadConfig();
  if (!isA2APhase1Enabled(cfg)) {
    respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        "A2A Phase 1 is disabled. Set a2a.phase1.enabled=true to enable.",
      ),
    );
    return false;
  }
  return true;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export const a2aHandlers: GatewayRequestHandlers = {
  "a2a.plan": async ({ params, respond }) => {
    if (!requireA2AEnabled(respond)) {
      return;
    }
    const message = normalizeOptionalString(params.message);
    if (!message) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "message required"));
      return;
    }
    const runId = normalizeOptionalString(params.runId);
    const requestId = normalizeOptionalString(params.requestId);
    const constraints = normalizeOptionalObject(params.constraints);
    const service = getA2APhase1Service();
    const result = await service.supervisor.plan({
      runId,
      requestId,
      message,
      constraints,
    });
    respond(true, result, undefined);
  },
  "a2a.run": async ({ params, respond }) => {
    if (!requireA2AEnabled(respond)) {
      return;
    }
    const message = normalizeOptionalString(params.message);
    if (!message) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "message required"));
      return;
    }
    const runId = normalizeOptionalString(params.runId);
    const constraints = normalizeOptionalObject(params.constraints);
    const service = getA2APhase1Service();
    const result = await service.supervisor.run({
      runId,
      message,
      constraints,
    });
    respond(true, result, undefined);
  },
  "a2a.tasks.get": async ({ params, respond }) => {
    if (!requireA2AEnabled(respond)) {
      return;
    }
    const taskId = normalizeOptionalString(params.taskId ?? params.id);
    if (!taskId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "taskId required"));
      return;
    }
    const service = getA2APhase1Service();
    const task = await service.store.getTask(taskId);
    if (!task) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "task not found"));
      return;
    }
    respond(true, { task }, undefined);
  },
  "a2a.runs.events": async ({ params, respond }) => {
    if (!requireA2AEnabled(respond)) {
      return;
    }
    const runId = normalizeOptionalString(params.runId);
    const service = getA2APhase1Service();
    const events = await service.store.listStatusEvents(runId);
    respond(true, { events }, undefined);
  },
  "a2a.artifacts.get": async ({ params, respond }) => {
    if (!requireA2AEnabled(respond)) {
      return;
    }
    const artifactId = normalizeOptionalString(params.artifactId ?? params.id);
    if (!artifactId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "artifactId required"));
      return;
    }
    const service = getA2APhase1Service();
    const artifacts = await service.store.listArtifacts();
    const artifact = artifacts.find((entry) => entry.id === artifactId);
    if (!artifact) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "artifact not found"));
      return;
    }
    respond(true, { artifact }, undefined);
  },
};
