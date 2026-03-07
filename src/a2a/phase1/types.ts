export type A2ARole = "planner" | "builder" | "tester" | "reporter";

export type A2ATaskStatus = "draft" | "ready" | "in_progress" | "blocked" | "completed" | "failed";

export type A2ATaskPriority = "low" | "normal" | "high" | "urgent";

export type A2AArtifactType = "summary" | "log" | "patch" | "report" | "metadata";

export type A2ATask = {
  id: string;
  title: string;
  description?: string;
  owner: A2ARole;
  status: A2ATaskStatus;
  priority?: A2ATaskPriority;
  dependsOn?: string[];
  acceptanceCriteria?: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
};

export type A2ATaskStatusEvent = {
  taskId: string;
  agent: A2ARole;
  from: A2ATaskStatus;
  to: A2ATaskStatus;
  at: string;
  message?: string;
  artifactIds?: string[];
};

export type A2AArtifact = {
  id: string;
  taskId: string;
  type: A2AArtifactType;
  name: string;
  uri: string;
  contentType: string;
  size?: number;
  createdAt: string;
  producer: A2ARole;
  metadata?: Record<string, unknown>;
};

export type A2APlanRequest = {
  runId?: string;
  requestId?: string;
  message: string;
  constraints?: Record<string, unknown>;
};

export type A2APlanResult = {
  runId: string;
  tasks: A2ATask[];
  createdAt: string;
};

export type A2ARunRequest = {
  runId?: string;
  message: string;
  constraints?: Record<string, unknown>;
};

export type A2ARunResult = {
  runId: string;
  tasks: A2ATask[];
  statusEvents: A2ATaskStatusEvent[];
  artifacts: A2AArtifact[];
  completedAt?: string;
};
