import type { A2AArtifact, A2ATask, A2ATaskStatusEvent } from "./types.js";

export interface A2AStore {
  saveTask(task: A2ATask): Promise<void>;
  saveTasks(tasks: A2ATask[]): Promise<void>;
  saveStatus(event: A2ATaskStatusEvent): Promise<void>;
  saveArtifact(artifact: A2AArtifact): Promise<void>;
  getTask(taskId: string): Promise<A2ATask | undefined>;
  listTasks(): Promise<A2ATask[]>;
  listStatusEvents(runId?: string): Promise<A2ATaskStatusEvent[]>;
  listArtifacts(taskId?: string): Promise<A2AArtifact[]>;
}

export class InMemoryA2AStore implements A2AStore {
  private tasks = new Map<string, A2ATask>();
  private statusEvents: A2ATaskStatusEvent[] = [];
  private artifacts: A2AArtifact[] = [];

  async saveTask(task: A2ATask): Promise<void> {
    this.tasks.set(task.id, task);
  }

  async saveTasks(tasks: A2ATask[]): Promise<void> {
    tasks.forEach((task) => this.tasks.set(task.id, task));
  }

  async saveStatus(event: A2ATaskStatusEvent): Promise<void> {
    this.statusEvents.push(event);
  }

  async saveArtifact(artifact: A2AArtifact): Promise<void> {
    this.artifacts.push(artifact);
  }

  async getTask(taskId: string): Promise<A2ATask | undefined> {
    return this.tasks.get(taskId);
  }

  async listTasks(): Promise<A2ATask[]> {
    return Array.from(this.tasks.values());
  }

  async listStatusEvents(): Promise<A2ATaskStatusEvent[]> {
    return this.statusEvents.slice();
  }

  async listArtifacts(taskId?: string): Promise<A2AArtifact[]> {
    if (!taskId) {
      return this.artifacts.slice();
    }
    return this.artifacts.filter((artifact) => artifact.taskId === taskId);
  }
}
