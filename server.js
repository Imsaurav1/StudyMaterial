/*********************************
 * IMPORTS
 *********************************/
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const slugify = require("slugify");


const app = express();

/* ================================
   CORS CONFIGURATION
================================ */
const allowedOrigins = [
  "https://www.saurabhjha.co.in",
  "https://saurabhjha.co.in",
  "https://www.saurabhjha.live",
  "https://saurabhjha.live",
   "https://saurabh1jha-git-main-imsaurav1s-projects.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed for this origin"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("*", cors());
app.use(express.json());

/* ================================
   MONGODB CONNECTION
================================ */
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

/* ================================
   SCHEMA & MODEL
================================ */
const PracticeMaterialSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: String,
  category: { type: String, default: "Practice Material" },
  type: { type: String, default: "PDF Download" },
  description: String,
  pdfUrl: String,
  imageUrl: String
}, { timestamps: true });

const PracticeMaterial = mongoose.model(
  "PracticeMaterial",
  PracticeMaterialSchema
);

/* ================================
   POST SCHEMA & MODEL
================================ */

const PostSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, unique: true, required: true },
    content: { type: String, required: true }, // FULL HTML
    excerpt: { type: String },
    featuredImage: { type: String },
    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published"
    },
    author: {
      type: String,
      default: "Saurabh Kumar Jha"
    },
    // ✅ NEW: Views count
    views: {
      type: Number,
      default: 0
    },
    // ✅ NEW: Tags array
    tags: {
      type: [String],
      default: []
      // example: ["Infosys", "Coding", "Interview", "DSA"]
    }
  },
  { timestamps: true }
);
const Post = mongoose.model("Post", PostSchema);


/* ================================
   ADMIN LOGIN (JWT)
================================ */
app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body;

  if (email !== process.env.ADMIN_EMAIL) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // hash env password once and compare
  const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  const isValid = await bcrypt.compare(password, hashedPassword);

  if (!isValid) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = jwt.sign(
    { role: "admin", email },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );

  res.json({ token });
});

/* ================================
   ADMIN AUTH MIDDLEWARE
================================ */
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/* ================================
   ROUTES
================================ */

// 🔓 PUBLIC – Get all materials
app.get("/api/materials", async (req, res) => {
  try {
    const data = await PracticeMaterial.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});


/* ================================
   PUBLIC – POSTS
================================ */

// Get all published posts
app.post("/api/posts/:slug/view", async (req, res) => {
  try {
    await Post.findOneAndUpdate(
      { slug: req.params.slug },
      { $inc: { views: 1 } }
    );
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update views" });
  }
});


// Get single post by slug
app.get("/api/posts/:slug", async (req, res) => {
  try {
    const post = await Post.findOne({
      slug: req.params.slug,
      status: "published"
    });

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});




// 🔐 ADMIN – Create material
app.post("/api/materials", adminAuth, async (req, res) => {
  try {
    const material = new PracticeMaterial(req.body);
    await material.save();
    res.status(201).json(material);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔐 ADMIN – Update material
app.put("/api/materials/:id", adminAuth, async (req, res) => {
  try {
    const updated = await PracticeMaterial.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 🔐 ADMIN – Delete material
app.delete("/api/materials/:id", adminAuth, async (req, res) => {
  try {
    await PracticeMaterial.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted Successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


/* ================================
   ADMIN – POSTS (JWT PROTECTED)
================================ */

app.post("/api/posts", adminAuth, async (req, res) => {
  try {
    const {
      title,
      content,
      excerpt,
      status,
      tags // 👈 NEW
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        message: "Title and content are required"
      });
    }

    const slug = slugify(title, {
      lower: true,
      strict: true
    });

    // 🔒 Prevent duplicate slug
    const exists = await Post.findOne({ slug });
    if (exists) {
      return res.status(400).json({
        message: "Post with this title already exists"
      });
    }

    const post = await Post.create({
      title,
      slug,
      content,
      excerpt,
      status,
      tags: Array.isArray(tags) ? tags : [], // ✅ safe handling
      views: 0 // ✅ explicit (optional, default already works)
    });

    res.status(201).json({
      message: "Post created successfully",
      post
    });

  } catch (err) {
    console.error("Post create error:", err);
    res.status(500).json({
      message: "Failed to create post"
    });
  }
});



// Update post
app.put("/api/posts/:id", adminAuth, async (req, res) => {
  try {
    const updated = await Post.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete post
app.delete("/api/posts/:id", adminAuth, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});





/* ================================
   SERVER START
================================ */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
