const emoji = require('node-emoji');
const helper = require('../helper.js');

module.exports = {
    command: ['emote', 'e'],
    description: "Print one or multiple emotes the bot can use in chat.",
    usage: '<emote 1> [emote 2] [emote n]',
    example: {
        run: 'e SourPls',
        result: 'Returns SourPls emote.'
    },
    argsRequired: 1,
    call: obj => {
        let { msg, argv, client } = obj;

        let emotes = argv.slice(1);
        let output = "";

        emotes.forEach(emoteName => {
            let emote;

            if(emoji.hasEmoji(emoteName))
                emote = emoji.find(emoteName).emoji;
            else
                emote = helper.emote(emoteName, client, msg.guild);

            if(emote){
                output += emote.toString();
            }else{
                return `Emote \`${emoteName}\` not found.`;
            }
        });

        return output;
    }
};
