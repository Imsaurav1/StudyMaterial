const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

/* ================================
   CORS CONFIGURATION
================================ */
const allowedOrigins = [
  "https://www.saurabhjha.co.in",
  "https://saurabhjha.co.in",
  "https://www.saurabhjha.live",
  "https://saurabhjha.live",
   "http://localhost:3000",
   "http://127.0.0.1:5501"

];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (Postman, server-side)
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

// Preflight support (IMPORTANT)
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
   ROUTES
================================ */

// Get all materials
app.get("/api/materials", async (req, res) => {
  try {
    const data = await PracticeMaterial.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create material
app.post("/api/materials", async (req, res) => {
  try {
    const material = new PracticeMaterial(req.body);
    await material.save();
    res.status(201).json(material);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update material
app.put("/api/materials/:id", async (req, res) => {
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

// Delete material
app.delete("/api/materials/:id", async (req, res) => {
  try {
    await PracticeMaterial.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted Successfully" });
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
