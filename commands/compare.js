const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: ['compare', 'c'],
    description: "Search for best score on the last beatmap.",
    usage: '[username or * for all users] [+mods]',
    example: [
        {
            run: "compare",
            result: "Returns your own best score on the last beatmap."
        },
        {
            run: "compare Vaxei +mods",
            result: "Returns Vaxei's best score with the same mods on the last beatmap."
        },
        {
            run: "compare * +HD",
            result: "Returns the #1 HD score on the last beatmap."
        }
    ],
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let compare_user = helper.getUsername(argv, msg, user_ign);

            if(!(msg.channel.id in last_beatmap)){
                reject('No recent score to compare to found');
                return false;
            }

            let compare_beatmap = last_beatmap[msg.channel.id].beatmap_id;
            let compare_mods;

            argv.slice(1).forEach(arg => {
                if(arg.startsWith('+')){
                    if(arg.startsWith('+mods'))
                        compare_mods = ['mods', ...last_beatmap[msg.channel.id].mods];
                    else
                        compare_mods = arg.toUpperCase().substr(1).match(/.{1,2}/g);
                }
                if(arg == '*')
                    compare_user = '*';
            });

            if(!compare_user){
                if(user_ign[msg.author.id] == undefined)
                    reject(helper.ignSetHelp());
                else
                    reject(helper.commandUsage('compare'));
                return false;
            }else{
                let options = {
                    beatmap_id: compare_beatmap,
                    mods: compare_mods
                };

                if(compare_user != '*')
                    options.user = compare_user;
                else
                    compare_mods.splice(1, 0);

                osu.get_compare(options, (err, recent, ur_promise) => {
                    if(err){
                        helper.error(err);
                        reject(err);
                    }else{
                        let embed = osu.format_embed(recent);
                        helper.updateLastBeatmap(recent, msg.channel.id, last_beatmap);

                        if(ur_promise){
                            resolve({embed: embed, ur_promise: new Promise((resolve, reject) => {
                                ur_promise.then(recent => {
                                    embed = osu.format_embed(recent);
                                    resolve({embed: embed});
                                });
                            })});
                        }else{
                            resolve({embed: embed});
                        }
                    }
                });
            }
        });
    }
};
