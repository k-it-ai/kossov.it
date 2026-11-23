# kossov.it

Website of kossov.it, built with [Astro](https://astro.build), in German, English and Russian.

```bash
npm install
npm run dev     # http://localhost:4321
npm run build   # → dist/
```

- Texts: `src/i18n/de.json`, `en.json`, `ru.json`. Page titles: `src/i18n/meta.js`
- Client logos: `src/components/Clients.astro`
- Legal notice & privacy: `src/components/legal/`

Every push to `main` is published automatically to GitHub Pages (`.github/workflows/deploy.yml`). After changing the custom domain in the repo's Pages settings, re-run that workflow once.

## DNS (Dynadot)

| Records | Purpose |
|---|---|
| A ×4 and AAAA ×4 on `@` → GitHub Pages IPs, CNAME `www` → `k-it-ai.github.io` | Website |
| MX, TXT `v=spf1 include:icloud.com ~all`, TXT `apple-domain=…`, CNAME `sig1._domainkey` | iCloud mail; don't delete these |
