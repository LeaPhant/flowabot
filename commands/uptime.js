const axios = require('axios');
const { DateTime, Duration } = require('luxon');

const helper = require('../helper.js');
const config = require('../config.json');

const twitchKraken = axios.create({
    baseURL: 'https://api.twitch.tv/kraken',
    headers: {
        'Accept': 'application/vnd.twitchtv.v5+json',
        'Client-ID': config.credentials.twitch_client_id
    }
});

module.exports = {
    command: ['uptime', 'downtime'],
    description: "See how for long a Twitch channel has been live or for how long it hasn't been streaming.",
    argsRequired: 1,
    usage: '<twitch username>',
    example: [
        {
            run: "uptime distortion2",
            result: "Returns distortion2's uptime or downtime."
        },
        {
            run: "downtime ninja",
            result: "Returns ninja's uptime or downtime."
        }
    ],
    configRequired: ['credentials.twitch_client_id'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let channel_name = argv[1];

            twitchKraken.get(`/users`, {
                params: {
                    'login': channel_name,
                },
            }).then(response => {
                let users = response.data.users;

                if(users.length == 0){
                    reject('User not found');
                    return;
                }

                let user_id = users[0]._id;

                twitchKraken.get(`/channels/${user_id}/videos`, {
                    params: {
                        broadcast_type: 'archive',
                        limit: 1
                    }
                }).then(response => {
                    let videos = response.data.videos;

                    if(videos.length >= 1){
                        var vod = videos[0];
                        var name = vod.channel.display_name;

                        if(vod.status == 'recording'){
                            const uptimeMs = DateTime.now().toMillis() - DateTime.fromISO(vod.created_at).toMillis();
                            const duration = Duration.fromMillis(uptimeMs);

                            if(uptimeMs > 60 * 60 * 1000)
                            resolve(`${name} has been live for ${duration.toFormat("h'h 'm'm'")}`);
                            else
                                resolve(`${name} has been live for ${duration.toFormat("m'm'")}`);
                        }else{
                            const downtimeMs = DateTime.now().toMillis() - DateTime.fromISO(vod.created_at).toMillis() - vod.length * 1000;
                            const duration = Duration.fromMillis(downtimeMs);

                            if(downtimeMs < 60 * 1000){
                                resolve(
                                    `${name} hasn't streamed in ${duration.toFormat("s's'")}
                                `);
                            }else if(downtimeMs < 60 * 60 * 1000){
                                resolve(
                                    `${name} hasn't streamed in ${duration.toFormat("m'm'")}
                                `);
                            }else if(downtimeMs < 24 * 60 * 60 * 1000){
                                resolve(
                                    `${name} hasn't streamed in ${duration.toFormat("h'h'")}
                                `);
                            }else{
                                resolve(
                                    `${name} hasn't streamed in ${duration.toFormat("d'd' h'h'")}
                                `);
                            }
                        }
                    }else{
                        reject(`User either has VODs disabled or hasn't streamed in a while`);
                    }
                }).catch(err => {
                    reject('User not found');
                    helper.error(err);
                });
            }).catch(err => {
                reject('User not found');
                helper.error(err);
            });
        });
    }
};
