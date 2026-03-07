/**
 * Environment variable and secret file substitution for config values.
 *
 * Supports two `${...}` syntaxes in string values, substituted at config load time:
 * - `${VAR_NAME}` — env var substitution. Only uppercase names: `[A-Z_][A-Z0-9_]*`
 * - `${file:/path/to/secret}` — reads the file and uses its trimmed content as the value
 * - Escape with `$${}` to output literal `${}`
 * - Missing env vars throw `MissingEnvVarError`; unreadable files throw `MissingSecretFileError`
 *
 * @example
 * ```json5
 * {
 *   channels: {
 *     telegram: { botToken: "${TELEGRAM_BOT_TOKEN}" }          // env var
 *     slack:    { botToken: "${file:/run/secrets/slack_token}" } // secret file
 *   }
 * }
 * ```
 */

// Pattern for valid uppercase env var names: starts with letter or underscore,
// followed by letters, numbers, or underscores (all uppercase)
import { readFileSync } from "node:fs";
import { isPlainObject } from "../utils.js";

const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

export class MissingEnvVarError extends Error {
  constructor(
    public readonly varName: string,
    public readonly configPath: string,
  ) {
    super(`Missing env var "${varName}" referenced at config path: ${configPath}`);
    this.name = "MissingEnvVarError";
  }
}

export class MissingSecretFileError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly configPath: string,
    cause?: unknown,
  ) {
    super(
      `Cannot read secret file "${filePath}" referenced at config path: ${configPath}${cause instanceof Error ? ` — ${cause.message}` : ""}`,
    );
    this.name = "MissingSecretFileError";
  }
}

/** Function type for reading a secret file. Injected for testability. */
export type ReadFileFn = (filePath: string) => string;

const defaultReadFile: ReadFileFn = (filePath) => readFileSync(filePath, "utf-8");

type EnvToken =
  | { kind: "escaped"; name: string; end: number }
  | { kind: "substitution"; name: string; end: number }
  | { kind: "file-ref"; path: string; end: number };

function parseEnvTokenAt(value: string, index: number): EnvToken | null {
  if (value[index] !== "$") {
    return null;
  }

  const next = value[index + 1];
  const afterNext = value[index + 2];

  // Escaped: $${VAR} -> ${VAR}
  if (next === "$" && afterNext === "{") {
    const start = index + 3;
    const end = value.indexOf("}", start);
    if (end !== -1) {
      const name = value.slice(start, end);
      if (ENV_VAR_NAME_PATTERN.test(name)) {
        return { kind: "escaped", name, end };
      }
    }
  }

  if (next === "{") {
    const start = index + 2;
    const end = value.indexOf("}", start);
    if (end !== -1) {
      const inner = value.slice(start, end);

      // File reference: ${file:/path/to/secret}
      if (inner.startsWith("file:")) {
        const path = inner.slice("file:".length).trim();
        if (path.length > 0) {
          return { kind: "file-ref", path, end };
        }
      }

      // Env var substitution: ${VAR_NAME}
      if (ENV_VAR_NAME_PATTERN.test(inner)) {
        return { kind: "substitution", name: inner, end };
      }
    }
  }

  return null;
}

function substituteString(
  value: string,
  env: NodeJS.ProcessEnv,
  configPath: string,
  readFile: ReadFileFn,
): string {
  if (!value.includes("$")) {
    return value;
  }

  const chunks: string[] = [];

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== "$") {
      chunks.push(char);
      continue;
    }

    const token = parseEnvTokenAt(value, i);
    if (token?.kind === "escaped") {
      chunks.push(`\${${token.name}}`);
      i = token.end;
      continue;
    }
    if (token?.kind === "substitution") {
      const envValue = env[token.name];
      if (envValue === undefined || envValue === "") {
        throw new MissingEnvVarError(token.name, configPath);
      }
      chunks.push(envValue);
      i = token.end;
      continue;
    }
    if (token?.kind === "file-ref") {
      try {
        const fileContent = readFile(token.path).trim();
        if (fileContent === "") {
          throw new MissingSecretFileError(token.path, configPath, new Error("file is empty"));
        }
        chunks.push(fileContent);
      } catch (err) {
        if (err instanceof MissingSecretFileError) {
          throw err;
        }
        throw new MissingSecretFileError(token.path, configPath, err);
      }
      i = token.end;
      continue;
    }

    // Leave untouched if not a recognized pattern
    chunks.push(char);
  }

  return chunks.join("");
}

/** Returns true if the value contains any `${VAR_NAME}` or `${file:...}` reference. */
export function containsEnvVarReference(value: string): boolean {
  if (!value.includes("$")) {
    return false;
  }

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== "$") {
      continue;
    }

    const token = parseEnvTokenAt(value, i);
    if (token?.kind === "escaped") {
      i = token.end;
      continue;
    }
    if (token?.kind === "substitution" || token?.kind === "file-ref") {
      return true;
    }
  }

  return false;
}

function substituteAny(
  value: unknown,
  env: NodeJS.ProcessEnv,
  path: string,
  readFile: ReadFileFn,
): unknown {
  if (typeof value === "string") {
    return substituteString(value, env, path, readFile);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => substituteAny(item, env, `${path}[${index}]`, readFile));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      result[key] = substituteAny(val, env, childPath, readFile);
    }
    return result;
  }

  // Primitives (number, boolean, null) pass through unchanged
  return value;
}

export type ResolveConfigSecretsOptions = {
  /** Environment variables (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Function to read secret files (defaults to fs.readFileSync). Inject for testing. */
  readFile?: ReadFileFn;
};

/**
 * Resolves `${VAR_NAME}` and `${file:/path}` references in config values.
 *
 * @param obj - The parsed config object (after JSON5 parse and $include resolution)
 * @param options - Optional env and readFile overrides
 * @returns The config object with all references substituted
 * @throws {MissingEnvVarError} If a referenced env var is not set or empty
 * @throws {MissingSecretFileError} If a referenced secret file cannot be read or is empty
 */
export function resolveConfigEnvVars(
  obj: unknown,
  env: NodeJS.ProcessEnv = process.env,
  options?: ResolveConfigSecretsOptions,
): unknown {
  const resolvedEnv = options?.env ?? env;
  const resolvedReadFile = options?.readFile ?? defaultReadFile;
  return substituteAny(obj, resolvedEnv, "", resolvedReadFile);
}
