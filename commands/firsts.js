const osu = require('../osu.js');
const helper = require('../helper.js');
const { DateTime } = require('luxon');
const config = require('../config.json');
const fetch = require('node-fetch');

module.exports = {
    command: ['firsts'],
    description: "Show a list of first places",
    startsWith: true,
    usage: '[username]',
    example: [
        {
            run: "firsts",
            result: "Returns your top 5 first places."
        },
        {
            run: "firsts7 vaxei",
            result: "Returns Vaxei's top 7 first places."
        }
    ],
    configRequired: ['credentials.client_id', 'credentials.client_secret'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let firsts_user = helper.getUsername(argv, msg, user_ign);

            let count = 5;
            let match = argv[0].match(/\d+/);

            if(match != null && !isNaN(match[0]))
                count = Math.max(1, Math.min(match[0], 25));

            if(!firsts_user){
                if(user_ign[msg.author.id] == undefined){
                    reject(helper.commandHelp('ign-set'));
                }else{
                    reject(helper.commandHelp('firsts'));
                }

                return false;
            }else{

                osu.get_firsts({user: firsts_user, count},(err, response) => {
                    if(err){
                        helper.error(err);
                        reject(err);
                    }else{
                        const { firsts, user } = response;

                        let embed = {fields: []};
                        embed.color = 12277111;
                        embed.author = {
                            url: `https://osu.ppy.sh/u/${user.id}`,
                            name: `${user.username} – ${Number(user.statistics.pp).toFixed(2)}pp (#${Number(user.statistics.global_rank).toLocaleString()})`,
                            icon_url: user.avatar_url
                        };

                        embed.thumbnail = {
                            url: firsts[0].beatmapset.covers.list
                        };

                        embed.fields = [];

                        for(const first of firsts){
                            let name = `${first.rank_emoji} ${first.stars.toFixed(2)}★ ${first.beatmapset.artist} - ${first.beatmapset.title} [${first.beatmap.version}]`;

                            if(first.mods.length > 0)
                                name += ` +${first.mods.map(mod => mod.acronym).join(",")}`;

                            name += ` ${first.accuracy}%`;

                            let value = `[🔗](https://osu.ppy.sh/b/${first.beatmap.id}) `;

                            if(Number(first.max_combo) < first.beatmap.max_combo && first.pp_fc > first.pp)
                                value += `**${Number(first.pp).toFixed(2)}pp** ➔ ${first.pp_fc.toFixed(2)}pp for ${first.acc_fc}% FC${helper.sep}`;
                            else
                                value += `**${Number(first.pp).toFixed(2)}pp**${helper.sep}`

                            if(Number(first.max_combo) < first.beatmap.max_combo)
                                value += `${first.max_combo}/${first.beatmap.max_combo}x`;
                            else
                                value += `${first.max_combo}x`;

                            if(Number(first.statistics.ok ?? 0) > 0 || Number(first.statistics.meh ?? 0) > 0 || Number(first.statistics.miss ?? 0) > 0)
                                value += helper.sep;

                            if(Number(first.statistics.ok ?? 0) > 0)
                                value += `${first.statistics.ok}x100`;

                            if(Number(first.statistics.meh ?? 0) > 0){
                                if(Number(first.statistics.ok ?? 0) > 0) value += helper.sep;
                                value += `${first.statistics.meh ?? 0}x50`;
                            }

                            if(Number(first.statistics.miss ?? 0) > 0){
                                if(Number(first.statistics.ok ?? 0) > 0 || Number(first.statistics.meh ?? 0) > 0) value += helper.sep;
                                value += `${first.statistics.miss ?? 0}xMiss`;
                            }

                            value += `${helper.sep}<t:${DateTime.fromISO(first.ended_at).toSeconds()}:R>`

                            embed.fields.push({ name, value })
                        }

                        resolve({ embed });
                    }
                })   
            }
        })
    }
};
