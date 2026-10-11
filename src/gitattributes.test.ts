import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/*
 * LINE ENDINGS ARE LF ON EVERY SYSTEM, WHATEVER GIT'S LOCAL SETTING SAYS.
 *
 * Git for Windows checks text files out with CRLF by default. This repository compares bytes:
 * the README figure blocks are cut and compared as text (src/figures.ts), and the sealed
 * record and its signature are hashed as written. On Crusetra Routing, the same figures module
 * failed on the first Windows run for exactly this reason, with nothing changed but the
 * checkout. The index already holds LF; what a checkout does to the working tree is decided by
 * the root `.gitattributes`, so this case asks the repository for that file and for the line
 * that fixes it.
 *
 * Plain line logic, like src/ci.test.ts: comments are stripped before anything is read, and
 * the witness case plays the refusals on fabricated files, so that a reader which sees nothing
 * cannot turn a missing file into the only red.
 */
const RACINE = fileURLToPath(new URL("..", import.meta.url));

/** The attributes the catch-all `*` pattern receives, comments stripped, later lines winning. */
function attributsDeTout(texte: string): Map<string, string> {
  const attributs = new Map<string, string>();
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.replace(/(^|\s)#.*$/, "").trim();
    const m = /^\*\s+(.+)$/.exec(ligne);
    if (!m) continue;
    for (const a of m[1]!.split(/\s+/)) {
      const cle = /^([-!]?)([\w-]+)(?:=(.*))?$/.exec(a);
      if (!cle) continue;
      attributs.set(cle[2]!, cle[1] === "" ? (cle[3] ?? "set") : cle[1] === "-" ? "unset" : "unspecified");
    }
  }
  return attributs;
}

/** True when `*` marks text and fixes the working-tree ending to LF. */
function imposeLF(texte: string): boolean {
  const a = attributsDeTout(texte);
  const texteReconnu = a.get("text") === "auto" || a.get("text") === "set";
  return texteReconnu && a.get("eol") === "lf";
}

test("le .gitattributes de la racine impose LF à tout fichier texte, et git l'applique", (t) => {
  const chemin = join(RACINE, ".gitattributes");
  assert.ok(existsSync(chemin),
    ".gitattributes n'existe pas à la racine : un checkout Windows réécrit chaque fichier texte en CRLF, "
    + "et les blocs du README comme les relevés scellés se comparent octet pour octet. "
    + "Ajouter `* text=auto eol=lf`.");
  assert.ok(imposeLF(readFileSync(chemin, "utf8")),
    ".gitattributes ne fixe pas `eol=lf` sur `*` (avec `text` ou `text=auto`) : la fin de ligne dépend alors du réglage local de git.");

  /* What git really applies, not only what the file says: a file that is read but that git does
     not apply (wrong name, wrong folder) protects nothing. */
  let sortie: string;
  try {
    sortie = execFileSync("git", ["-C", RACINE, "check-attr", "eol", "--", "README.md", "package.json", "src/figures.ts"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    /* Not a git checkout here (an archive): the file itself was checked above, git's reading of it cannot be. */
    return t.skip("pas un dépôt git ici : le fichier est vérifié, mais pas ce que git en retient");
  }
  const lignes = sortie.trim().split(/\r?\n/);
  assert.equal(lignes.length, 3, `git check-attr devait répondre pour trois fichiers : ${sortie}`);
  for (const l of lignes) assert.match(l, /: eol: lf$/, `git n'applique pas eol=lf : ${l}`);
});

test("témoin : la lecture du .gitattributes voit la bonne ligne, et refuse les fautes qui lui ressemblent", () => {
  assert.equal(imposeLF("* text=auto eol=lf\n*.png binary\n"), true, "la ligne attendue n'est pas vue.");
  assert.equal(imposeLF("# En-tête\n#\n* text=auto eol=lf  # commentaire\r\n"), true, "un commentaire ou un CRLF cache la ligne.");
  assert.equal(imposeLF("* text eol=lf\n"), true, "`text` seul avec eol=lf est une forme valable.");
  assert.equal(imposeLF(""), false, "un fichier vide est accepté.");
  assert.equal(imposeLF("* text=auto\n"), false, "`text=auto` sans eol=lf est accepté : la fin de ligne reste celle du système.");
  assert.equal(imposeLF("* text=auto eol=crlf\n"), false, "eol=crlf est accepté.");
  assert.equal(imposeLF("* text=auto eol=lf\n* -text\n"), false, "une ligne ultérieure qui retire `text` est ignorée.");
  assert.equal(imposeLF("*.md text=auto eol=lf\n"), false, "un motif plus étroit que `*` est accepté.");
  assert.equal(imposeLF("# * text=auto eol=lf\n"), false, "la ligne en commentaire est acceptée.");
});
