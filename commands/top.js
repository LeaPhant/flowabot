const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: ['top', 'rb', 'recentbest', 'ob', 'oldbest'],
    description: "Show a specific top play.",
    startsWith: true,
    usage: '[username]',
    example: [
        {
            run: "top",
            result: "Returns your #1 top play."
        },
        {
            run: "top5 vaxei",
            result: "Returns Vaxei's #5 top play."
        },
        {
            run: "rb",
            result: "Returns your most recent top play."
        },
        {
            run: "ob",
            result: "Returns your oldest top play (from your top 100)."
        }
    ],
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let top_user = helper.getUsername(argv, msg, user_ign);

            let rb = argv[0].toLowerCase().startsWith('rb') || argv[0].toLowerCase().startsWith('recentbest');
            let ob = argv[0].toLowerCase().startsWith('ob') || argv[0].toLowerCase().startsWith('oldestbest');

            let index = 1;
            let match = argv[0].match(/\d+/);
            let _index = match > 0 ? match[0] : 1;

            if(_index >= 1 && _index <= 100)
                index = _index;

            if(!top_user){
                if(user_ign[msg.author.id] == undefined){
                    reject(helper.commandHelp('ign-set'));
                }else{
                    reject(helper.commandHelp('top'));
                }

                return false;
            }else{
                osu.get_top({user: top_user, index: index, rb: rb, ob: ob}, (err, recent, strains_bar, ur_promise) => {
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
