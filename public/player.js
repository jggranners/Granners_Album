const audio = document.getElementById("audio");
const tracklistEl = document.getElementById("tracklist");
const playPauseBtn = document.getElementById("playPause");
const seek = document.getElementById("seek");
const timeDisplay = document.getElementById("timeDisplay");
const nowTitle = document.getElementById("nowTitle");
const nowDot = document.getElementById("nowDot");
const nowDotWrap = document.querySelector(".now-dot-wrap");

let tracks = [];
let currentIndex = -1;
let playCounted = false;
let siteConfig = {};
const likedTracks = new Set(JSON.parse(localStorage.getItem("likedTracks") || "[]"));
const toastEl = document.getElementById("toast");
const shareAlbumBtn = document.getElementById("shareAlbumBtn");
const playAllBtn = document.getElementById("playAllBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const shareNowBtn = document.getElementById("shareNowBtn");

// ---------- Comments state ----------
const commentsOverlay = document.getElementById("commentsOverlay");
const commentsList = document.getElementById("commentsList");
const commentsForm = document.getElementById("commentsForm");
const commentAuthorInput = document.getElementById("commentAuthor");
const commentTextInput = document.getElementById("commentText");
const commentsTrackTitle = document.getElementById("commentsTrackTitle");
const commentsClose = document.getElementById("commentsClose");
let activeCommentsTrack = null;
// { [commentId]: 'like' | 'love' } — one reaction per comment per browser
const commentReactions = JSON.parse(localStorage.getItem("commentReactions") || "{}");
commentAuthorInput.value = localStorage.getItem("commenterName") || "";

// If the URL is /t/123, that's the track this link was shared for.
const sharedTrackMatch = window.location.pathname.match(/^\/t\/(\d+)/);
const sharedTrackId = sharedTrackMatch ? Number(sharedTrackMatch[1]) : null;

function fmtTime(sec) {
  if (!isFinite(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

async function loadConfig() {
  const res = await fetch("/api/config");
  const cfg = await res.json();
  siteConfig = cfg;
  document.title = `${cfg.artistName} — ${cfg.albumTitle}`;
  document.getElementById("eyebrow").textContent = cfg.eyebrow || "";
  document.getElementById("artistName").textContent = cfg.artistName;
  document.getElementById("albumTitle").textContent = cfg.albumTitle;
  const taglineEl = document.getElementById("tagline");
  taglineEl.textContent = cfg.tagline || "";
  taglineEl.style.display = cfg.tagline ? "" : "none";
  const creditEl = document.getElementById("credit");
  creditEl.textContent = cfg.credit || "";
  if (cfg.credit && cfg.credit.includes("@")) {
    creditEl.href = `mailto:${cfg.credit}`;
  } else {
    creditEl.removeAttribute("href");
  }
  document.documentElement.style.setProperty("--accent", cfg.accentColor);
  document.documentElement.style.setProperty("--accent-deep", cfg.accentColorDeep);
  document.documentElement.style.setProperty("--accent-cool", cfg.accentColorCool);
  document.documentElement.style.setProperty("--bg", cfg.bgColor);
  document.documentElement.style.setProperty("--text", cfg.textColor);
  document.documentElement.style.setProperty("--ambient-image", `url(${cfg.ambientImage})`);
  document.getElementById("heroPhoto").style.backgroundImage = `url(${cfg.heroImage})`;
}

async function loadTracks() {
  const res = await fetch("/api/tracks");
  tracks = await res.json();
  renderTracklist();
}

function renderTracklist() {
  tracklistEl.innerHTML = "";
  // Part 1/Part 2 split evenly in half, whatever the total track count is
  // (the extra track goes to Part 1 if the total is odd). Recomputed every
  // render, so it stays correct as tracks are added or removed.
  const splitPoint = Math.ceil(tracks.length / 2);
  tracks.forEach((t, i) => {
    if (i === 0) tracklistEl.appendChild(buildDivider("Part 1"));
    if (i === splitPoint && splitPoint < tracks.length) tracklistEl.appendChild(buildDivider("Part 2"));

    const li = document.createElement("li");
    li.className = "track";
    li.dataset.index = i;
    li.dataset.trackId = t.id;

    const titleWrap = document.createElement("div");
    titleWrap.className = "track-title-wrap";
    const num = document.createElement("span");
    num.className = "track-num";
    num.textContent = String(i + 1).padStart(2, "0");
    const title = document.createElement("span");
    title.className = "track-title";
    title.textContent = t.title;
    titleWrap.append(num, title);

    const plays = document.createElement("span");
    plays.className = "track-plays";
    plays.textContent = t.plays;

    // Likes: heart icon + count combined into one clickable stat.
    const likeBtn = document.createElement("button");
    likeBtn.className = "stat-btn like-stat" + (likedTracks.has(t.id) ? " liked" : "");
    likeBtn.setAttribute("aria-label", "Like this track");
    likeBtn.title = "Like this track";
    const likeIcon = document.createElement("span");
    likeIcon.className = "stat-icon";
    likeIcon.textContent = "♥";
    const likeNum = document.createElement("span");
    likeNum.className = "stat-num";
    likeNum.textContent = t.likes;
    likeBtn.append(likeIcon, likeNum);
    likeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleLike(t.id, likeBtn, likeNum);
    });

    // Comments: speech-mark icon + count, opens the comments panel.
    const commentBtn = document.createElement("button");
    commentBtn.className = "stat-btn comment-stat";
    commentBtn.setAttribute("aria-label", "View comments");
    commentBtn.title = "View comments";
    const commentIcon = document.createElement("span");
    commentIcon.className = "stat-icon";
    commentIcon.textContent = "”";
    const commentNum = document.createElement("span");
    commentNum.className = "stat-num";
    commentNum.textContent = t.comments || 0;
    commentBtn.append(commentIcon, commentNum);
    commentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openComments(t);
    });

    // Share: plain text label, not an icon — avoids ambiguity.
    const shareBtn = document.createElement("button");
    shareBtn.className = "share-stat";
    shareBtn.textContent = "Share";
    shareBtn.setAttribute("aria-label", "Share this track");
    shareBtn.title = "Copy or share link to this track";
    shareBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      shareTrack(t);
    });

    li.append(titleWrap, plays, likeBtn, commentBtn, shareBtn);
    li.addEventListener("click", () => playTrack(i));
    tracklistEl.appendChild(li);
  });
}

