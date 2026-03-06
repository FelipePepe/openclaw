import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveAuthProfileStore } from "./auth-profiles.js";
import type { readCodexCliCredentialsCached as ReadCodexCliCredentialsCachedFn } from "./cli-credentials.js";
import { ensurePiAuthJsonFromAuthProfiles } from "./pi-auth-json.js";

const mockReadCodexCli = vi.hoisted(() =>
  vi.fn<typeof ReadCodexCliCredentialsCachedFn>(() => null),
);

vi.mock(import("./cli-credentials.js"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readCodexCliCredentialsCached: mockReadCodexCli,
  };
});

type AuthProfileStore = Parameters<typeof saveAuthProfileStore>[0];

async function createAgentDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "openclaw-agent-"));
}

function writeProfiles(agentDir: string, profiles: AuthProfileStore["profiles"]) {
  saveAuthProfileStore(
    {
      version: 1,
      profiles,
    },
    agentDir,
  );
}

async function readAuthJson(agentDir: string) {
  const authPath = path.join(agentDir, "auth.json");
  return JSON.parse(await fs.readFile(authPath, "utf8")) as Record<string, unknown>;
}

describe("ensurePiAuthJsonFromAuthProfiles", () => {
  it("writes openai-codex oauth credentials into auth.json for pi-coding-agent discovery", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "openai-codex:default": {
        type: "oauth",
        provider: "openai-codex",
        access: "access-token",
        refresh: "refresh-token",
        expires: Date.now() + 60_000,
      },
    });

    const first = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(first.wrote).toBe(true);

    const auth = await readAuthJson(agentDir);
    expect(auth["openai-codex"]).toMatchObject({
      type: "oauth",
      access: "access-token",
      refresh: "refresh-token",
    });

    const second = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(second.wrote).toBe(false);
  });

  it("writes api_key credentials into auth.json", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "openrouter:default": {
        type: "api_key",
        provider: "openrouter",
        key: "sk-or-v1-test-key",
      },
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(true);

    const auth = await readAuthJson(agentDir);
    expect(auth["openrouter"]).toMatchObject({
      type: "api_key",
      key: "sk-or-v1-test-key",
    });
  });

  it("writes token credentials as api_key into auth.json", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "anthropic:default": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-test-token",
      },
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(true);

    const auth = await readAuthJson(agentDir);
    expect(auth["anthropic"]).toMatchObject({
      type: "api_key",
      key: "sk-ant-test-token",
    });
  });

  it("syncs multiple providers at once", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "openrouter:default": {
        type: "api_key",
        provider: "openrouter",
        key: "sk-or-key",
      },
      "anthropic:default": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-token",
      },
      "openai-codex:default": {
        type: "oauth",
        provider: "openai-codex",
        access: "access",
        refresh: "refresh",
        expires: Date.now() + 60_000,
      },
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(true);

    const auth = await readAuthJson(agentDir);

    expect(auth["openrouter"]).toMatchObject({ type: "api_key", key: "sk-or-key" });
    expect(auth["anthropic"]).toMatchObject({ type: "api_key", key: "sk-ant-token" });
    expect(auth["openai-codex"]).toMatchObject({ type: "oauth", access: "access" });
  });

  it("skips profiles with empty keys", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "openrouter:default": {
        type: "api_key",
        provider: "openrouter",
        key: "",
      },
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(false);
  });

  it("skips expired token credentials", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "anthropic:default": {
        type: "token",
        provider: "anthropic",
        token: "sk-ant-expired",
        expires: Date.now() - 60_000,
      },
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(false);
  });

  it("normalizes provider ids when writing auth.json keys", async () => {
    const agentDir = await createAgentDir();

    writeProfiles(agentDir, {
      "z.ai:default": {
        type: "api_key",
        provider: "z.ai",
        key: "sk-zai",
      },
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(true);

    const auth = await readAuthJson(agentDir);
    expect(auth["zai"]).toMatchObject({ type: "api_key", key: "sk-zai" });
    expect(auth["z.ai"]).toBeUndefined();
  });

  it("preserves existing auth.json entries not in auth-profiles", async () => {
    const agentDir = await createAgentDir();
    const authPath = path.join(agentDir, "auth.json");

    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(
      authPath,
      JSON.stringify({ "legacy-provider": { type: "api_key", key: "legacy-key" } }),
    );

    writeProfiles(agentDir, {
      "openrouter:default": {
        type: "api_key",
        provider: "openrouter",
        key: "new-key",
      },
    });

    await ensurePiAuthJsonFromAuthProfiles(agentDir);

    const auth = await readAuthJson(agentDir);
    expect(auth["legacy-provider"]).toMatchObject({ type: "api_key", key: "legacy-key" });
    expect(auth["openrouter"]).toMatchObject({ type: "api_key", key: "new-key" });
  });
});

describe("ensurePiAuthJsonFromAuthProfiles — Codex CLI bridge", () => {
  beforeEach(() => {
    mockReadCodexCli.mockReset();
    mockReadCodexCli.mockReturnValue(null);
  });

  it("bridges Codex CLI credentials for openai-codex when no OpenClaw profile exists", async () => {
    const agentDir = await createAgentDir();
    mockReadCodexCli.mockReturnValueOnce({
      type: "oauth",
      provider: "openai-codex" as never,
      access: "codex-access-token",
      refresh: "codex-refresh-token",
      expires: Date.now() + 3_600_000,
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(true);

    const auth = await readAuthJson(agentDir);
    expect(auth["openai-codex"]).toMatchObject({
      type: "oauth",
      access: "codex-access-token",
      refresh: "codex-refresh-token",
    });
  });

  it("skips Codex CLI bridge when openai-codex is already in OpenClaw profiles", async () => {
    const agentDir = await createAgentDir();
    mockReadCodexCli.mockReturnValueOnce({
      type: "oauth",
      provider: "openai-codex" as never,
      access: "codex-access-token",
      refresh: "codex-refresh-token",
      expires: Date.now() + 3_600_000,
    });

    writeProfiles(agentDir, {
      "openai-codex:default": {
        type: "oauth",
        provider: "openai-codex",
        access: "openclaw-access-token",
        refresh: "openclaw-refresh-token",
        expires: Date.now() + 60_000,
      },
    });

    await ensurePiAuthJsonFromAuthProfiles(agentDir);

    const auth = await readAuthJson(agentDir);
    // OpenClaw profile wins over Codex CLI
    expect(auth["openai-codex"]).toMatchObject({ access: "openclaw-access-token" });
  });

  it("skips Codex CLI bridge when credentials are expired", async () => {
    const agentDir = await createAgentDir();
    mockReadCodexCli.mockReturnValueOnce({
      type: "oauth",
      provider: "openai-codex" as never,
      access: "codex-access-token",
      refresh: "codex-refresh-token",
      expires: Date.now() - 1_000, // already expired
    });

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(false);
  });

  it("skips Codex CLI bridge when no Codex credentials exist", async () => {
    const agentDir = await createAgentDir();
    mockReadCodexCli.mockReturnValueOnce(null);

    const result = await ensurePiAuthJsonFromAuthProfiles(agentDir);
    expect(result.wrote).toBe(false);
  });
});
