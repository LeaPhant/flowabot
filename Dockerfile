FROM node:10

RUN apt-get update \
    && apt-get install -qq libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++

WORKDIR /usr/src/app

COPY package*.json ./

RUN echo yes | npm install

COPY . .

CMD ["npm", "start"]
