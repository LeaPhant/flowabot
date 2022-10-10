const osu = require('../osu.js');
const helper = require('../helper.js');
const axios = require('axios');
const { DateTime } = require('luxon')

module.exports = {
    command: ['osustatscounts', 'osustats', 'osc'],
    description: "Get leaderboard position counts",
    usage: '[username]',
    example: [
        {
            run: "osc xasuma",
            result: "Returns the leaderboard positions for xasuma."
        },
    ],
    call: obj => {
        return new Promise(async (resolve, reject) => {
            let { argv, msg, user_ign } = obj;
            let osu_user = helper.getUsername(argv, msg, user_ign);

            if (!osu_user) {
                if (user_ign[msg.author.id] == undefined)
                    reject(helper.commandHelp('ign-set'));
                else
                    reject(helper.commandHelp('osu'));

                return false;
            }

            const { user_id } = await osu.get_user_id(osu_user)

            const res = await axios.get(`https://osustats.respektive.pw/counts/${user_id}`)
            const counts = res.data
            const res2 = await axios.get("https://osustats.respektive.pw/last_update")
            const last_update = res2.data.last_update

            if (counts) {
                osu.get_user({ u: osu_user }, (err, embed) => {
                    if (err) {
                        reject(err);
                        helper.error(err);
                        return false;
                    }

                    let output = ""
                    output += `\`\`\`\n`
                    output += `Top 1s :\t${counts.top1s ?? 0}\n`
                    output += `Top 8s :\t${counts.top8s ?? 0}\n`
                    output += `Top 25s:\t${counts.top25s ?? 0}\n`
                    output += `Top 50s:\t${counts.top50s ?? 0}\n`
                    output += `\`\`\``

                    embed.fields = []
                    embed.footer = {
                        text: `Last update: ${DateTime.fromISO(last_update).toRelative()}${helper.sep}${last_update.replace(/T/g, " ").split(".")[0]} UTC`
                    }
                    embed.description = output

                    resolve({ embed: embed });
                })

            } else {
                reject("Couldn't find this User");
            }
        });
    }
};
