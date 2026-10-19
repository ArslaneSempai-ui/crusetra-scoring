import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { exigerDossier } from "./dossier.ts";
import { NATURES_ESCALATED, NATURES_MAINTAINED, DOSSIERS_PRIVES, chargerDossiersEtiquetes } from "./synthetic.ts";
import { jeuPresent, raisonAbsent } from "./jeux.ts";

/*
 * WITNESS: the full labelled dossier set is private, so no git index may track it.
 * The public sample must stay valid and, when the private set is present, must be what the
 * written rule draws from it.
 */
const RACINE = fileURLToPath(new URL("..", import.meta.url));
const ECHANTILLON = fileURLToPath(new URL("./echantillons/dossiers-20.json", import.meta.url));

test("the moved labelled dossier set is not tracked by git", () => {
  const suivis = execFileSync("git", ["ls-files", "--", DOSSIERS_PRIVES], { cwd: RACINE, encoding: "utf8" })
    .split("\n").filter(Boolean);
  assert.deepEqual(suivis, [], `this private set is still tracked: ${suivis.join(", ")}`);
});

type Echantillon = { seed: string; drawnFrom: number; dossiers: { id: string; nature: string }[] };

test("the public sample holds 20 valid dossiers and every family", () => {
  const e = JSON.parse(readFileSync(ECHANTILLON, "utf8")) as Echantillon;
  assert.equal(e.dossiers.length, 20);
  assert.equal(new Set(e.dossiers.map((c) => c.id)).size, 20);
  for (const c of e.dossiers) exigerDossier(c as never);
  const presentes = new Set(e.dossiers.map((c) => c.nature));
  for (const n of [...NATURES_ESCALATED, ...NATURES_MAINTAINED]) assert.ok(presentes.has(n), `family missing from the sample: ${n}`);
});

test("the public sample is the draw of its written rule on the private set",
  { skip: jeuPresent(DOSSIERS_PRIVES) ? false : raisonAbsent(DOSSIERS_PRIVES) }, async () => {
  const { createHash } = await import("node:crypto");
  const e = JSON.parse(readFileSync(ECHANTILLON, "utf8")) as Echantillon;
  const tous = chargerDossiersEtiquetes();
  assert.equal(e.drawnFrom, tous.length);
  const h = (id: string) => createHash("sha256").update(`${e.seed}:${id}`).digest("hex");
  const choisis = new Set<string>();
  for (const n of [...new Set(tous.map((c) => c.nature))].sort()) {
    choisis.add(tous.filter((c) => c.nature === n).map((c) => c.id).sort((a, b) => h(a).localeCompare(h(b)))[0]!);
  }
  for (const id of tous.map((c) => c.id).sort((a, b) => h(a).localeCompare(h(b)))) {
    if (choisis.size >= 20) break;
    choisis.add(id);
  }
  assert.deepEqual([...choisis].sort(), e.dossiers.map((c) => c.id).sort());
  for (const c of e.dossiers) assert.deepEqual(c, tous.find((x) => x.id === c.id), `${c.id} differs from the private set`);
});
