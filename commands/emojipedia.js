const axios = require('axios');
const helper = require('../helper.js');
const cheerio = require('cheerio');

const emojipedia = axios.create({
    baseURL: 'https://emojipedia.org',
    responseType: 'document'
})

module.exports = {
    command: 'emojipedia',
    description: "Look up what an emoji looks like on all platforms (warning: spammy).",
    argsRequired: 1,
    usage: '<emoji>',
    example: {
        run: "emojipedia 🤔",
        result: "Returns thinking emoji on all platforms."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let emoji = encodeURIComponent(argv.slice(1).join('').trim());

            emojipedia.get(`/${emoji}/`).then(response => {
                let $ = cheerio.load(response.data);
                let embeds = [], promises = [];

                $('.vendor-rollout-target').each(function(){
                        let vendor = $(this).find('.vendor-info a');
                        let vendor_name = vendor.text();
                        let vendor_url = "https://emojipedia.org" + vendor.attr('href');
                        let img = $(this).find('img').attr('srcset').replace('/240/', '/60/').split(" ")[0];
                        embeds.push({ embed:
                            {
                                title: vendor_name,
                                url: vendor_url,
                                thumbnail: {
                                    url: img
                                }
                            }
                        });
                });

                embeds.forEach(function(embed){
                    promises.push(msg.channel.send(embed));
                });

                promises.reduce((p, fn) => p.then(fn), Promise.resolve());

                resolve();
            }).catch(err => {
                helper.error(err);
                reject(`Couldn't find emoji`);
            });
        });
    }
};
