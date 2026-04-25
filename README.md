# Madeira Crew Planner

A lightweight trip-planning app for a group of 4, designed to run from your machine with no paid backend.

## Features

- Activity board for each day and time
- Notes and comments on each activity
- `@mentions` to tag teammates in comments
- Interactive Madeira map with pinned activities
- Local storage persistence in browser (no cloud account required)

## Run locally

You can run this with Python (already present on most macOS installs):

```bash
cd /Users/antalog/Cursor
python3 -m http.server 8787
```

Then open:

- On your machine: `http://localhost:8787`
- On teammate devices on same Wi-Fi: `http://YOUR_LOCAL_IP:8787`

To find your local IP on macOS:

```bash
ipconfig getifaddr en0
```

If you are using Ethernet, use:

```bash
ipconfig getifaddr en1
```

## Share safely with your team of 4

- Keep everyone on the same Wi-Fi network.
- Confirm macOS firewall allows incoming connections for Python.
- This app stores data in each browser's local storage; it does not sync automatically across devices.

### Best workflow for group collaboration on free plan

Because this version avoids paid backend services, use one of these:

1. **Host-only workflow (simplest):**
   - Only one device edits (yours).
   - Share screen or read updates live.

2. **Manual sync workflow (still free):**
   - Use one "source of truth" device.
   - At checkpoints, copy agreed plan text to group chat.

If you want true live multi-user syncing later, we can add a free backend option (for example Supabase free tier) in a second iteration.

## Notes

- Map tiles are loaded from OpenStreetMap over internet.
- This app is static: `index.html`, `styles.css`, `script.js`.
