# A2A Phase 1 Design (Clippy/OpenClaw)

## Scope

Phase 1 defines a minimal, production-safe A2A (agent‑to‑agent) coordination layer for Clippy/OpenClaw. It introduces a supervisor‑managed workflow across four internal agents:

- Planner
- Builder
- Tester
- Reporter

Goals for this phase:

- Standardize task, status, and artifact contracts.
- Support deterministic handoffs between specialist agents.
- Keep integration additive and behind explicit entrypoints.
- Preserve existing OpenClaw behavior unless A2A is explicitly invoked.

Non‑goals for this phase:

- Full distributed execution or multi‑host scheduling.
- Cross‑repo artifact transport.
- Automatic remediation loops beyond a single supervisor pass.

## Agent Cards

Each card defines capabilities, inputs, outputs, and constraints.

### Planner

- Role: Turn user intent into executable task graph.
- Inputs:
  - User request
  - Repository context summary
  - Optional constraints (time, safety, channels)
- Outputs:
  - Task list with dependencies
  - Acceptance criteria per task
  - Initial risk notes
- Constraints:
  - Must not mutate files directly.
  - Must emit tasks conforming to `A2ATask`.

### Builder

- Role: Implement planned changes in repository.
- Inputs:
  - Planned tasks
  - Relevant file and code context
- Outputs:
  - Code changes
  - Build/test execution notes
  - Artifacts (patch summaries, logs, changed‑file manifest)
- Constraints:
  - Must scope edits to assigned task IDs.
  - Must publish step status transitions.

### Tester

- Role: Validate behavior and regressions.
- Inputs:
  - Completed build tasks
  - Test plan and acceptance criteria
- Outputs:
  - Test run results
  - Failures with repro metadata
  - Verification artifact set
- Constraints:
  - Must report pass/fail per acceptance criterion.
  - Must not silently downgrade test depth.

### Reporter

- Role: Produce final synthesis for user and/or channel.
- Inputs:
  - Task graph status
  - Build/test/report artifacts
- Outputs:
  - Final user‑facing summary
  - Open issues and follow‑up suggestions
  - Delivery metadata (duration, task completion map)
- Constraints:
  - Must include unresolved risks.
  - Must reference artifact IDs, not raw large payloads.

## Core Schemas

Phase 1 uses JSON‑serializable schemas with strict enums for status and roles.

### A2ATask

```json
{
  "id": "task_01",
  "title": "Implement A2A supervisor skeleton",
  "description": "Add types and orchestration shell for Phase 1",
  "owner": "builder",
  "status": "ready",
  "priority": "normal",
  "dependsOn": ["task_00"],
  "acceptanceCriteria": [
    "Compiles without changing runtime behavior",
    "No existing command behavior regresses"
  ],
  "createdAt": "2026-03-07T10:00:00Z",
  "updatedAt": "2026-03-07T10:00:00Z",
  "metadata": {
    "area": "a2a",
    "labels": ["phase1", "scaffold"]
  }
}
```

### A2ATaskStatusEvent

```json
{
  "taskId": "task_01",
  "agent": "builder",
  "from": "in_progress",
  "to": "completed",
  "at": "2026-03-07T10:10:00Z",
  "message": "Scaffolded supervisor and task contracts",
  "artifactIds": ["artifact_12"]
}
```

### A2AArtifact

```json
{
  "id": "artifact_12",
  "taskId": "task_01",
  "type": "summary",
  "name": "Scaffold change summary",
  "uri": "local://a2a/artifacts/artifact_12.json",
  "contentType": "application/json",
  "size": 1290,
  "createdAt": "2026-03-07T10:10:00Z",
  "producer": "builder",
  "metadata": {
    "filesChanged": ["src/a2a/phase1/types.ts", "src/a2a/phase1/supervisor.ts"]
  }
}
```

## Supervisor Flow

Phase 1 uses a single supervisor execution loop with explicit stage transitions.

1. **Intake**
   - Receive request and normalize to `A2APlanRequest`.
   - Assign correlation ID for all downstream events.
2. **Plan**
   - Invoke Planner to create task DAG.
   - Validate task schema and dependency integrity.
3. **Build**
   - Dispatch ready tasks to Builder in dependency order.
   - Ingest status events and artifacts.
4. **Test**
   - Dispatch verification tasks to Tester.
   - Attach test evidence artifacts to tasks.
5. **Report**
   - Invoke Reporter to synthesize outcome.
   - Emit final `A2APlanResult`.
6. **Persist**
   - Store task graph, status timeline, artifact index.

**Failure handling (Phase 1):**

- Hard‑fail on schema violations.
- Soft‑fail on non‑critical artifact write errors (record warnings).
- Stop flow if Builder or Tester reports blocking failure.

## Endpoints (Phase 1)

These endpoints are internal‑facing contracts first; external exposure can follow.

- `POST /a2a/plan`
  - Input: `A2APlanRequest`
  - Output: `A2APlanResult` (initial task graph, no execution)
- `POST /a2a/run`
  - Input: `A2ARunRequest`
  - Output: `A2ARunResult` (execution summary + final report artifact ref)
- `GET /a2a/tasks/:id`
  - Output: `A2ATask` + latest status
- `GET /a2a/runs/:runId/events`
  - Output: status event stream or paged list
- `GET /a2a/artifacts/:id`
  - Output: metadata + resolved storage pointer

**Transport note:**

- Phase 1 can start with in‑process handlers and no public route registration.
- Route exposure should be gated by feature flag (`a2a.phase1.enabled`).

## Integration Points (OpenClaw)

Primary integration points for Phase 1:

- **CLI command surface:**
  - Add future `openclaw a2a plan` and `openclaw a2a run` wrappers.
  - Reuse existing progress/status renderer for stage updates.
- **Agent runtime:**
  - Supervisor sits above existing single‑agent execution path.
  - Specialist roles map to prompt profiles/tool allowlists.
- **Eventing/logging:**
  - Emit A2A lifecycle events to existing telemetry pipeline.
  - Correlate via run/task IDs.
- **Artifact storage:**
  - Start with local file‑backed adapter.
  - Keep storage contract abstract for S3/DB adapters later.

## Phase 1 Implementation Plan

1. Add shared types for tasks/status/artifacts and run requests/results.
2. Add supervisor skeleton with pluggable role handlers.
3. Add no‑op in‑memory repository for task/artifact state.
4. Add internal entrypoints (non‑user‑facing) guarded by config flag.
5. Add focused tests for schema validation and stage transitions.

## Open Questions

- Should Planner generate strictly linear tasks for first release to simplify rollback?
- Should Tester be mandatory for all runs or optional by risk class?
- Where should artifacts persist by default in hosted vs local mode?
- How should A2A runs be surfaced in multi‑channel conversations?
