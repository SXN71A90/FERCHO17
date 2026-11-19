const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const VIDEOS_FILE = path.join(DATA_DIR, "videos.json");
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json");
const LIKES_FILE = path.join(DATA_DIR, "likes.json");

for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
for (const file of [USERS_FILE, VIDEOS_FILE, COMMENTS_FILE, LIKES_FILE]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, "[]", "utf8");
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return []; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}
function safeUser(user) {
  return { id: user.id, username: user.username, createdAt: user.createdAt };
}
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Inicia sesión para continuar." });
  next();
}

app.use(express.json({ limit: "1mb" }));
app.use(session({
  name: "lfc.sid",
  secret: process.env.SESSION_SECRET || "cambia-esta-clave-en-produccion-LFC-2026",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));
app.use(express.static(path.join(ROOT, "public")));
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = readJson(USERS_FILE).find(u => u.id === req.session.userId);
  res.json({ user: user ? safeUser(user) : null });
});

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "El usuario debe tener 3-20 caracteres: letras, números o _." });
  }
  if (password.length < 8) return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
  const users = readJson(USERS_FILE);
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(409).json({ error: "Ese nombre de usuario ya está ocupado." });
  }
  const user = {
    id: crypto.randomUUID(),
    username,
    passwordHash: await bcrypt.hash(password, 12),
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeJson(USERS_FILE, users);
  req.session.userId = user.id;
  res.status(201).json({ user: safeUser(user) });
});

app.post("/api/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = readJson(USERS_FILE).find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  req.session.userId = user.id;
  res.json({ user: safeUser(user) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lfc.sid");
    res.json({ ok: true });
  });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(new Error("Formato no compatible. Usa MP4, WebM, OGG o MOV."));
  }
});

app.get("/api/videos", (req, res) => {
  const users = readJson(USERS_FILE);
  const allVideos = readJson(VIDEOS_FILE);
  const allComments = readJson(COMMENTS_FILE);
  const allLikes = readJson(LIKES_FILE);
  const videos = allVideos
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(v => {
      const videoLikes = allLikes.filter(l => l.videoId === v.id);
      return {
        ...v,
        username: users.find(u => u.id === v.userId)?.username || "Usuario",
        views: Number(v.views || 0),
        likesCount: videoLikes.length,
        likedByMe: !!req.session.userId && videoLikes.some(l => l.userId === req.session.userId),
        commentsCount: allComments.filter(c => c.videoId === v.id).length
      };
    });
  res.json({ videos });
});

app.post("/api/videos", requireAuth, upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Selecciona un archivo de video." });
  const title = String(req.body.title || "").trim().slice(0, 90);
  const description = String(req.body.description || "").trim().slice(0, 500);
  if (!title) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: "Escribe un título para el video." });
  }
  const video = {
    id: crypto.randomUUID(),
    userId: req.session.userId,
    title,
    description,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`,
    originalName: req.file.originalname,
    size: req.file.size,
    views: 0,
    createdAt: new Date().toISOString()
  };
  const videos = readJson(VIDEOS_FILE);
  videos.push(video);
  writeJson(VIDEOS_FILE, videos);
  const user = readJson(USERS_FILE).find(u => u.id === req.session.userId);
  res.status(201).json({ video: { ...video, username: user.username } });
});

// Suma una vista al reproducir/abrir un video. Se cuenta una vez por sesión y video.
app.post("/api/videos/:id/view", (req, res) => {
  const videos = readJson(VIDEOS_FILE);
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Video no encontrado." });
  if (!Array.isArray(req.session.viewedVideos)) req.session.viewedVideos = [];
  if (!req.session.viewedVideos.includes(video.id)) {
    video.views = Number(video.views || 0) + 1;
    req.session.viewedVideos.push(video.id);
    writeJson(VIDEOS_FILE, videos);
  }
  res.json({ views: Number(video.views || 0) });
});

// Un usuario registrado puede dar o quitar su like.
app.post("/api/videos/:id/like", requireAuth, (req, res) => {
  const videos = readJson(VIDEOS_FILE);
  if (!videos.some(v => v.id === req.params.id)) {
    return res.status(404).json({ error: "Video no encontrado." });
  }
  const likes = readJson(LIKES_FILE);
  const existing = likes.findIndex(l => l.videoId === req.params.id && l.userId === req.session.userId);
  let liked;
  if (existing >= 0) {
    likes.splice(existing, 1);
    liked = false;
  } else {
    likes.push({ videoId: req.params.id, userId: req.session.userId, createdAt: new Date().toISOString() });
    liked = true;
  }
  writeJson(LIKES_FILE, likes);
  res.json({ liked, likesCount: likes.filter(l => l.videoId === req.params.id).length });
});

// Comentarios: lectura pública y publicación solo para usuarios registrados.
app.get("/api/videos/:id/comments", (req, res) => {
  const videos = readJson(VIDEOS_FILE);
  if (!videos.some(v => v.id === req.params.id)) {
    return res.status(404).json({ error: "Video no encontrado." });
  }
  const users = readJson(USERS_FILE);
  const comments = readJson(COMMENTS_FILE)
    .filter(c => c.videoId === req.params.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map(c => ({
      id: c.id,
      text: c.text,
      createdAt: c.createdAt,
      username: users.find(u => u.id === c.userId)?.username || "Usuario"
    }));
  res.json({ comments });
});

app.post("/api/videos/:id/comments", requireAuth, (req, res) => {
  const videos = readJson(VIDEOS_FILE);
  if (!videos.some(v => v.id === req.params.id)) {
    return res.status(404).json({ error: "Video no encontrado." });
  }
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Escribe un comentario." });
  if (text.length > 500) return res.status(400).json({ error: "El comentario no puede superar 500 caracteres." });
  const comments = readJson(COMMENTS_FILE);
  const comment = {
    id: crypto.randomUUID(),
    videoId: req.params.id,
    userId: req.session.userId,
    text,
    createdAt: new Date().toISOString()
  };
  comments.push(comment);
  writeJson(COMMENTS_FILE, comments);
  const user = readJson(USERS_FILE).find(u => u.id === req.session.userId);
  res.status(201).json({
    comment: { id: comment.id, text: comment.text, createdAt: comment.createdAt, username: user?.username || "Usuario" },
    commentsCount: comments.filter(c => c.videoId === req.params.id).length
  });
});

app.delete("/api/videos/:id", requireAuth, (req, res) => {
  const videos = readJson(VIDEOS_FILE);
  const video = videos.find(v => v.id === req.params.id);
  if (!video) return res.status(404).json({ error: "Video no encontrado." });
  if (video.userId !== req.session.userId) return res.status(403).json({ error: "Solo puedes eliminar tus propios videos." });
  const filePath = path.join(UPLOAD_DIR, path.basename(video.filename));
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  writeJson(VIDEOS_FILE, videos.filter(v => v.id !== video.id));
  res.json({ ok: true });
});

app.use((err, _req, res, _next) => {
  const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
    ? "El archivo supera el límite de 500 MB."
    : (err.message || "Ocurrió un error.");
  res.status(400).json({ error: message });
});

app.listen(PORT, () => console.log(`LFC está funcionando en http://localhost:${PORT}`));
