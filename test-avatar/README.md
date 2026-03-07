# Test Avatar

Minimal AKOOL + Agora prototype for fast iteration.

## What It Does

- FastAPI creates and closes AKOOL live avatar sessions.
- React joins the returned Agora room directly in the browser.
- The browser publishes microphone audio to the room for realtime voice input.
- The browser sends text and control commands (`chat`, `set-params`, `interrupt`) over Agora stream messages.
- The remote avatar video/audio comes back from AKOOL through Agora.

## Structure

- `/Users/ugobalducci/Documents/talk-to-my-agent/test-avatar/backend`
- `/Users/ugobalducci/Documents/talk-to-my-agent/test-avatar/frontend`

## Backend

1. Create a virtualenv and install requirements:

```bash
cd /Users/ugobalducci/Documents/talk-to-my-agent/test-avatar/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Copy envs:

```bash
cp .env.example .env
```

3. Set at least:

```env
AKOOL_API_TOKEN=...
AKOOL_AUTH_METHOD=auto
AKOOL_AVATAR_ID=...
```

4. Run:

```bash
uvicorn main:app --reload
```

## Frontend

1. Install dependencies:

```bash
cd /Users/ugobalducci/Documents/talk-to-my-agent/test-avatar/frontend
npm install
```

2. Start dev server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:5174
```

4. Fill in an avatar ID if you did not set a backend default, then start the session.

## Notes

- This is intentionally thin and not production-safe.
- The AKOOL token stays server-side in FastAPI.
- `AKOOL_AUTH_METHOD=auto` tries `x-api-key` first, then bearer token.
- Microphone audio goes directly from the browser to Agora once connected.
- If you want your own agent in the loop, add a backend endpoint that takes transcript text and returns reply text, then send that reply to AKOOL through the existing browser message path.
