require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const basicAuth = require("basic-auth");
const db = require("./lib/db");
const siteConfig = require("./site.config.js");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const UPLOAD_DIR = path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(express.json());

// ---------- Server-rendered index (per-track title + Open Graph tags) ----------
const INDEX_PATH = path.join(__dirname, "public", "index.html");

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderIndex({ title, ogTitle, ogDesc, ogImage }) {
  let html = fs.readFileSync(INDEX_PATH, "utf8");
  html = html.replace(/__TITLE__/g, escapeHtml(title));
  html = html.replace(/__OG_TITLE__/g, escapeHtml(ogTitle));
  html = html.replace(/__OG_DESC__/g, escapeHtml(ogDesc));
  html = html.replace(/__OG_IMAGE__/g, escapeHtml(ogImage));
  return html;
}

app.get("/", (req, res) => {
  const origin = `${req.protocol}://${req.get("host")}`;
  res.send(
    renderIndex({
      title: `${siteConfig.artistName} — ${siteConfig.albumTitle}`,
      ogTitle: `${siteConfig.artistName} — ${siteConfig.albumTitle}`,
      ogDesc: siteConfig.tagline,
      ogImage: origin + siteConfig.ogImage
    })
  );
});

// Shareable per-track URL: /t/5 — same page, but the link (and its preview
// card in iMessage/WhatsApp/Slack) shows the specific track, and the
// frontend auto-selects that track on load.
app.get("/t/:id", (req, res) => {
  const track = db.getTrack(req.params.id);
  if (!track) return res.redirect("/");
  const origin = `${req.protocol}://${req.get("host")}`;
  res.send(
    renderIndex({
      title: `${track.title} — ${siteConfig.artistName}`,
      ogTitle: `${track.title} — ${siteConfig.artistName}`,
      ogDesc: `From "${siteConfig.albumTitle}" — listen now`,
      ogImage: origin + siteConfig.ogImage
    })
  );
});

app.use(express.static(path.join(__dirname, "public")));

// ---------- Admin auth ----------
function requireAdmin(req, res, next) {
  const creds = basicAuth(req);
  if (!creds || creds.name !== ADMIN_USER || creds.pass !== ADMIN_PASSWORD) {
    res.set("WWW-Authenticate", 'Basic realm="Admin"');
    return res.status(401).send("Authentication required.");
  }
  next();
}

app.use("/admin", requireAdmin, express.static(path.join(__dirname, "admin")));

// ---------- Uploads ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, safe);
  }
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ok = file.mimetype === "audio/mpeg" || file.originalname.toLowerCase().endsWith(".mp3");
    cb(ok ? null : new Error("Only .mp3 files are allowed"), ok);
  },
  limits: { fileSize: 60 * 1024 * 1024 } // 60MB per track
});

// ---------- Public API ----------
app.get("/api/config", (req, res) => {
  res.json(siteConfig);
});

app.get("/api/tracks", (req, res) => {
  const tracks = db.getTracks().map((t) => ({
    id: t.id,
    title: t.title,
    position: t.position,
    plays: t.plays,
    likes: t.likes,
    comments: db.getCommentCount(t.id)
  }));
  res.json(tracks);
});

app.get("/api/stream/:id", (req, res) => {
  const track = db.getTrack(req.params.id);
  if (!track) return res.status(404).end();
  const filePath = path.join(UPLOAD_DIR, track.filename);
  if (!fs.existsSync(filePath)) return res.status(404).end();

  const stat = fs.statSync(filePath);
  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Length": stat.size,
      "Content-Type": "audio/mpeg"
    });
    return fs.createReadStream(filePath).pipe(res);
  }

  const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
  const start = parseInt(startStr, 10);
  const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${stat.size}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": "audio/mpeg"
  });
  fs.createReadStream(filePath, { start, end }).pipe(res);
});

app.post("/api/tracks/:id/play", async (req, res) => {
  const track = await db.incrementPlay(req.params.id);
  if (!track) return res.status(404).end();
  res.json({ plays: track.plays });
});

app.post("/api/tracks/:id/like", async (req, res) => {
  const track = await db.incrementLike(req.params.id);
  if (!track) return res.status(404).end();
  res.json({ likes: track.likes });
});

