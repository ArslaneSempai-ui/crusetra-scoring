/* PARTAGÉ DANS LA FAMILLE CASCADE — source : cascade
   Les dépôts de la famille (cascade, -screening, -monitoring, -scoring, -dossier) en portent
   une copie identique AU BYTE. Corrigez-le dans la source, puis recopiez : la famille est
   EXCLUE de la diffusion d'identite (depots.json), aucune diffusion ne viendra le faire à
   votre place. `couche-famille.test.ts` compare les octets, nomme la direction du retard, et
   refuse aussi un fichier identique dans deux dépôts qui ne porte PAS cet en-tête — c'est
   ainsi qu'une copie neuve se déclare au lieu de dériver en silence. */
/*
 * THE NODE FLOOR: .nvmrc NEVER PINS A NODE.JS BELOW THE LAST SECURITY FIX (12 October 2026).
 *
 * The gap: the Node.js July 2026 security release fixes the 26.x line in one patch version
 * (two High advisories among others), and the five repositories of the family still pinned
 * the release before it in .nvmrc. Nothing in the suite read that file, so `npm test` was
 * green on a runtime with known holes, in all five.
 *
 * What this witness does: it reads THIS repository's own .nvmrc, parses it as
 * major.minor.patch, and compares the three numbers one by one (never as text: "26.10.0"
 * sits above "26.5.1"). A pin below the fixed version fails. So does a missing file and a
 * value that is not a plain version ("26", "lts/*"): a floor that cannot be read is not a
 * floor. The message names the fixed version and the advisory.
 *
 * The detector carries its own witness, played on made-up folders: it must say no to a pin
 * one patch below, one minor below, one major below, a short version, an alias, an empty
 * file and a missing file, and yes to the fixed version and above, with or without a "v".
 * A check that never said no proves nothing.
 *
 * When the next security release lands: raise FIXED_IN here, in the source (cascade), copy
 * the file byte for byte into the four others, and move each .nvmrc. The runtime this suite
 * runs under is not checked here; only the pin that developers and tooling read from .nvmrc.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The first release of the 26.x line that carries the July 2026 security fixes. */
const FIXED_IN = "26.5.1";
const ADVISORY = "https://nodejs.org/en/blog/vulnerability/july-2026-security-releases";

const root = fileURLToPath(new URL("..", import.meta.url));

type Version = [number, number, number];

/** "26.5.1" or "v26.5.1", surrounding whitespace allowed, as numbers; null for anything else. */
export function parseVersion(text: string): Version | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `a` is strictly below `b`, compared number by number. */
export function isBelow(a: Version, b: Version): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
}

/** Why the .nvmrc of `dir` does not meet the floor, or null when it does. */
export function nvmrcProblem(dir: string): string | null {
  const why = `Node.js ${FIXED_IN} is the first 26.x release with the July 2026 security fixes: ${ADVISORY}`;
  let raw: string;
  try {
    raw = readFileSync(join(dir, ".nvmrc"), "utf8");
  } catch {
    return `.nvmrc is missing or unreadable, so no Node.js version is pinned. ${why}`;
  }
  const pinned = parseVersion(raw);
  if (pinned === null) {
    return `.nvmrc holds ${JSON.stringify(raw.trim())}, which is not a plain major.minor.patch version. ${why}`;
  }
  const floor = parseVersion(FIXED_IN)!;
  if (isBelow(pinned, floor)) {
    return `.nvmrc pins ${pinned.join(".")}, below ${FIXED_IN}. ${why}`;
  }
  return null;
}

test("the floor check says no to every pin below the fix, to a missing file and to an unreadable value: witness", () => {
  const d = mkdtempSync(join(tmpdir(), "node-floor-"));
  try {
    const pin = (text: string) => { writeFileSync(join(d, ".nvmrc"), text); return nvmrcProblem(d); };

    for (const bad of ["26.5.0\n", "26.4.9\n", "26.0.0", "25.9.9\n", "24.15.3\n", "v26.5.0\n"]) {
      const problem = pin(bad);
      assert.ok(problem?.includes("below"), `${JSON.stringify(bad)} is below the fix and must be refused: ${problem}`);
      assert.ok(problem?.includes(FIXED_IN) && problem.includes(ADVISORY), "the message names the fixed version and the advisory");
    }
    for (const bad of ["26\n", "26.5\n", "lts/*\n", "latest\n", "", "\n", "26.5.x\n", "26.5.1-rc.1\n"]) {
      const problem = pin(bad);
      assert.ok(problem?.includes("not a plain"), `${JSON.stringify(bad)} cannot be read as a version and must be refused: ${problem}`);
    }
    for (const good of ["26.5.1\n", "26.5.1", "v26.5.1\n", "26.5.2\n", "26.10.0\n", "27.0.0\n"]) {
      assert.equal(pin(good), null, `${JSON.stringify(good)} meets the floor`);
    }

    rmSync(join(d, ".nvmrc"));
    assert.ok(nvmrcProblem(d)?.includes("missing"), "no .nvmrc at all is a failure, never a pass");
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("the .nvmrc of this repository pins the Node.js security fix or later", () => {
  const problem = nvmrcProblem(root);
  assert.equal(problem, null, problem ?? "the pin meets the floor");
});
