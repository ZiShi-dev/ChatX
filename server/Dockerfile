FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
COPY releases ./releases
COPY update-public.pem /update-public.pem
ENV CHATX_RELEASE_DIR=/app/releases
ENV PORT=8787
ENV NODE_ENV=production
EXPOSE 8787
RUN apk add --no-cache su-exec
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/main.ts"]
