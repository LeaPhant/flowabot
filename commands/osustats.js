const osu = require('../osu.js');
const helper = require('../helper.js');
const axios = require('axios');
const { DateTime } = require('luxon')

const ARGS = ["-start", "-from", "-end", "-to", "-tags", "-min", "-max", "-stars", "-length-min", "-length-max", "-spinners-min", "-spinners-max", "-mods", "-m"]

module.exports = {
    command: ['osustatscounts', 'osustats', 'osc'],
    description: "Get leaderboard position counts",
    usage: '[username]',
    example: [
        {
            run: "osc xasuma",
            result: "Returns the leaderboard positions for xasuma."
        },
        {
            run: "osc wubwoofwolf -length-min 60 -length-max 300 -min 1 -max 5 -start 2010-01-01 -end 2013-01-01 -spinners-min 1 -spinners-max 3",
            result: "Returns the leaderboard positions for WubWoofWolf with the given parameters."
        }
    ],
    call: obj => {
        return new Promise(async (resolve, reject) => {
            let { argv, msg, user_ign } = obj;
            let filteredArgv = argv
            if (ARGS.includes(argv[1]) || argv[1].startsWith("+")) {
                filteredArgv = argv.splice(0, 1)
            } else {
                filteredArgv = argv.splice(0, 2)
            }

            let osu_user = helper.getUsername(filteredArgv, msg, user_ign);

            if (!osu_user) {
                if (user_ign[msg.author.id] == undefined)
                    reject(helper.commandHelp('ign-set'));
                else
                    reject(helper.commandHelp('osu'));

                return false;
            }

            const { user_id } = await osu.get_user_id(osu_user)

            let search = {}
            let mods_array = []
            let stars = ""
            for (const [i, arg] of argv.entries()) {
                if (arg == "-start" || arg == "-from")
                    search["from"] = argv[i + 1]
                if (arg == "-end" || arg == "-to")
                    search["to"] = argv[i + 1]
                if (arg == "-tags")
                    search["tags"] = argv[i + 1]
                if (arg == "-stars") {
                    search["star_rating"] = argv[i + 1]
                } else {
                    if (arg == "-min") {
                        stars += argv[i + 1] + "-"
                    }
                    if (arg == "-max")
                        if (stars.endsWith("-"))
                            stars += argv[i + 1]
                        else
                            stars += "-" + argv[i + 1]
                }
                if (arg == "-length-min")
                    search["length_min"] = argv[i + 1]
                if (arg == "-length-max")
                    search["length_max"] = argv[i + 1]
                if (arg == "-spinners-min")
                    search["spinners_min"] = argv[i + 1]
                if (arg == "-spinners-max")
                    search["spinners_max"] = argv[i + 1]
                if (arg == "-mods" || arg == "-m") {
                    const modString = argv[i + 1].replace(/\+/g, "")
                    modString.toUpperCase().match(/.{2}/g).forEach(m => {
                        mods_array.push(m)
                    })
                }
            }
            if (mods_array.length > 0) {
                if (mods_array.includes("NC") && !mods_array.includes("DT"))
                    mods_array.push("DT")
                if (mods_array.includes("PF") && !mods_array.includes("SD"))
                    mods_array.push("SD")

                search["mods"] = mods_array.join("")
            }

            if (stars.length > 0) {
                if (stars.startsWith("-")) {
                    stars = "0" + stars
                }
                if (stars.endsWith("-")) {
                    stars += "99"
                }
                search["star_rating"] = stars
            }

            let searchParamsString = "";
            if (Object.keys(search).length != 0) {
                const params = new URLSearchParams(search)
                searchParamsString = "?" + params.toString()
            }

            const res = await axios.get(`https://osustats.respektive.pw/counts/${user_id}${searchParamsString}`)
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
                    output += `Top 15s:\t${counts.top15s ?? 0}\n`
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
