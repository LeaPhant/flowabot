const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: 'with',
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

            if(!(msg.channel.id in last_beatmap)){
                reject('No recent score to get the beatmap from');
                return false;
            }

            let options = {
                beatmap_id: last_beatmap[msg.channel.id].beatmap_id,
                mods: last_beatmap[msg.channel.id].mods,
                custom_acc: last_beatmap[msg.channel.id].acc
            };

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+'))
                    options.mods = arg.toUpperCase().substr(1).match(/.{1,2}/g);
                else if(arg.endsWith('%'))
                    options.custom_acc = parseFloat(arg);
                else
                    options.beatmap_id = osu.parse_beatmap_url_sync(arg, false);
            });

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
