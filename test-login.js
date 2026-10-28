import "dotenv/config";

const base = "http://localhost:5000/api";
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

const post = (path, body) =>
  fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

try {
  const bad = await post("/auth/login", {
    email: ADMIN_EMAIL,
    password: "galat-password-123",
  });
  console.log(
    "1. Galat password:",
    bad.status === 401 ? "ROKA GAYA ✅" : "❌ problem, status " + bad.status
  );

  const good = await post("/auth/login", {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (!good.ok) {
    console.log("2. Sahi password: ❌ login fail, status", good.status);
    process.exit(1);
  }
  const { token } = await good.json();
  console.log("2. Sahi password: LOGIN OK ✅");

  const me = await fetch(base + "/auth/me", {
    headers: { Authorization: "Bearer " + token },
  });
  const data = await me.json();
  console.log("3. Token check:", me.ok ? "OK ✅ " + data.email : "❌ fail");

  const noToken = await fetch(base + "/auth/me");
  console.log(
    "4. Bina token ke:",
    noToken.status === 401 ? "ROKA GAYA ✅" : "❌ problem"
  );
} catch (e) {
  console.log(
    "Server se baat nahi ho payi. Pehle terminal mein npm run dev chal raha hai?"
  );
}