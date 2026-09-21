# Google OAuth setup (Calendar + Gmail)

One-time setup you (the project owner) must do in Google Cloud Console. Takes
about 5 minutes. Nothing here goes on the server — the app uses the client-side
Google Identity Services token flow.

## 1. Create the OAuth client

1. Go to <https://console.cloud.google.com/> and pick (or create) a project.
2. **APIs & Services → Library**: enable **Google Calendar API** and **Gmail API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: **External**, fill the app name (`Ascend Protocol`) + your email.
   - Scopes: you can leave this empty (scopes are requested at runtime).
   - **Test users**: add your own Gmail address (and any other accounts that will
     use the app). While the app is in "Testing" mode only test users can
     connect — that's fine for personal use and skips Google's verification
     review (Gmail scopes are "restricted" and would otherwise need it).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins:
     - `https://ascend-delta-sage.vercel.app`
     - `http://localhost:3000` (for local dev)
   - No redirect URIs needed (token flow, not code flow).
5. Copy the **Client ID** (looks like `1234-abc.apps.googleusercontent.com`).

## 2. Give it to the app

- **Vercel**: Project → Settings → Environment Variables → add
  `VITE_GOOGLE_CLIENT_ID = <your client id>` (Production + Preview), then redeploy.
- **Local dev**: add the same line to `.env`.

## 3. Connect inside Ascend

Settings → **Google Account** → *Connect Google (Calendar + Gmail)*. A Google
popup asks for consent (it will warn "Google hasn't verified this app" while in
Testing mode — click *Continue*). Scopes requested:

| Scope | Used for |
|---|---|
| `calendar.events` | Reading today's events into Jarvis's context; creating events when you approve a day plan |
| `gmail.readonly` | Inbox summaries and urgent-mail flagging |
| `gmail.compose` | Creating **draft** replies for your review — the app never sends mail |

Tokens live in your browser's sessionStorage only, expire after ~1 hour, and are
silently renewed. Disconnecting revokes the grant.

## 4. Server-side Calendar access (for Telegram alerts)

The flow above only works while a browser tab is open — it can't power a cron
that texts you before an event with your laptop closed. That needs a second,
server-side OAuth flow (authorization code + refresh token), which requires
two more things in the same Cloud Console project:

1. **Credentials → your OAuth client → edit**: under *Authorized redirect
   URIs*, add `https://<your-domain>/api/google-oauth/callback` (and
   `http://localhost:3000/api/google-oauth/callback` for local testing).
2. Still on that client's page, note the **Client secret** (if you don't see
   one, the client type must be "Web application" — the same one from step 1
   above already is).
3. Set on your deployment: `GOOGLE_CLIENT_SECRET` (the secret from step 2) and
   `GOOGLE_OAUTH_REDIRECT_URI` (the URL from step 1, exactly as entered). See
   `.env.example` for the full list.
4. **APIs & Services → Library**: enable both the **Google Calendar API** and
   the **Gmail API** in this project. Email alerts need the Gmail one; without
   it the cron reports `gmail: forbidden`.
5. In Ascend: **Settings → Connections → Connect Calendar + Gmail for Telegram
   alerts**. Approve the consent screen once and tick both boxes. This is a
   one-time setup, not a per-session login like the flow above. If you
   connected before email alerts existed, connect again: the old grant only
   covers Calendar.

   Gmail read access is a restricted scope, so while the app is in Testing
   mode Google shows an "unverified app" warning. That is expected for a
   personal project: choose *Advanced → Go to (app)* to continue.

What Telegram texts about on its own (important email, habit nudges, study
reminders) and at what times is set in **Settings → Connections → Telegram
alerts**.

**Important — the cron interval.** Vercel's free/Hobby plan only allows one
cron run per day (see `telegram-cron.ts`'s own header comment), which is
useless for a "5 minutes before" alert. The cron endpoint itself
(`/api/telegram/cron`) is stateless and safe to call as often as you like —
point a free external scheduler (e.g. <https://cron-job.org>) at it every
5 minutes, sending the same `CRON_SECRET` your Vercel cron already uses. Without
that, timetable and calendar alerts will still eventually fire once a day, not
5 minutes ahead.
