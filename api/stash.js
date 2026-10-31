// Ideeënstash — gedeelde stash voor een boek uit de catalogus.
// Bestaat hij al in de opslag, dan komt hij direct terug (JSON). Anders wordt hij
// één keer geschreven (gestreamd als JSON Lines) en daarna voor iedereen bewaard.
import { limited, sameOrigin, anthropicStream, pump, storeGet, storePut, startText } from "./_lib/common.js";
import { LIST } from "./_lib/books.js";
import { stashPrompt, parseStash } from "./_lib/prompts.js";
export const config = { maxDuration: 120 };

export default async function handler(req, res) {
  const id = String(req.query?.id || "");
  const book = LIST[id];
  if (!book) return res.status(404).json({ error: "not_found" });

  const hit = await storeGet("stashes", "id", id);
  if (hit) {
    res.setHeader("cache-control", "public, max-age=300");
    return res.status(200).json({ cached: true, data: hit.data });
  }
  if (!sameOrigin(req)) return res.status(403).json({ error: "forbidden" });
  if (limited(req)) return res.status(429).json({ error: "rate_limited" });

  const up = await anthropicStream(stashPrompt(book), { tier: "default", maxTokens: 3500 });
  if (!up.ok) return res.status(up.status).json({ error: up.error, message: up.message || "" });
  startText(res);
  const r = await pump(up.reader, t => res.write(t));
  if (r.error) { res.write("\u0000ERR:" + r.error); return res.end(); }
  const { meta, ideas } = parseStash(r.text);
  if (meta && meta.known === false) {
    await storePut("stashes", { id, data: { known: false, reason: String(meta.reason || "") } });
  } else if (meta && ideas.length >= 5) {
    await storePut("stashes", { id, data: {
      known: true,
      titleNl: meta.titleNl && meta.titleNl !== "null" ? String(meta.titleNl) : null,
      summary: String(meta.summary || ""),
      ideas,
    } });
  }
  if (r.stop === "max_tokens") res.write("\u0000TRUNC");
  res.end();
}
