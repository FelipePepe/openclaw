import type { OpenClawConfig } from "../../config/config.js";
import { InMemoryA2AStore, type A2AStore } from "./store.js";
import { A2ASupervisor, type A2ARoleHandler } from "./supervisor.js";

export type A2APhase1Service = {
  store: A2AStore;
  supervisor: A2ASupervisor;
};

const NOOP_ROLE_HANDLER: A2ARoleHandler = {};

let cachedService: A2APhase1Service | null = null;

export function getA2APhase1Service(): A2APhase1Service {
  if (!cachedService) {
    const store = new InMemoryA2AStore();
    cachedService = {
      store,
      supervisor: new A2ASupervisor({
        store,
        planner: NOOP_ROLE_HANDLER,
        builder: NOOP_ROLE_HANDLER,
        tester: NOOP_ROLE_HANDLER,
        reporter: NOOP_ROLE_HANDLER,
      }),
    };
  }
  return cachedService;
}

export function isA2APhase1Enabled(cfg: OpenClawConfig): boolean {
  return cfg.a2a?.phase1?.enabled === true;
}

export function __resetA2APhase1ServiceForTests() {
  cachedService = null;
}
