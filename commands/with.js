const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: ['with', 'map'],
    description: "Show pp values of a beatmap with several accuracies or a specified accuracy.",
    usage: '[beatmap url] [+mods] [98.34%]',
    example: [
        {
            run: "with",
            result: "Returns pp values for the last beatmap with the same mods."
        },
        {
            run: "with +",
            result: "Returns pp values for the last beatmap without mods."
        },
        {
            run: "with +HD 97.5%",
            result: "Returns pp value for the last beatmap with 97.5% accuracy and HD applied."
        }
    ],
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let modsSet = false, accSet = false, beatmapSet = false, speedSet = false;

            let options = {
                mods: [],
                custom_acc: 100
            };

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+')){
                    options.mods = arg.toUpperCase().substr(1).match(/.{1,2}/g).map(mod => ({ "acronym": mod }));
                    modsSet = true;
                }else if(arg.endsWith('%')){
                    options.custom_acc = parseFloat(arg);
                    accSet = true;
                }else if(arg.endsWith('*') || arg.endsWith('x')) {
                    options.speed_change = parseFloat(arg);
                    speedSet = true;
                }else{
                    options.beatmap_id = osu.parse_beatmap_url_sync(arg, false);
                    beatmapSet = true;
                }
            });

            if(msg.channel.id in last_beatmap && beatmapSet == false){
                options.beatmap_id = last_beatmap[msg.channel.id].beatmap_id;

                if(!modsSet && !speedSet) {
                    mods = last_beatmap[msg.channel.id].mods
                    if (Array.isArray(mods)) {
                        options.mods = mods
                    } else {
                        options.mods = []
                    }
                }

                if(!accSet)
                    options.custom_acc = last_beatmap[msg.channel.id].acc;
            }

            if(!(msg.channel.id in last_beatmap) && options.beatmap_id == null){
                reject('No recent score to get the beatmap from');
                return false;
            }

            osu.get_pp(options, (err, embed) => {
                if(err){
                    helper.error(err);
                    reject(err);
                }else{
                    options.acc = options.custom_acc;
                    options.fail_percent = 1;
                    helper.updateLastBeatmap(options, msg.channel.id, last_beatmap);
                    resolve({embed: embed});
                }
            });
        });
    }
};
