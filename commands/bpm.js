const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');
const { execFileSync } = require('child_process');
const URL = require('url');

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

            let beatmap_id, beatmap_url, mods = "", custom_url = false;

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+'))
                    mods = arg.toUpperCase().substr(1);
                else{
                    beatmap_url = arg;
                    beatmap_id = osu.parse_beatmap_url(beatmap_url);
                    if(!beatmap_id) custom_url = true;
                }
            });

            if(!(msg.channel.id in last_beatmap)){
                msg.channel.send(helper.commandUsage('bpm'));
                return;
            }else if(!beatmap_id && !custom_url){
                beatmap_id = last_beatmap[msg.channel.id].beatmap_id;
                mods = last_beatmap[msg.channel.id].mods.join('');
            }

            let download_path = path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

            if(!beatmap_id){
                try{
                    let download_url = URL.parse(beatmap_url);
                    download_path = `/tmp/${Math.floor(Math.random() * 1000000) + 1}.osu`;

                    if(config.debug)
                        console.log('downloading .osu file from', URL.format(download_url));

                    execFileSync('curl', ['--silent', '--create-dirs', '-o', download_path, URL.format(download_url)]);
                }catch(err){
                    helper.error(err);
                    reject("Couldn't download .osu file");
                    return false;
                }
            }

            osu.get_bpm_graph(download_path, mods, (err, res) => {
               if(err)
                   reject(err);
               else
                   resolve({file: new Buffer(res, 'base64'), name: 'bpm.png'});
            });
        });
    }
};
