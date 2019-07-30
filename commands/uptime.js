const axios = require('axios');
const moment = require('moment');
require("moment-duration-format");

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

                console.log('USER ID', user_id);

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
                            resolve(
                                `${name} has been live for ${moment.duration(moment().unix() - moment(vod.created_at).unix(), "seconds").format("h [hour and] m [minute]")}
                            `);
                        }else{
                            let duration = moment().unix() - (moment(vod.created_at).unix() + vod.length);

                            if(duration < 60){
                                resolve(
                                    `${name} hasn't streamed in ${moment.duration(duration, 'seconds').format('s [second]')}
                                `);
                            }else if(duration < 60 * 60){
                                resolve(
                                    `${name} hasn't streamed in ${moment.duration(duration, 'seconds').format('m [minute]')}
                                `);
                            }else{
                                resolve(
                                    `${name} hasn't streamed in ${moment.duration(duration, 'seconds').format('d [day and] h [hour]')}
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
