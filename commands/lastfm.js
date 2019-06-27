const axios = require('axios');
const moment = require('moment');
require("moment-duration-format");

const helper = require('../helper.js');
const config = require('../config.json');

const lastFm = axios.create({
    baseURL: 'http://ws.audioscrobbler.com/2.0/',
    params: {
        format: 'json'
    }
});

const periods = {
    '7day': {
        name: 'Stats for the last 7 days',
        time: 7 * 24 * 60 * 60
    },
    '1month': {
        name: 'Stats for the last 30 days',
        time: 30 * 24 * 60 * 60
    },
    '3month': {
        name: 'Stats for the last 3 months',
        time: 90 * 24 * 60 * 60
    },
    '6month': {
        name: 'Stats for the last 6 months',
        time: 180 * 24 * 60 * 60
    },
    '12month': {
        name: 'Stats for the last year',
        time: 360 * 24 * 60 * 60
    },
    'overall': {
        name: 'Stats of all time',
        time: -Number.MAX_SAFE_INTEGER
    }
};

module.exports = {
    command: 'lastfm',
    description: "Show Last.fm stats for a user.",
    argsRequired: 1,
    usage: `<last.fm username> [period (${Object.keys(periods).join(', ')})]`,
    example: {
        run: 'lastfm rj overall',
        result: "Returns total last.fm stats for rj."
    },
    configRequired: ['credentials.last_fm_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;
            let period = '1month';

            lastFm.defaults.params.api_key = config.credentials.last_fm_key;

            if(argv.length > 2){
                if(Object.keys(periods).includes(argv[2])){
                    period = argv[2];
                }else{
                    msg.channel.send(`Invalid time period! (\`${Object.keys(periods).join(', ')})`);
                    return false;
                }
            }

            let requests = [
                lastFm.get('', { params: { method: 'user.getinfo', user: argv[1] }}),
                lastFm.get('', { params: { method: 'user.gettopartists', limit: 4, user: argv[1], period: period }}),
                lastFm.get('', { params: { method: 'user.gettoptracks', limit: 4, user: argv[1], period: period }}),
                lastFm.get('', { params: { method: 'user.getrecenttracks', limit: 2, user: argv[1], from: moment().unix() - periods[period].time }})
            ];

            Promise.all(requests).then(response => {
                let user = response[0].data.user;
                let top_artists = response[1].data.topartists;
                let top_tracks = response[2].data.toptracks;
                let recent_tracks = response[3].data.recenttracks;

                let recent_tracks_string = "";
                let top_artists_string = "";
                let top_tracks_string = "";

                recent_tracks.track.forEach((track, index) => {
                    if(index > 0)
                        recent_tracks_string += "\n";
                    let track_date;
                    if(track["@attr"] != undefined && track["@attr"].nowplaying == 'true')
                        track_date = "now playing";
                    else
                        track_date = moment.unix(track.date.uts).fromNow();
                    recent_tracks_string += `**${track.artist["#text"]}** – ${track.name} *(${track_date})*`;
                });

                top_artists.artist.forEach((artist, index) => {
                    if(index > 0)
                        top_artists_string += "\n";
                    top_artists_string += `${artist.name} ▸ ${artist.playcount}`;
                });

                top_tracks.track.forEach((track, index) => {
                    if(index > 0)
                        top_tracks_string += "\n";
                    top_tracks_string += `**${track.artist.name}** – ${track.name} ▸ ${track.playcount}`;
                });

                if(top_artists.artist.length == 0)
                    top_artists_string = 'No scrobbles in the selected timeframe';

                if(top_tracks.track.length == 0)
                    top_tracks_string = 'No scrobbles in the selected timeframe';

                let embed = {
                    color: 13959168,
                    description: periods[period].name,
                    footer: {
                        icon_url: "https://cdn.discordapp.com/attachments/532034792804581379/591679254656319556/lastfm-1.png",
                        text: `Last.fm${helper.sep}Scrobbling since ${moment.unix(user.registered.unixtime).format('D MMMM YYYY')}`
                    },
                    thumbnail: {
                        url: user.image["2"]["#text"]
                    },
                    author: {
                        name: user.name,
                        url: user.url,
                        icon_url: user.image["0"]["#text"]
                    }
                };

                if(recent_tracks.track.length == 0 || top_artists.artist.length == 0 || top_tracks.track.length == 0){
                    embed.fields = [
                        {
                            name: "Total Scrobbles",
                            value: user.playcount
                        },
                        {
                            name: "Recent Tracks",
                            value: "No scrobbles for the selected timeframe"
                        }
                    ];
                }else{
                    embed.fields = [
                        {
                            name: "Scrobbles",
                            value: recent_tracks["@attr"].total
                        },
                        {
                            name: "Recent Tracks",
                            value: recent_tracks_string
                        },
                        {
                            name: "Top Artists",
                            value: top_artists_string
                        },
                        {
                            name: "Top Songs",
                            value: top_tracks_string
                        }
                    ];
                }

                resolve({embed: embed});
            }).catch(err => {
               if(config.debug)
                   helper.error(err);

               reject('User not found');
            });
        });
    }
};
