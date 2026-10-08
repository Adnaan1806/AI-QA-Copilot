# AI QA Copilot — Frontend

React 19 + Vite, styled with Tailwind CSS v4 and shadcn/ui, animated with GSAP.

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
| `src/pages/` | One component per route (see `App.jsx`) |
| `src/components/` | App components; `ui/` holds generated shadcn primitives |
| `src/motion/` | GSAP animation hooks and wrappers |
| `src/context/` | Auth and breadcrumb providers |
| `src/services/api.js` | All backend calls |
