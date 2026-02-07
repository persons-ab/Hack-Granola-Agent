FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json SOUL.md ./
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p data/meetings data/vector-index

EXPOSE 3030

CMD ["npm", "start"]
