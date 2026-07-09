// Builds the CommonJS distribution from the ESM source (index.js).
//
// The source is pure data: top-level `export const NAME = <expr>;`. We emit a
// CommonJS module that defines each const and exposes every export on
// `module.exports`. The ESM source is consumed directly by the frontend via the
// package `exports` map; only the backend (CommonJS) needs this CJS build.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "index.js"), "utf8");

const names = [...src.matchAll(/^export const (\w+)/gm)].map((m) => m[1]);
if (names.length === 0) {
  throw new Error("build: no `export const` declarations found in index.js");
}

const body = src.replace(/^export const /gm, "const ");

const cjs = `${body}
Object.defineProperty(module.exports, '__esModule', { value: true });
module.exports = { ${names.join(", ")} };
`;

mkdirSync(join(here, "dist"), { recursive: true });
writeFileSync(join(here, "dist", "index.cjs"), cjs);
console.log(`build: wrote dist/index.cjs (${names.length} exports)`);
