# Moiz Mobile & Corporation — Counter App (Frontend)

The React app the shop actually touches: the counter (POS), products, purchases, customers and
their udhaar ledgers, returns, reports and the day-end drawer count, for **Moiz Mobile &
Corporation, Danwran Lodhran**.

This is the **frontend** repository. The API, database migrations, specifications and deployment
notes live in the backend repository,
[MobileAccessoriesBack](https://github.com/JaferHussain/MobileAccessoriesBack). The commands below
assume the two are cloned side by side:

```
Mobile accessories/
  backend/     MobileAccessoriesBack          ASP.NET Core 8 · Dapper · MySQL 8
  frontend/    Mobile-Accessories-Frontend    this repository
```

## Stack

React 18 · TypeScript · Vite · TanStack Query · Vitest + Testing Library

## Getting started

Prerequisites: Node.js 20 LTS+, and the backend running on `http://localhost:5080`
(see the backend README).

```bash
npm install
npm run dev          # http://localhost:5173 — /api is proxied to the backend on :5080
```

`VITE_API_BASE_URL` decides where API calls go. In development the default `/api` plus the Vite
proxy is enough; see `.env.example`. `.env.production` holds the live API address and is baked into
the bundle at **build** time, so changing it needs a rebuild.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run test` | Run the test suite once |
| `npm run test:watch` | Tests in watch mode |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Type-check and build to `dist/` |

**Before anything is merged:** `npm run test && npx tsc --noEmit` must pass, and so must the backend
suite.

## Layout

```
src/
  api/          the HTTP client — envelope unwrapping, auth refresh, FormData and Blob handling
  components/   the shell (rail, header) and shared pieces
  features/     one folder per module: pos, products, customers, documents, returns, reports, …
  lib/          pure helpers — money, the cart store
  routes/       AppRoutes.tsx
  index.css     every style, including the rail icons (keyed on href)
tests/          mirrors src/features
```

## Deploying

`npm run build` produces `dist/`. The shop serves it from the API's own origin (copied into the
backend's `wwwroot`); the step-by-step is in the backend repository's `docs/deployment.md`.