function buildDivider(label) {
  const li = document.createElement("li");
  li.className = "tracklist-divider";
  li.textContent = label;
  return li;
}

function getTrackRow(trackId) {
  return tracklistEl.querySelector(`.track[data-track-id="${trackId}"]`);
}

async function toggleLike(id, btn, likesEl) {
  if (likedTracks.has(id)) return; // one like per browser, per track
  likedTracks.add(id);
  localStorage.setItem("likedTracks", JSON.stringify([...likedTracks]));
  btn.classList.add("liked");
  const res = await fetch(`/api/tracks/${id}/like`, { method: "POST" });
  const data = await res.json();
  likesEl.textContent = data.likes;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.remove("show"), 2000);
}

async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ title, url });
      return;
    } catch (err) {
      if (err && err.name === "AbortError") return; // user cancelled the share sheet
      // fall through to clipboard on any other failure
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied");
  } catch (err) {
    showToast(url);
  }
}

function shareTrack(t) {
  const url = `${window.location.origin}/t/${t.id}`;
  const title = `${t.title} — ${siteConfig.artistName || ""}`;
  shareLink(url, title);
}

function shareAlbum() {
  const url = window.location.origin + "/";
  const title = `${siteConfig.artistName || ""} — ${siteConfig.albumTitle || ""}`;
  shareLink(url, title);
}

shareAlbumBtn.addEventListener("click", shareAlbum);

playAllBtn.addEventListener("click", () => {
  if (!tracks.length) return;
  playTrack(0);
});

shuffleBtn.addEventListener("click", () => {
  if (!tracks.length) return;
  shuffleQueue = shuffleIndices(tracks.length);
  shuffleQueuePos = 0;
  shuffleBtn.classList.add("active");
  playTrack(shuffleQueue[0], true);
});
shareNowBtn.addEventListener("click", () => {
  if (currentIndex === -1) return;
  shareTrack(tracks[currentIndex]);
});

