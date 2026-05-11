FROM node:20-alpine
WORKDIR /app
COPY sms-gateway/package*.json ./
RUN npm ci --omit=dev
COPY sms-gateway/src/ ./src/
COPY manifests/ /manifests/
EXPOSE 4011
CMD ["node", "src/server.js"]
