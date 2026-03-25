FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

ENV HOST=0.0.0.0
ENV PORT=13720
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 13720

CMD ["npm", "run", "dev:api"]
