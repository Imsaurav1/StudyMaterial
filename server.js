/*********************************
 * IMPORTS
 *********************************/
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const slugify = require("slugify");
require("dotenv").config();

const app = express();

/* ================================
   ENVIRONMENT VALIDATION
   Fail fast if required env vars are missing
================================ */
const REQUIRED_ENV = ["MONGODB_URI", "JWT_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

/* ================================
   CORS CONFIGURATION
================================ */
const allowedOrigins = [
  "https://www.saurabhjha.co.in",
  "https://saurabhjha.co.in",
  "https://www.saurabhjha.live",
  "https://saurabhjha.live"
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());
app.use(express.json({ limit: "2mb" })); // Prevent oversized payloads

/* ================================
   MONGODB CONNECTION
================================ */
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => {
    console.error("❌ MongoDB Connection Failed:", err.message);
    process.exit(1);
  });

mongoose.connection.on("disconnected", () =>
  console.warn("⚠️ MongoDB disconnected")
);
mongoose.connection.on("reconnected", () =>
  console.log("✅ MongoDB reconnected")
);

/* ================================
   SCHEMAS & MODELS
================================ */
const PracticeMaterialSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  date:        { type: String, trim: true },
  category:    { type: String, default: "Practice Material", trim: true },
  type:        { type: String, default: "PDF Download", trim: true },
  description: { type: String, trim: true },
  pdfUrl:      { type: String, trim: true },
  imageUrl:    { type: String, trim: true },
  downloads:   { type: Number, default: 0, min: 0 } // ✅ NEW: download counter
}, { timestamps: true });

const PracticeMaterial = mongoose.model("PracticeMaterial", PracticeMaterialSchema);

const PostSchema = new mongoose.Schema({
  title:         { type: String, required: true, trim: true },
  slug:          { type: String, unique: true, required: true, trim: true },
  content:       { type: String, required: true },
  excerpt:       { type: String, trim: true },
  featuredImage: { type: String, trim: true },
  status: {
    type:    String,
    enum:    ["draft", "published"],
    default: "published"
  },
  author: {
    type:    String,
    default: "Saurabh Kumar Jha",
    trim:    true
  },
  views: { type: Number, default: 0, min: 0 },
  tags:  { type: [String], default: [] }
}, { timestamps: true });

// Index for faster slug lookups
PostSchema.index({ slug: 1 });
PostSchema.index({ status: 1, createdAt: -1 });

const Post = mongoose.model("Post", PostSchema);

/* ================================
   VIEW LOG SCHEMA
   Tracks which IPs have viewed which slugs.
   TTL index auto-deletes entries after 24h so
   the same IP can increment the counter again the next day.
================================ */
const ViewLogSchema = new mongoose.Schema({
  slug: { type: String, required: true },
  ip:   { type: String, required: true },
  viewedAt: { type: Date, default: Date.now, expires: 86400 } // 86400s = 24 hours
});

// Compound unique index: one record per IP+slug combo within the 24h window
ViewLogSchema.index({ slug: 1, ip: 1 }, { unique: true });

const ViewLog = mongoose.model("ViewLog", ViewLogSchema);

/* ================================
   PRE-HASH ADMIN PASSWORD AT STARTUP
   Fix: original code re-hashed on every login request,
   making bcrypt.compare always return false (new hash != stored)
================================ */
let hashedAdminPassword = null;

(async () => {
  try {
    hashedAdminPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    console.log("✅ Admin password hashed");
  } catch (err) {
    console.error("❌ Failed to hash admin password:", err.message);
    process.exit(1);
  }
})();

/* ================================
   UTILITY HELPERS
================================ */

/**
 * Wraps an async route handler and forwards errors to Express error middleware.
 * Eliminates repetitive try/catch in every route.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Validate MongoDB ObjectId to avoid CastError on malformed IDs.
 */
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/**
 * Extract the real client IP from the request.
 * Works correctly behind Render, Vercel, Cloudflare, and other proxies.
 */
