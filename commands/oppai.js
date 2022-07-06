const { execFileSync, execFile, exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const URL = require('url');

const helper = require('../helper.js');
const osu = require('../osu.js');
const config = require('../config.json');

function parseLine(line, decimals){
    let output = parseFloat(line.split(": ").pop());

    if(decimals >= 0)
        return +output.toFixed(decimals);

    return output;
}

module.exports = {
    command: 'oppai',
    description: "Uses oppai (2016 ppv2) to calculate pp for a beatmap.",
    argsRequired: 1,
    usage: '<map link> [+HDDT] [99.23%] [2x100] [1x50] [3m] [342x]',
    example: {
        run: "oppai https://osu.ppy.sh/b/75 +DT ",
        result: "Calculates pp on this beatmap with DT applied."
    },
    configRequired: ['pp_path', 'debug', 'osu_cache_path'],
    call: async obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_url = argv[1];
            let mods = [];
            let download_path, download_promise;

            if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
                beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

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

                    oppaiCmd = '/home/osu/oppai-ng/oppai ' + beatmap_path + ' ' + argv.slice(2).join(" ")

                    exec(oppaiCmd, (err, stdout, stderr) => {
                        if(err || stderr){
                            if(err){
                                helper.error(err);
                                reject(err);
                                return false;
                            }

                            let error = stderr.split("\n")[1];
                            reject(error);

                            if(config.debug)
                                helper.error(stderr);

                            return false;
                        }else{
                            let ppResult = stdout;

                            let output = `\`\`\`\n${ppResult}\`\`\``;

                            if(beatmap_id){
                                helper.updateLastBeatmap({
                                    beatmap_id,
                                    mods,
                                    fail_percent: last_beatmap[msg.channel.id].fail_percent || 1,
                                    acc: last_beatmap[msg.channel.id].acc || 100
                                }, msg.channel.id, last_beatmap);
                            }

                            resolve(output);
                        }
                    });
                });
            });
        });
    }
}
