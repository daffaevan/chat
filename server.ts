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
    storageBucket: firebaseConfig.storageBucket,
  });
}
const authAdmin = admin.auth();
const bucket = admin.storage().bucket();

const PORT = 3000;

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
api.get("/health", (req, res) => res.json({ status: "online" }));

api.get("/admin/list-stickers", authenticate, async (req: any, res) => {
  try {
    const [files] = await bucket.getFiles({ prefix: "uploads/stickers/" });
    const urls = files.map(file => `https://storage.googleapis.com/${bucket.name}/${file.name}`);
    res.json(urls);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

api.post("/upload", authenticate, upload.single("file"), async (req: any, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const type = req.body.type || "images";
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}${path.extname(req.file.originalname) || '.png'}`;
    
    const filePath = `uploads/${type}/${filename}`;
    const file = bucket.file(filePath);
    
    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
      public: true,
    });

    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    res.json({ url });
  } catch (err: any) {
    console.error("[API/upload] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

api.post("/users/profile", authenticate, async (req: any, res) => {
  try {
    const { displayName, photoData } = req.body;
    let photoURL = null;
    
    // Get existing user to not overwrite photoURL with null if only changing name
    const existingUser = await authAdmin.getUser(req.user.uid);
    photoURL = existingUser.photoURL || null;

    if (photoData && photoData.startsWith('data:')) {
      const filename = `avatar_${Date.now()}_${req.user.uid}.png`;
      const base64Data = photoData.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      
      const filePath = `uploads/avatars/${filename}`;
      const file = bucket.file(filePath);
      
      await file.save(buffer, {
        metadata: { contentType: "image/png" },
        public: true,
      });
      
      photoURL = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    }

    const updatePayload: any = {};
    if (displayName) updatePayload.displayName = displayName;
    if (photoURL) updatePayload.photoURL = photoURL;

    if (Object.keys(updatePayload).length > 0) {
      await authAdmin.updateUser(req.user.uid, updatePayload);
    }
    
    res.json({ displayName: displayName || existingUser.displayName, photoURL });
  } catch (err: any) {
    console.error("[API/profile] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

api.all("*", (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.url}` });
});

app.use("/api", api);

// Static / Vite
const isProduction = process.env.NODE_ENV === "production";
const isVercel = process.env.VERCEL === "1";

async function start() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, host: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!isVercel) {
    // Standard production node environment (non-serverless)
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  // Only listen on a port if we're not in a Vercel serverless function
  if (!isVercel) {
    httpServer.listen(PORT, "0.0.0.0", () => {
      console.log(`[SYSTEM] Server running on 0.0.0.0:${PORT}`);
    });
  }
}

start().catch(console.error);

export default app;
