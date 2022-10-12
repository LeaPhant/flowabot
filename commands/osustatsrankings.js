const osu = require('../osu.js');
const helper = require('../helper.js');
const axios = require('axios');
const { DateTime } = require('luxon')

const title = (type) => `Top ${type.replace(/\D/g, "")} Score Count Rankings`

module.exports = {
    command: ['osustatsrankings', 'osr', 'top50s', 'top25s', 'top15s', 'top8s', 'top1s'],
    description: "Get leaderboard position rankings for osu!",
    usage: '[username]',
    example: [
        {
            run: "osr",
            result: "Returns the top50s leaderboard position rankings."
        },
        {
            run: "top8s -length-min 60 -length-max 300 -min 1 -max 5 -start 2010-01-01 -end 2013-01-01 -spinners-min 1 -spinners-max 3",
            result: "Returns the top8s leaderboard position rankings with the given parameters."
        }
    ],
    call: obj => {
        return new Promise(async (resolve, reject) => {
            let { argv, msg, user_ign } = obj;

            const type = argv[0] == "osr" || argv[0] == "osustatsrankings" ? "top50s" : argv[0]

            let search = {
                "limit": 10,
                "page": 1,
            }
            let mods_array = []
            let mods_include_array = []
            let mods_exclude_array = []
            let stars = ""
            for (const [i, arg] of argv.entries()) {
                if (arg == "-page" || arg == "-p")
                    search["page"] = argv[i + 1]
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
                if (arg == "-is") {
                    const modString = argv[i + 1].replace(/\+/g, "")
                    modString.toUpperCase().match(/.{2}/g).forEach(m => {
                        mods_include_array.push(m)
                    })
                }
                if (arg == "-isnot" || arg == "-not") {
                    const modString = argv[i + 1].replace(/\+/g, "")
                    modString.toUpperCase().match(/.{2}/g).forEach(m => {
                        mods_exclude_array.push(m)
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
            if (mods_include_array.length > 0) {
                if (mods_include_array.includes("NC") && !mods_include_array.includes("DT"))
                    mods_include_array.push("DT")
                if (mods_include_array.includes("PF") && !mods_include_array.includes("SD"))
                    mods_include_array.push("SD")

                search["mods_include"] = mods_include_array.join("")
            }
            if (mods_exclude_array.length > 0) {
                if (mods_exclude_array.includes("NC") && !mods_exclude_array.includes("DT"))
                    mods_exclude_array.push("DT")
                if (mods_exclude_array.includes("PF") && !mods_exclude_array.includes("SD"))
                    mods_exclude_array.push("SD")

                search["mods_exclude"] = mods_exclude_array.join("")
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

            const res = await axios.get(`https://osustats.respektive.pw/rankings/${type}${searchParamsString}`)
            const rankings = res.data
            const res2 = await axios.get("https://osustats.respektive.pw/last_update")
            const last_update = res2.data.last_update

            if (rankings) {
                let embed = {
                    color: 12277111,
                    footer: {
                        text: `Last update: ${DateTime.fromISO(last_update).toRelative()}${helper.sep}${last_update.replace(/T/g, " ").split(".")[0]} UTC`
                    },
                    title: title(type)
                }

                let output = ""

                const biggest_count = Math.max(...(rankings.map(el => el[type].toString().length)));
                const longest_name = Math.max(...(rankings.map(el => el.username.length)));
                for (const user of rankings) {
                    output += `\`#${user.rank}${user.rank < 10 ? " " : ""}\``
                    output += `:flag_${user.country.toLowerCase()}:\``
                    output += `${user.username}${" ".repeat(longest_name - user.username.length)}\``
                    output += ` \`${user[type].toLocaleString()}${" ".repeat(biggest_count - user[type].toString().length)}\`\n`
                }

                embed.description = output

                resolve({ embed: embed });

            } else {
                reject("Couldn't find this User");
            }
        });
    }
};
