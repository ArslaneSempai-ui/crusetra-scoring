import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * THE README CLAIMS THE SYSTEMS THE CI MATRIX HOLDS, CITES A RUN OF THIS REPOSITORY, AND CLAIMS
 * NOTHING BROADER.
 *
 * The Requirements section used to say that Windows had not been tested and was not claimed.
 * The matrix of .github/workflows/tests.yml has since run ubuntu, macOS and Windows, each on
 * Node 24 and Node 26, and a push to main went green on every cell. A claim of that kind is
 * only worth what backs it, so this case keeps it true in both directions: every system and
 * every Node version of the matrix is named in the Requirements section, no system and no Node
 * version the matrix lacks is named there, an Actions run URL of THIS repository backs the claim
 * (a run of a sister tool proves nothing here), and no disclaimer about a system survives
 * (not tested, untested, not claimed, not supported, unsupported, wrapped across lines or in
 * capitals: a README that says "Windows is not supported" would otherwise pass). The matrix is
 * read from the workflow, never copied into this file, so adding a system or a Node version to
 * the workflow turns this case red until the README says so. The witness case plays each fault on
 * a fabricated README and a fabricated workflow: without it, a reader that finds nothing
 * would turn a missing section into the only red and a wrong claim into green.
 *
 * No YAML parser, for the reason ci.test.ts gives: plain line logic over the inline
 * `[a, b]` lists the matrix uses, LF or CRLF.
 */
const README = fileURLToPath(new URL("../README.md", import.meta.url));
const WORKFLOW = fileURLToPath(new URL("../.github/workflows/tests.yml", import.meta.url));
const PACKAGE = fileURLToPath(new URL("../package.json", import.meta.url));

/** The names a README uses for the runner labels of the matrix. */
const SYSTEM_NAMES: Record<string, string> = { ubuntu: "Linux", macos: "macOS", windows: "Windows" };

/** The ways a README disclaims a system: not tested, untested, not claimed, not supported, unsupported; wrapped lines included. */
const DISCLAIMER = /\bnot\s+(?:been\s+)?(?:tested|claimed|supported)\b|\b(?:untested|unsupported)\b/i;

