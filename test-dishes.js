import "dotenv/config";

const base = "http://localhost:5000/api";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const headers = { "Content-Type": "application/json" };

const show = (label, ok, extra = "") =>
  console.log(label, ok ? "✅" : "❌", extra);

const dish = {
  slug: "test-dish-delete-me",
  name: "Test Dish",
  description: "Sirf test ke liye",
  price: "₹199",
  image: "",
  type: "veg",
  available: true,
};

try {
  // admin login
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!login.ok) {
    console.log("Admin login fail. Pehle node seedAdmin.js chalao.");
    process.exit(1);
  }
  const { token } = await login.json();
  const auth = { ...headers, Authorization: "Bearer " + token };

  // pichle adhure test ki dish ho toh pehle hata do
  await fetch(base + "/dishes/" + dish.slug, { method: "DELETE", headers: auth });

  // 1. bina login dish add karna rokna chahiye
  const noLogin = await fetch(base + "/dishes", {
    method: "POST",
    headers,
    body: JSON.stringify(dish),
  });
  show("1. Bina login dish add roka:", noLogin.status === 401);

  // 2. admin dish add karta hai
  const create = await fetch(base + "/dishes", {
    method: "POST",
    headers: auth,
    body: JSON.stringify(dish),
  });
  show("2. Admin ne dish add ki:", create.status === 201, "status " + create.status);
  if (!create.ok) process.exit(1);

  // 3. same dish dobara rokna chahiye
  const dup = await fetch(base + "/dishes", {
    method: "POST",
    headers: auth,
    body: JSON.stringify(dish),
  });
  show("3. Same dish dobara roki:", dup.status === 409);

  // 4. galat data rokna chahiye
  const bad = await fetch(base + "/dishes", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ ...dish, slug: "bad-dish", type: "kuch-aur" }),
  });
  show("4. Galat data roka:", bad.status === 400);

  // 5. customer (bina login) menu dekh sakta hai
  const list = await fetch(base + "/dishes");
  const dishes = await list.json();
  show(
    "5. Menu bina login dikha:",
    list.ok && dishes.some((d) => d.slug === dish.slug)
  );

  // 6. dish edit (price badla, sold out kiya)
  const put = await fetch(base + "/dishes/" + dish.slug, {
    method: "PUT",
    headers: auth,
    body: JSON.stringify({ ...dish, price: "₹249", available: false }),
  });
  const updated = await put.json();
  show(
    "6. Dish edit hui:",
    put.ok && updated.price === "₹249" && updated.available === false
  );

  // 7. dish delete (safai)
  const del = await fetch(base + "/dishes/" + dish.slug, {
    method: "DELETE",
    headers: auth,
  });
  show("7. Test dish delete:", del.ok);

  // 8. delete ke baad menu mein nahi honi chahiye
  const after = await (await fetch(base + "/dishes")).json();
  show("8. Menu se hat gayi:", !after.some((d) => d.slug === dish.slug));
} catch (e) {
  console.log(
    "Server se baat nahi ho payi. Pehle terminal mein npm run dev chal raha hai?"
  );
}