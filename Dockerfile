# Fronted: web app + Playwright portal worker in one container.
# The Playwright base image ships Node and Chromium with its system libraries.
FROM mcr.microsoft.com/playwright:v1.65.0-noble

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    CLAUDE_MODE=replay \
    PORTAL_RUNNER=headless \
    ISSUER=mock

# better-sqlite3 has no prebuilt binary for this Node version, so compile it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

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