function getClientIP(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

/* ================================
   ADMIN AUTH MIDDLEWARE
================================ */
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Insufficient privileges" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError"
      ? "Token expired, please log in again"
      : "Invalid token";
    return res.status(401).json({ message });
  }
}

/* ================================
   ROUTES – ADMIN AUTH
================================ */
app.post("/api/admin/login", asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  // Constant-time email comparison to avoid timing attacks
  const emailMatch = email === process.env.ADMIN_EMAIL;

  // Always run bcrypt compare even on wrong email to prevent timing-based user enumeration
  const isValid = await bcrypt.compare(
    password,
    hashedAdminPassword || "$2a$12$invalidhashtopreventtimingattack"
  );

  if (!emailMatch || !isValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { role: "admin", email },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ token });
}));

/* ================================
   ROUTES – PRACTICE MATERIALS (PUBLIC)
================================ */
app.get("/api/materials", asyncHandler(async (req, res) => {
  const data = await PracticeMaterial.find().sort({ createdAt: -1 }).lean();
  res.json(data);
}));

/* ================================
   ROUTE – INCREMENT DOWNLOAD COUNT
   Every time a user clicks "Download PDF", the frontend
   calls this route. No deduplication — every click counts
   as one download (mirrors how most download trackers work).
================================ */
app.post("/api/materials/:id/download", asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid material ID" });
  }

  const material = await PracticeMaterial.findByIdAndUpdate(
    req.params.id,
    { $inc: { downloads: 1 } },
    { new: true, select: "downloads" }
  );

  if (!material) {
    return res.status(404).json({ message: "Material not found" });
  }

  res.json({ success: true, downloads: material.downloads });
}));

/* ================================
   ROUTES – PRACTICE MATERIALS (ADMIN)
================================ */
app.post("/api/materials", adminAuth, asyncHandler(async (req, res) => {
  const { title, date, category, type, description, pdfUrl, imageUrl } = req.body;

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  const material = await PracticeMaterial.create({
    title, date, category, type, description, pdfUrl, imageUrl
  });

  res.status(201).json(material);
}));

app.put("/api/materials/:id", adminAuth, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid material ID" });
  }

  const updated = await PracticeMaterial.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!updated) {
    return res.status(404).json({ message: "Material not found" });
  }

  res.json(updated);
}));

app.delete("/api/materials/:id", adminAuth, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid material ID" });
  }

  const deleted = await PracticeMaterial.findByIdAndDelete(req.params.id);

  if (!deleted) {
    return res.status(404).json({ message: "Material not found" });
  }

  res.json({ message: "Deleted successfully" });
}));

/* ================================
   ROUTES – POSTS (PUBLIC)
================================ */

