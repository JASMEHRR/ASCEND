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
