# Artist Album Streaming Site

A single-artist album page: stream MP3s, track plays and likes, and manage
tracks (upload / rename / replace / delete / reorder) through a password-protected
admin panel at `/admin`.

No external database service, no build step, no native dependencies —
just Node.js and two folders (`data/` for the JSON database, `uploads/` for
the MP3 files).

## 1. Make it yours

Edit `site.config.js` for text and palette:

```js
module.exports = {
  artistName: "JOHN GRANVILLE",
  albumTitle: "Static & Salt",
  releaseYear: "2026",
  tagline: "Sixteen songs recorded between 2am and sunrise.",
  accentColor: "#c1793f",
  accentColorDeep: "#7a2f39",
  accentColorCool: "#7f93ab",
  bgColor: "#0a0908",
  textColor: "#ece5da",
  heroImage: "/images/hero-streak.jpg",
  ambientImage: "/images/tunnel-glow.jpg",
  ogImage: "/images/og-cover.jpg"
};
```

To swap the photography: drop new images into `public/images/`, and point
`heroImage` / `ambientImage` / `ogImage` at them. `heroImage` fills the top
of the page behind the title — a portrait or landscape photo both work, it's
cropped to fill. `ambientImage` sits low-opacity and blurred behind the
sticky player bar at the bottom, so pick something with a warm midtone,
it reads better than something very dark or very bright. `ogImage` is what
shows up in link previews (iMessage/WhatsApp/Slack) — 1200×630 works best.

## 2. Run it locally

```bash
cp .env.example .env    # then edit ADMIN_USER / ADMIN_PASSWORD
npm install
npm start
```

Visit `http://localhost:3000` for the public page and
`http://localhost:3000/admin` to upload your 16–18 tracks (your browser
will prompt for the admin username/password).

**Starter tracks**: this package ships with three tracks already loaded —
"Not Guaranteed the Sun," "When We Were Young," and "Make Up Doll" — each
pointing at a short placeholder tone, not real audio. Go to `/admin` and
use **Replace MP3** on each one to drop in the real files; the titles,
position, and any likes/comments stay put, you're just swapping the audio.
Delete any of the three if you don't want them, or add more with the
upload form the same way.

## 3. Deploy it

This app needs one thing most "serverless" hosts don't give you by default:
**a persistent disk**, so uploaded MP3s and the track database survive restarts
and redeploys. Pick any host below that supports a volume — all three have
free or near-free tiers.

### Option A — Railway (simplest)
1. Push this folder to a GitHub repo.
2. On railway.app: New Project → Deploy from GitHub repo.
3. Add a **Volume**, mount it at `/app/data` and a second at `/app/uploads`
   (or one volume mounted at `/app` covering both).
4. Set environment variables `ADMIN_USER` and `ADMIN_PASSWORD` in the Railway dashboard.
5. Railway auto-detects the Dockerfile and deploys. It gives you a public URL immediately.

### Option B — Render
1. Push to GitHub. On render.com: New → Web Service → connect the repo (Docker runtime, auto-detected).
2. Add a **Disk**, mount path `/app/data` (add a second disk for `/app/uploads`, or point both at one disk root).
3. Set `ADMIN_USER` / `ADMIN_PASSWORD` env vars.
4. Deploy — Render gives you a `.onrender.com` URL.

### Option C — Fly.io
1. `fly launch` in this folder (it will detect the Dockerfile).
2. `fly volumes create data_vol --size 1`
3. In `fly.toml`, mount it: `[[mounts]] source = "data_vol" destination = "/app/data"` (add uploads similarly, or nest both under one mount).
4. `fly secrets set ADMIN_USER=... ADMIN_PASSWORD=...`
5. `fly deploy`

A custom domain can be attached in any of these dashboards afterward if you don't want the default subdomain.

## Notes

- **Storage**: MP3s live on disk, not in the database — the JSON file only stores titles, order, plays, and likes. This keeps the whole thing simple, but it does mean the volume is the source of truth; back it up if the tracks matter to you.
- **Play counting**: a play is only counted once a listener is ~15 seconds in (or halfway through short tracks), to avoid inflating counts from accidental clicks.
- **Likes**: one like per track per browser (tracked via localStorage), not per account — there's no user login system on the public side by design.
- **Admin auth**: Basic Auth over HTTPS (your host provides HTTPS automatically) is adequate for a single admin user. If you want multiple admins or stronger auth later, that's a bigger change — ask and I can add it.
- **Sharing**: every track has a permanent link at `/t/{id}` (a share icon next to each track, and next to the now-playing bar, copies it or opens the device's native share sheet). Opening that link scrolls to and highlights the track, ready to play — browsers block autoplay without a tap, so the recipient presses play once. The link also carries a proper title and preview description, so it shows the track name (not just the site name) when pasted into iMessage, WhatsApp, or Slack.
- **Track sections**: the tracklist splits into an italic "Part 1" / "Part 2" evenly in half, based on however many tracks actually exist — not fixed slots. 16 tracks gives you 8/8; 13 gives you 7/6 (the odd one goes to Part 1); fewer than 2 tracks means "Part 2" doesn't appear at all. It recalculates automatically as you add or remove tracks in `/admin`. Track numbering (01, 02…) and each track's play count are both independent of this grouping — they run straight through both parts and are never affected by where the split falls.
- **Playback**: "Play" starts the album from track 1 in order; "Shuffle" plays all tracks in a random order through to the end (each plays once, no repeats). Clicking any individual track directly cancels shuffle and switches to normal sequential playback from that point.
- **Comments**: each track has a comment count in the tracklist ("Comments") that opens a slide-up panel. Anyone can post a name + comment (name is remembered in their browser for next time). Comments can be reacted to with Like or Love — the two buttons share a single combined counter between them, and each browser can only pick one reaction per comment. In `/admin`, a Comments section lists everything across all tracks, lets you edit or delete any comment (for cleaning up spam or typos), and reply (posted with an ARTIST badge under your artist name). There's no login system for listeners — it's open commenting, same trust model as a guestbook, not a moderated community; edit/delete in admin is the moderation tool.
