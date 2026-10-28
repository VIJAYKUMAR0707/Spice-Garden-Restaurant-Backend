import mongoose from "mongoose";

const dishSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    price: { type: String, required: true },
    image: { type: String, default: "" },
    type: { type: String, enum: ["veg", "non-veg"], required: true },
    available: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    method: { type: String, enum: ["cod", "online"], required: true },
    items: [{ name: String, qty: Number, price: String }],
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ["new", "preparing", "delivered", "cancelled"],
      default: "new",
    },
  },
  { timestamps: true }
);

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
});

export const Dish = mongoose.model("Dish", dishSchema);
export const Order = mongoose.model("Order", orderSchema);
export const Admin = mongoose.model("Admin", adminSchema);