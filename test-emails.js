import "dotenv/config";

const base = "http://localhost:5000/api";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const headers = { "Content-Type": "application/json" };

const show = (label, ok, extra = "") =>
  console.log(label, ok ? "✅" : "❌", extra);

try {
  // 1. contact message
  const c1 = await fetch(base + "/contact", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Test Customer",
      email: "test@example.com",
      phone: "9876543210",
      message: "Ye ek test message hai.",
    }),
  });
  show("1. Contact message bheja:", c1.ok, "status " + c1.status);

  // 2. galat contact message rokna chahiye
  const c2 = await fetch(base + "/contact", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "", email: "galat", message: "" }),
  });
  show("2. Galat contact roka:", c2.status === 400);

  // 3. test order (iski alert email aani chahiye)
  const o = await fetch(base + "/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Test Customer",
      phone: "9876543210",
      address: "Test Address, Pune",
      method: "cod",
      items: [{ name: "Butter Chicken", qty: 2, price: "₹350" }],
    }),
  });
  const order = await o.json();
  show("3. Test order ban gaya:", o.status === 201, order.id || "");

  // 4. test order delete (safai)
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();
  const del = await fetch(base + "/orders/" + order.id, {
    method: "DELETE",
    headers: { Authorization: "Bearer " + token },
  });
  show("4. Test order delete:", del.ok);

  console.log("\nAb apna inbox (aur Spam) check karo. 2 emails aani chahiye:");
  console.log(" - New message from Test Customer (website)");
  console.log(" - 🔔 New order " + (order.id || "SG-...") + " - ₹700");
} catch (e) {
  console.log(
    "Server se baat nahi ho payi. Pehle terminal mein npm run dev chal raha hai?"
  );
}