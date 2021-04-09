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

            console.log('count', count);

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
                        url: `https://osu.ppy.sh/u/${user.user_id}`,
                        name: `${user.username} – ${Number(user.pp_raw).toFixed(2)}pp (#${Number(user.pp_rank).toLocaleString()})`,
                        icon_url: `https://a.ppy.sh/${user.user_id}?${+new Date()}}`
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

                        let value = `[🔗](https://osu.ppy.sh/b/${top.beatmap_id}) `;

                        if(Number(top.maxcombo) < top.beatmap.max_combo && top.pp_fc > top.pp)
                            value += `**${Number(top.pp).toFixed(2)}pp** ➔ ${top.pp_fc.toFixed(2)}pp for ${top.acc_fc}% FC${helper.sep}`;
                        else
                            value += `**${Number(top.pp).toFixed(2)}pp**${helper.sep}`

                        if(Number(top.maxcombo) < top.beatmap.max_combo)
                            value += `${top.maxcombo}/${top.beatmap.max_combo}x`;
                        else
                            value += `${top.maxcombo}x`;

                        if(Number(top.count100) > 0 || Number(top.count50) > 0 || Number(top.countmiss) > 0)
                            value += helper.sep;

                        if(Number(top.count100) > 0)
                            value += `${top.count100}x100`;

                        if(Number(top.count50) > 0){
                            if(Number(top.count100) > 0) value += helper.sep;
                            value += `${top.count50}x50`;
                        }

                        if(Number(top.countmiss) > 0){
                            if(Number(top.count100) > 0 || Number(top.count50) > 0) value += helper.sep;
                            value += `${top.countmiss}xMiss`;
                        }

                        value += `${helper.sep}${DateTime.fromSQL(top.date).toRelative()}`

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
