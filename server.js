require("dotenv").config();
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const supabase = require("./supabase");

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

app.get("/api/me", async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, created_at")
      .eq("id", req.session.userId)
      .maybeSingle();
    if (error) throw error;
    if (!user) return res.json({ user: null });
    res.json({ user: { id: user.id, username: user.username, createdAt: user.created_at } });
  } catch (error) {
    console.error("Error consultando sesión:", error.message);
    res.status(500).json({ error: "No se pudo consultar la sesión." });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({ error: "El usuario debe tener 3-20 caracteres: letras, números o _." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres." });
    }

    const { data: existing, error: searchError } = await supabase
      .from("users")
      .select("id")
      .ilike("username", username)
      .limit(1);
    if (searchError) throw searchError;
    if (existing.length > 0) {
      return res.status(409).json({ error: "Ese nombre de usuario ya está ocupado." });
    }

    const { data: user, error } = await supabase
      .from("users")
      .insert({
        id: crypto.randomUUID(),
        username,
        password_hash: await bcrypt.hash(password, 12)
      })
      .select("id, username, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "Ese nombre de usuario ya está ocupado." });
      }
      throw error;
    }

    req.session.userId = user.id;
    res.status(201).json({
      user: { id: user.id, username: user.username, createdAt: user.created_at }
    });
  } catch (error) {
    console.error("Error de registro:", error.message);
    res.status(500).json({ error: "No se pudo registrar el usuario." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");
    if (!username || !password) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    const { data: user, error } = await supabase
      .from("users")
      .select("id, username, password_hash, created_at")
      .ilike("username", username)
      .maybeSingle();
    if (error) throw error;
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }
    req.session.regenerate((sessionError) => {
      if (sessionError) {
        console.error("Error creando sesión:", sessionError.message);
        return res.status(500).json({ error: "No se pudo iniciar sesión." });
      }
      req.session.userId = user.id;
      req.session.save((saveError) => {
        if (saveError) {
          console.error("Error guardando sesión:", saveError.message);
          return res.status(500).json({ error: "No se pudo iniciar sesión." });
        }
        res.json({ user: { id: user.id, username: user.username, createdAt: user.created_at } });
      });
    });
  } catch (error) {
    console.error("Error de inicio de sesión:", error.message);
    res.status(500).json({ error: "No se pudo iniciar sesión." });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lfc.sid");
    res.json({ ok: true });
  });
});

// Los archivos se suben directamente a Supabase Storage, sin guardarlos en el disco.
const BUCKET = "lfc-videos";
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["video/mp4", "video/webm", "video/ogg", "video/quicktime"]);
    cb(allowed.has(file.mimetype) ? null : new Error("Formato no compatible. Usa MP4, WebM, OGG o MOV."), allowed.has(file.mimetype));
  }
});

function dbError(res, label, error) {
  console.error(label, error);
  return res.status(500).json({ error: "No se pudo completar la operación. Inténtalo nuevamente." });
}

function formatVideo(v, users, comments, likes, currentUserId, url) {
  const videoLikes = likes.filter(l => l.video_id === v.id);
  return {
    id: v.id, userId: v.user_id, title: v.title,
    description: v.description || "", filename: v.filename,
    originalName: v.original_name, size: Number(v.size || 0),
    views: Number(v.views || 0), createdAt: v.created_at,
    url,
    username: users.find(u => u.id === v.user_id)?.username || "Usuario",
    likesCount: videoLikes.length,
    likedByMe: !!currentUserId && videoLikes.some(l => l.user_id === currentUserId),
    commentsCount: comments.filter(c => c.video_id === v.id).length
  };
}

app.get("/api/videos", async (req, res) => {
  try {
    const [vr, ur, cr, lr] = await Promise.all([
      supabase.from("videos").select("*").order("created_at", { ascending: false }),
      supabase.from("users").select("id, username"),
      supabase.from("comments").select("video_id"),
      supabase.from("likes").select("video_id, user_id")
    ]);
    for (const r of [vr, ur, cr, lr]) if (r.error) throw r.error;
    const videos = await Promise.all(vr.data.map(async v => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(v.filename, 3600);
      if (error) console.error("No se pudo generar URL del video:", v.id, error.message);
      return formatVideo(v, ur.data, cr.data, lr.data, req.session.userId, data?.signedUrl || null);
    }));
    res.json({ videos });
  } catch (error) { dbError(res, "Error listando videos:", error); }
});

app.post("/api/videos", requireAuth, upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Selecciona un archivo de video." });
  const title = String(req.body.title || "").trim().slice(0, 90);
  const description = String(req.body.description || "").trim().slice(0, 500);
  if (!title) return res.status(400).json({ error: "Escribe un título para el video." });
  const ext = ({ "video/mp4": ".mp4", "video/webm": ".webm", "video/ogg": ".ogg", "video/quicktime": ".mov" })[req.file.mimetype];
  const filename = `${crypto.randomUUID()}${ext}`;
  try {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filename, req.file.buffer, {
      contentType: req.file.mimetype, upsert: false
    });
    if (uploadError) throw uploadError;
    const { data: video, error } = await supabase.from("videos").insert({
      id: crypto.randomUUID(), user_id: req.session.userId,
      title, description, filename, original_name: req.file.originalname,
      size: req.file.size, views: 0
    }).select("*").single();
    if (error) {
      await supabase.storage.from(BUCKET).remove([filename]);
      throw error;
    }
    const { data: user, error: userError } = await supabase.from("users").select("username").eq("id", req.session.userId).single();
    if (userError) throw userError;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(filename, 3600);
    res.status(201).json({ video: formatVideo(video, [{ id: req.session.userId, username: user.username }], [], [], req.session.userId, signed?.signedUrl || null) });
  } catch (error) { dbError(res, "Error subiendo video:", error); }
});

