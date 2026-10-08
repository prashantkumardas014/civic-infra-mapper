# Civic Infra Mapper

Civic Infra Mapper is a full-stack web application for neighbourhood civic infrastructure mapping. Residents can report issues, pin locations, upload photos, and share survey feedback. The dashboard, report list, account page, and survey chart receive updates directly from **Supabase Realtime**.

## Technology

- Node.js 22.12+, Express, and plain HTML/CSS/JavaScript
- Supabase Postgres for persistent shared application data
- Supabase Realtime for Postgres change notifications
- Supabase Storage for report photos
- Leaflet maps and Chart.js

## Set up Supabase

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase dashboard, paste in [`supabase/schema.sql`](./supabase/schema.sql), and run it. It creates the required tables, access policies, photo bucket, and Realtime publication.
3. In Supabase **Project Settings → API**, copy the project URL, publishable/anon key, and the `service_role` secret. The service-role secret is private; never put it in browser code, commit it, or share it.
4. Copy `.env.example` to `.env` in this folder and enter those values, together with a private admin email and password:

   ```text
   SUPABASE_URL=https://your-project-ref.supabase.co
   SUPABASE_ANON_KEY=your-publishable-or-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-private-service-role-secret
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=use-a-unique-password-of-at-least-10-characters
   ```

The server uses the service-role secret for database and photo operations; the browser receives only the project URL and publishable/anon key. RLS denies browser access to account and session data. Reports and survey rows are public so anonymous visitors can receive their live Postgres updates.

## Run locally

In PowerShell, from the project folder:

```powershell
npm ci
Copy-Item .env.example .env
notepad .env
npm start
```

Fill out and save `.env` before running `npm start`. The configured `ADMIN_PASSWORD` is applied to the administrator account each time the server starts, so updating it in `.env` resets that account's password at the next successful start. Keep `.env` private and excluded from source control. Open **http://localhost:3000**. The `/health` endpoint reports whether the app can reach Supabase. Sign in to the bootstrapped administrator account through the **Account** page to manage report status.

To populate an empty Supabase project with demonstration reports and survey responses, run `npm run seed` after applying the schema and configuring `.env`. The seed command refuses to run when reports or survey responses already exist.

## Import existing local SQLite data

If this project already has a `civic.db` and you want to keep its reports/accounts/surveys, apply the Supabase schema, configure `.env`, then run the import **before starting the app or creating users in Supabase**. The importer uses Node.js's built-in SQLite reader; no native SQLite package or compiler is needed:

```powershell
npm run migrate:sqlite
npm start
```

By default, the importer reads `civic.db` and photos from `uploads`. To use other locations, set `SQLITE_PATH` and `UPLOADS_DIR` in `.env`. It imports users and password hashes, reports and available photos, and survey responses. Existing sessions are not transferred, so users will sign in again. The importer refuses to run if the destination already contains users, reports, or surveys; back up the SQLite database before importing.

## Deployment

Deploy as a Node.js web service running `npm start`. Add these environment variables in the hosting provider's secret/environment settings:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (publishable/anon key)
- `SUPABASE_SERVICE_ROLE_KEY` (server secret only)
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- `PORT` if required by the host

Supabase is the shared persistent database and photo store, so app hosts do not need a persistent local disk. Serve the app over HTTPS. Do not expose the service-role key to the browser or add it to source control. Configure the host's health check to use `/health`.

## Live updates

Browsers subscribe to Supabase Postgres Changes on `public.reports` and `public.surveys`; inserts, status changes, and deletions update the connected pages without a manual refresh. The tables must be included in the `supabase_realtime` publication and the public read policies in [`supabase/schema.sql`](./supabase/schema.sql) must be in place. Browser subscriptions use only the publishable/anon key; all changes still go through the Express API, which enforces administrator permissions.

## API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/config` | Public Supabase configuration for the browser Realtime client |
| GET | `/health` | App and Supabase database readiness |
| GET | `/api/reports` | Paginated reports; supports `page`, `pageSize` (1–100), `category`, `status`, `severity`, `sort` (`newest`, `oldest`, `severity`), and `q` (2–80 characters) |
| GET | `/api/reports/:id` | Fetch a report |
| POST | `/api/reports` | Create a report and optionally upload a photo |
| PATCH | `/api/reports/:id` | Update report status (administrator only) |
| DELETE | `/api/reports/:id` | Delete a report (administrator only) |
| GET | `/api/stats` | Dashboard totals and charts |
| POST | `/api/surveys` | Save a survey response |
| GET | `/api/surveys` | List survey responses |
| GET | `/api/surveys/stats` | Survey averages and common problems |
| POST | `/api/auth/register` | Create an account and sign in |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Return the current signed-in user |
| GET | `/api/me/reports` | List the signed-in user's reports |

The All Reports and Admin pages include text search, category/status/severity filters, sorting or review controls, and pagination. The report indexes and generated severity rank are included in the idempotent `supabase/schema.sql`; run it again in the Supabase SQL Editor to add those performance improvements to an existing project without resetting its data.

## Project structure

```text
civic-infra-mapper/
├── .env.example
├── package.json
├── server.js
├── seed.js
├── migrate-sqlite-to-supabase.js
├── supabase/
│   └── schema.sql
└── public/
    ├── index.html
    ├── report.html
    ├── reports.html
    ├── survey.html
    ├── admin.html
    ├── account.html
    ├── css/style.css
    └── js/
```
