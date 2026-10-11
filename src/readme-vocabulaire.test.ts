import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/*
 * THE README SPEAKS OF REVIEWS AND ESCALATIONS, NOT OF ALERTS (S1 (b) of the scoring plan).
 *
 * This tool measures a periodic-review outcome, escalated or maintained, decided by a
 * committee. The words of transaction monitoring ("per alert", "cash reporting threshold",
 * "suspicious") describe another tool, and a buyer who reads them in this README reads a
 * promise this tool does not make. The README used to carry all three (the assumptions
 * paragraph, "What is measured, assumed, synthetic").
 *
 * What this case reads is the page a buyer reads, not the generator. A phrase wrapped across
 * two lines is still the phrase, and the case is not sensitive to case: whitespace is
 * collapsed before looking. The witness case plants each word and requires that it is seen,
 * in both shapes, or the green above would mean nothing.
 */
const README = fileURLToPath(new URL("../README.md", import.meta.url));

/** The words that belong to transaction monitoring, not to a review. */
const MOTS_REFUSES = ["per alert", "cash reporting threshold", "suspicious"];

/** The refused words a text holds, found after collapsing whitespace, whatever the case. */
function motsRefuses(texte: string): string[] {
  const plat = texte.replace(/\s+/g, " ").toLowerCase();
  return MOTS_REFUSES.filter((m) => plat.includes(m));
}

test("README.md holds none of \"per alert\", \"cash reporting threshold\", \"suspicious\"", () => {
  const trouves = motsRefuses(readFileSync(README, "utf8"));
  assert.deepEqual(trouves, [],
    `README.md still speaks the vocabulary of transaction monitoring: ${trouves.map((m) => `"${m}"`).join(", ")}. `
    + "This tool measures reviews and escalations: say what the tool measures, in those words.");
});

test("witness: each refused word is seen, wrapped on two lines or in capitals, and a clean text passes", () => {
  assert.deepEqual(motsRefuses("minutes per alert and cost"), ["per alert"]);
  assert.deepEqual(motsRefuses("minutes per\nalert and cost"), ["per alert"],
    "a phrase wrapped across two lines is not seen.");
  assert.deepEqual(motsRefuses("the Cash Reporting\n  Threshold"), ["cash reporting threshold"],
    "capitals or an indented continuation hide the phrase.");
  assert.deepEqual(motsRefuses("five confirmed SUSPICIOUS cases"), ["suspicious"], "capitals hide the word.");
  assert.deepEqual(motsRefuses("reviews escalated by the committee, and escalations measured"), [],
    "a clean text is refused: the guard bites on the right vocabulary.");
});
