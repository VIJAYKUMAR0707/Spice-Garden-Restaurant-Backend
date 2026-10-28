import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomInt } from "node:crypto";
import { Admin, Dish, Order } from "./models.js";
import { sendMail, escapeHtml } from "./mailer.js";
import reviewsRouter from "./reviews.js";

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET .env mein daalo.");
  process.exit(1);
}

const app = express();

app.set("trust proxy", 1); // online hosting par asli IP pehchanne ke liye
app.use(helmet());

// sirf apni site ko backend se baat karne do (.env mein CLIENT_ORIGINS)
const origins = (process.env.CLIENT_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: origins }));

// limit badi isliye, kyunki dish ki photo bhi isme aa sakti hai
app.use(express.json({ limit: "5mb" }));

/* ---------- chhote helpers ---------- */
const str = (v, max) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max;

const toNumber = (p) => Number(String(p).replace(/[^\d.]/g, "")) || 0;

const oneLine = (s) => String(s).replace(/[\r\n]+/g, " ").trim();

const STATUSES = ["new", "preparing", "delivered", "cancelled"];

// ek hi IP se bahut zyada requests rokne ke liye (spam se bachav)
const hits = new Map();
function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res
        .status(429)
        .json({ error: "Bahut zyada koshish ho gayi. Thodi der baad try karo." });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

// order ko frontend ke liye saaf form mein badalta hai
const publicOrder = (o) => ({
  id: o.orderId,
  name: o.name,
  phone: o.phone,
  address: o.address,
  method: o.method,
  items: o.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price })),
  total: o.total,
  status: o.status,
  createdAt: o.createdAt,
});

// dish ki photo database mein text ke roop mein ho toh uska chhota link bhejte hain
const imageUrl = (d, req) =>
  d.image && d.image.startsWith("data:")
    ? `${req.protocol}://${req.get("host")}/api/dishes/${d.slug}/image?v=${new Date(
        d.updatedAt
      ).getTime()}`
    : d.image;

const publicDish = (d, req) => ({
  slug: d.slug,
  name: d.name,
  description: d.description,
  price: d.price,
  image: imageUrl(d, req),
  type: d.type,
  available: d.available,
});

// naye order ki email ka design
function orderEmailHtml(o) {
  const cell = "padding:6px 12px;border-bottom:1px solid #eee";
  const rows = o.items
    .map(
      (i) =>
        `<tr><td style="${cell}">${escapeHtml(i.name)}</td><td style="${cell};text-align:center">${i.qty}</td><td style="${cell};text-align:right">${escapeHtml(i.price)}</td></tr>`
    )
    .join("");

  return `<div style="font-family:Arial,sans-serif;max-width:560px">
    <h2 style="color:#a63a23">🔔 New order ${escapeHtml(o.orderId)}</h2>
    <p>
      <b>Name:</b> ${escapeHtml(o.name)}<br>
      <b>Phone:</b> ${escapeHtml(o.phone)}<br>
      <b>Address:</b> ${escapeHtml(o.address)}<br>
      <b>Payment:</b> ${o.method === "cod" ? "Cash on Delivery" : "Online (UPI)"}
    </p>
    <table style="border-collapse:collapse;width:100%">
      <tr style="background:#f6efe4">
        <th style="${cell};text-align:left">Item</th>
        <th style="${cell}">Qty</th>
        <th style="${cell};text-align:right">Price</th>
      </tr>
      ${rows}
    </table>
    <h3>Total: ₹${o.total}</h3>
    <p style="color:#888;font-size:12px">Admin panel mein order ka status update karo.</p>
  </div>`;
}

/* ---------- login check karne wala guard ---------- */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Pehle login karo" });

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token galat ya expire ho gaya" });
  }
}

/* ---------- health ---------- */
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    message: "Spice Garden backend chal raha hai",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "not connected",
  });
});

/* ---------- auth ---------- */
app.post("/api/auth/login", rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!str(email, 200) || !str(password, 200)) {
      return res.status(400).json({ error: "Email aur password daalo" });
    }

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
    const ok = admin && (await bcrypt.compare(password, admin.passwordHash));
    if (!ok) {
      return res.status(401).json({ error: "Email ya password galat hai" });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, email: admin.email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/auth/me", requireAdmin, (req, res) => {
  res.json({ email: req.admin.email });
});

