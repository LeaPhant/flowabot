FROM node:24-alpine AS base
RUN apk update && apk add \
curl \
ffmpeg \
jq

WORKDIR /flowabot

VOLUME [ "/maps", "/mapsets", "/replays", "/store" ]

COPY docker/entrypoint.sh ./entrypoint
COPY docker/config.json ./config.json

COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY .gitignore ./.gitignore

RUN npm ci

COPY commands ./commands
COPY emotes ./emotes
COPY handlers ./handlers
COPY renderer ./renderer
COPY res ./res

COPY fantasynamegen.js ./fantasynamegen.js
COPY generate-config.js ./generate-config.js
COPY helper.js ./helper.js
COPY index.js ./index.js
COPY osu.js ./osu.js
COPY underscore-min.js ./underscore-min.js
COPY upload-emojis.js ./upload-emojis.js

ENTRYPOINT [ "/flowabot/entrypoint" ]
