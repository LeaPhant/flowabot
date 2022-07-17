const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: ['score', 'soloscore'],
    description: "Search for a score on a beatmap.",
    argsRequired: 1,
    startsWith: true,
    usage: '<beatmap url> [username or * for any user] [+mods]',
    example: [
        {
            run: 'score https://osu.ppy.sh/b/75 * +HD',
            result: "Returns #1 score with HD on this beatmap."
        },
        {
            run: "score https://osu.ppy.sh/b/75",
            result: "Returns your best score on this beatmap."
        },
        {
            run: "score5 https://osu.ppy.sh/b/75 *",
            result: "Returns the #5 score on this beatmap."
        }
    ],
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let score_user = helper.getUsername(argv, msg, user_ign);

            let beatmap_promise;

            let command = argv[0].toLowerCase().replace(/[0-9]/g, '');

            let solo_score = argv[0].toLowerCase().startsWith('soloscore')

            if(!module.exports.command.includes(command))
                return false;

            let index = 1;
            let match = argv[0].match(/\d+/);
            let _index = match > 0 ? match[0] : 1;

            if(_index >= 1 && _index <= 100)
                index = _index;

            let options = { index: index, solo_score: solo_score };

            argv.forEach(function(arg){
                if(arg.startsWith('+'))
                    options.mods = arg.toUpperCase().substr(1).match(/.{1,2}/g);
                if(arg == '*')
                    score_user = '*';
                let b = osu.parse_beatmap_url_sync(arg, false);
                if(b)
                    options.beatmap_id = b;
            });

            if(score_user != '*')
                options.user = score_user;

            if(!score_user || !options.beatmap_id){
                if(user_ign[msg.author.id] == undefined)
                    reject(helper.commandHelp('ign-set'));
                else
                    reject(helper.commandHelp('score'));
                return false;
            }else{
                osu.get_score(options, (err, recent, strains_bar, ur_promise) => {
                    if(err){
                        helper.error(err);
                        reject(err);
                        return false;
                    }else{
                        let embed = osu.format_embed(recent);
                        helper.updateLastBeatmap(recent, msg.channel.id, last_beatmap);

                        if(ur_promise){
                            resolve({
                                embed: embed,
                                files: [{attachment: strains_bar, name: 'strains_bar.png'}],
                                edit_promise: new Promise((resolve, reject) => {
                                    ur_promise.then(recent => {
                                        embed = osu.format_embed(recent);
                                        resolve({embed});
                                    });
                                })});
                        }else{
                            resolve({
                                embed: embed,
                                files: [{attachment: strains_bar, name: 'strains_bar.png'}]
                            });
                        }
                    }
                });
            }
        });
    }
};
