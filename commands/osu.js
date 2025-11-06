const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: ['osu', 'osu2'],
    description: "Show osu! stats.",
    usage: '[username]',
    example: {
        run: "osu nathan_on_osu",
        result: "Returns nathan on osu's osu! stats."
    },
    configRequired: ["credentials.client_id", "credentials.client_secret"],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign } = obj;

            let extended = argv[0].toLowerCase() == 'osu2';

            let osu_user = helper.getUsername(argv, msg, user_ign);

            if(!osu_user){
                if(user_ign[msg.author.id] == undefined)
                    reject(helper.commandHelp('ign-set'));
                else
                    reject(helper.commandHelp('osu'));

                return false;
            }

            osu.get_user({u: osu_user, extended}, (err, embed) => {
                if(err){
                    reject(err);
                    helper.error(err);
                    return false;
                }

                resolve({embeds: [embed]});
            });
        });
    }
};
