# Fronted: web app + portal worker in one container. The worker runs in
# simulated mode (no browser), so a plain Node image is enough.
FROM node:22-bookworm-slim

# better-sqlite3 falls back to compiling when no prebuilt binary matches.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CLAUDE_MODE=replay \
    PORTAL_RUNNER=simulated \
    ISSUER=mock

COPY package.json package-lock.json ./
# Dev dependencies are needed at runtime: tsx runs the worker and launcher.
RUN npm ci --include=dev

COPY . .
RUN npx next build

# Railway sets PORT; default for local docker run.
ENV PORT=3000
EXPOSE 3000

# Reset + seed the demo org, then run next start and the worker.
CMD ["npx", "tsx", "scripts/demo.ts", "--prod", "--skip-build"]
