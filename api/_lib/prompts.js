// Vaste prompts (op de server, zodat niemand de gedeelde opslag kan vervuilen).
export const KNOWLEDGE = ["Wetenschap", "Natuur", "Geschiedenis", "Politiek", "Economie", "Technologie", "Filosofie"];

export function stashPrompt(b) {
  const know = KNOWLEDGE.includes(b.topic);
  return `Je maakt een "stash" voor een leesapp zoals Deepstash: de kernideeën van één bestaand boek, in je eigen woorden, in het Nederlands.

Boek: "${b.title}" van ${b.author}${b.year ? ` (${b.year < 0 ? -b.year + " v.Chr." : b.year})` : ""}. Onderwerp in de app: ${b.topic}.

Regels:
1. Ken je dit boek niet goed genoeg om de inhoud betrouwbaar weer te geven? Geef dan alleen {"known":false,"reason":"..."}. Verzin nooit inhoud.
2. Geef alleen ideeën die echt in het boek staan, ongeveer in de volgorde van het boek. Geen verzonnen cijfers, onderzoeken, namen of anekdotes. Twijfel je over een detail, laat het weg.
3. Is het een roman of klassiek literair werk, behandel dan de belangrijkste thema's en ideeën die het boek overbrengt, zonder het hele plot na te vertellen.
4. Is het boek omstreden of zijn belangrijke claims later weerlegd, zeg dat dan kort in de samenvatting.
5. Schrijf in je eigen woorden, geen letterlijke passages; hoogstens een heel kort bekend citaat.
6. Precies 8 ideeën. Elk idee: titel van max. 8 woorden, tekst van 60 tot 90 woorden die op zichzelf te begrijpen is, en "apply": ${know ? "één of twee zinnen met een vraag of gedachte om over na te denken, die het idee verbindt met de wereld van vandaag of het leven van de lezer (max. 30 woorden)" : "één of twee zinnen met een concrete actie of reflectievraag voor de lezer (max. 30 woorden)"}.

Antwoord in JSON Lines: één JSON-object per regel, zonder andere tekst, zonder codeblok.
Regel 1: {"known":true,"titleNl":"bekende Nederlandse titel of null","summary":"twee zinnen waar het boek over gaat"}
Regel 2 tot en met 9: {"title":"...","body":"...","apply":"..."}`;
}

export function deepPrompt(b, it) {
  return `Je schrijft een verdieping bij één idee uit het boek "${b.title}" van ${b.author || "onbekende auteur"}, voor een leesapp zoals Deepstash. De lezer heeft deze korte kaart al gelezen:

Titel: ${it.title}
Tekst: ${it.body}

Schrijf in het Nederlands een verdieping van 200 tot 300 woorden, in 3 of 4 korte alinea's:
- Leg de redenering of het mechanisme achter het idee uit zoals de auteur het onderbouwt. Herhaal de kaart niet.
- Noem een voorbeeld, onderzoek of anekdote uit het boek alleen als je zeker weet dat die er echt in staat. Verzin geen cijfers, namen of citaten; twijfel je, laat het dan weg.
- Geef een kanttekening of beperking als die relevant is, bijvoorbeeld kritiek op het idee.
- Sluit af met wat dit betekent voor de lezer of de wereld van vandaag.
Platte tekst, alinea's gescheiden door een lege regel, geen kopjes, geen opsommingstekens, geen markdown.`;
}

// Zet de JSON Lines-uitvoer om naar een stash-object.
export function parseStash(text) {
  let meta = null; const ideas = [];
  for (let line of text.split("\n")) {
    line = line.trim().replace(/^```(json)?|```$/g, "").trim();
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (!meta && "known" in o) { meta = o; continue; }
    if (meta && o.title && o.body) ideas.push({ title: String(o.title), body: String(o.body), apply: o.apply ? String(o.apply) : "" });
  }
  return { meta, ideas };
}