// Get all published posts (with pagination)
app.get("/api/posts", asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
  const skip  = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    Post.find({ status: "published" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-content") // Omit heavy content in list view
      .lean(),
    Post.countDocuments({ status: "published" })
  ]);

  res.json({
    posts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// Get single published post by slug
app.get("/api/posts/:slug", asyncHandler(async (req, res) => {
  const post = await Post.findOne({
    slug:   req.params.slug,
    status: "published"
  }).lean();

  if (!post) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json(post);
}));

/* ================================
   ROUTE – INCREMENT VIEW COUNT
   Uses server-side IP + slug deduplication via ViewLog.
   - Same IP cannot increment the same post more than once per 24 hours.
   - TTL index on ViewLog auto-expires records after 24h.
   - Works correctly behind Render/Vercel proxies via x-forwarded-for.
   - `counted: true`  → new view, counter was incremented
   - `counted: false` → duplicate within 24h, counter unchanged
================================ */
app.post("/api/posts/:slug/view", asyncHandler(async (req, res) => {
  const slug = req.params.slug;
  const ip   = getClientIP(req);

  try {
    // Try to insert a new ViewLog record for this IP+slug combo.
    // If it already exists (duplicate key), Mongoose throws error code 11000.
    await ViewLog.create({ slug, ip });

    // Only reaches here on a genuinely new view — now increment the counter.
    const post = await Post.findOneAndUpdate(
      { slug, status: "published" },
      { $inc: { views: 1 } },
      { new: true, select: "views" }
    );

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    return res.json({ success: true, views: post.views, counted: true });

  } catch (err) {
    if (err.code === 11000) {
      // Duplicate key — this IP already viewed this slug within 24h.
      // Return current view count without incrementing.
      const post = await Post.findOne(
        { slug, status: "published" },
        { views: 1 }
      ).lean();

      return res.json({
        success: true,
        views:   post?.views ?? 0,
        counted: false  // tells the frontend it was a duplicate
      });
    }

    // Any other error — re-throw so the global handler catches it
    throw err;
  }
}));

/* ================================
   ROUTES – POSTS (ADMIN)
================================ */
app.post("/api/posts", adminAuth, asyncHandler(async (req, res) => {
  const { title, content, excerpt, featuredImage, status, tags } = req.body;

  if (!title || !content) {
    return res.status(400).json({ message: "Title and content are required" });
  }

  let slug = slugify(title, { lower: true, strict: true });

  // Handle duplicate slugs by appending a counter suffix
  let suffix = 0;
  let uniqueSlug = slug;
  while (await Post.exists({ slug: uniqueSlug })) {
    suffix++;
    uniqueSlug = `${slug}-${suffix}`;
  }

  const post = await Post.create({
    title,
    slug: uniqueSlug,
    content,
    excerpt,
    featuredImage,
    status: status || "published",
    tags: Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean) : [],
    views: 0
  });

  res.status(201).json({ message: "Post created successfully", post });
}));

// Get all posts (admin — includes drafts)
app.get("/api/admin/posts", adminAuth, asyncHandler(async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const skip  = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-content")
      .lean(),
    Post.countDocuments()
  ]);

  res.json({ posts, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
}));

app.put("/api/posts/:id", adminAuth, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid post ID" });
  }

  // Prevent overwriting slug or views accidentally
  const { slug: _ignoredSlug, views: _ignoredViews, ...safeBody } = req.body;

  const updated = await Post.findByIdAndUpdate(
    req.params.id,
    safeBody,
    { new: true, runValidators: true }
  );

  if (!updated) {
    return res.status(404).json({ message: "Post not found" });
  }

  res.json(updated);
}));

app.delete("/api/posts/:id", adminAuth, asyncHandler(async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid post ID" });
  }

  const deleted = await Post.findByIdAndDelete(req.params.id);

  if (!deleted) {
    return res.status(404).json({ message: "Post not found" });
  }

  // Clean up all ViewLog records for this post's slug too
  await ViewLog.deleteMany({ slug: deleted.slug });

  res.json({ message: "Post deleted successfully" });
}));

/* ================================
   404 HANDLER
================================ */
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

/* ================================
   GLOBAL ERROR HANDLER
================================ */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(`❌ [${new Date().toISOString()}] ${req.method} ${req.path}:`, err);

  // Mongoose validation error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({ message: "Validation error", errors: messages });
  }

  // Mongoose duplicate key error (outside of the view route)
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({ message: `Duplicate value for: ${field}` });
  }

  // CORS error
  if (err.message?.startsWith("CORS blocked")) {
    return res.status(403).json({ message: err.message });
  }

  res.status(500).json({
    message: "Internal server error",
    ...(process.env.NODE_ENV === "development" && { error: err.message })
  });
});

/* ================================
   SERVER START
================================ */
const PORT = parseInt(process.env.PORT) || 5000;
const server = app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`)
);

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("✅ Server and DB closed.");
      process.exit(0);
    });
  });
});
