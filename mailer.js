import "dotenv/config";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// customer ka likha text email mein safe dikhane ke liye
export const escapeHtml = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );

// restaurant ki email par mail bhejta hai
export async function sendMail({ subject, html, replyTo }) {
  if (!resend) throw new Error("RESEND_API_KEY .env mein nahi hai");
  const to = process.env.EMAIL_TO;
  if (!to) throw new Error("EMAIL_TO .env mein nahi hai");

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Spice Garden <onboarding@resend.dev>",
    to: [to],
    subject,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) throw new Error(error.message || "Email bhejne mein dikkat");
}