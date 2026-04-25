# Madeira Crew Planner

Shared multi-trip planning app for a group with realtime sync on Supabase free tier.

## Features

- Multi-trip support with trip switcher
- Shared activity board scoped to selected trip
- Shared comments on each activity
- `@mentions` in comments
- Mention notifications with "Mark addressed" action
- Voting/likes per activity
- Cost tracking with trip budget summary
- WMS map overlay support
- Day picker popup calendar for date selection
- Interactive Madeira map with pinned activities

## Local run

```bash
cd /Users/antalog/Cursor
python3 -m http.server 8787
```

Open `http://localhost:8787`.

## Supabase setup (required for shared sync)

1. Create a free Supabase project.
2. Go to SQL Editor and run `supabase-schema.sql` (safe to re-run).
3. In Supabase Project Settings -> API, copy:
   - Project URL
   - anon public key
4. Open the app and paste both values in the Connection section.
5. Click `Connect Shared Board`.

After this, all teammates using the same URL and same Supabase credentials will see shared updates in near realtime.

## Gemini Edge Function setup (no client API key prompts)

The app is configured to call:

`https://rwibuoccrcgrozysfwfw.functions.supabase.co/gemini-proxy`

Deploy the function and set secret once:

```bash
supabase login
supabase link --project-ref rwibuoccrcgrozysfwfw
supabase secrets set GEMINI_API_KEY=YOUR_GEMINI_KEY --project-ref rwibuoccrcgrozysfwfw
supabase functions deploy gemini-proxy --project-ref rwibuoccrcgrozysfwfw --no-verify-jwt
```

Function source is at:

`supabase/functions/gemini-proxy/index.ts`

## Team usage

- Choose yourself in `Current user` (Anthony, Vivian, Jason, Darrell).
- Create a trip from `New Trip` in the left insights panel.
- Tag someone in a comment with `@Name`.
- Tagged users see a notification card.
- Notification clears when they click `Mark addressed`.

## Deploy to GitHub Pages

1. Push the repository to GitHub.
2. Settings -> Pages -> Deploy from a branch.
3. Branch `main`, folder `/ (root)`.
4. Share the generated Pages URL.

## Notes

- Supabase `anon` key is safe for client use when RLS policies are in place (included in schema file).
- This app remains static files: `index.html`, `styles.css`, `script.js`.
