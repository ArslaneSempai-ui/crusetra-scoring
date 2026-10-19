# Crusetra · Scoring

**Which customer risk factor suffices, at which threshold, measured on your own
periodic-review outcomes.** Nothing of yours goes up: this tool downloads nothing, your
customer files stay on your machine.

Periodic review scores customer risk; most of the files it pulls come back unchanged, each
one costs analyst time, and nobody can say why a factor sits at its threshold except "that
is how it was configured". This tool measures it: every risk factor is run at every
threshold over the reviews your analysts already decided, and each factor and threshold cell
is read for recall on the files that were escalated and false-alert rate on the files that
were retained, with its count and its interval, or not at all.

It is the fourth tool of the Crusetra suite. The first,
[Crusetra Routing](https://github.com/ArslaneSempai-ui/crusetra-routing), measures which
extraction tier suffices per field. Same method, same seal, same key.

No real customer file is public, so the public record of this tool is entirely written and
generated, and the record states it: dossiers we wrote, with the retained files they have to
be told apart from, and seeded variants, kept apart. The measure that counts is yours, on
your machine.

<!-- figures:commandes -->
| Command | What it does, in the order that makes sense |
|---|---|
| `npm ci --ignore-scripts` | install exactly the versions the lockfile pins, and run no install script from any dependency; the only command that needs the network: this tool downloads nothing else, ever |
| `npm run test` | types, the README blocks, the licence inventory, and the suite. Start here; it runs with the network cut |
| `npm run measure [-- --yes-overwrite]` | the public measure: every risk factor at every threshold on dossiers we wrote (retained files included) plus declared generated variants, sealed into `releve-public.json` and readable in `RELEVE-PUBLIC.md`: no real customer is public, and the record says so; it refuses to overwrite a sealed one without the flag |
| `npm run measure:yours -- --customers=<csv> --reviews=<csv> [--volume=N]` | your own periodic reviews, rebuilt into dossiers from your customer attributes: recall on escalated customers and false-alert rate on maintained ones per risk factor and threshold, with n and interval; a sealed record and a report beside your file, never a value of yours |
| `npm run optimise -- --from=<record> --recall=<min>` | the best trade-off: fewest alerts with the recall lower bound held, or `--review-budget=<N>` for the highest bounded recall under a yearly review budget |
| `npm run sceller -- <record.json>` | seal a record: the content hash that makes a silently edited measurement fail loudly; the same content hash as Crusetra Routing |
| `npm run verify -- <report>` | check that a report was issued by the holder of the suite's public key, `cle-publique.pem`, without asking us |
| `npm run licences` | regenerate `LICENCES.md`, the licence of every shipped package; `--check` fails the suite when the table drifts |
<!-- /figures:commandes -->

## Requirements

Node 24 or newer, on **macOS or Linux**. Windows has not been tested and is not claimed.

## What leaves your machine

Nothing. This tool has no list to download and no model to fetch: every command runs with
the network cut, and a test reads every source so that no module ever grows a network call
(`src/frontiere.test.ts`).

## What is measured, assumed, synthetic

Every rate in a report carries its `n` and its 95 % Wilson interval. The risk tables, the
scales that turn an amount or a count into a score, analyst minutes per review, analyst
cost and the recall floor are **assumed** and declared in `src/assumptions.ts`. The public
record is **written and generated**: dossiers we authored and seeded variants, measured
apart, never merged into anything measured on your data. Below five confirmed escalations,
no recall is quoted, and the report states why.

## Seals and signatures

Records are sealed (`npm run sceller`) with the same content hash as Crusetra Routing, and
reports are verified against the same public key, [`cle-publique.pem`](cle-publique.pem),
with `npm run verify`.

<!-- figures:tests -->
**131 tests** across 20 files, counted by running the suite rather than typed here.
<!-- /figures:tests -->

## What is public, what is private

The figures stay public: `releve-public.json`, its signature and `RELEVE-PUBLIC.md`. The only labelled dossiers left public are in `src/echantillons/dossiers-20.json`: 20 dossiers, every family at least once, drawn by a fixed rule written at the top of the file (rank by the SHA-256 of a seed and the dossier id), never hand-picked.

The full labelled dossier set (`src/dossiers-etiquetes.json`) is private since this change. Its recorded SHA-256 is `fb3762798a757e020570a2680179c9054d53abec17aafeec0a43d4af38d9f63f`, from the private folder's `MANIFEST.txt`. Earlier versions remain in the git history of this repository.

A holder of the private folder runs the full tests with `CRUSETRA_JEUX=/path/to/crusetra-jeux/crusetra-scoring npm test` (default: `../crusetra-jeux/crusetra-scoring`); the seal then recomputes. Without it the tests that read the set are skipped with a named reason.

## Licence

The same public licence as Crusetra Routing: non-commercial use without limit of time, a
thirty-day evaluation on your own records for organisations, a commercial licence for
production. See [LICENSE](LICENSE) and [LICENCES.md](LICENCES.md).
