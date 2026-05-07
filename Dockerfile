FROM node:20-bullseye

# Install ffmpeg + python (for yt-dlp)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --no-cache-dir yt-dlp \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json /app/package.json
RUN npm install --omit=dev

COPY . /app

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]

