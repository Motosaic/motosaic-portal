/**
 * Resolves the Python interpreter to spawn for deck rendering + PDF extraction.
 *
 * On Render the build step creates a venv at ./.venv with the deps from
 * server/deck-generator/requirements.txt installed into it. Spawning the
 * system `python3` from Node wouldn't find those packages (pip3 --user
 * writes to the build-user's home, not visible to the runtime user), so
 * we point spawn directly at the venv's interpreter.
 *
 * Locally, the venv usually doesn't exist; we fall back to system python3
 * (assumes the dev has `pip3 install --user python-pptx Pillow lxml pypdf`
 * or similar).
 */

import fs from "fs";
import path from "path";

const venvPython = path.resolve(process.cwd(), ".venv", "bin", "python3");
export const PYTHON_BIN = fs.existsSync(venvPython) ? venvPython : "python3";
