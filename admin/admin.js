const trackBody = document.getElementById("trackBody");
const uploadForm = document.getElementById("uploadForm");
const uploadStatus = document.getElementById("uploadStatus");

let tracks = [];
let dragSrcId = null;

async function loadTracks() {
  const res = await fetch("/api/admin/tracks");
  tracks = (await res.json()).sort((a, b) => a.position - b.position);
  renderTable();
}

function renderTable() {
  trackBody.innerHTML = "";
  tracks.forEach((t, i) => {
    const tr = document.createElement("tr");
    tr.draggable = true;
    tr.dataset.id = t.id;

    tr.innerHTML = `
      <td class="drag-handle">&#8942;&#8942;</td>
      <td>${i + 1}</td>
      <td><input type="text" class="title-input" value="${escapeHtml(t.title)}" /></td>
      <td>${t.plays}</td>
      <td>${t.likes}</td>
      <td><input type="file" class="replace-file" accept=".mp3,audio/mpeg" /></td>
      <td><button class="delete-btn">Delete</button></td>
    `;

    const titleInput = tr.querySelector(".title-input");
    titleInput.addEventListener("change", () => renameTrack(t.id, titleInput.value));

    const replaceInput = tr.querySelector(".replace-file");
    replaceInput.addEventListener("change", () => {
      if (replaceInput.files[0]) replaceTrack(t.id, replaceInput.files[0]);
    });

    tr.querySelector(".delete-btn").addEventListener("click", () => deleteTrack(t.id, t.title));

    tr.addEventListener("dragstart", () => {
      dragSrcId = t.id;
      tr.classList.add("dragging");
    });
    tr.addEventListener("dragend", () => tr.classList.remove("dragging"));
    tr.addEventListener("dragover", (e) => e.preventDefault());
    tr.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSrcId === null || dragSrcId === t.id) return;
      reorderLocal(dragSrcId, t.id);
    });

    trackBody.appendChild(tr);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function renameTrack(id, title) {
  await fetch(`/api/admin/tracks/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
}

async function replaceTrack(id, file) {
  const fd = new FormData();
  fd.append("mp3", file);
  setStatus("Replacing file…");
  const res = await fetch(`/api/admin/tracks/${id}/replace`, { method: "PUT", body: fd });
  if (res.ok) setStatus("File replaced.", "success");
  else setStatus("Failed to replace file.", "error");
}

async function deleteTrack(id, title) {
  if (!confirm(`Delete "${title}"? This removes the MP3 permanently.`)) return;
  await fetch(`/api/admin/tracks/${id}`, { method: "DELETE" });
  await loadTracks();
}

async function reorderLocal(srcId, targetId) {
  const srcIdx = tracks.findIndex((t) => t.id === srcId);
  const targetIdx = tracks.findIndex((t) => t.id === targetId);
  const [moved] = tracks.splice(srcIdx, 1);
  tracks.splice(targetIdx, 0, moved);
  renderTable();
  await fetch("/api/admin/reorder", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderedIds: tracks.map((t) => t.id) })
  });
}

function setStatus(msg, type) {
  uploadStatus.textContent = msg;
  uploadStatus.className = "status" + (type ? " " + type : "");
}

uploadForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("uploadTitle").value;
  const file = document.getElementById("uploadFile").files[0];
  if (!file) return;

  const fd = new FormData();
  fd.append("title", title);
  fd.append("mp3", file);

  setStatus("Uploading…");
  const res = await fetch("/api/admin/tracks", { method: "POST", body: fd });
  if (res.ok) {
    setStatus("Uploaded.", "success");
    uploadForm.reset();
    await loadTracks();
  } else {
    const data = await res.json().catch(() => ({}));
    setStatus(data.error || "Upload failed.", "error");
  }
});

loadTracks();
loadArtistName();
loadAdminComments();

async function loadArtistName() {
  const res = await fetch("/api/config");
  const cfg = await res.json();
  document.getElementById("artistNameLabel").textContent = cfg.artistName;
}

async function loadAdminComments() {
  const res = await fetch("/api/admin/comments");
  const comments = await res.json();
  renderAdminComments(comments);
}

function renderAdminComments(comments) {
  const el = document.getElementById("adminCommentsList");
  el.innerHTML = "";
  if (comments.length === 0) {
    el.innerHTML = '<p class="no-comments">No comments yet.</p>';
    return;
  }
  comments.forEach((c) => el.appendChild(buildAdminCommentEl(c)));
}

function buildAdminCommentEl(c) {
  const div = document.createElement("div");
  div.className = "admin-comment" + (c.isArtist ? " is-artist" : "");

  const meta = document.createElement("div");
  meta.className = "admin-comment-meta";

  const author = document.createElement("span");
  author.className = "admin-comment-author";
  author.textContent = c.author;
  meta.appendChild(author);

  if (c.isArtist) {
    const badge = document.createElement("span");
    badge.className = "admin-comment-badge";
    badge.textContent = "ARTIST";
    meta.appendChild(badge);
  }

  const track = document.createElement("span");
  track.className = "admin-comment-track";
  track.textContent = `on "${c.trackTitle}"`;
  meta.appendChild(track);

  const time = document.createElement("span");
  time.textContent = new Date(c.createdAt).toLocaleString();
  meta.appendChild(time);

  const reactions = document.createElement("span");
  reactions.className = "admin-comment-reactions";
  reactions.textContent = `${c.likes || 0} like${c.likes === 1 ? "" : "s"} · ${c.loves || 0} love${c.loves === 1 ? "" : "s"}`;
  meta.appendChild(reactions);

  const text = document.createElement("p");
  text.className = "admin-comment-text";
  text.textContent = c.text;

  const actions = document.createElement("div");
  actions.className = "admin-comment-actions";

  const editBtn = document.createElement("button");
  editBtn.className = "reply-btn";
  editBtn.textContent = "Edit";

  const replyBtn = document.createElement("button");
  replyBtn.className = "reply-btn";
  replyBtn.textContent = "Reply as artist";

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "delete-btn";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", async () => {
    if (!confirm("Delete this comment?")) return;
    await fetch(`/api/admin/comments/${c.id}`, { method: "DELETE" });
    await loadAdminComments();
  });

  actions.append(editBtn, replyBtn, deleteBtn);

  const editFormWrap = document.createElement("div");
  editFormWrap.style.display = "none";

  editBtn.addEventListener("click", () => {
    if (editFormWrap.style.display !== "none") {
      editFormWrap.style.display = "none";
      return;
    }
    editFormWrap.style.display = "block";
    editFormWrap.innerHTML = "";
    const form = document.createElement("div");
    form.className = "reply-form";
    const textarea = document.createElement("textarea");
    textarea.value = c.text;
    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", async () => {
      const newText = textarea.value.trim();
      if (!newText) return;
      saveBtn.disabled = true;
      await fetch(`/api/admin/comments/${c.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newText })
      });
      await loadAdminComments();
    });
    form.append(textarea, saveBtn);
    editFormWrap.appendChild(form);
    textarea.focus();
  });

  const replyFormWrap = document.createElement("div");
  replyFormWrap.style.display = "none";

  replyBtn.addEventListener("click", () => {
    if (replyFormWrap.style.display === "none") {
      replyFormWrap.style.display = "block";
      replyFormWrap.innerHTML = "";
      const form = document.createElement("div");
      form.className = "reply-form";
      const textarea = document.createElement("textarea");
      textarea.placeholder = "Write a reply…";
      const sendBtn = document.createElement("button");
      sendBtn.textContent = "Send";
      sendBtn.addEventListener("click", async () => {
        const text = textarea.value.trim();
        if (!text) return;
        sendBtn.disabled = true;
        await fetch(`/api/admin/tracks/${c.trackId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });
        await loadAdminComments();
      });
      form.append(textarea, sendBtn);
      replyFormWrap.appendChild(form);
    } else {
      replyFormWrap.style.display = "none";
    }
  });

  div.append(meta, text, actions, editFormWrap, replyFormWrap);
  return div;
}
