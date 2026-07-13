const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(
      DB_PATH,
      JSON.stringify({ tracks: [], comments: [], nextId: 1, nextCommentId: 1 }, null, 2)
    );
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  // Backfill fields for db.json files created before comments existed.
  if (!db.comments) db.comments = [];
  if (!db.nextCommentId) db.nextCommentId = 1;
  return db;
}

// Simple write queue so concurrent requests don't clobber the file.
let writing = Promise.resolve();
function writeDb(data) {
  writing = writing.then(
    () =>
      new Promise((resolve, reject) => {
        fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), (err) =>
          err ? reject(err) : resolve()
        );
      })
  );
  return writing;
}

function getTracks() {
  return readDb().tracks.sort((a, b) => a.position - b.position);
}

function getTrack(id) {
  return readDb().tracks.find((t) => t.id === Number(id));
}

async function addTrack({ title, filename }) {
  const db = readDb();
  const id = db.nextId;
  const maxPos = db.tracks.reduce((m, t) => Math.max(m, t.position), -1);
  const track = {
    id,
    title,
    filename,
    position: maxPos + 1,
    plays: 0,
    likes: 0,
    createdAt: new Date().toISOString()
  };
  db.tracks.push(track);
  db.nextId += 1;
  await writeDb(db);
  return track;
}

async function updateTrack(id, updates) {
  const db = readDb();
  const track = db.tracks.find((t) => t.id === Number(id));
  if (!track) return null;
  Object.assign(track, updates);
  await writeDb(db);
  return track;
}

async function deleteTrack(id) {
  const db = readDb();
  const idx = db.tracks.findIndex((t) => t.id === Number(id));
  if (idx === -1) return null;
  const [removed] = db.tracks.splice(idx, 1);
  await writeDb(db);
  return removed;
}

async function reorderTracks(orderedIds) {
  const db = readDb();
  orderedIds.forEach((id, i) => {
    const track = db.tracks.find((t) => t.id === Number(id));
    if (track) track.position = i;
  });
  await writeDb(db);
  return db.tracks;
}

async function incrementPlay(id) {
  return updateTrack(id, { plays: (getTrack(id)?.plays || 0) + 1 });
}

async function incrementLike(id) {
  return updateTrack(id, { likes: (getTrack(id)?.likes || 0) + 1 });
}

// ---------- Comments ----------
function getComments(trackId) {
  return readDb()
    .comments.filter((c) => c.trackId === Number(trackId))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function getCommentCount(trackId) {
  return readDb().comments.filter((c) => c.trackId === Number(trackId)).length;
}

function getAllComments() {
  return readDb().comments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function addComment({ trackId, author, text, isArtist }) {
  const db = readDb();
  const comment = {
    id: db.nextCommentId,
    trackId: Number(trackId),
    author: (author || "").trim().slice(0, 60) || "Anonymous",
    text: text.trim().slice(0, 500),
    isArtist: !!isArtist,
    likes: 0,
    loves: 0,
    createdAt: new Date().toISOString()
  };
  db.comments.push(comment);
  db.nextCommentId += 1;
  await writeDb(db);
  return comment;
}

async function deleteComment(id) {
  const db = readDb();
  const idx = db.comments.findIndex((c) => c.id === Number(id));
  if (idx === -1) return null;
  const [removed] = db.comments.splice(idx, 1);
  await writeDb(db);
  return removed;
}

async function updateComment(id, updates) {
  const db = readDb();
  const comment = db.comments.find((c) => c.id === Number(id));
  if (!comment) return null;
  Object.assign(comment, updates);
  await writeDb(db);
  return comment;
}

async function incrementCommentLike(id) {
  const db = readDb();
  const comment = db.comments.find((c) => c.id === Number(id));
  if (!comment) return null;
  comment.likes = (comment.likes || 0) + 1;
  await writeDb(db);
  return comment;
}

async function incrementCommentLove(id) {
  const db = readDb();
  const comment = db.comments.find((c) => c.id === Number(id));
  if (!comment) return null;
  comment.loves = (comment.loves || 0) + 1;
  await writeDb(db);
  return comment;
}

module.exports = {
  getTracks,
  getTrack,
  addTrack,
  updateTrack,
  deleteTrack,
  reorderTracks,
  incrementPlay,
  incrementLike,
  getComments,
  getCommentCount,
  getAllComments,
  addComment,
  deleteComment,
  updateComment,
  incrementCommentLike,
  incrementCommentLove
};