/* ---------- contact form (email) ---------- */
app.post("/api/contact", rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { name, email, phone, message } = req.body || {};

  if (
    !str(name, 100) ||
    !str(message, 2000) ||
    !str(email, 200) ||
    !/^\S+@\S+\.\S+$/.test(email.trim())
  ) {
    return res.status(400).json({ error: "Naam, sahi email aur message zaroori hain" });
  }
  const phoneText = typeof phone === "string" ? phone.slice(0, 20) : "";

  try {
    await sendMail({
      subject: `New message from ${oneLine(name)} (website)`,
      replyTo: email.trim(),
      html: `<div style="font-family:Arial,sans-serif;max-width:560px">
        <h2 style="color:#a63a23">📩 New website message</h2>
        <p>
          <b>Name:</b> ${escapeHtml(name.trim())}<br>
          <b>Email:</b> ${escapeHtml(email.trim())}<br>
          <b>Phone:</b> ${escapeHtml(phoneText || "-")}
        </p>
        <p style="white-space:pre-wrap;background:#f6efe4;padding:12px;border-radius:8px">${escapeHtml(message.trim())}</p>
        <p style="color:#888;font-size:12px">Is email par Reply dabaoge toh jawab seedha customer ko jayega.</p>
      </div>`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("Contact email failed:", err.message);
    res.status(502).json({
      error: "Email nahi ja paya. Thodi der baad try karo ya WhatsApp par message karo.",
    });
  }
});

/* ---------- dishes ---------- */

// dish ka data check karke saaf karta hai (galat ho toh null)
function readDish(body) {
  const { slug, name, description, price, image, type, available } = body || {};
  if (!str(slug, 100) || !/^[a-z0-9-]+$/.test(slug)) return null;
  if (!str(name, 100) || !str(price, 30)) return null;
  if (type !== "veg" && type !== "non-veg") return null;
  return {
    slug,
    name: name.trim(),
    description:
      typeof description === "string" ? description.slice(0, 1000) : "",
    price: price.trim(),
    image: typeof image === "string" ? image : "",
    type,
    available: available !== false,
  };
}

// sabke liye: menu dekhna
app.get("/api/dishes", async (req, res) => {
  try {
    // photo ka bhaari data database se mat laao, sirf ye pata karo ki photo hai ya nahi
    const dishes = await Dish.aggregate([
      { $sort: { createdAt: -1 } },
      {
        $project: {
          slug: 1,
          name: 1,
          description: 1,
          price: 1,
          type: 1,
          available: 1,
          updatedAt: 1,
          hasDataImage: {
            $eq: [{ $substrCP: [{ $ifNull: ["$image", ""] }, 0, 5] }, "data:"],
          },
          image: {
            $cond: [
              { $eq: [{ $substrCP: [{ $ifNull: ["$image", ""] }, 0, 5] }, "data:"] },
              "",
              { $ifNull: ["$image", ""] },
            ],
          },
        },
      },
    ]);

    res.json(
      dishes.map((d) => ({
        slug: d.slug,
        name: d.name,
        description: d.description,
        price: d.price,
        type: d.type,
        available: d.available,
        image: d.hasDataImage
          ? `${req.protocol}://${req.get("host")}/api/dishes/${d.slug}/image?v=${new Date(
              d.updatedAt
            ).getTime()}`
          : d.image,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// dish ki photo alag se (browser ise yaad rakhta hai, isliye dobara tez khulti hai)
app.get("/api/dishes/:slug/image", async (req, res) => {
  try {
    const dish = await Dish.findOne({ slug: req.params.slug }).select("image");
    const m = dish && /^data:(image\/[\w.+-]+);base64,(.+)$/s.exec(dish.image || "");
    if (!m) return res.status(404).end();

    res.set({
      "Content-Type": m[1],
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.send(Buffer.from(m[2], "base64"));
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// sirf admin: nayi dish
app.post("/api/dishes", requireAdmin, async (req, res) => {
  try {
    const data = readDish(req.body);
    if (!data) return res.status(400).json({ error: "Dish ka data galat hai" });
    const dish = await Dish.create(data);
    res.status(201).json(publicDish(dish, req));
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Is naam ki dish pehle se hai" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// sirf admin: dish edit
app.put("/api/dishes/:slug", requireAdmin, async (req, res) => {
  try {
    const data = readDish({ ...req.body, slug: req.params.slug });
    if (!data) return res.status(400).json({ error: "Dish ka data galat hai" });

    // admin ne photo nahi badli (wahi link wapas aaya) toh purani photo rakho
    if (data.image.includes(`/api/dishes/${data.slug}/image`)) {
      const existing = await Dish.findOne({ slug: data.slug }).select("image");
      data.image = existing ? existing.image : "";
    }

    const dish = await Dish.findOneAndUpdate({ slug: req.params.slug }, data, {
      new: true,
    });
    if (!dish) return res.status(404).json({ error: "Dish nahi mili" });
    res.json(publicDish(dish, req));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// sirf admin: dish delete
app.delete("/api/dishes/:slug", requireAdmin, async (req, res) => {
  try {
    const deleted = await Dish.findOneAndDelete({ slug: req.params.slug });
    if (!deleted) return res.status(404).json({ error: "Dish nahi mili" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- orders ---------- */

// customer order daalta hai (login ki zaroorat nahi)
app.post("/api/orders", rateLimit(20, 15 * 60 * 1000), async (req, res) => {
  try {
    const { name, phone, address, method, items } = req.body || {};
if (!str(name, 100) || !/^\d{10}$/.test(String(phone ?? "").trim()) || !str(address, 300)) {
          return res.status(400).json({ error: "Naam, phone aur address zaroori hain" });
    }
    if (method !== "cod" && method !== "online") {
      return res.status(400).json({ error: "Payment method galat hai" });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 30) {
      return res.status(400).json({ error: "Items galat hain" });
    }

    // customer sirf slug aur quantity bhejta hai, check karte hain
    for (const i of items) {
      const qty = Number(i?.qty);
      if (!str(i?.slug, 100)) {
        return res.status(400).json({ error: "Item galat hai" });
      }
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) {
        return res.status(400).json({ error: "Quantity galat hai" });
      }
    }

    // dishes ka naam aur price database se aata hai (browser ki price nahi maanta)
    const dishList = await Dish.find({
      slug: { $in: items.map((i) => i.slug) },
    }).select("-image");
    const bySlug = new Map(dishList.map((d) => [d.slug, d]));

    const cleanItems = [];
    for (const i of items) {
      const dish = bySlug.get(i.slug);
      if (!dish) {
        return res.status(400).json({
          error: "Ek dish ab menu mein nahi hai. Cart saaf karke dobara order karo.",
        });
      }
      if (!dish.available) {
        return res.status(400).json({ error: `${dish.name} abhi sold out hai` });
      }
      cleanItems.push({ name: dish.name, qty: Number(i.qty), price: dish.price });
    }

    const total = cleanItems.reduce((s, i) => s + toNumber(i.price) * i.qty, 0);

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const order = await Order.create({
          orderId: `SG-${randomInt(100000, 999999)}`,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          method,
          items: cleanItems,
          total,
        });

        // restaurant ko alert email (fail ho toh bhi order save rehta hai)
        sendMail({
          subject: `🔔 New order ${order.orderId} - ₹${order.total}`,
          html: orderEmailHtml(order),
        }).catch((err) =>
          console.error("Order email failed:", err.message)
        );

        return res.status(201).json(publicOrder(order));
      } catch (err) {
        if (err.code !== 11000) throw err; // sirf same ID hone par dobara try
      }
    }
    res.status(500).json({ error: "Order nahi ban paya" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// sirf admin: saare orders
app.get("/api/orders", requireAdmin, async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders.map(publicOrder));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// sirf admin: status badalna
app.patch("/api/orders/:id", requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: "Status galat hai" });
    }
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.id },
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: "Order nahi mila" });
    res.json(publicOrder(order));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// sirf admin: order delete
app.delete("/api/orders/:id", requireAdmin, async (req, res) => {
  try {
    const deleted = await Order.findOneAndDelete({ orderId: req.params.id });
    if (!deleted) return res.status(404).json({ error: "Order nahi mila" });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});
/* ---------- dashboard stats ---------- */
app.get("/api/stats", requireAdmin, async (_req, res) => {
  try {
    const [totalDishes, soldOut, totalOrders, newOrders, recentOrders] =
      await Promise.all([
        Dish.countDocuments(),
        Dish.countDocuments({ available: false }),
        Order.countDocuments(),
        Order.countDocuments({ status: "new" }),
        Order.find().sort({ createdAt: -1 }).limit(5),
      ]);

    res.json({
      totalDishes,
      soldOut,
      totalOrders,
      newOrders,
      recentOrders: recentOrders.map(publicOrder),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- reviews ---------- */
app.use("/api/reviews", reviewsRouter({ requireAdmin, rateLimit, str }));

/* ---------- start ---------- */
const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected ✅");
    app.listen(PORT, () =>
      console.log(`Server running on http://localhost:${PORT}`)
    );
  })
  .catch((err) => {
    console.error("MongoDB connect failed ❌:", err.message);
    process.exit(1);
  });