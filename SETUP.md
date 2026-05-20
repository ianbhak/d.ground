# d.ground — Setup Checklist

Before `npm run dev` works, do these 5 things (≈ 12 min total).
Run `npm test` at the end to verify steps 1–3.

## 1. Run the SQL migrations

Supabase Dashboard → **SQL Editor** → New query → run each in order:

1. [`supabase/migrations/0001_dground_init.sql`](supabase/migrations/0001_dground_init.sql)
   — creates the `dground` schema, 10 tables, RLS policies, helper
   functions, and the private `dground-docs` storage bucket.
2. [`supabase/migrations/0002_dground_grants.sql`](supabase/migrations/0002_dground_grants.sql)
   — grants table privileges to the `authenticated` / `service_role`
   roles. A new schema does **not** inherit Supabase's default grants,
   so without this every query fails with `42501 permission denied`.

Verify with:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'dground' ORDER BY table_name;
```
Expect 10 tables: `audit_log, chunks, invites, memberships, messages, room_documents, rooms, shared_documents, threads, usage_daily`.

## 1b. Expose the `dground` schema to the Data API

⚠️ **Critical** — without this the app fails with `PGRST106: Invalid schema: dground`.

Run [`supabase/migrations/0003_expose_dground_schema.sql`](supabase/migrations/0003_expose_dground_schema.sql)
in the SQL Editor (along with 0001 and 0002).

It sets the `authenticator` role's `pgrst.db_schemas` config and reloads
PostgREST — the same thing the dashboard's *Settings → API → Exposed
schemas* control does, but without dashboard navigation.

> Dashboard alternative (if you prefer the UI): Project Settings → API →
> *Exposed schemas* → add `dground`. The menu label/location changes
> between Supabase releases, so the SQL migration above is more reliable.

## 2. Add d.ground redirect URLs to Supabase

Supabase Dashboard → **Authentication** → **URL Configuration**

- **Site URL** (already set for d.connect — leave as is)
- **Additional Redirect URLs** → click **Add URL** and paste each of:
  - `http://localhost:3000/**`
  - `https://dground.dconnect.kr/**`

> ⚠️ The wildcard `/**` is required — it lets Supabase redirect to any path
> under d.ground after Google OAuth. Without it, `/auth/callback` rejects.

## 3. Fill in `.env.local`

Open `.env.local` and replace the three `<PASTE_...>` placeholders:

```bash
NEXT_PUBLIC_SUPABASE_ANON_KEY="<PASTE_ANON_KEY>"
SUPABASE_SERVICE_ROLE_KEY="<PASTE_SERVICE_ROLE_KEY>"
DATABASE_URL="<PASTE_SESSION_POOLER_CONNECTION_STRING>"
```

Where to find them:

| Variable | Dashboard path |
|---|---|
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Project Settings → API → Project API keys → `anon` `public`** |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → `service_role` `secret`. **Server-only — never expose.** |
| `DATABASE_URL` | **Project Settings → Database → Connection string → Session pooler** (5432). Replace `[YOUR-PASSWORD]` with the DB password set in the same page. |

## 4. Verify Google OAuth provider

Supabase Dashboard → **Authentication → Providers → Google** → check that
Google is **enabled** (it already is, since d.connect uses it). No changes
needed on the Google Cloud side — d.ground reuses Supabase's existing
callback URL `https://yvasxiixcnukyzxlnqvb.supabase.co/auth/v1/callback`.

## 5. Run

```bash
npm run dev
```

Open http://localhost:3000 → click **Sign in with Google** → you should
land on `/rooms` (empty state). Click **+ 새 방** to create your first Room.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `Database URL is not set` on `npm run dev` | `.env.local` missing or `DATABASE_URL` empty |
| OAuth redirects to localhost but errors with "redirect_uri_mismatch" | Supabase Auth → URL Configuration → Additional Redirect URLs missing `http://localhost:3000/**` |
| `relation "dground.rooms" does not exist` | SQL migration in step 1 didn't run |
| Room list shows 401 / no rows | RLS policy issue — check you're logged in, `auth.uid()` should match `owner_id` |
| Vector index build slow | Normal on first big insert; HNSW is created upfront so it's incremental |

---

## What's next (W2)

- PDF upload UI + SHA256 dedup
- Server-side text extraction (`unpdf`) + chunking
- Voyage AI embedding calls
- pgvector storage + similarity search
