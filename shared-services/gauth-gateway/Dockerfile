FROM node:20-alpine
WORKDIR /app
COPY gauth-gateway/package*.json ./
RUN npm ci --omit=dev
COPY gauth-gateway/src/ ./src/
COPY manifests/ /manifests/
EXPOSE 4013
CMD ["node", "src/server.js"]
