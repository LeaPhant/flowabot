const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: 'osu',
    description: "Show osu! stats.",
    usage: '[username]',
    example: {
        run: "osu nathan_on_osu",
        result: "Returns nathan on osu's osu! stats."
    },
    configRequired: ['credentials.osu_api_key'],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign } = obj;

            let osu_user = helper.getUsername(argv, msg, user_ign);

            if(!osu_user){
                if(user_ign[msg.author.id] == undefined)
                    reject(helper.ignSetHelp());
                else
                    reject(helper.commandUsage('osu'));

                return false;
            }

            osu.get_user(osu_user, (err, embed) => {
                if(err){
                    reject('Something went wrong');
                    helper.error(err);
                    return false;
                }

                resolve({embed: embed});
            });
        });
    }
};
