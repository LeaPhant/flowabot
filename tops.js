const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: 'tops',
    description: "Show a list of top plays",
    startsWith: true,
    usage: '[username]',
    example: [
        {
            run: "tops",
            result: "Returns your top 5 plays."
        },
        {
            run: "tops7 vaxei",
            result: "Returns Vaxei's top 7 plays."
        }
    ],
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign, last_beatmap } = obj;

            let top_user = helper.getUsername(argv, msg, user_ign);

            let tops = 5;
            let match = argv[0].match(/\d+/);
            let _tops = match > 0 ? match[0] : 1;

            if(_index >= 1 && _index <= 15)
                tops = _tops;

            if(!top_user){
                if(user_ign[msg.author.id] == undefined){
                    reject(helper.commandHelp('ign-set'));
                }else{
                    reject(helper.commandHelp('top'));
                }

                return false;
            }else{
                osu.get_tops({user: top_user, tops}, (err, user, tops) => {
                    if(err){
                        helper.error(err);
                        reject(err);
                        return false;
                    }else{
                        let embed = {fields: []};
                        embed.color = 12277111;
                        embed.author = {
                            url: `https://osu.ppy.sh/u/${recent.user_id}`,
                            name: `${recent.username} – ${recent.user_pp}pp (#${recent.user_rank.toLocaleString()})`,
                            icon_url: `https://a.ppy.sh/${recent.user_id}?${+new Date()}}`
                        };

                        embed.fields = [];

                        tops.forEach(top => {

                        });

                        resolve({
                            embed: embed,
                            files: [{attachment: strains_bar, name: 'strains_bar.png'}]
                        });
                    }
                });
            }
        })
    }
};
