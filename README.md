# Madeira Crew Planner

Shared trip planning app for a group of 4 with realtime sync on Supabase free tier.

## Features

- Shared activity board (same data for all devices)
- Shared comments on each activity
- `@mentions` in comments
- Mention notifications with "Mark addressed" action
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
2. Go to SQL Editor and run `supabase-schema.sql`.
3. In Supabase Project Settings -> API, copy:
   - Project URL
   - anon public key
4. Open the app and paste both values in the Connection section.
5. Click `Connect Shared Board`.

After this, all teammates using the same URL and same Supabase credentials will see shared updates in near realtime.

## Team usage

- Choose yourself in `Current user` (Anthony, Vivian, Jason, Darrell).
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
