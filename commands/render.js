const { execFileSync } = require('child_process');
const URL = require('url');
const fs = require('fs-extra');
const path = require('path');
const { fork } = require('child_process');

const osu = require('../osu.js');
const helper = require('../helper.js');
const frame = require('../renderer/render_frame.js')
const config = require('../config.json');

module.exports = {
    command: ['render', 'frame', 'fail'],
    description: "Render picture or gif of a beatmap at a specific time.",
    usage: '[beatmap url] [+mods] [AR8] [CS6] [strains/aim/speed/fail] [mp4] [plain] [120fps] [mm:ss] [4s]',
    example: [
        {
            run: "render strains",
            result: "Returns a gif of the hardest part on the last beatmap."
        },
        {
            run: "fail",
            result: "Returns a gif of the part where the player failed on the last beatmap."
        },
        {
            run: "render 1:05",
            result: "Returns an image of the last beatmap at 1 minute and 5 seconds."
        },
        {
            run: "render speed 10s",
            result: "Returns a 10 second video of the streamiest part on the last beatmap."
        },
        {
            run: "render strains 120fps plain",
            result: "Returns a 120fps video of the hardest part on the last beatmap without sound and black background."
        }
    ],
    configRequired: ['debug'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_id, beatmap_url, beatmap_promise, mods = [], time = 0,
            ar, cs, length = 0, percent = 0, custom_url = false,
            size = [400, 300], type, objects,
            video_type = 'gif', audio = true, download_promise;

            let score_id;

            if(argv[0].toLowerCase() == 'fail'){
                if(msg.channel.id in last_beatmap){
                    percent = last_beatmap[msg.channel.id].fail_percent;
                    length = 4;
                }
            }

            let fps = 60;

            argv.map(arg => arg.toLowerCase());

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+'))
                    mods = arg.substr(1).toUpperCase().match(/.{1,2}/g);
                else if(/^([0-9]+)\:([0-9]+)\:([0-9]+)$/g.test(arg)){
                    let parts = arg.split(':');
                    if(parts.length > 2){
                        time += parseInt(parts[2]);
                        time += parseInt(parts[1]) * 1000;
                        time += parseInt(parts[0]) * 1000 * 60;
                    }
                }else if(/^([0-9]+)\:([0-9]+)$/g.test(arg)){
                    let parts = arg.split(':');
                    if(parts.length > 1){
                        time += parseInt(parts[1]) * 1000;
                        time += parseInt(parts[0]) * 1000 * 60;
                    }
                }else if(arg == 'strains' || arg == 'aim' || arg == 'speed'){
                    type = arg;
                    length = 4;
                }else if(arg == 'mp4'){
                    video_type = 'mp4';
                }else if(arg == 'audio'){
                    audio = true;
                    video_type = 'mp4';
                }else if(arg == 'plain'){
                    audio = false;
                }else if(arg.endsWith('fps')){
                    let _fps = parseInt(arg);
                    if(!isNaN(_fps)){
                        fps = Math.max(1, Math.min(240, _fps));
                        video_type = 'mp4';
                    }
                }else if(arg.endsWith('s')){
                    length = parseFloat(arg);
                }else if(/^([0-9]+)$/g.test(arg)){
                    time += parseInt(arg) * 1000;
                }else if(arg.toLowerCase().startsWith('ar')){
                    ar = parseFloat(arg.substr(2));
                }else if(arg.toLowerCase().startsWith('cs')){
                    cs = parseFloat(arg.substr(2));
                }else if(arg.startsWith('(') && arg.endsWith(')')){
                    objects = arg.substr(1, arg.length - 1).split(',').length;
                }else if(arg == 'fail'){
                    if(msg.channel.id in last_beatmap){
                        percent = last_beatmap[msg.channel.id].fail_percent;
                        length = 4;
                    }
                }else{
                    if(arg.startsWith('http://') || arg.startsWith('https://')){
                        beatmap_url = arg;
                        beatmap_promise = osu.parse_beatmap_url(beatmap_url);
                        beatmap_promise.then(response => {
                            beatmap_id = response;
                            if(!beatmap_id) custom_url = true;
                        });

                    }
                }
            });

            Promise.resolve(beatmap_promise).then(() => {
                if(!(msg.channel.id in last_beatmap)){
                    reject(helper.commandHelp('render'));
                    return false;
                }else if(!beatmap_id && !custom_url){
                    beatmap_id = last_beatmap[msg.channel.id].beatmap_id;
                    download_promise = helper.downloadBeatmap(beatmap_id);

                    mods = last_beatmap[msg.channel.id].mods;
                    if(last_beatmap[msg.channel.id].score_id)
                        ({ score_id } = last_beatmap[msg.channel.id]);
                }

                let download_path = path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

                if(config.debug)
                    helper.log('render length', length);

                if(length >= 10)
                    video_type = 'mp4';

                if(config.debug)
                    helper.log('specified ar', ar);

                if(!beatmap_id || custom_url){
                    let download_url = URL.parse(beatmap_url);
                    download_path = `/tmp/${Math.floor(Math.random() * 1000000) + 1}.osu`;

                    download_promise = helper.downloadFile(download_path, download_url);
                    download_promise.catch(reject);
                }

                Promise.resolve(download_promise).then(() => {
                    if(type == 'strains' || type == 'aim' || type == 'speed'){
                        if(config.debug)
                            helper.log('getting strains for mods', mods);

                        time = osu.get_strains(download_path, mods.join(''), type).max_strain_time_real - 2000;
                    }

                    if(length > 0 || objects){
                        resolve({
                            content: 'Rendering...',
                            replace_promise: new Promise((resolve, reject) => {
                                frame.get_frames(download_path, time, length * 1000, mods, size, {
                                    type: video_type, cs, ar, black: false, score_id, audio, fps,
                                    fill: video_type == 'mp4', noshadow: true, percent, border: false, objects
                                }, (err, send, remove_path) => {
                                    if(err)
                                        reject(err);

                                    resolve({file: send, name: 'render.gif', remove_path});
                                });
                            })
                        });
                    }else{
                        frame.get_frame(download_path, time, mods, [800, 600], {
                            cs: cs, ar: ar, score_id, black: true, fill: true, percent: percent
                        }, (err, buf) => {
                            if(err)
                                reject(err);

                            resolve({file: buf, name: 'frame.png'});
                        });
                    }
                });
            });
        });
    }
};
