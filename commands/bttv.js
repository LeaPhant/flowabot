const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const helper = require('../helper.js');
const Discord = require('discord.js');

const bttvApi = axios.create({
    baseURL: 'https://api.betterttv.net/3/emotes/shared'
});

module.exports = {
    command: 'bttv',
    description: "Show a BTTV emote by name. Emotes from <https://betterttv.com/>.",
    argsRequired: 1,
    usage: '<emote name>',
    example: {
        run: 'bttv WoweeHOP',
        result: 'Returns WoweeHOP BTTV emote'
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let q = argv[1].toLowerCase();

            bttvApi.get('/search', {
                params: {
                    query: q,
                    limit: 100
                }
            }).then(response => {
                let emoticons = response.data;

                if(emoticons.length > 0){
                    let exactMatch = emoticons.filter(a => a.code.toLowerCase() == q);
                    let emote;
                    if(exactMatch.length > 0){
                        emote = exactMatch[0]
                    }else{
                        emote = emoticons[0]
                    }

                    let emoteUrl = `https://cdn.betterttv.net/emote/${emote.id}/3x`;

                    let file = path.resolve(os.tmpdir(), `emote_${emote.code}_${helper.getRandomArbitrary(1000, 9999)}.${emote.imageType}`);

                    axios.get(emoteUrl, {responseType: 'stream'}).then(response => {
                        let stream = response.data.pipe(fs.createWriteStream(file));

                        stream.on('finish', () => {
                            let attachment = new Discord.Attachment(file, `emote.${emote.imageType}`);
                            resolve({embed: {
                                title: emote.code,
                                url: `https://betterttv.com/emotes/${emote.id}`,
                                image: {
                                    url: `attachment://emote.${emote.imageType}`
                                },
                                footer: {
                                    text: `Submitted by ${emote.user.displayName}`
                                }
                            }, file: attachment, remove_path: file});
                        });
                    });
                }else{
                    reject(`BTTV emote ${q} not found.`);
                }
            }).catch(err => {
                helper.error(err);
                reject(`BTTV emote ${q} not found.`);
            });
        });
    }
};
