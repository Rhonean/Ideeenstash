// Ideeënstash — algemene AI-functie (voorstellen, eigen boeken, geplakte artikelen).
import { limited, sameOrigin, anthropicStream, pump, startText } from "./_lib/common.js";
export const config = { maxDuration: 120 };
const MAX_PROMPT = 80000;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "method_not_allowed" }); }
  if (!sameOrigin(req)) return res.status(403).json({ error: "forbidden" });
  const appCode = process.env.APP_CODE || "";
  if (appCode && req.headers["x-app-code"] !== appCode) return res.status(401).json({ error: "no_code" });
  if (limited(req)) return res.status(429).json({ error: "rate_limited" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) return res.status(400).json({ error: "invalid_request" });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: "prompt_too_large" });
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 2000, 200), 4000);

  const up = await anthropicStream(prompt, { tier: body.tier === "quick" ? "quick" : "default", maxTokens });
  if (!up.ok) return res.status(up.status).json({ error: up.error, message: up.message || "" });
  startText(res);
  const r = await pump(up.reader, t => res.write(t));
  if (r.error) res.write("\u0000ERR:" + r.error);
  else if (r.stop === "max_tokens") res.write("\u0000TRUNC");
  res.end();
}
