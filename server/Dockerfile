FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
ENV PORT=8787
EXPOSE 8787
USER node
CMD ["node", "src/main.ts"]
