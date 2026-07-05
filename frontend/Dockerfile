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

COPY . .
RUN npm run build

# --- prod: static build served by nginx --------------------------------------
FROM nginx:1.27-alpine AS prod

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