app.post("/api/videos/:id/view", async (req, res) => {
  try {
    const { data: video, error } = await supabase.from("videos").select("id, views").eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!video) return res.status(404).json({ error: "Video no encontrado." });
    let views = Number(video.views || 0);
    if (!Array.isArray(req.session.viewedVideos)) req.session.viewedVideos = [];
    if (!req.session.viewedVideos.includes(video.id)) {
      views++;
      const { error: updateError } = await supabase.from("videos").update({ views }).eq("id", video.id);
      if (updateError) throw updateError;
      req.session.viewedVideos.push(video.id);
    }
    res.json({ views });
  } catch (error) { dbError(res, "Error contando vista:", error); }
});

app.post("/api/videos/:id/like", requireAuth, async (req, res) => {
  try {
    const { data: video, error: ve } = await supabase.from("videos").select("id").eq("id", req.params.id).maybeSingle();
    if (ve) throw ve;
    if (!video) return res.status(404).json({ error: "Video no encontrado." });
    const query = supabase.from("likes");
    const { data: existing, error: ee } = await query.select("id").eq("video_id", video.id).eq("user_id", req.session.userId).maybeSingle();
    if (ee) throw ee;
    const liked = !existing;
    const result = existing
      ? await supabase.from("likes").delete().eq("id", existing.id)
      : await supabase.from("likes").insert({ id: crypto.randomUUID(), video_id: video.id, user_id: req.session.userId });
    if (result.error) throw result.error;
    const { count, error: ce } = await supabase.from("likes").select("id", { count: "exact", head: true }).eq("video_id", video.id);
    if (ce) throw ce;
    res.json({ liked, likesCount: count });
  } catch (error) { dbError(res, "Error guardando like:", error); }
});

app.get("/api/videos/:id/comments", async (req, res) => {
  try {
    const { data: video, error: ve } = await supabase.from("videos").select("id").eq("id", req.params.id).maybeSingle();
    if (ve) throw ve;
    if (!video) return res.status(404).json({ error: "Video no encontrado." });
    const [cr, ur] = await Promise.all([
      supabase.from("comments").select("*").eq("video_id", video.id).order("created_at", { ascending: true }),
      supabase.from("users").select("id, username")
    ]);
    if (cr.error) throw cr.error;
    if (ur.error) throw ur.error;
    res.json({ comments: cr.data.map(c => ({
      id: c.id, text: c.text, createdAt: c.created_at,
      username: ur.data.find(u => u.id === c.user_id)?.username || "Usuario"
    })) });
  } catch (error) { dbError(res, "Error listando comentarios:", error); }
});

app.post("/api/videos/:id/comments", requireAuth, async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "Escribe un comentario." });
  if (text.length > 500) return res.status(400).json({ error: "El comentario no puede superar 500 caracteres." });
  try {
    const { data: video, error: ve } = await supabase.from("videos").select("id").eq("id", req.params.id).maybeSingle();
    if (ve) throw ve;
    if (!video) return res.status(404).json({ error: "Video no encontrado." });
    const { data: comment, error } = await supabase.from("comments").insert({
      id: crypto.randomUUID(), video_id: video.id, user_id: req.session.userId, text
    }).select("*").single();
    if (error) throw error;
    const [ur, cr] = await Promise.all([
      supabase.from("users").select("username").eq("id", req.session.userId).single(),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("video_id", video.id)
    ]);
    if (ur.error) throw ur.error;
    if (cr.error) throw cr.error;
    res.status(201).json({
      comment: { id: comment.id, text: comment.text, createdAt: comment.created_at, username: ur.data.username },
      commentsCount: cr.count
    });
  } catch (error) { dbError(res, "Error creando comentario:", error); }
});

app.delete("/api/videos/:id", requireAuth, async (req, res) => {
  try {
    const { data: video, error } = await supabase.from("videos").select("id, user_id, filename").eq("id", req.params.id).maybeSingle();
    if (error) throw error;
    if (!video) return res.status(404).json({ error: "Video no encontrado." });
    if (video.user_id !== req.session.userId) return res.status(403).json({ error: "Solo puedes eliminar tus propios videos." });
    // Primero se elimina el objeto. Si falla, se conserva el registro para poder reintentar.
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([video.filename]);
    if (storageError) throw storageError;
    for (const table of ["likes", "comments"]) {
      const { error: childError } = await supabase.from(table).delete().eq("video_id", video.id);
      if (childError) throw childError;
    }
    const { error: deleteError } = await supabase.from("videos").delete().eq("id", video.id);
    if (deleteError) throw deleteError;
    res.json({ ok: true });
  } catch (error) { dbError(res, "Error eliminando video:", error); }
});

app.use((err, _req, res, _next) => {
  const message = err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
    ? "El archivo supera el límite de 50 MB."
    : (err.message || "Ocurrió un error.");
  res.status(400).json({ error: message });
});

app.listen(PORT, () => console.log(`LFC está funcionando en http://localhost:${PORT}`));
