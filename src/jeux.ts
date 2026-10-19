/*
 * THE DOOR TO THE PRIVATE SET.
 *
 * The full labelled dossier set (src/dossiers-etiquetes.json) lives in a private folder, not in this
 * repository. CRUSETRA_JEUX points at it; the default is the sibling folder
 * ../crusetra-jeux/crusetra-scoring. A measure or a test that needs the set reads it
 * through here, and on a clean clone it skips with the named reason below, never failing
 * and never passing silently. The public sample is src/echantillons/dossiers-20.json.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = fileURLToPath(new URL("..", import.meta.url));

/** The private folder for this tool. */
export function racinePrive(): string {
  const env = process.env.CRUSETRA_JEUX;
  return env && env.length > 0 ? env : join(RACINE, "..", "crusetra-jeux", "crusetra-scoring");
}

/** The absolute path of a private file, whether or not it exists. */
export function cheminPrive(rel: string): string {
  return join(racinePrive(), rel);
}

/** True when the private file is present. */
export function jeuPresent(rel: string): boolean {
  return existsSync(cheminPrive(rel));
}

/** The reason a test names when it skips for a missing private set. */
export function raisonAbsent(rel: string): string {
  return `private set absent: ${rel} (set CRUSETRA_JEUX or clone crusetra-jeux next to this repository)`;
}

/** The error a measure throws when it needs a set that is absent. */
export class JeuPriveAbsent extends Error {
  constructor(rel: string) {
    super(raisonAbsent(rel));
    this.name = "JeuPriveAbsent";
  }
}
