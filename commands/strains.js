const { execFileSync } = require('child_process');
const URL = require('url');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: 'strains',
    description: "Show a visual strain graph of the star raiting over time on a beatmap.",
    usage: '[beatmap url] [+mods] [AR8] [CS6] [aim/speed]',
    example: [
        {
            run: "strains",
            result: "Returns strain graph for the last beatmap."
        },
        {
            run: "strains +HR CS5",
            result: "Returns strain graph with HR applied and CS set to 5 for the last beatmap."
        },
        {
            run: "strains https://osu.ppy.sh/b/75 aim",
            result: "Returns aim strain graph for this beatmap."
        }
    ],
    configRequired: ['debug'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_id, beatmap_url, beatmap_promise, download_promise, mods = "", ar = 2, cs, custom_url = false, type;

            argv.map(arg => arg.toLowerCase());

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+')){
                    mods = arg.toUpperCase().substr(1);
                }else if(arg.startsWith('ar')){
                    ar = parseFloat(arg.substr(2));
                }else if(arg.startsWith('cs')){
                    cs = parseFloat(arg.substr(2));
                }else if(arg.toLowerCase() == 'aim'){
                    type = 'aim';
                }else if(arg.toLowerCase() == 'speed'){
                    type = 'speed';
                }else{
                    beatmap_url = arg;
                    beatmap_promise = osu.parse_beatmap_url(beatmap_url);
                    beatmap_promise.then(response => {
                        beatmap_id = response;
                        if(!beatmap_id) custom_url = true;
                    });
                }
            });

            Promise.resolve(beatmap_promise).finally(() => {
                if(!(msg.channel.id in last_beatmap)){
                    reject(helper.commandHelp('strains'))
                    return false;
                }else if(!beatmap_id && !custom_url){
                    beatmap_id = last_beatmap[msg.channel.id].beatmap_id;
                    download_promise = helper.downloadBeatmap(beatmap_id);

                    mods = last_beatmap[msg.channel.id].mods.join('');
                }

                let download_path = path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

                if(!beatmap_id || custom_url){
                    let download_url = URL.parse(beatmap_url);
                    download_path = path.resolve(os.tmpdir(), `${Math.floor(Math.random() * 1000000) + 1}.osu`);

                    download_promise = helper.downloadFile(download_path, download_url);

                    download_promise.catch(reject);
                }

                Promise.resolve(download_promise).then(() => {
                    osu.get_strains_graph(download_path, mods, cs, ar, type, (err, buf) => {
                       if(err){
                            reject(err);
                            return false;
                        }

                        if(beatmap_id){
                            helper.updateLastBeatmap({
                                beatmap_id,
                                mods,
                                fail_percent: 1,
                                acc: 1
                            }, msg.channel.id, last_beatmap);
                        }

                        resolve({file: buf, name: 'strains.png'});
                    });
                });
            });
        });
    }
};
