import "dotenv/config";
import { sendMail } from "./mailer.js";

try {
  await sendMail({
    subject: "Spice Garden test email ✅",
    html: "<h2>Email chal gaya!</h2><p>Ye Spice Garden backend se aayi test email hai.</p>",
  });
  console.log("Email bhej di ✅ Apna inbox (aur Spam folder) check karo.");
} catch (e) {
  console.log("Email nahi gayi ❌:", e.message);
}