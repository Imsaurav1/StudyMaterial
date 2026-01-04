const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

const PracticeMaterialSchema = new mongoose.Schema({
  title: String,
  date: String,
  category: { type: String, default: "Practice Material" },
  type: { type: String, default: "PDF Download" },
  description: String,
  pdfUrl: String
}, { timestamps: true });

const PracticeMaterial = mongoose.model("PracticeMaterial", PracticeMaterialSchema);

app.get("/api/materials", async (req, res) => {
  const data = await PracticeMaterial.find().sort({ createdAt: -1 });
  res.json(data);
});

app.post("/api/materials", async (req, res) => {
  const material = new PracticeMaterial(req.body);
  await material.save();
  res.status(201).json(material);
});

app.put("/api/materials/:id", async (req, res) => {
  const updated = await PracticeMaterial.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
});

app.delete("/api/materials/:id", async (req, res) => {
  await PracticeMaterial.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted Successfully" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
