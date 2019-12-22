const helper = require('../helper.js');

module.exports = {
    command: 'ign-set',
    description: "Sets your osu! username so you can use osu! commands without specifying a username.",
    usage: '<osu! username>',
    example: {
        run: "ign-set nathan on osu",
        result: "Sets your osu! username to nathan on osu."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { msg, user_ign } = obj;

            let split = helper.splitWithTail(msg.content, ' ', 1);

            if(split.length < 2){
                reject(helper.commandHelp('ign-set'));
                return false;
            }

            let ign = split[1];
            let user_id = msg.author.id;

            if(ign.length == 0){
                reject(helper.commandHelp('ign-set'));
                return false;
            }

            if(!helper.validUsername(ign)){
                reject('Not a valid osu! username!');
                return false;
            }

            user_ign[user_id] = ign;
            helper.setItem('user_ign', JSON.stringify(user_ign));

            let author = msg.author.username.endsWith('s') ?
                `${msg.author.username}'`: `${msg.author.username}'s`;

            msg.channel.send(`${author} ingame name set to ${ign}`);
        });
    }
};
