import { randomUUID } from "crypto";
import type { A2AStore } from "./store.js";
import type {
  A2APlanRequest,
  A2APlanResult,
  A2ARunRequest,
  A2ARunResult,
  A2ATask,
  A2ATaskStatusEvent,
  A2AArtifact,
} from "./types.js";

export type A2ARoleHandler = {
  plan?: (request: A2APlanRequest) => Promise<A2ATask[]>;
  build?: (tasks: A2ATask[]) => Promise<A2ATaskStatusEvent[]>;
  test?: (tasks: A2ATask[]) => Promise<A2ATaskStatusEvent[]>;
  report?: (tasks: A2ATask[], artifacts: A2AArtifact[]) => Promise<A2AArtifact | undefined>;
};

export type A2ASupervisorDeps = {
  store: A2AStore;
  planner: A2ARoleHandler;
  builder: A2ARoleHandler;
  tester: A2ARoleHandler;
  reporter: A2ARoleHandler;
};

export class A2ASupervisor {
  constructor(private readonly deps: A2ASupervisorDeps) {}

  async plan(request: A2APlanRequest): Promise<A2APlanResult> {
    const tasks = (await this.deps.planner.plan?.(request)) ?? [];
    await this.deps.store.saveTasks(tasks);
    return {
      runId: request.runId ?? randomUUID(),
      tasks,
      createdAt: new Date().toISOString(),
    };
  }

  async run(request: A2ARunRequest): Promise<A2ARunResult> {
    const plan = await this.plan({ message: request.message, constraints: request.constraints });
    const buildEvents = (await this.deps.builder.build?.(plan.tasks)) ?? [];
    await Promise.all(buildEvents.map((event) => this.deps.store.saveStatus(event)));

    const testEvents = (await this.deps.tester.test?.(plan.tasks)) ?? [];
    await Promise.all(testEvents.map((event) => this.deps.store.saveStatus(event)));

    const artifacts = await this.deps.store.listArtifacts();
    const reportArtifact = await this.deps.reporter.report?.(plan.tasks, artifacts);
    if (reportArtifact) {
      await this.deps.store.saveArtifact(reportArtifact);
    }

    return {
      runId: plan.runId,
      tasks: plan.tasks,
      statusEvents: [...buildEvents, ...testEvents],
      artifacts: reportArtifact ? [...artifacts, reportArtifact] : artifacts,
      completedAt: new Date().toISOString(),
    };
  }
}
