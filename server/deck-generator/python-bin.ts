/**
 * Resolves the Python interpreter + dependencies path for deck rendering
 * and PDF extraction.
 *
 * On Render the build step installs deps into ./node_modules/.python-deps
 * (chosen because Render's buildpack guarantees node_modules persists into
 * runtime — earlier attempts at ./python-deps and ./.venv vanished between
 * build and runtime). At spawn time we set PYTHONPATH to that directory
 * so `import pptx` resolves.
 *
 * The directory-exists check happens at spawn time, not module load, so
 * a manual `pip install --target=./node_modules/.python-deps ...` from
 * the Render Shell takes effect on the very next Generate without
 * needing a server restart.
 *
 * Locally, the directory usually doesn't exist; we fall back to system
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

// Canonical locations to check, in order. We pick the first one that exists.
function resolveDepsDir(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "node_modules", ".python-deps"),
    // Legacy locations we used briefly — still honored so a manual install
    // in either spot keeps working.
    path.resolve(process.cwd(), "python-deps"),
    path.resolve(process.cwd(), ".venv", "lib", "python3.11", "site-packages"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function resolvePythonBin(): string {
  const venvPython = path.resolve(process.cwd(), ".venv", "bin", "python3");
  return fs.existsSync(venvPython) ? venvPython : "python3";
}

export const PYTHON_BIN = resolvePythonBin();

console.log(
  `[python-bin] startup cwd=${process.cwd()} bin=${PYTHON_BIN} deps=${
    resolveDepsDir() ?? "(none — will fall back to system python)"
  }`
);

/**
 * spawn() wrapper that selects the right interpreter and injects
 * PYTHONPATH at call time (not module load time, so manual installs
 * from the Render Shell take effect immediately).
 */
export function spawnPython(
  args: readonly string[],
  options: SpawnOptions = {}
): ChildProcessByStdio<null, Readable, Readable> {
  const depsDir = resolveDepsDir();
  const callerEnv = (options.env || {}) as Record<string, string>;
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    ...callerEnv,
  };
  if (depsDir) {
    env.PYTHONPATH = [depsDir, env.PYTHONPATH || ""]
      .filter(Boolean)
      .join(path.delimiter);
  }
  return spawn(PYTHON_BIN, args, { ...options, env }) as ChildProcessByStdio<
    null,
    Readable,
    Readable
  >;
}
