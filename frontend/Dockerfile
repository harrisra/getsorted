FROM node:20-slim AS base

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# --- dev: Vite dev server with HMR, source mounted as a volume -------------
FROM base AS dev

COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]

# --- build -------------------------------------------------------------------
FROM base AS build
ARG VITE_API_BASE_URL
ARG VITE_GOOGLE_OAUTH_CLIENT_ID
# Short git commit SHA baked in at build time (see .github/workflows/ci.yml) —
# shown next to the logo so it's obvious which build is running on a given
# deployment target. Blank in local dev, where this isn't set.
ARG VITE_GIT_SHA
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_GOOGLE_OAUTH_CLIENT_ID=${VITE_GOOGLE_OAUTH_CLIENT_ID}
ENV VITE_GIT_SHA=${VITE_GIT_SHA}
COPY . .
RUN npm run build

# --- prod: static build served by nginx --------------------------------------
FROM nginx:1.27-alpine AS prod

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
