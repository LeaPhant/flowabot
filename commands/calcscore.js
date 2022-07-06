const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');
const bparser = require("bparser-js");
const path = require('path');
const os = require('os');
const URL = require('url');

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

function getModsEnum(mods){
    let return_value = 0;
    mods.forEach(mod => {
        return_value |= mods_enum[mod.toUpperCase()];
    });
    return return_value;
}

module.exports = {
    command: ['calcscore', 'scorecalc', 'cs'],
    description: "Calculate maximum score for a beatmap.",
    argsRequired: 1,
    usage: '<map link> [+mods]',
    example: [
        {
            run: "calcscore https://osu.ppy.sh/b/75",
            result: "Returns the maximum score for Disco Prince with no mods."
        },
        {
            run: "calcscore https://osu.ppy.sh/b/75 +HDHRDT",
            result: "Returns the maximum score for Disco Prince +HDHRDT."
        }
    ],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_url = argv[1];
            let mods = argv[2];
            if(mods){
                if(mods.startsWith("+")){
                    mods = mods.substring(1);
                }
            }
            let download_path, download_promise;

            osu.parse_beatmap_url(beatmap_url, true).then(response => {
                let beatmap_id = response;

                if(!beatmap_id){
                    let download_url = URL.parse(beatmap_url);
                    download_path = path.resolve(os.tmpdir(), `${Math.floor(Math.random() * 1000000) + 1}.osu`);

                    download_promise = helper.downloadFile(download_path, download_url);
                    download_promise.catch(reject);
                }

                Promise.resolve(download_promise).then(async () => {
                    if(beatmap_id === undefined && download_path === undefined){
                        reject('Invalid beatmap url');
                        return false;
                    }

                    let beatmap_path = download_path ? download_path : path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

                    var beatmap = new bparser.BeatmapParser(beatmap_path);
                    let mods_enum, output, score;
                    let sv2 = "";

                    if(mods){
                        mods_enum = getModsEnum(mods.match(/.{1,2}/g));
                        score = beatmap.getMaxScore(mods_enum);
                        if(score >= 2147483647){
                            score = 1000000;
                            sv2 = " ScoreV2 forced";
                        }
                        output = "Max score (" + mods + "): " + new Intl.NumberFormat('en-EN').format(score) + sv2;
                    } else {
                        mods = "NM";
                        mods_enum = 0;
                        score = beatmap.getMaxScore(mods_enum);
                        if(score >= 2147483647){
                            score = 1000000
                            sv2 = " ScoreV2 forced";
                        }
                        output = "Max score (" + mods + "): " + new Intl.NumberFormat('en-EN').format(score) + sv2;
                    }

                    resolve(output);
                                            
                });
            });
        });
    }
};
