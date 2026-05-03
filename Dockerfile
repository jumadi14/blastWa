FROM ghcr.io/puppeteer/puppeteer:latest

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ✅ Path Chrome yang benar untuk image ini
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-for-testing

EXPOSE 10000

CMD ["node", "server.js"]
