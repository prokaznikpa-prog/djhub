# DJHUB Backend Proxy Scaffold

Minimal Express backend scaffold for future Supabase proxying.

## Local run

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
PORT=3001
```

3. Start the backend:

```bash
npm run dev
```

4. Open:

- [http://localhost:3001/health](http://localhost:3001/health)

## Endpoints

- `GET /health` -> `{ "ok": true }`
- `GET /api/djs` -> reads active `dj_profiles` from Supabase using the anon key

## Notes

- This scaffold does not change the current frontend.
- It uses the Supabase anon key only.
- No service role key is used here.
