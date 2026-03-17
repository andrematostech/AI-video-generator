FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./

RUN npm install

COPY . .

ENV NODE_ENV=development
ENV FFMPEG_PATH=ffmpeg

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
