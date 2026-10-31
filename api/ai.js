// Ideeënstash — AI-proxy. Houdt de Anthropic API-sleutel op de server.
// Omgevingsvariabelen: ANTHROPIC_API_KEY (verplicht), APP_CODE (toegangscode),
// optioneel MODEL_DEFAULT en MODEL_QUICK.
export const config = { maxDuration: 120 };

const MAX_PROMPT = 80000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const appCode = process.env.APP_CODE || "";
  if (!appCode || req.headers["x-app-code"] !== appCode) {
    return res.status(401).json({ error: "no_code" });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: "not_configured" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const prompt = typeof body?.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) return res.status(400).json({ error: "invalid_request" });
  if (prompt.length > MAX_PROMPT) return res.status(413).json({ error: "prompt_too_large" });
  const tier = body.tier === "quick" ? "quick" : "default";
  const model = tier === "quick"
    ? (process.env.MODEL_QUICK || "claude-haiku-5-5")
    : (process.env.MODEL_DEFAULT || "claude-sonnet-5-5");
  const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 2000, 200), 4000);

  let upstream;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: true,
        system: "Je bent de schrijver van een persoonlijke leesapp zoals Deepstash. Volg het gevraagde antwoordformaat precies. Verzin nooit feiten, cijfers, citaten of namen.",
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch {
    return res.status(502).json({ error: "upstream_error" });
  }
  if (!upstream.ok) {
    const status = upstream.status;
    let msg = "";
    try { msg = (await upstream.json())?.error?.message || ""; } catch {}
    const error = status === 429 || status === 529 ? "rate_limited" : status === 401 ? "not_configured" : "upstream_error";
    return res.status(status === 429 || status === 529 ? 429 : 502).json({ error, message: msg.slice(0, 300) });
  }

  res.status(200);
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-accel-buffering", "no");

  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "", stop = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          res.write(ev.delta.text);
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) {
          stop = ev.delta.stop_reason;
        } else if (ev.type === "error") {
          res.write("\u0000ERR:" + (ev.error?.message || "fout"));
          return res.end();
        }
      }
    }
  } catch {
    res.write("\u0000ERR:verbinding verbroken");
    return res.end();
  }
  if (stop === "max_tokens") res.write("\u0000TRUNC");
  res.end();
}
