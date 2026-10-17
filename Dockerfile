FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=3000 NODE_ENV=production
# campus database lives here — mount a volume so it survives redeploys
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server/index.js"]
