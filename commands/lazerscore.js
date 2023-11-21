const axios = require('axios');

const mods_enum = {
    ''    : 0,
    'NF'  : 1,
    'EZ'  : 2,
    'TD'  : 4,
    'HD'  : 8,
    'HR'  : 16,
    'SD'  : 32,
    'DT'  : 64,
    'RX'  : 128,
    'HT'  : 256,
    'NC'  : 512,
    'FL'  : 1024,
    'AT'  : 2048,
    'SO'  : 4096,
    'AP'  : 8192,
    'PF'  : 16384,
    '4K'  : 32768,
    '5K'  : 65536,
    '6K'  : 131072,
    '7K'  : 262144,
    '8K'  : 524288,
    'FI'  : 1048576,
    'RD'  : 2097152,
    'LM'  : 4194304,
    '9K'  : 16777216,
    '10K' : 33554432,
    '1K'  : 67108864,
    '3K'  : 134217728,
    '2K'  : 268435456,
    'V2'  : 536870912,
};


function modsMultiplier(mods) {
    let multiplier = 1.0;
    if (mods.includes("NF"))
        multiplier *= 0.5;
    if (mods.includes("EZ"))
        multiplier *= 0.5;
    if (mods.includes("HT"))
        multiplier *= 0.3;
    if (mods.includes("HD"))
        multiplier *= 1.06;
    if (mods.includes("HR"))
        multiplier *= 1.06;
    if (mods.includes("DT"))
        multiplier *= 1.12;
    if (mods.includes("FL"))
        multiplier *= 1.12;
    if (mods.includes("SO"))
        multiplier *= 0.9;
    if ((mods.includes("RX")) || (mods.includes("AP")))
        multiplier *= 0;
    return multiplier;
}

module.exports = {
    command: ['lazerscore', 'ls', 'classicscore'],
    description: "Calculate maximum lazer classic score for a beatmap.",
    argsRequired: 1,
    usage: '<map link> [+mods]',
    example: [
        {
            run: "ls https://osu.ppy.sh/b/75",
            result: "Returns the maximum lazer classic score for Disco Prince with no mods."
        },
        {
            run: "classicscore https://osu.ppy.sh/b/75 +HDHRDT",
            result: "Returns the maximum lazer classic score for Disco Prince +HDHRDT."
        }
    ],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let beatmap_url = argv[1];
            let mods = argv[2];
            if(mods){
                if(mods.startsWith("+")){
                    mods = mods.substring(1);
                }
            } else {
                mods = "NM"
            }
            mods = mods.toUpperCase();

            if(beatmap_url.includes("#osu/"))
            beatmap_id = parseInt(beatmap_url.split("#osu/").pop());
            else if(beatmap_url.includes("#fruits/"))
            beatmap_id = parseInt(beatmap_url.split("#fruits/").pop());
            else if(beatmap_url.includes("#taiko/"))
            beatmap_id = parseInt(beatmap_url.split("#taiko/").pop());
            else if(beatmap_url.includes("#mania/"))
            beatmap_id = parseInt(beatmap_url.split("#mania/").pop());
            else if(beatmap_url.includes("/b/"))
                beatmap_id = parseInt(beatmap_url.split("/b/").pop());
            else if(beatmap_url.includes("/osu/"))
                beatmap_id = parseInt(beatmap_url.split("/osu/").pop());
            else if(beatmap_url.includes("/beatmaps/"))
                beatmap_id = parseInt(beatmap_url.split("/beatmaps/").pop());
            else if(beatmap_url.includes("/discussion/"))
                beatmap_id = parseInt(beatmap_url.split("/discussion/").pop().split("/")[0]);
            else if(parseInt(beatmap_url) == beatmap_url && _id_only)
                beatmap_id = parseInt(beatmap_url);

            if(beatmap_id === NaN){
                reject('Invalid beatmap url');
            }

            axios.get(`https://osu.respektive.pw/b/${beatmap_id}`).then(response => {
                let beatmap = response.data.beatmap;

                let mod_multiplier, output, score;

                mod_multiplier = modsMultiplier(mods.match(/.{1,2}/g));
                score = parseInt(Math.pow(mod_multiplier * beatmap.hit_objects, 2) * 32.57 + 100000);
                output = "Max lazer classic score (" + mods + "): " + score.toLocaleString();

                resolve(output);
                                            
                });
        });
    }
};
