import "dotenv/config";

const base = "http://localhost:5000/api";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const headers = { "Content-Type": "application/json" };

const show = (label, ok, extra = "") =>
  console.log(label, ok ? "✅" : "❌", extra);

const post = (body) =>
  fetch(base + "/orders", { method: "POST", headers, body: JSON.stringify(body) });

const customer = { name: "Test", phone: "9876543210", address: "Test Address", method: "cod" };

try {
  const dishes = await (await fetch(base + "/dishes")).json();
  const dish = dishes.find((d) => d.available);
  if (!dish) {
    console.log("Pehle admin Menu mein dishes import karo.");
    process.exit(1);
  }
  console.log("Test dish:", dish.name, dish.price);

  // 1. nakli sasti price bhejo, server database wali price lagaye
  const fake = await post({
    ...customer,
    items: [{ slug: dish.slug, name: dish.name, qty: 2, price: "₹1" }],
  });
  const order = await fake.json();
  const real = Number(String(dish.price).replace(/[^\d.]/g, "")) * 2;
  show(
    "1. Nakli price ₹1 chali nahi:",
    fake.status === 201 && order.total === real,
    `total ₹${order.total} (sahi ₹${real})`
  );

  // 2. galat slug rokna chahiye
  const bad = await post({ ...customer, items: [{ slug: "yeh-dish-nahi-hai", qty: 1 }] });
  show("2. Galat dish roki:", bad.status === 400);

  // 3. slug ki jagah attack wali cheez rokna chahiye
  const hack = await post({ ...customer, items: [{ slug: { $ne: null }, qty: 1 }] });
  show("3. Attack wala data roka:", hack.status === 400);

  // 4. bina slug ka purana tarika rokna chahiye
  const old = await post({ ...customer, items: [{ name: "Butter Chicken", qty: 1, price: "₹350" }] });
  show("4. Bina slug wala order roka:", old.status === 400);

  // 5. test order delete (safai)
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
  show("5. Test order delete:", del.ok);
} catch (e) {
  console.log("Server se baat nahi ho payi. Pehle terminal mein npm run dev chal raha hai?");
}