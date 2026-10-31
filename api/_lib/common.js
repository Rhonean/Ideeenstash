// Gedeelde hulpfuncties voor de serverfuncties van Ideeënstash.
export const PER_HOUR = parseInt(process.env.RATE_PER_HOUR || "40", 10);
export const PER_DAY = parseInt(process.env.RATE_PER_DAY || "600", 10);

const hits = new Map();
let day = "", dayCount = 0;
export function limited(req) {
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "onbekend";
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; hits.clear(); }
  if (dayCount >= PER_DAY) return true;
  const list = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= PER_HOUR) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list); dayCount++;
  return false;
}

export function sameOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const src = req.headers.origin || req.headers.referer || "";
  if (!src) return false;
  try { return new URL(src).host === host; } catch { return false; }
}

export function model(tier) {
  return tier === "quick"
    ? (process.env.MODEL_QUICK || "claude-haiku-5-5")
    : (process.env.MODEL_DEFAULT || "claude-sonnet-5-5");
}

const SYSTEM = "Je bent de schrijver van een leesapp zoals Deepstash. Volg het gevraagde antwoordformaat precies. Verzin nooit feiten, cijfers, citaten of namen.";

// Start een gestreamd antwoord van Anthropic. Geeft {ok, status, error, message, reader}.
export async function anthropicStream(prompt, { tier = "default", maxTokens = 2000 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, status: 503, error: "not_configured" };
  let up;
  try {
    up = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: model(tier), max_tokens: maxTokens, stream: true, system: SYSTEM, messages: [{ role: "user", content: prompt }] }),
    });
  } catch { return { ok: false, status: 502, error: "upstream_error" }; }
  if (!up.ok) {
    let msg = "";
    try { msg = (await up.json())?.error?.message || ""; } catch {}
    const s = up.status;
    const error = s === 429 || s === 529 ? "rate_limited" : s === 401 ? "bad_key" : (s === 400 && /credit|balance/i.test(msg)) ? "no_credit" : s === 404 ? "bad_model" : "upstream_error";
    return { ok: false, status: s === 429 || s === 529 ? 429 : 502, error, message: msg.slice(0, 300) };
  }
  return { ok: true, reader: up.body.getReader() };
}

// Leest de SSE-stroom van Anthropic, roept onText(delta) aan en geeft {text, stop, error}.
export async function pump(reader, onText) {
  const dec = new TextDecoder();
  let buf = "", text = "", stop = "", error = "";
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
        let ev; try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { text += ev.delta.text; onText(ev.delta.text); }
        else if (ev.type === "message_delta" && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
        else if (ev.type === "error") { error = ev.error?.message || "fout"; return { text, stop, error }; }
      }
    }
  } catch { error = "verbinding verbroken"; }
  return { text, stop, error };
}

// --- Supabase (gedeelde opslag), via de REST-API met de service-sleutel ---
function sb() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}
export const hasStore = () => !!sb();
export async function storeGet(table, col, id) {
  const s = sb(); if (!s) return null;
  try {
    const r = await fetch(`${s.url}/rest/v1/${table}?${col}=eq.${encodeURIComponent(id)}&select=*`, {
      headers: { apikey: s.key, authorization: `Bearer ${s.key}` },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch { return null; }
}
export async function storePut(table, row) {
  const s = sb(); if (!s) return false;
  try {
    const r = await fetch(`${s.url}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: s.key, authorization: `Bearer ${s.key}`, "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    return r.ok;
  } catch { return false; }
}

export function startText(res) {
  res.status(200);
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-accel-buffering", "no");
}