// ---------- Comments (public) ----------
app.get("/api/tracks/:id/comments", (req, res) => {
  const track = db.getTrack(req.params.id);
  if (!track) return res.status(404).end();
  res.json(db.getComments(req.params.id));
});

app.post("/api/tracks/:id/comments", async (req, res) => {
  const track = db.getTrack(req.params.id);
  if (!track) return res.status(404).end();
  const { author, text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment can't be empty" });
  const comment = await db.addComment({ trackId: req.params.id, author, text, isArtist: false });
  res.json(comment);
});

app.post("/api/comments/:id/like", async (req, res) => {
  const comment = await db.incrementCommentLike(req.params.id);
  if (!comment) return res.status(404).end();
  res.json({ likes: comment.likes, loves: comment.loves });
});

app.post("/api/comments/:id/love", async (req, res) => {
  const comment = await db.incrementCommentLove(req.params.id);
  if (!comment) return res.status(404).end();
  res.json({ likes: comment.likes, loves: comment.loves });
});

// ---------- Admin API ----------
app.get("/api/admin/tracks", requireAdmin, (req, res) => {
  res.json(db.getTracks());
});

app.post("/api/admin/tracks", requireAdmin, upload.single("mp3"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const title = req.body.title || req.file.originalname.replace(/\.mp3$/i, "");
  const track = await db.addTrack({ title, filename: req.file.filename });
  res.json(track);
});

app.put("/api/admin/tracks/:id", requireAdmin, async (req, res) => {
  const { title } = req.body;
  const track = await db.updateTrack(req.params.id, { title });
  if (!track) return res.status(404).end();
  res.json(track);
});

app.put("/api/admin/tracks/:id/replace", requireAdmin, upload.single("mp3"), async (req, res) => {
  const existing = db.getTrack(req.params.id);
  if (!existing) return res.status(404).end();
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const oldPath = path.join(UPLOAD_DIR, existing.filename);
  const track = await db.updateTrack(req.params.id, { filename: req.file.filename });
  if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
  res.json(track);
});

app.delete("/api/admin/tracks/:id", requireAdmin, async (req, res) => {
  const track = await db.deleteTrack(req.params.id);
  if (!track) return res.status(404).end();
  const filePath = path.join(UPLOAD_DIR, track.filename);
  if (fs.existsSync(filePath)) fs.unlink(filePath, () => {});
  res.json({ ok: true });
});

app.put("/api/admin/reorder", requireAdmin, async (req, res) => {
  const { orderedIds } = req.body;
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "orderedIds must be an array" });
  const tracks = await db.reorderTracks(orderedIds);
  res.json(tracks);
});

// ---------- Comments (admin) ----------
app.get("/api/admin/comments", requireAdmin, (req, res) => {
  const tracksById = new Map(db.getTracks().map((t) => [t.id, t.title]));
  const comments = db.getAllComments().map((c) => ({
    ...c,
    trackTitle: tracksById.get(c.trackId) || "(deleted track)"
  }));
  res.json(comments);
});

// Reply as the artist — posts a comment on the given track tagged isArtist:true.
app.post("/api/admin/tracks/:id/comments", requireAdmin, async (req, res) => {
  const track = db.getTrack(req.params.id);
  if (!track) return res.status(404).end();
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment can't be empty" });
  const comment = await db.addComment({
    trackId: req.params.id,
    author: siteConfig.artistName,
    text,
    isArtist: true
  });
  res.json(comment);
});

app.delete("/api/admin/comments/:id", requireAdmin, async (req, res) => {
  const comment = await db.deleteComment(req.params.id);
  if (!comment) return res.status(404).end();
  res.json({ ok: true });
});

app.put("/api/admin/comments/:id", requireAdmin, async (req, res) => {
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: "Comment can't be empty" });
  const comment = await db.updateComment(req.params.id, { text: text.trim().slice(0, 500) });
  if (!comment) return res.status(404).end();
  res.json(comment);
});

app.listen(PORT, () => {
  console.log(`Artist site running on port ${PORT}`);
});
