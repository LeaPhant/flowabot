const osu = require('../osu.js');
const helper = require('../helper.js');
const { DateTime } = require('luxon');
const config = require('../config.json');

module.exports = {
    command: 'tops',
    description: "Show a list of top plays",
    startsWith: true,
    usage: '[username]',
    example: [
        {
            run: "tops",
            result: "Returns your top 5 plays."
        },
        {
            run: "tops7 vaxei",
            result: "Returns Vaxei's top 7 plays."
        }
    ],
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let top_user = helper.getUsername(argv, msg, user_ign);

            let count = 5;
            let match = argv[0].match(/\d+/);

            if(match != null && !isNaN(match[0]))
                count = Math.max(1, Math.min(match[0], 25));

            if(!top_user){
                if(user_ign[msg.author.id] == undefined){
                    reject(helper.commandHelp('ign-set'));
                }else{
                    reject(helper.commandHelp('top'));
                }

                return false;
            }else{
                osu.get_tops({user: top_user, count}).then(response => {
                    const { tops, user } = response;

                    let embed = {fields: []};
                    embed.color = 12277111;
                    embed.author = {
                        url: `https://osu.ppy.sh/u/${user.id}`,
                        name: `${user.username} – ${Number(user.statistics.pp).toFixed(2)}pp (#${Number(user.statistics.global_rank).toLocaleString()})`,
                        icon_url: user.avatar_url
                    };

                    embed.thumbnail = {
                        url: `https://b.ppy.sh/thumb/${tops[0].beatmap.beatmapset_id}l.jpg`
                    };

                    embed.fields = [];

                    for(const top of tops){
                        let name = `${top.rank_emoji} ${top.stars.toFixed(2)}★ ${top.beatmap.artist} - ${top.beatmap.title} [${top.beatmap.version}]`;

                        if(top.mods.length > 0)
                            name += ` +${top.mods.join(",")}`;

                        name += ` ${top.accuracy}%`;

                        let value = `[🔗](https://osu.ppy.sh/b/${top.beatmap.id}) `;

                        if(Number(top.max_combo) < top.beatmap.max_combo && top.pp_fc > top.pp)
                            value += `**${Number(top.pp).toFixed(2)}pp** ➔ ${top.pp_fc.toFixed(2)}pp for ${top.acc_fc}% FC${helper.sep}`;
                        else
                            value += `**${Number(top.pp).toFixed(2)}pp**${helper.sep}`

                        if(Number(top.max_combo) < top.beatmap.max_combo)
                            value += `${top.max_combo}/${top.beatmap.max_combo}x`;
                        else
                            value += `${top.max_combo}x`;

                        if(Number(top.statistics.count_100) > 0 || Number(top.statistics.count_50) > 0 || Number(top.statistics.count_miss) > 0)
                            value += helper.sep;

                        if(Number(top.statistics.count_100) > 0)
                            value += `${top.statistics.count_100}x100`;

                        if(Number(top.statistics.count_50) > 0){
                            if(Number(top.statistics.count_100) > 0) value += helper.sep;
                            value += `${top.statistics.count_50}x50`;
                        }

                        if(Number(top.statistics.count_miss) > 0){
                            if(Number(top.statistics.count_100) > 0 || Number(top.statistics.count_50) > 0) value += helper.sep;
                            value += `${top.statistics.count_miss}xMiss`;
                        }

                        value += `${helper.sep}${DateTime.fromISO(top.created_at).toRelative()}`

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
