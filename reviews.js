import express from "express";
import mongoose from "mongoose";
import { sendMail, escapeHtml } from "./mailer.js";

const reviewSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    city: { type: String, default: "" },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
    approved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Review =
  mongoose.models.Review || mongoose.model("Review", reviewSchema);

const publicReview = (r) => ({
  id: String(r._id),
  name: r.name,
  city: r.city,
  rating: r.rating,
  comment: r.comment,
  approved: r.approved,
  createdAt: r.createdAt,
});

const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ").trim();

export default function reviewsRouter({ requireAdmin, rateLimit, str }) {
  const router = express.Router();

  // sabke liye: sirf approved reviews
  router.get("/", async (_req, res) => {
    try {
      const list = await Review.find({ approved: true })
        .sort({ createdAt: -1 })
        .limit(30);
      res.json(list.map(publicReview));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // customer review bhejta hai (pehle pending rehta hai)
  router.post("/", rateLimit(3, 15 * 60 * 1000), async (req, res) => {
    try {
      const { name, city, rating, comment } = req.body || {};
      const stars = Number(rating);

      if (
        !str(name, 80) ||
        !str(comment, 600) ||
        comment.trim().length < 10 ||
        !Number.isInteger(stars) ||
        stars < 1 ||
        stars > 5
      ) {
        return res.status(400).json({
          error: "Naam, 1 se 5 rating aur kam se kam 10 akshar ka review zaroori hai",
        });
      }

      const cityText = typeof city === "string" ? city.trim().slice(0, 60) : "";

      await Review.create({
        name: name.trim(),
        city: cityText,
        rating: stars,
        comment: comment.trim(),
      });

      // restaurant ko alert (fail ho toh bhi review save rehta hai)
      sendMail({
        subject: `⭐ New review (${stars}/5) from ${oneLine(name)}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px">
          <h2 style="color:#a63a23">⭐ New review waiting for approval</h2>
          <p><b>${escapeHtml(name.trim())}</b>${cityText ? ` (${escapeHtml(cityText)})` : ""} gave <b>${stars}/5</b></p>
          <p style="white-space:pre-wrap;background:#f6efe4;padding:12px;border-radius:8px">${escapeHtml(comment.trim())}</p>
          <p style="color:#888;font-size:12px">Admin panel mein Reviews page par Approve ya Delete karo.</p>
        </div>`,
      }).catch((err) => console.error("Review email failed:", err.message));

      res.status(201).json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // sirf admin: saare reviews (pending bhi)
  router.get("/all", requireAdmin, async (_req, res) => {
    try {
      const list = await Review.find().sort({ createdAt: -1 });
      res.json(list.map(publicReview));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // sirf admin: approve ya hide
  router.patch("/:id", requireAdmin, async (req, res) => {
    try {
      const { approved } = req.body || {};
      if (!mongoose.isValidObjectId(req.params.id) || typeof approved !== "boolean") {
        return res.status(400).json({ error: "Data galat hai" });
      }
      const review = await Review.findByIdAndUpdate(
        req.params.id,
        { approved },
        { new: true }
      );
      if (!review) return res.status(404).json({ error: "Review nahi mila" });
      res.json(publicReview(review));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  // sirf admin: delete
  router.delete("/:id", requireAdmin, async (req, res) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ error: "Data galat hai" });
      }
      const deleted = await Review.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: "Review nahi mila" });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  });

  return router;
}