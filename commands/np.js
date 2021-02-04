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

module.exports = {
    command: 'np',
    description: "Shows what song you are currently listening to. If it can't be retrieved from Rich Presence it will ask for a Last.fm username.",
    usage: '[last.fm username]',
    configRequired: ['credentials.last_fm_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let activities = msg.author.presence.activities;

            console.log(msg.author.presence);

            let embed;

            for(const presence of activities){
                if(presence.name !== null
                && ['Spotify', 'osu!'].includes(presence.name)){
                    if(presence.name == 'osu!' && presence.details != null){
                        let artist_title = presence.details;
                        let username = presence.assets.largeText;
                        let profile_link;
    
                        if(username.includes('('))
                            profile_link = `https://osu.ppy.sh/u/${username.split('(')[0].trim()}`;
    
                        let playing_text = presence.state.startsWith('Spectating') ?
                            presence.state : 'Playing';
    
    
                        embed = {
                            color: 12277111,
                            author: {
                                name: msg.member.nickname || msg.member.username,
                                icon_url: msg.author.avatarURL()
                            },
                            title: artist_title,
                            footer: {
                                icon_url: "https://osu.ppy.sh/favicon-32x32.png",
                                text: `osu!${helper.sep}${playing_text} right now`
                            }
                        };
    
                        if(profile_link)
                            embed.author.url = profile_link;
                    }else{
                        let title = presence.details;
                        let artist = presence.state;
                        let album = presence.assets;
                        let album_name = album.largeText;
                        let album_cover = album.largeImage.split(':');
                        let track_url = `https://open.spotify.com/track/${presence.syncID}`;
                        let username = msg.author.username;
    
                        if(msg.member !== null && msg.member.nickname !== null)
                            username = msg.member.nickname;
    
                        if(album_cover.length > 1){
                            album_cover = `https://i.scdn.co/image/${album_cover[1]}`;
    
                            embed = {
                                color: 1947988,
                                author: {
                                    name: username,
                                    icon_url: msg.author.avatarURL()
                                },
                                footer: {
                                    icon_url: "https://cdn.discordapp.com/attachments/572429763700981780/807009451173216277/favicon-1.png",
                                    text: `Spotify${helper.sep}Listening right now`
                                },
                                thumbnail: {
                                    url: album_cover
                                },
                                title: `**${artist}** – ${title}`,
                                description: `Album: **${album_name}**`,
                                url: track_url
                            }
                        }
                    }
                }
            }

            if(embed){
                resolve({embed: embed});
                return true;
            }

            if(argv.length < 2){
                reject('Currently not sharing any listening status. Please specify a Last.fm username.')
                return false;
            }

            lastFm.defaults.params.api_key = config.credentials.last_fm_key;

            let requests = [
                lastFm.get('', { params: { method: 'user.getinfo', user: argv[1] }}),
                lastFm.get('', { params: { method: 'user.getrecenttracks',  user: argv[1], limit: 1 }})
            ];

            Promise.all(requests).then(response => {
                let user = response[0].data.user;
                let recent_tracks = response[1].data.recenttracks;
                if(recent_tracks.track.length == 0){
                    reject(`This user hasn't listened to anything yet`);
                }else{
                    let listening_text = "";
                    let track = recent_tracks.track[0];

                    if(track["@attr"] != undefined && track["@attr"].nowplaying == 'true'){
                        listening_text = 'Listening right now';
                    }else{
                        listening_text = `Listened ${moment.unix(track.date.uts).fromNow()}`;
                    }

                    embed = {
                        color: 13959168,
                        footer: {
                            icon_url: "https://cdn.discordapp.com/attachments/532034792804581379/591679254656319556/lastfm-1.png",
                            text: `Last.fm${helper.sep}${listening_text}`
                        },
                        thumbnail: {
                            url: track.image[2]["#text"]
                        },
                        title: `**${track.artist["#text"]}** – ${track.name}`,
                        url: track.url,
                        author: {
                            name: user.name,
                            url: user.url,
                            icon_url: user.image["0"]["#text"]
                        }
                    };
                    
                    if(track.album["#text"].length > 0)
                        embed.description = `⠀\nAlbum: **${track.album["#text"]}**`

                    resolve({ embed: embed });
                }
            }).catch(err => {
                if(config.debug)
                    helper.error(err);

                reject('User not found');
            });
        });
    }
};
