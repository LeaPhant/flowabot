const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: 'osu-untrack',
    description: "Stop tracking the specified user's osu! top plays in the current channel.",
    argsRequired: 1,
    permsRequired: ['MANAGE_MESSAGES'],
    usage: '<username> [top play limit (1-100, default 50)]',
    example: {
        run: "osu-untrack nathan_on_osu",
        result: "Stop tracking nathan on osu's top plays."
    },
    configRequired: ["credentials.client_id", "credentials.client_secret"],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, user_ign } = obj;

            let osu_name = helper.getUsername(argv.slice(0, 2), msg, user_ign);

            osu.untrack_user(msg.channel.id, osu_name, (err, message) => {
                if(err)
                    reject(err);
                else
                    resolve(message);
            });
        });
    }
};
