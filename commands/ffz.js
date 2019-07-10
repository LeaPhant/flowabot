const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const helper = require('../helper.js');
const Discord = require('discord.js');

const ffzApi = axios.create({
    baseURL: 'https://api.frankerfacez.com/v1'
})

module.exports = {
    command: 'ffz',
    description: "Show an FFZ emote by name. Emotes from <https://frankerfacez.com/>.",
    argsRequired: 1,
    usage: '<emote name>',
    example: {
        run: 'ffz WoweeW',
        result: 'Returns WoweeW FFZ emote'
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let q = argv[1];

            ffzApi.get('/emoticons', {
                params: {
                    q: q,
                    sort: 'count',
                    per_page: 200
                }
            }).then(response => {
                let emoticons = response.data.emoticons;

                if(emoticons.length > 0){
                    let exactMatch = emoticons.filter(a => a.name.toLowerCase() == q);
                    let emote;
                    if(exactMatch.length > 0){
                        emote = exactMatch[0]
                    }else{
                        emote = emoticons[0]
                    }

                    let emoteUrl = "";

                    if("2" in emote.urls)
                        emoteUrl = emote.urls["2"];
                    else
                        emoteUrl = emote.urls["1"];

                    if(emoteUrl.startsWith("//"))
                        emoteUrl = "https:" + emoteUrl;

                    let file = path.resolve(os.tmpdir(), `emote_${emote.name}_${helper.getRandomArbitrary(1000, 9999)}.png`);

                    axios.get(emoteUrl, {responseType: 'stream'}).then(response => {
                        let stream = response.data.pipe(fs.createWriteStream(file));

                        stream.on('finish', () => {
                            let attachment = new Discord.Attachment(file, "emote.png");
                            resolve({embed: {
                                title: emote.name,
                                url: `https://www.frankerfacez.com/emoticon/${emote.id}`,
                                image: {
                                    url: "attachment://emote.png"
                                },
                                footer: {
                                    text: `Submitted by ${emote.owner.display_name}`
                                }
                            }, file: attachment}).then(() => {
                                fs.unlinkSync(file);
                            });
                        });
                    });
                }else{
                    reject(`FFZ emote ${q} not found.`);
                }
            }).catch(err => {
                helper.error(err);
                reject(`FFZ emote ${q} not found.`);
            });
        });
    }
};
