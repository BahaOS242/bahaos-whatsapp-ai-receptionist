# Dependency audit record — 2026-10-09

Commands: `npm audit` and `npm audit --omit=dev` (read-only, against the npm registry advisory database as of today), before and after `npm audit fix` (non-breaking; `--force` was **not** used). Reachability statements below are **assessments from reading this codebase, not guarantees**; they can change if the code or its configuration changes.

## Before (commit `9cc6b82`)
- All dependencies: **8** — 5 moderate, 2 high, 1 critical. Production-only: **3** — 1 moderate, 1 high, 1 critical.
| Package | Severity | Scope | Reached via | Reachability assessment |
|---|---|---|---|---|
| `proxy-addr` 2.0.7 | critical | production | `express` | Advisory concerns trusted-proxy subnet matching. The code sets no `trust proxy` and does not read `req.ip`/`x-forwarded-for` (grep-checked). Not reachable as configured. |
| `qs` 6.15.3 | moderate | production | `express`, `body-parser`, `googleapis-common` | Crafted query strings/bracket keys. App accepts JSON bodies; Express 5 default query parser is the simple one. Low. |
| `brace-expansion` (nested in `glob`) | high | production | `googleapis` → `gaxios` → `rimraf` → `glob` → `minimatch` | Only loaded for the optional Google Calendar client (unused on staging); patterns are not attacker-supplied. Low. |
| `source-map-js` | high | development tooling | test/build tooling | Source-map/CSS parsing in tools; not request handling. |
| `esbuild`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `drizzle-kit` | moderate | development tooling | migration CLI chain | `esbuild` dev-server request issue; no dev server runs. `drizzle-kit` is the migration CLI. |

## After `npm audit fix` (lockfile-only patch updates; no `package.json` change)
- Updated: `proxy-addr` 2.0.7→2.0.8, `qs` 6.15.3→6.16.0, `brace-expansion` →2.1.7, `source-map-js` 1.2.1→1.2.2 and two related patch bumps.
- All dependencies: **4** — all moderate, **development tooling only** (`drizzle-kit` chain: `drizzle-kit`, `@esbuild-kit/core-utils`, `@esbuild-kit/esm-loader`, `esbuild`). Production-only: **0**.
- Remaining 4 are fixable only with `npm audit fix --force`, which moves `drizzle-kit` to an unreleased 1.0 beta (breaking); **not applied**. Accepted for now as dev-tool findings; revisit when a non-breaking `drizzle-kit` release exists.
- Free checks after the change: unit 1467/1467, DB 371/371, lint/tsc/build clean, fallback eval 37/38 (NL-01 only).
- Hardening (documented, not yet applied on Render): build with `npm ci --include=dev && npm run build && npm prune --omit=dev` so dev tools are not present on the running service.
