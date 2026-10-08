# AI QA Copilot — Frontend

React 19 + Vite, styled with Tailwind CSS v4 and shadcn/ui, set in IBM Plex Sans and Mono.

```bash
npm install
npm run dev     # http://localhost:5173
npm run lint    # oxlint
npm run build
```

The backend URL defaults to `http://localhost:8000`. Override it with `VITE_API_BASE_URL` in `frontend/.env.local`.

## Layout

| Path | Contents |
|---|---|
| `src/pages/` | One component per route (see `App.jsx`). `RequirementWorkspace` serves the Review, Automation and Report tabs. |
| `src/components/workspace/` | The requirement workspace panels: review list and detail, case editor, automation results, report, verdict |
| `src/components/` | Shared app components (case strip, requirement table, sidebar, chips); `ui/` holds the shadcn primitives |
| `src/lib/qa.js` | Shared vocabulary: case states, requirement stage, verdict reading, flaky detection |
| `src/context/` | Auth, breadcrumb, and data-version providers (the last tells the sidebar queue to refetch) |
| `src/services/api.js` | All backend calls |

## Design tokens

Colours are defined once in `src/index.css` as CSS variables, with light values on `:root` and dark values under `.dark`, then exposed to Tailwind (`bg-pass`, `text-review`, `bg-pencil-wash`, ...).

| Token | Role |
|---|---|
| `paper`, `sheet`, `sheet-2` | Page background, panels, subtle fills |
| `graphite`, `graphite-2` | Text and muted text; also the "approved" case mark |
| `rule` | Borders and dividers |
| `pencil` | The only accent: actions, focus, selection |
| `pass`, `review`, `fail` (+ `-wash`) | Test state only. Never used for decoration. |

Keep state colours for state. Anything a person can click uses `pencil` (`primary`).