// ---------- Comments ----------
function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

async function openComments(track) {
  activeCommentsTrack = track;
  commentsTrackTitle.textContent = `Comments · ${track.title}`;
  commentsOverlay.classList.add("open");
  commentsList.innerHTML = "<p class=\"comments-empty\">Loading…</p>";
  await loadComments(track.id);
}

function closeComments() {
  commentsOverlay.classList.remove("open");
  activeCommentsTrack = null;
}

commentsClose.addEventListener("click", closeComments);
commentsOverlay.addEventListener("click", (e) => {
  if (e.target === commentsOverlay) closeComments();
});

async function loadComments(trackId) {
  const res = await fetch(`/api/tracks/${trackId}/comments`);
  const comments = await res.json();
  renderComments(comments);
}

function renderComments(comments) {
  commentsList.innerHTML = "";
  if (comments.length === 0) {
    commentsList.innerHTML = '<p class="comments-empty">No comments yet — be the first.</p>';
    return;
  }
  comments.forEach((c) => commentsList.appendChild(buildCommentEl(c)));
  commentsList.scrollTop = commentsList.scrollHeight;
}

function buildCommentEl(c) {
  const wrap = document.createElement("div");
  wrap.className = "comment" + (c.isArtist ? " comment-artist" : "");

  const meta = document.createElement("div");
  meta.className = "comment-meta";

  const author = document.createElement("span");
  author.className = "comment-author";
  author.textContent = c.author;
  meta.appendChild(author);

  if (c.isArtist) {
    const badge = document.createElement("span");
    badge.className = "artist-badge";
    badge.textContent = "ARTIST";
    meta.appendChild(badge);
  }

  const time = document.createElement("span");
  time.className = "comment-time";
  time.textContent = relativeTime(c.createdAt);
  meta.appendChild(time);

  const text = document.createElement("p");
  text.className = "comment-text";
  text.textContent = c.text;

  const reactions = document.createElement("div");
  reactions.className = "comment-reactions";

  const likeBtn = document.createElement("button");
  likeBtn.className = "reaction-btn like-reaction";
  likeBtn.textContent = "Like";

  const count = document.createElement("span");
  count.className = "reaction-count";
  count.textContent = (c.likes || 0) + (c.loves || 0);

  const loveBtn = document.createElement("button");
  loveBtn.className = "reaction-btn love-reaction";
  loveBtn.textContent = "Love";

  const existing = commentReactions[c.id];
  if (existing === "like") likeBtn.classList.add("active");
  if (existing === "love") loveBtn.classList.add("active");

  likeBtn.addEventListener("click", () => reactToComment(c.id, "like", likeBtn, loveBtn, count));
  loveBtn.addEventListener("click", () => reactToComment(c.id, "love", likeBtn, loveBtn, count));

  reactions.append(likeBtn, count, loveBtn);
  wrap.append(meta, text, reactions);
  return wrap;
}

async function reactToComment(id, kind, likeBtn, loveBtn, countEl) {
  if (commentReactions[id]) return; // one reaction per comment per browser
  commentReactions[id] = kind;
  localStorage.setItem("commentReactions", JSON.stringify(commentReactions));
  (kind === "like" ? likeBtn : loveBtn).classList.add("active");

  const res = await fetch(`/api/comments/${id}/${kind}`, { method: "POST" });
  const data = await res.json();
  countEl.textContent = (data.likes || 0) + (data.loves || 0);
}

commentsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!activeCommentsTrack) return;
  const author = commentAuthorInput.value.trim();
  const text = commentTextInput.value.trim();
  if (!text) return;

  localStorage.setItem("commenterName", author);
  const submitBtn = commentsForm.querySelector("button");
  submitBtn.disabled = true;

  try {
    const res = await fetch(`/api/tracks/${activeCommentsTrack.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author, text })
    });
    if (res.ok) {
      commentTextInput.value = "";
      await loadComments(activeCommentsTrack.id);
      // keep the tracklist's visible comment count in sync
      const t = tracks.find((tr) => tr.id === activeCommentsTrack.id);
      if (t) {
        t.comments = (t.comments || 0) + 1;
        const row = getTrackRow(t.id);
        if (row) row.querySelector(".comment-stat .stat-num").textContent = t.comments;
      }
    } else {
      showToast("Couldn't post — try again");
    }
  } finally {
    submitBtn.disabled = false;
  }
});

// If this page was opened via a /t/:id share link, select that track,
// scroll it into view, and prime it to play — browsers block autoplay
// without a user gesture, so we stop short of calling .play() here.
function jumpToSharedTrack() {
  if (sharedTrackId == null) return;
  const idx = tracks.findIndex((t) => t.id === sharedTrackId);
  if (idx === -1) return;

  currentIndex = idx;
  const t = tracks[idx];
  audio.src = `/api/stream/${t.id}`;
  nowTitle.textContent = t.title;
  updateActiveRow();

  const row = getTrackRow(t.id);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("shared-highlight");
    setTimeout(() => row.classList.remove("shared-highlight"), 1600);
  }
}

let shuffleQueue = null; // array of track indices, or null when not shuffling
let shuffleQueuePos = -1;

function shuffleIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function playTrack(i, fromShuffle) {
  if (!fromShuffle) {
    shuffleQueue = null;
    shuffleQueuePos = -1;
    shuffleBtn.classList.remove("active");
  }
  currentIndex = i;
  playCounted = false;
  const t = tracks[i];
  audio.src = `/api/stream/${t.id}`;
  audio.play();
  nowTitle.textContent = t.title;
  updateActiveRow();
  history.pushState({ trackId: t.id }, "", `/t/${t.id}`);
}

function updateActiveRow() {
  const activeId = currentIndex === -1 ? null : tracks[currentIndex]?.id;
  tracklistEl.querySelectorAll(".track").forEach((li) => {
    li.classList.toggle("active", Number(li.dataset.trackId) === activeId);
  });
}

playPauseBtn.addEventListener("click", () => {
  if (currentIndex === -1) {
    if (tracks.length) playTrack(0);
    return;
  }
  if (audio.paused) audio.play();
  else audio.pause();
});

audio.addEventListener("play", () => {
  playPauseBtn.innerHTML = "&#10074;&#10074;";
  nowDot.classList.add("playing");
  nowDotWrap.classList.add("active");
});
audio.addEventListener("pause", () => {
  playPauseBtn.innerHTML = "&#9658;";
  nowDot.classList.remove("playing");
  nowDotWrap.classList.remove("active");
});

audio.addEventListener("timeupdate", () => {
  if (!isFinite(audio.duration)) return;
  seek.value = (audio.currentTime / audio.duration) * 100;
  timeDisplay.textContent = `${fmtTime(audio.currentTime)} / ${fmtTime(audio.duration)}`;

  // Count a "play" once the listener is 15s in or halfway through, whichever is sooner —
  // avoids inflating counts from accidental clicks/skips.
  if (!playCounted && currentIndex !== -1) {
    const threshold = Math.min(15, audio.duration / 2);
    if (audio.currentTime >= threshold) {
      playCounted = true;
      const t = tracks[currentIndex];
      fetch(`/api/tracks/${t.id}/play`, { method: "POST" })
        .then((r) => r.json())
        .then((data) => {
          t.plays = data.plays;
          const row = getTrackRow(t.id);
          if (row) row.querySelector(".track-plays").textContent = data.plays;
        });
    }
  }
});

audio.addEventListener("ended", () => {
  if (shuffleQueue) {
    shuffleQueuePos += 1;
    if (shuffleQueuePos < shuffleQueue.length) {
      playTrack(shuffleQueue[shuffleQueuePos], true);
    } else {
      shuffleQueue = null;
      shuffleQueuePos = -1;
      shuffleBtn.classList.remove("active");
    }
    return;
  }
  if (currentIndex + 1 < tracks.length) playTrack(currentIndex + 1);
});

seek.addEventListener("input", () => {
  if (isFinite(audio.duration)) {
    audio.currentTime = (seek.value / 100) * audio.duration;
  }
});

(async function init() {
  await loadConfig();
  await loadTracks();
  jumpToSharedTrack();
})();
