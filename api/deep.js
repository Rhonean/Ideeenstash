// Ideeënstash — gedeelde verdieping per idee van een catalogusboek.
import { limited, sameOrigin, anthropicStream, pump, storeGet, storePut, startText } from "./_lib/common.js";
import { LIST, HANDWRITTEN } from "./_lib/books.js";
import { deepPrompt } from "./_lib/prompts.js";
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const id = String(req.query?.id || ""), i = parseInt(req.query?.i, 10);
  if (!(i >= 0 && i < 20)) return res.status(400).json({ error: "invalid_request" });
  const key = `${id}_${i}`;

  const hit = await storeGet("deep", "key", key);
  if (hit) { startText(res); res.setHeader("x-cache", "hit"); return res.end(hit.text); }

  let book = HANDWRITTEN[id] || null;
  if (!book && LIST[id]) {
    const s = await storeGet("stashes", "id", id);
    if (s?.data?.ideas) book = { ...LIST[id], ideas: s.data.ideas };
  }
  const it = book?.ideas?.[i];
  if (!it) return res.status(404).json({ error: "not_found" });

  if (!sameOrigin(req)) return res.status(403).json({ error: "forbidden" });
  if (limited(req)) return res.status(429).json({ error: "rate_limited" });
  const up = await anthropicStream(deepPrompt(book, it), { tier: "default", maxTokens: 1500 });
  if (!up.ok) return res.status(up.status).json({ error: up.error, message: up.message || "" });
  startText(res);
  const r = await pump(up.reader, t => res.write(t));
  if (r.error) { res.write("\u0000ERR:" + r.error); return res.end(); }
  if (r.text.trim().length > 300 && r.stop !== "max_tokens") await storePut("deep", { key, text: r.text });
  if (r.stop === "max_tokens") res.write("\u0000TRUNC");
  res.end();
}
