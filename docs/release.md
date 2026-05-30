# Release and Deploy

This repo ships two v1 artifacts from the current goal scope:

1. `@mermaid-render/core` as a public npm package
2. `packages/core/dist-demo/` as a static web app

## Core Release Verification

Run the full pre-release gate from the repo root:

```bash
pnpm install --frozen-lockfile
pnpm verify:core
```

That gate runs:

- lint
- typecheck
- unit tests
- headless browser render tests
- core library build
- static demo build
- built static demo smoke test from a plain file host
- core bundle-budget check and demo-entry size report
- npm package dry-run pack verification

Latest verified current-tree result:

- unit tests: `142` passed
- browser tests: `83` passed
- built static demo smoke test: passed
- core ESM: `202.86 KiB`
- core CJS: `205.14 KiB`
- demo entry: `478.38 KiB` raw / `137.53 KiB` gzip
- dry-run tarball: `mermaid-render-core-1.0.0.tgz`, package size `275.8 kB`

## Dry-Run the npm Package

From the repo root:

```bash
pnpm --filter @mermaid-render/core pack --pack-destination ../../artifacts
```

Or inspect the publish payload without writing a tarball:

```bash
cd packages/core
npm pack --dry-run
```

The package is scoped and configured for public publish via:

```json
"publishConfig": {
"access": "public"
}
```

## Bundle Budget Check

After building, verify the publishable core stays inside the `~330 KiB` budget and the static demo stays inside its separate release budget:

```bash
pnpm --filter @mermaid-render/core bundle:check
```

This check:

- fails if `dist/index.js` or `dist/index.cjs` exceed the core budget
- fails if the demo entry chunk exceeds `500 KiB` raw or `160 KiB` gzip
- prints the current measured sizes for release tracking

## Publish `@mermaid-render/core`

After verification on the current `1.0.0` release tree:

```bash
cd packages/core
npm publish
```

Expected publish surface:

- `dist/index.js`
- `dist/index.cjs`
- `dist/index.d.ts`

`prepack` runs `pnpm build`, so the tarball is built from fresh output.

Latest verified dry-run package artifact:

- `mermaid-render-core-1.0.0.tgz`

## Pack Verification in CI / Local Gate

The v1 release gate also verifies that the package can be packed without publishing:

```bash
pnpm --filter @mermaid-render/core pack:check
```

This runs:

```bash
npm pack --dry-run
```

So the CI/release path checks the actual publish surface, not only TypeScript/build output.

## Build the Static Demo

```bash
pnpm --filter @mermaid-render/core build:demo
```

Output:

```text
packages/core/dist-demo/
```

## Preview the Static Demo Locally

```bash
pnpm --filter @mermaid-render/core preview:demo
```

That command rebuilds `packages/core/dist-demo/` and serves it from a plain static HTTP server on `127.0.0.1:4173`.

The same built-artifact smoke path is also available directly:

```bash
pnpm --filter @mermaid-render/core test:browser:static-demo
```

Or serve the built folder with any static file host.

## GPU and Lifecycle Verification

There is also a focused browser gate for renderer lifecycle and backend recovery behavior:

```bash
pnpm --filter @mermaid-render/core test:browser:lifecycle
```

That focused run covers:

- multi-instance coexistence
- lifecycle misuse errors
- destroy-time cleanup of handlers, timers, preview state, and live-canvas ownership
- synthetic WebGL context loss / restore
- WebGPU-present-but-no-adapter fallback to WebGL
- visibility pause / resume
- idle ticker shutdown / wake-up
- readable renderer-init and no-backend fallback states
- WebGPU device-loss probe behavior

There is also a focused browser gate for the relayout and animation proof surface:

```bash
pnpm --filter @mermaid-render/core test:browser:relayout
```

That focused run covers:

- fold state surviving a philosophy switch
- no orphaned or duplicate sprites across rebuilds
- clean settled state after rapid relayout interruptions
- edge endpoints staying attached during live relayout motion
- clean mid-motion inventory
- clean mid-relayout canvas frame
- smooth node progression instead of teleporting
- hidden-tab pause / visible-tab resume during active relayout
- stress-mode relayout fast path

Current result on the present tree:

- `pnpm --filter @mermaid-render/core test:browser:relayout` -> `9` passed

There is also a focused mixed unit + browser gate for the spring/runtime animation contract:

```bash
pnpm --filter @mermaid-render/core test:animation
```

That command covers:

- spring guardrails against non-finite values and unbounded runtime
- the renderer animation-clock fence
- the relayout browser slice for items `48` through `50`

Current result on the present tree:

- spring + animation-clock unit slice: `12` passed
- relayout browser slice: `9` passed

There is also a focused mixed unit + browser gate for the theme and emphasis contract:

```bash
pnpm --filter @mermaid-render/core test:theme
```

That command covers:

- theme contrast floor
- theme emphasis perceptibility math
- theme depth-tint availability
- renderer hardcoded-color fence
- light-theme resolution
- browser theme/emphasis states across light mode, depth tints, hover/selection distinction, relationship emphasis, broken-link distinction, and overlap z-order

Current result on the present tree:

- theme unit slice: `7` passed
- theme/emphasis browser slice: `10` passed

Current environment expectation:

- in ordinary CI or headless Chromium without a usable WebGPU adapter, the WebGPU probe should finish quickly with an explicit adapter-unavailable result instead of hanging
- in a browser with a real WebGPU adapter, the same probe should exercise the WebGPU device-loss recovery path and re-render successfully

## Static Deploy Contract

The demo build is static-only:

- no Node server runtime
- no filesystem dependency
- bundled example `.mmd` files are compiled into the app
- cross-file navigation resolves through the in-browser virtual file map

Any static host that can serve `packages/core/dist-demo/` is valid.
