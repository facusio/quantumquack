# Imagen chica para no pasar los 0,5 GB gratis de Artifact Registry.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM gcr.io/distroless/nodejs22-debian13:nonroot
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY server.js ./
COPY public ./public
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["server.js"]
