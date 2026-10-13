# Crusetra · Scoring

**Which customer risk factor suffices, at which threshold, measured on your own
periodic-review outcomes.** Nothing of yours goes up: this tool downloads nothing, your
customer files stay on your machine.

Periodic review scores customer risk; most of the files it pulls come back unchanged, each
one costs analyst time, and nobody can say why a factor sits at its threshold except "that
is how it was configured". This tool measures it: every risk factor is run at every
threshold over the reviews your analysts already decided, and each factor and threshold cell
is read for recall on the files that were escalated and false-alert rate on the files that
were retained, with its count and its interval, or not at all. The sealed record keeps only the cells for one recall
floor of yours: per factor, its cell at the floor and the next threshold. The rest of the grid stays on your machine, and
another floor means running the tool again there.

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
| `npm run measure:yours -- --customers=<csv> --reviews=<csv> [--volume=N] [--recall=<min>]` | your own periodic reviews, rebuilt into dossiers from your customer attributes: recall on escalated customers and false-alert rate on maintained ones per risk factor at your recall floor, with n and interval; a sealed record and a report beside your file, with no value of yours written out: the record keeps, per factor, only its cell at your recall floor and the next threshold of a grid 0.05 apart, never the grid. The record cannot answer another recall floor: run measure:yours again, here, on the same files, with another --recall. The step bounds each score, not each weight: a weight can still read tighter than the step when a kept threshold falls between two scores of one factor that sit closer than the step, when it enters one score twice (residence equal to nationality in geography), when two tables carry the same weight and the observer knows it, or when several records measured under the same tables are shared together (the unsalted SHA-256 of each table links them), whether of the same data at other floors or of other data. |
| `npm run optimise -- --from=<record> --recall=<min>` | the cell the record keeps for its own recall floor (the fewest false alerts with the recall lower bound held); it refuses another floor, and `--review-budget`, which needs the whole frontier that the record no longer keeps: for another floor, run `measure:yours` again with another `--recall` |
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
**146 tests** across 22 files, counted by running the suite rather than typed here.
<!-- /figures:tests -->

## Licence

The same public licence as Crusetra Routing: non-commercial use without limit of time, a
thirty-day evaluation on your own records for organisations, a commercial licence for
production. See [LICENSE](LICENSE) and [LICENCES.md](LICENCES.md).
