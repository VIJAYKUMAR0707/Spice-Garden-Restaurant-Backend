import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { Admin } from "./models.js";

const { ADMIN_EMAIL, ADMIN_PASSWORD, MONGODB_URI } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error("ADMIN_EMAIL aur ADMIN_PASSWORD .env mein daalo.");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);

const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

await Admin.findOneAndUpdate(
  { email: ADMIN_EMAIL.toLowerCase() },
  { passwordHash },
  { upsert: true }
);

console.log("Admin ready ✅:", ADMIN_EMAIL);
await mongoose.disconnect();