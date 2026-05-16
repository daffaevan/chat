import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import admin from "firebase-admin";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import dotenv from "dotenv";
import firebaseConfig from "./firebase-applet-config.json";

dotenv.config();

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}
const authAdmin = admin.auth();

const PORT = 3000;
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// Ensure directories
["avatars", "audio", "images", "stickers"].forEach(sub => {
  const p = path.join(UPLOADS_DIR, sub);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

const app = express();
app.use((req, res, next) => {
  console.log(`[REQUEST] ${req.method} ${req.url}`);
  next();
});
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on("connection", (socket) => {
  socket.on("join", (uid) => socket.join("global"));
  socket.on("typing", (data) => io.to("global").emit("userTyping", data));
});

// Multer (Memory for robustness, then write to disk)
const upload = multer({ storage: multer.memoryStorage() });

// Auth Middleware
const authenticate = async (req: any, res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
    const idToken = authHeader.split(" ")[1];
    const decodedToken = await authAdmin.verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// --- API Router ---
const api = express.Router();

api.get("/ping", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

api.get("/admin/list-stickers", authenticate, (req: any, res) => {
  try {
    const stickersPath = path.join(UPLOADS_DIR, "stickers");
    if (!fs.existsSync(stickersPath)) return res.json([]);
    const files = fs.readdirSync(stickersPath);
    const urls = files.filter(f => !f.startsWith(".")).map(f => `/uploads/stickers/${f}`);
    res.json(urls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.post("/upload", authenticate, upload.single("file"), (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const type = req.body.type || "images";
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(req.file.originalname) || '.png'}`;
    
    const typeDir = path.join(UPLOADS_DIR, type);
    if (!fs.existsSync(typeDir)) fs.mkdirSync(typeDir, { recursive: true });
    
    fs.writeFileSync(path.join(typeDir, filename), req.file.buffer);
    res.json({ url: `/uploads/${type}/${filename}` });
  } catch (err: any) {
    console.error("[API/upload] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

api.post("/users/profile", authenticate, async (req: any, res) => {
  try {
    const { displayName, photoData } = req.body;
    let photoURL = null;
    if (photoData && photoData.startsWith('data:')) {
      const filename = `avatar_${Date.now()}_${req.user.uid}.png`;
      const avatarsDir = path.join(UPLOADS_DIR, "avatars");
      if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(path.join(avatarsDir, filename), base64Data, "base64");
      photoURL = `/uploads/avatars/${filename}`;
    }
    if (displayName) {
      await authAdmin.updateUser(req.user.uid, { displayName });
    }
    res.json({ displayName, photoURL });
  } catch (err: any) {
    console.error("[API/profile] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

api.all("*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

app.use("/api", api);
app.use("/uploads", express.static(UPLOADS_DIR));

// Static / Vite
const isProduction = process.env.NODE_ENV === "production";

async function start() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, host: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`[SYSTEM] Server running on 0.0.0.0:${PORT}`);
  });
}

start().catch(console.error);

export default app;
