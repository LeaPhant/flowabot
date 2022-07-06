const config = require('../config.json');
const helper = require('../helper.js');

module.exports = {
    message: obj => {
        let { msg, last_message, client } = obj;

        if(!msg.content.startsWith(config.prefix) && msg.author.id != client.user.id){
            last_message[msg.channel.id] = msg.content;
            helper.setItem('last_message', JSON.stringify(last_message));
        }
    }
};
