const helper = require('../helper.js');
const axios = require('axios');
const config = require('../config.json');

const twitchKraken = axios.create({
    baseURL: 'https://api.twitch.tv/kraken'
})

module.exports = {
    command: 'viewers',
    description: "See how many people are watching a Twitch channel.",
    argsRequired: 1,
    usage: '<twitch username>',
    example: {
        run: "viewers distortion2",
        result: "Returns how many viewers distortion2 currently has (if they're live)."
    },
    configRequired: ['credentials.twitch_client_id'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let channel_name = argv[1];

            twitchKraken.get(`/streams/${channel_name}`, {
                params: {
                    client_id: config.credentials.twitch_client_id
                }
            }).then(response => {
                let stream = response.data.stream;

                if(stream != null){
                    let display_name = stream.channel.display_name;
                    let viewers = stream.viewers.toLocaleString() + " viewer";
                    if(parseInt(stream.viewers) != 1) viewers += "s";
                    let game = stream.game;
                    let status = stream.channel.status;
                    let quality = Math.round(stream.video_height) + "p" + Math.round(stream.average_fps);
                    resolve(
                        `"${status}" - <https://twitch.tv/${stream.channel.name}> is currently streaming **${game}** for **${viewers}** [${quality}]`
                    );
                }else{
                    reject(`${channel_name} is currently not live`);
                }
            }).catch(err => {
                helper.error(err);
                reject('User not found');
            });
        });
    }
};
