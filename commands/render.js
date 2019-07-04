const { execFileSync } = require('child_process');
const URL = require('url');
const fs = require('fs-extra');
const path = require('path');
const osu = require('../osu.js');
const helper = require('../helper.js');
const frame = require('../renderer/render_frame.js')
const config = require('../config.json');

module.exports = {
    command: ['render', 'frame', 'fail'],
    description: "Render picture or gif of a beatmap at a specific time.",
    usage: '[beatmap url] [+mods] [AR8] [CS6] [strains/aim/speed/fail] [mp4] [audio] [120fps] [mm:ss] [4s]',
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
            run: "render speed 10s audio",
            result: "Returns a 10 second video with sound of the streamiest part on the last beatmap."
        },
        {
            run: "render strains 120fps",
            result: "Returns a 120fps video of the hardest part on the last beatmap."
        }
    ],
    configRequired: ['debug'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_id, beatmap_url, mods = [], time = 0,
            ar, cs, length = 0, percent = 0, custom_url = false,
            size = [400, 300], type, objects,
            video_type = 'gif', audio = false;

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
                        beatmap_id = osu.parse_beatmap_url(beatmap_url);
                        if(!beatmap_id) custom_url = true;
                    }
                }
            });

            if(!(msg.channel.id in last_beatmap)){
                reject(helper.commandHelp('render'));
                return false;
            }else if(!beatmap_id && !custom_url){
                beatmap_id = last_beatmap[msg.channel.id].beatmap_id;
                mods = last_beatmap[msg.channel.id].mods;
                if(last_beatmap[msg.channel.id].score_id)
                    ({ score_id } = last_beatmap[msg.channel.id]);
            }

            let download_path = path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

            if(config.debug)
                console.log('render length', length);

            if(length >= 10)
                video_type = 'mp4';

            if(config.debug)
                console.log('specified ar', ar);

            if(!beatmap_id || custom_url){
                try{
                    let download_url = URL.parse(beatmap_url);
                    download_path = `/tmp/${Math.floor(Math.random() * 1000000) + 1}.osu`;

                    if(config.debug)
                        console.log('downloading .osu file from', URL.format(download_url));

                    execFileSync('curl', ['--silent', '--create-dirs', '-o', download_path, URL.format(download_url)]);

                    if(!helper.validateBeatmap(download_path))
                        throw "invalid beatmap";
                }catch(err){
                    helper.error(err);
                    reject("Couldn't download .osu file");
                    return false;
                }
            }else{
                if(!helper.downloadBeatmap(beatmap_id)){
                    reject("Couldn't download beatmap");
                    return false;
                }
            }

            if(type == 'strains' || type == 'aim' || type == 'speed'){
                if(config.debug)
                    console.log('getting strains for mods', mods);

                time = osu.get_strains(download_path, mods.join(''), type).max_strain_time_real - 2000;
            }

            if(length > 0 || objects){
                frame.get_frames(download_path, time, length * 1000, mods, size, {
                    type: video_type, cs, ar, black: video_type == 'mp4', score_id, audio, fps, fill: video_type == 'mp4', noshadow: true, percent, border: false, objects
                }, (send, remove_path) => {
                    resolve({file: send, name: 'render.gif', remove_path});
                });
            }else{
                frame.get_frame(download_path, time, mods, [800, 600], {cs: cs, ar: ar, score_id, black: true, fill: true, percent: percent}, buf => {
                    resolve({file: buf, name: 'frame.png'});
                });
            }
        });
    }
};
