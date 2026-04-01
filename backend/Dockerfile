FROM node:22-alpine

RUN apk add --no-cache ffmpeg python3 py3-pip

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "src/index.js"]
