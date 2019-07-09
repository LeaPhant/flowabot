const path = require('path');
const fs = require('fs-extra');
const { execFileSync } = require('child_process');
const URL = require('url');

const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: 'bpm',
    description: "Show a visual BPM graph over time for a beatmap.",
    usage: '[beatmap url] [+mods]',
    example: [
        {
            run: "bpm",
            result: "Returns BPM graph for the last beatmap."
        },
        {
            run: "bpm https://osu.ppy.sh/b/75 +DT",
            result: "Returns BPM graph with DT for specific beatmap."
        }
    ],
    configRequired: ['debug'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_id, beatmap_promise, download_promise, beatmap_url, mods = "", custom_url = false;

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+'))
                    mods = arg.toUpperCase().substr(1);
                else{
                    beatmap_url = arg;
                    beatmap_promise = osu.parse_beatmap_url(beatmap_url);
                    beatmap_promise.then(response => {
                        beatmap_id = response;
                        if(!beatmap_id) custom_url = true;
                    });
                }
            });

            Promise.resolve(beatmap_promise).then(() => {
                if(!(msg.channel.id in last_beatmap)){
                    msg.channel.send(helper.commandHelp('bpm'));
                    return;
                }else if(!beatmap_id && !custom_url){
                    beatmap_id = last_beatmap[msg.channel.id].beatmap_id;
                    download_promise = helper.downloadBeatmap(beatmap_id);

                    mods = last_beatmap[msg.channel.id].mods.join('');
                }

                let download_path = path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

                if(!beatmap_id){
                    let download_url = URL.parse(beatmap_url);
                    download_path = `/tmp/${Math.floor(Math.random() * 1000000) + 1}.osu`;

                    download_promise = helper.downloadFile(download_path, download_url);

                    download_promise.catch(reject);
                }

                Promise.resolve(download_promise).then(() => {
                    osu.get_bpm_graph(download_path, mods, (err, res) => {
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

                        resolve({file: Buffer.from(res, 'base64'), name: 'bpm.png'});
                    });
                });
            });
        });
    }
};
