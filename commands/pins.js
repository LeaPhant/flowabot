const osu = require('../osu.js');
const helper = require('../helper.js');
const { DateTime } = require('luxon');
const config = require('../config.json');
const fetch = require('node-fetch');

module.exports = {
    command: ['pins', 'pinned'],
    description: "Show a list of pinned plays",
    startsWith: true,
    usage: '[username]',
    example: [
        {
            run: "pins",
            result: "Returns your top 5 pinned plays."
        },
        {
            run: "pins7 vaxei",
            result: "Returns Vaxei's top 7 pinned plays."
        }
    ],
    configRequired: ['credentials.client_id', 'credentials.client_secret'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let pin_user = helper.getUsername(argv, msg, user_ign);

            let count = 5;
            let match = argv[0].match(/\d+/);

            if(match != null && !isNaN(match[0]))
                count = Math.max(1, Math.min(match[0], 25));

            if(!pin_user){
                if(user_ign[msg.author.id] == undefined){
                    reject(helper.commandHelp('ign-set'));
                }else{
                    reject(helper.commandHelp('pins'));
                }

                return false;
            }else{

                osu.get_pins({user: pin_user, count}).then(response => {

                    const { pins, user } = response;

                    let embed = {fields: []};
                    embed.color = 12277111;
                    embed.author = {
                        url: `https://osu.ppy.sh/u/${user.id}`,
                        name: `${user.username} – ${Number(user.statistics.pp).toFixed(2)}pp (#${Number(user.statistics.global_rank).toLocaleString()})`,
                        icon_url: user.avatar_url
                    };

                    embed.thumbnail = {
                        url: pins[0].beatmapset.covers.list
                    };

                    embed.fields = [];

                    for(const pin of pins){
                        let name = `${pin.rank_emoji} ${pin.stars.toFixed(2)}★ ${pin.beatmap.artist} - ${pin.beatmap.title} [${pin.beatmap.version}]`;

                        if(pin.mods.length > 0)
                            name += ` +${pin.mods.join(",")}`;

                        name += ` ${pin.accuracy}%`;

                        let value = `[🔗](https://osu.ppy.sh/b/${pin.beatmap.beatmap_id}) `;

                        if(Number(pin.max_combo) < pin.beatmap.max_combo && pin.pp_fc > pin.pp)
                            value += `**${Number(pin.pp).toFixed(2)}pp** ➔ ${pin.pp_fc.toFixed(2)}pp for ${pin.acc_fc}% FC${helper.sep}`;
                        else
                            value += `**${Number(pin.pp).toFixed(2)}pp**${helper.sep}`

                        if(Number(pin.max_combo) < pin.beatmap.max_combo)
                            value += `${pin.max_combo}/${pin.beatmap.max_combo}x`;
                        else
                            value += `${pin.max_combo}x`;

                            if(Number(pin.statistics.count_100) > 0 || Number(pin.statistics.count_50) > 0 || Number(pin.statistics.count_miss) > 0)
                            value += helper.sep;

                        if(Number(pin.statistics.count_100) > 0)
                            value += `${pin.statistics.count_100}x100`;

                        if(Number(pin.statistics.count_50) > 0){
                            if(Number(pin.statistics.count_100) > 0) value += helper.sep;
                            value += `${pin.statistics.count_50}x50`;
                        }

                        if(Number(pin.statistics.count_miss) > 0){
                            if(Number(pin.statistics.count_100) > 0 || Number(pin.statistics.count_50) > 0) value += helper.sep;
                            value += `${pin.statistics.count_miss}xMiss`;
                        }

                        value += `${helper.sep}${DateTime.fromISO(pin.created_at).toRelative()}`

                        embed.fields.push({ name, value })
                    }

                    resolve({ embed });
                }).catch(err => {
                    helper.error(err);
                    reject(err);
                    return false;
                });

                    
            }
        })
    }
};
