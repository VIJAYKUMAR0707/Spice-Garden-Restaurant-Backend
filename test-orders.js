import "dotenv/config";

const base = "http://localhost:5000/api";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const headers = { "Content-Type": "application/json" };

const show = (label, ok, extra = "") =>
  console.log(label, ok ? "✅" : "❌", extra);

try {
  // 1. customer order bhejta hai (bina login)
  const create = await fetch(base + "/orders", {
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
  const order = await create.json();
  show(
    "1. Customer order daalna:",
    create.status === 201 && order.total === 700,
    create.ok ? `${order.id}, total ₹${order.total}` : `status ${create.status}`
  );
  if (!create.ok) process.exit(1);

  // 2. galat order (khali items) rokna chahiye
  const bad = await fetch(base + "/orders", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "X", phone: "1", address: "Y", method: "cod", items: [] }),
  });
  show("2. Galat order rokna:", bad.status === 400);

  // 3. bina login orders dekhna rokna chahiye
  const noLogin = await fetch(base + "/orders");
  show("3. Bina login orders dekhna roka:", noLogin.status === 401);

  // 4. admin login
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();
  const auth = { ...headers, Authorization: "Bearer " + token };
  show("4. Admin login:", login.ok);

  // 5. admin orders dekhta hai
  const list = await fetch(base + "/orders", { headers: auth });
  const orders = await list.json();
  show(
    "5. Admin ko order dikha:",
    list.ok && orders.some((o) => o.id === order.id)
  );

  // 6. status badalna
  const patch = await fetch(base + "/orders/" + order.id, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ status: "preparing" }),
  });
  const updated = await patch.json();
  show("6. Status badalna:", patch.ok && updated.status === "preparing");

  // 7. test order delete (safai)
  const del = await fetch(base + "/orders/" + order.id, {
    method: "DELETE",
    headers: auth,
  });
  show("7. Test order delete:", del.ok);
} catch (e) {
  console.log(
    "Server se baat nahi ho payi. Pehle terminal mein npm run dev chal raha hai?"
  );
}