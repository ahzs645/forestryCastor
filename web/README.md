# forestryCastor in the browser

This fork keeps the original Province of British Columbia R module and adds a
browser workbench. The editable converted engine and interface live in `web/src`.
They run in a browser worker, read local inventory/project files, display spatial
and tabular results, and generate downloads locally.

The workbench uses PGMaps's shared UI and build infrastructure from an **exact
reviewed commit** recorded in `source.json`. Its build overlays this fork's
`web/src` files into that host checkout. It therefore includes the same complete
interface as PGMaps, while this fork's converted source remains editable. The
original R files are preserved separately.

## Build

Use Node 22.12 or newer and Git. From this `web` folder:

```sh
npm run verify-source
npm run build
npm run preview
```

The first build checks out the pinned PGMaps revision under `.cache/PGMaps`,
initializes only its shared-toolkit submodule, installs the pinned dependencies,
builds the toolkit, copies the reviewed source overlay, and builds the static
application. Later builds reuse that checkout; they fail if it is a different
commit rather than resetting unrelated work. `--skip-install` is available for
a local checkout whose dependencies have already been installed.

To use a separately prepared checkout, set `CASTOR_PGMAPS_CHECKOUT` to that
checkout's absolute root for the command. It must already be at the exact
`source.json` revision. The script writes the listed source overlay there; use
an isolated build checkout rather than your active development checkout.

The result is `web/dist/`, deployable as static files at `/forestryCastor/`.
Preview opens `http://127.0.0.1:42179/forestryCastor/`. The build does not execute
PGMaps's general scraper-data preparation pipeline or ship its unrelated data.

## Editing and source review

Edit the engine in `web/src/features/forestry-castor` and the interface in
`web/src/pages/forestry-castor` / `web/src/pages/DevForestryCastor.tsx`. Record the
SHA-256 of each reviewed file in `source.json`; its `files` array uses paths
relative to `web`, such as `src/features/forestry-castor/engine.ts`. Every mirrored
source file must be listed exactly once. A checksum mismatch stops the build.

Changing the shared host requires updating the full PGMaps commit SHA, reviewing
the source overlay against it, and passing both unit and browser acceptance
checks. `source.json.template` documents the schema; it is not a working source
lock. The deployed `source-manifest.json` records the host revision, source dirty
flag, fork revision and overlay hashes, upstream pins, and static sample hashes.

## Inputs, outputs and model scope

The full browser workbench includes local SQLite, project JSON, CSV/GeoJSON and
aligned raster inputs; growth/harvest scenarios; management constraints; live,
salvage and partial treatments; maps and comparisons; CSV/GeoJSON/Float64 GeoTIFF
outputs; session recovery; and complete report bundles.

The original tutorial database is illustrative. It has no prepared harvest
blocks or demand schedule; preparation choices are disclosed. This browser model
records explicit changes from the upstream implementation. The original README
advertises calibrated yield uncertainty, but the requested module does not
include that implementation or calibration data. Browser uncertainty is labelled
as scenario sensitivity. A complete R/SpaDES equivalence claim would require the
full dependency chain, fixed inputs and independent reference outputs.

The static sample, compiled calculation worker and SQLite Wasm are served from
the application's own origin. Uploaded files, calculations and generated outputs
remain local. The application does not connect to a provincial database or an R
server. Landings are planning locations, not engineered access roads.

## Validation and deployment

The workflow prepares the exact host and source overlay, checks the independent
source/SQLite fixtures, runs unit tests, builds the production artifact, and runs
the browser suite under `/forestryCastor/`. Deployments publish only after those
checks pass. Pull requests build and test without deploying.

Source attribution and Apache-2.0 terms are included with the deployed sample.
The upstream R module's licence and notices remain in this repository.
