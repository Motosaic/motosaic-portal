/**
 * Resolves the Python interpreter + dependencies path for deck rendering
 * and PDF extraction.
 *
 * On Render the build step installs deps via `pip install --target=./python-deps`
 * (avoids relying on `python3 -m venv`, which isn't available on every base
 * image, and avoids `--user` whose site-packages dir isn't visible to the
 * runtime in some configurations). At spawn time we set PYTHONPATH to that
 * directory so `import pptx` resolves.
 *
 * Locally, ./python-deps usually doesn't exist; we fall back to system
 * python3 and whatever the dev has installed via pip3 --user.
 */

import fs from "fs";
import path from "path";
import {
  spawn,
  ChildProcessByStdio,
  SpawnOptions,
} from "child_process";
import type { Readable } from "stream";

const PYTHON_DEPS = path.resolve(process.cwd(), "python-deps");
const venvPython = path.resolve(process.cwd(), ".venv", "bin", "python3");

export const PYTHON_BIN = fs.existsSync(venvPython) ? venvPython : "python3";
const HAS_TARGET_DEPS = fs.existsSync(PYTHON_DEPS);

// Log once at module load so the Render deploy log shows exactly what
// the runtime resolved — makes future "did the build install deps?"
// questions a 5-second answer.
console.log(
  `[python-bin] cwd=${process.cwd()} bin=${PYTHON_BIN} deps=${HAS_TARGET_DEPS ? PYTHON_DEPS : "(system)"}`
);

/**
 * spawn() wrapper that selects the right interpreter and injects
 * PYTHONPATH=./python-deps when the build installed packages there.
 */
export function spawnPython(
  args: readonly string[],
  options: SpawnOptions = {}
): ChildProcessByStdio<null, Readable, Readable> {
  const callerEnv = (options.env || {}) as Record<string, string>;
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...callerEnv,
  };
  if (HAS_TARGET_DEPS) {
    env.PYTHONPATH = [PYTHON_DEPS, env.PYTHONPATH || ""]
      .filter(Boolean)
      .join(path.delimiter);
  }
  return spawn(PYTHON_BIN, args, { ...options, env }) as ChildProcessByStdio<
    null,
    Readable,
    Readable
  >;
}
