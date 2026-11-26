FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

RUN npm install --prefix server && npm install --prefix client

COPY content ./content
COPY server ./server
COPY client ./client

RUN npm run build --prefix client && npm run build --prefix server

ENV NODE_ENV=production
ENV PORT=3080

EXPOSE 3080

VOLUME ["/app/data"]

CMD ["node", "server/dist/index.js"]
