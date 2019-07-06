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
            
            if(emoteName.startsWith("<:") && emoteName.split(":").length > 1)
                emoteName = emoteName.split(":")[1];
                
            console.log(emote);

            if(emoji.hasEmoji(emoteName))
                emote = emoji.find(emoteName).emoji;
            else if(msg.channel.type == 'text')
                emote = helper.emote(emoteName, msg.guild, client);
            else
                emote = helper.emote(emoteName, null, client);

            if(emote){
                output += emote.toString();
            }
        });

        if(output.length == 0)
            output = "No emote found";

        return output;
    }
};