function withoutComments(text: string): string {
  return text.split(/\r?\n/).map((l) => (/^\s*#/.test(l) ? "" : l.replace(/\s+#.*$/, ""))).join("\n");
}

/** The `[a, b]` inline list under a matrix key, quotes removed; empty when the key is not there. */
function inlineList(workflow: string, key: string): string[] {
  const m = new RegExp(`^\\s+${key}:\\s*\\[(.*)\\]\\s*$`, "m").exec(withoutComments(workflow));
  return m ? m[1]!.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean) : [];
}

/** The systems (runner labels) and the Node versions the workflow's matrix holds. */
function matrix(workflow: string): { os: string[]; node: string[] } {
  return { os: inlineList(workflow, "os"), node: inlineList(workflow, "node") };
}

/** The Requirements section of the README, up to the next heading; null when it is not there. */
function requirements(readme: string): string | null {
  const m = /^## Requirements\s*$([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(readme);
  return m ? m[1]! : null;
}

/** The faults of a README against a workflow and a package name, as readable lines; empty when the claim is exactly the matrix. */
function faults(readme: string, workflow: string, packageName: string): string[] {
  const out: string[] = [];
  const section = requirements(readme);
  if (section === null) return ["README.md has no Requirements section"];
  const { os, node } = matrix(workflow);
  if (os.length === 0 || node.length === 0) {
    return [`the workflow's matrix was not read (${os.length} system(s), ${node.length} Node version(s)): the check would prove nothing`];
  }
  const held = new Set<string>();
  for (const label of os) {
    const name = SYSTEM_NAMES[label.replace(/-latest$/, "")];
    if (name === undefined) { out.push(`the matrix holds ${label}, which this check has no README name for: add it to SYSTEM_NAMES`); continue; }
    held.add(name);
    if (!section.includes(name)) out.push(`the matrix holds ${label} but the Requirements section does not name ${name}`);
  }
  for (const name of Object.values(SYSTEM_NAMES)) {
    if (!held.has(name) && section.includes(name)) out.push(`the Requirements section names ${name}, which the matrix does not hold: nothing broader than the CI proved`);
  }
  for (const v of node) {
    if (!new RegExp(`\\bNode ${v}\\b`).test(section)) out.push(`the matrix holds Node ${v} but the Requirements section does not name it`);
  }
  const runs = [...section.matchAll(/https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/\d+/g)];
  if (runs.length === 0) {
    out.push("the Requirements section cites no Actions run URL (https://github.com/<owner>/<repo>/actions/runs/<id>)");
  } else if (!runs.some((r) => r[2] === packageName)) {
    out.push(`the Requirements section cites no run of ${packageName}: a run of another repository proves nothing here`);
  }
  for (const m of section.matchAll(/\bNode (\d+)\b/g)) {
    if (!node.includes(m[1]!)) out.push(`the Requirements section names Node ${m[1]}, which the matrix does not hold: nothing broader than the CI proved`);
  }
  if (DISCLAIMER.test(section)) {
    out.push("the Requirements section still carries a 'not tested', 'not claimed' or 'not supported' disclaimer about a system the matrix holds");
  }
  return out;
}

test("README.md names the systems and Node versions the CI matrix holds, cites a run of this repository, and claims nothing broader", () => {
  const packageName = (JSON.parse(readFileSync(PACKAGE, "utf8")) as { name: string }).name;
  const workflow = readFileSync(WORKFLOW, "utf8");
  assert.deepEqual(faults(readFileSync(README, "utf8"), workflow, packageName), []);
});

test("witness: each fault is seen on a fabricated README and workflow", () => {
  const workflow = "jobs:\n  test:\n    strategy:\n      matrix:\n        os: [ubuntu-latest, macos-latest, windows-latest]\n        node: ['24', '26']\n";
  const good = "# T\n\n## Requirements\n\nTested on Linux, macOS and Windows, each on Node 24 and Node 26: "
    + "https://github.com/o/pkg/actions/runs/1.\n\n## Next\n";
  assert.deepEqual(faults(good, workflow, "pkg"), [], "the fabricated good pair must be clean, or the cases below prove nothing");

  const old = "# T\n\n## Requirements\n\nNode 24 or newer, on **macOS or Linux**. Windows has not been tested and is not claimed.\n";
  const f1 = faults(old, workflow, "pkg");
  assert.ok(f1.some((f) => /cites no Actions run URL/.test(f)), f1.join("\n"));
  assert.ok(f1.some((f) => /still carries a 'not tested'/.test(f)), f1.join("\n"));
  assert.ok(f1.some((f) => /holds Node 26 but/.test(f)), f1.join("\n"));

  for (const phrase of ["Windows has not been tested", "Windows is not tested", "Windows is untested", "Windows is not claimed",
    "Windows is not supported", "Windows is unsupported", "Windows is not\nclaimed", "Windows is NOT SUPPORTED"]) {
    const disclaimed = faults(good.replace("\n\n## Next", ` ${phrase}.\n\n## Next`), workflow, "pkg");
    assert.ok(disclaimed.some((f) => /still carries a 'not tested'/.test(f)), `"${phrase}" is not seen as a disclaimer: ${disclaimed.join("\n")}`);
  }

  const nodeBeyond = faults(good.replace("Node 26:", "Node 26 and Node 25:"), workflow, "pkg");
  assert.ok(nodeBeyond.some((f) => /names Node 25, which the matrix does not hold/.test(f)), `a Node version beyond the matrix is not seen: ${nodeBeyond.join("\n")}`);

  const silent = faults(good.replace("Linux, macOS and Windows", "Linux and macOS"), workflow, "pkg");
  assert.ok(silent.some((f) => /does not name Windows/.test(f)), silent.join("\n"));

  const withoutWindows = faults(good, workflow.replace(", windows-latest", ""), "pkg");
  assert.ok(withoutWindows.some((f) => /names Windows, which the matrix does not hold/.test(f)), withoutWindows.join("\n"));

  const extraNode = faults(good, workflow.replace("'26']", "'26', '28']"), "pkg");
  assert.ok(extraNode.some((f) => /holds Node 28 but/.test(f)), extraNode.join("\n"));

  const extraSystem = faults(good, workflow.replace("windows-latest]", "windows-latest, freebsd-latest]"), "pkg");
  assert.ok(extraSystem.some((f) => /holds freebsd-latest, which this check has no README name for/.test(f)), extraSystem.join("\n"));

  const noUrl = faults(good.replace(/https:\/\/\S+/, "somewhere."), workflow, "pkg");
  assert.ok(noUrl.some((f) => /cites no Actions run URL/.test(f)), noUrl.join("\n"));

  const otherRepo = faults(good.replace("/o/pkg/", "/o/sister/"), workflow, "pkg");
  assert.ok(otherRepo.some((f) => /cites no run of pkg/.test(f)), otherRepo.join("\n"));

  const crlf = faults(good, workflow.replace(/\n/g, "\r\n"), "pkg");
  assert.deepEqual(crlf, [], "a workflow handed back with CRLF by a Windows checkout must be read the same");

  assert.ok(faults("# T\n", workflow, "pkg").some((f) => /no Requirements section/.test(f)));
  assert.ok(faults(good, "jobs:\n", "pkg").some((f) => /matrix was not read/.test(f)));
});
