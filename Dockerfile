FROM ghcr.io/puppeteer/puppeteer:latest
USER root
WORKDIR /app
COPY package*.json ./
RUN npm install

# ✅ Print path Chrome untuk kita tahu
RUN find /home -name "chrome" -type f 2>/dev/null && \
    find /usr -name "chrome" -type f 2>/dev/null && \
    find /root -name "chrome" -type f 2>/dev/null

COPY . .
EXPOSE 10000
CMD ["node", "server.js"]
