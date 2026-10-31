# Ideeënstash

Leesapp in de stijl van Deepstash: kernideeën uit ruim 950 boeken (98 handgeschreven, de rest wordt bij eerste opening gemaakt en gedeeld), met per idee een toepassing en een verdieping op verzoek.

## Opbouw
- `index.html` — de complete app (catalogus zit erin). Voortgang wordt op het toestel opgeslagen.
- `api/ai.js` — serverfunctie voor de AI-functies (nieuwe stashes, verdieping, voorstellen). Houdt de API-sleutel op de server.
- `sw.js`, `manifest.webmanifest`, iconen — maken de app installeerbaar en offline bruikbaar.

## Instellingen (Vercel → Project → Settings → Environment Variables)
- `ANTHROPIC_API_KEY` — je Anthropic API-sleutel (verplicht voor de AI-functies).
- `APP_CODE` — optioneel: alleen invullen als je toch een toegangscode wilt.
- `SUPABASE_URL` en `SUPABASE_SERVICE_ROLE_KEY` — gedeelde opslag van gemaakte stashes en verdiepingen.
- Optioneel: `MODEL_DEFAULT`, `MODEL_QUICK`, `RATE_PER_HOUR`, `RATE_PER_DAY`.

Zonder API-sleutel werkt de app gewoon; alleen de AI-functies zijn dan uit.
