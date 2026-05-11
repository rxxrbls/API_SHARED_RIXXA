FROM node:20-alpine
WORKDIR /app
COPY paymongo/package*.json ./
RUN npm ci --omit=dev
COPY paymongo/src/ ./src/
# Manifests copied to /manifests/ so that path.resolve(__dirname, '../../manifests/')
# from /app/src resolves correctly to /manifests/ at runtime.
COPY manifests/ /manifests/
EXPOSE 4010
CMD ["node", "src/server.js"]
