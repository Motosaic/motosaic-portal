/**
 * Python interpreter + dependency management for deck rendering and PDF
 * extraction.
 *
 * IMPORTANT CONTEXT: This service's build command is configured in the
 * Render dashboard, NOT via render.yaml — so adding a `pip install` step to
 * render.yaml's buildCommand had no effect (Render ignores the yaml here).
 * Rather than depend on the build step at all, the server installs the
 * Python deps itself at startup, into the persistent /data disk so the
 * install survives across deploys (only the very first boot pays the cost).
 *
 * Resolution order for the deps dir:
 *   1. If system python3 can already `import pptx` → use system (PYTHONPATH unset)
 *   2. /data/python-deps  (persistent disk, survives deploys)  [Render]
 *   3. ./node_modules/.python-deps                             [fallback]
 */

import fs from "fs";
import path from "path";
import {
  spawn,
  spawnSync,
  ChildProcessByStdio,
  SpawnOptions,
} from "child_process";
import type { Readable } from "stream";

const REQUIREMENTS = path.resolve(
  process.cwd(),
  "server",
  "deck-generator",
  "requirements.txt"
);

function pickPythonBin(): string {
  const venvPython = path.resolve(process.cwd(), ".venv", "bin", "python3");
  return fs.existsSync(venvPython) ? venvPython : "python3";
}

export const PYTHON_BIN = pickPythonBin();

// Where to install if system python can't already import pptx. Prefer the
// persistent disk so we install once, not every deploy.
function preferredInstallTarget(): string {
  try {
    if (fs.existsSync("/data") && fs.statSync("/data").isDirectory()) {
      return "/data/python-deps";
    }
  } catch {
    /* /data not present locally — fine */
  }
  return path.resolve(process.cwd(), "node_modules", ".python-deps");
}

function systemCanImportPptx(): boolean {
  try {
    const r = spawnSync(PYTHON_BIN, ["-c", "import pptx"], { stdio: "ignore" });
    return r.status === 0;
  } catch {
    return false;
  }
}

function dirHasPptx(dir: string): boolean {
  return fs.existsSync(path.join(dir, "pptx"));
}

// Resolved PYTHONPATH dir once ensurePythonDeps() settles. null = use system.
let resolvedDepsDir: string | null = null;
let ensurePromise: Promise<string | null> | null = null;

/**
 * Make sure python-pptx et al. are importable. Idempotent + memoized.
 * Resolves to the directory that should go on PYTHONPATH, or null if the
 * system interpreter already has the packages.
 */
export function ensurePythonDeps(): Promise<string | null> {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    // 1. Already importable by system python? Nothing to do.
    if (systemCanImportPptx()) {
      console.log("[python-bin] system python already has pptx — no install needed");
      resolvedDepsDir = null;
      return null;
    }

    // 2. Already installed at one of our target dirs (from a prior boot on
    //    the persistent disk, or a manual Shell install)?
    const candidates = [
      "/data/python-deps",
      path.resolve(process.cwd(), "node_modules", ".python-deps"),
      path.resolve(process.cwd(), "python-deps"),
    ];
    for (const c of candidates) {
      if (dirHasPptx(c)) {
        console.log(`[python-bin] found existing deps at ${c}`);
        resolvedDepsDir = c;
        return c;
      }
    }

    // 3. Install now into the preferred target.
    const target = preferredInstallTarget();
    console.log(`[python-bin] installing python deps into ${target} …`);
    try {
      await pipInstall(target);
      if (dirHasPptx(target)) {
        console.log(`[python-bin] install OK → ${target}`);
        resolvedDepsDir = target;
        return target;
      }
      console.error(`[python-bin] install ran but pptx missing at ${target}`);
    } catch (err) {
      console.error(`[python-bin] install failed:`, err);
    }
    resolvedDepsDir = null;
    return null;
  })();
  return ensurePromise;
}

function pipInstall(target: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(target, { recursive: true });
    // `--target` avoids PEP-668 "externally managed" lockouts and doesn't
    // need root. Verified working from the Render shell.
    const proc = spawn(
      PYTHON_BIN,
      ["-m", "pip", "install", "--target", target, "-r", REQUIREMENTS],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let stderr = "";
    proc.stdout.on("data", (d) => process.stdout.write(`[pip] ${d}`));
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pip exited ${code}: ${stderr.slice(0, 1000)}`));
    });
    proc.on("error", (err) => reject(err));
  });
}

// Kick off the install as soon as the module loads so the first Generate
// isn't waiting on a cold install. Fire-and-forget; callers still await
// ensurePythonDeps() to be safe.
void ensurePythonDeps();

/**
 * spawn() wrapper that selects the interpreter and injects PYTHONPATH from
 * the resolved deps dir. Call ensurePythonDeps() (and await it) before
 * relying on this in a fresh process.
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
  if (resolvedDepsDir) {
    env.PYTHONPATH = [resolvedDepsDir, env.PYTHONPATH || ""]
      .filter(Boolean)
      .join(path.delimiter);
  }
  return spawn(PYTHON_BIN, args, { ...options, env }) as ChildProcessByStdio<
    null,
    Readable,
    Readable
  >;
}
