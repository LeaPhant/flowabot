FROM node:10

RUN apt-get update \
    && apt-get install -qq libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++ jq

WORKDIR /root

RUN wget -q https://download.visualstudio.microsoft.com/download/pr/3224f4c4-8333-4b78-b357-144f7d575ce5/ce8cb4b466bba08d7554fe0900ddc9dd/dotnet-sdk-2.2.301-linux-x64.tar.gz \
    && mkdir -p dotnet \
    && tar zxf dotnet-sdk-2.2.301-linux-x64.tar.gz -C dotnet

ENV PATH="/root/dotnet:${PATH}"
ENV DOTNET_ROOT=/root/dotnet

WORKDIR /opt/osu-tools

RUN git clone --recurse-submodules https://github.com/ppy/osu-tools.git .

RUN bash build.sh

WORKDIR /usr/src/app

COPY package*.json ./

RUN echo yes | npm install

COPY . .

RUN jq --indent 4 '.pp_path = "/opt/osu-tools/PerformanceCalculator/bin/Release/netcoreapp2.0/PerformanceCalculator.dll"' \
    config.default.json > tmp.$$.json && mv tmp.$$.json config.default.json

CMD ["npm", "start"]
