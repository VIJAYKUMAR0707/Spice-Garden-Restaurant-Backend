import "dotenv/config";

const base = "http://localhost:5000/api";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
const headers = { "Content-Type": "application/json" };

const show = (label, ok, extra = "") =>
  console.log(label, ok ? "✅" : "❌", extra);

const NAME = "Test Reviewer ZZ";

try {
  // 1. review bhejo
  const r1 = await fetch(base + "/reviews", {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: NAME,
      city: "Pune",
      rating: 5,
      comment: "Khana bahut tasty tha, delivery bhi time par aayi.",
    }),
  });
  show("1. Review bheja:", r1.status === 201, "status " + r1.status);

  // 2. galat review rokna chahiye
  const r2 = await fetch(base + "/reviews", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "", rating: 9, comment: "kam" }),
  });
  show("2. Galat review roka:", r2.status === 400);

  // 3. approve se pehle public list mein nahi dikhna chahiye
  const pub1 = await (await fetch(base + "/reviews")).json();
  show("3. Approve se pehle public mein nahi dikha:", !pub1.some((r) => r.name === NAME));

  // 4. bina login admin list rokna chahiye
  const noLogin = await fetch(base + "/reviews/all");
  show("4. Bina login admin list roki:", noLogin.status === 401);

  // admin login
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const { token } = await login.json();
  const auth = { ...headers, Authorization: "Bearer " + token };

  // 5. admin ko pending review dikhna chahiye
  const all = await (await fetch(base + "/reviews/all", { headers: auth })).json();
  const mine = all.find((r) => r.name === NAME);
  show("5. Admin ko pending review dikha:", !!mine && mine.approved === false);
  if (!mine) process.exit(1);

  // 6. approve karo
  const ap = await fetch(base + "/reviews/" + mine.id, {
    method: "PATCH",
    headers: auth,
    body: JSON.stringify({ approved: true }),
  });
  show("6. Approve hua:", ap.ok);

  // 7. ab public mein dikhna chahiye
  const pub2 = await (await fetch(base + "/reviews")).json();
  show("7. Approve ke baad public mein dikha:", pub2.some((r) => r.name === NAME));

  // 8. delete (safai)
  const del = await fetch(base + "/reviews/" + mine.id, {
    method: "DELETE",
    headers: auth,
  });
  show("8. Test review delete:", del.ok);
} catch (e) {
  console.log("Server se baat nahi ho payi. Pehle terminal mein npm run dev chal raha hai?");
}