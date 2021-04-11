FROM node:14

RUN apt-get update \
    && apt-get install -qq libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++ jq

WORKDIR /root

RUN wget -q https://download.visualstudio.microsoft.com/download/pr/ab82011d-2549-4e23-a8a9-a2b522a31f27/6e615d6177e49c3e874d05ee3566e8bf/dotnet-sdk-3.1.407-linux-x64.tar.gz \
    && mkdir -p dotnet \
    && tar zxf dotnet-sdk-3.1.407-linux-x64.tar.gz -C dotnet

ENV PATH="/root/dotnet:${PATH}"
ENV DOTNET_ROOT=/root/dotnet

WORKDIR /opt/osu-tools

RUN git clone --recurse-submodules https://github.com/ppy/osu-tools.git .

RUN bash build.sh

WORKDIR /usr/src/app

COPY package*.json ./

RUN echo yes | npm install

COPY . .

RUN jq --indent 4 '.pp_path = "/opt/osu-tools/PerformanceCalculator/bin/Release/netcoreapp3.1/PerformanceCalculator.dll"' \
    config.default.json > tmp.$$.json && mv tmp.$$.json config.default.json

CMD ["npm", "start"]
