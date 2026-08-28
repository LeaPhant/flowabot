const emoji = require('node-emoji');
const helper = require('../helper.js');
const axios = require('axios');

const SevenApi = axios.create({
    baseURL: 'https://api.7tv.app/v3',
});

module.exports = {
    command: ['emote', 'e'],
    description: "Print one or multiple emotes the bot can use in chat.",
    usage: '(add) <emote 1> [emote 2] [emote n]',
    example: {
        run: 'e SourPls',
        result: 'Returns SourPls emote.'
    },
    argsRequired: 1,
    call: async obj => {
        let { msg, argv, client } = obj;

        if (argv[1] == 'add') {
            if (!msg.member?.permissions.has('ADMINISTRATOR'))
                throw "Need to be administrator.";

            const sevenUrls = argv.slice(2);
            let successString = '';

            const currentEmojis = await client.application.emojis.fetch();

            for (const sevenUrl of sevenUrls) {
                try {
                    const url = new URL(sevenUrl);

                    if (url.host != '7tv.app')
                        continue;

                    const id = url.pathname.split('/').pop();
                    const response = await SevenApi.get(`/emotes/${id}`);
                    const emote = response.data;

                    let emoteUrl;

                    const format = emote.animated ? 'WEBP' : 'PNG';

                    const [compatibleEmoteUrl] = emote.host.files.filter(x => x.format == format && x.size < 256_000).sort((a, b) => b.size - a.size);
                    if (!compatibleEmoteUrl) throw "No suitable emoji URL found.";

                    emoteUrl = `https:${emote.host.url}/${compatibleEmoteUrl.name}`;

                    const createOptions = {
                        attachment: emoteUrl,
                        name: emote.name
                    };
                    let e;

                    const existingEmoji = currentEmojis.find(e => e.name == emote.name);

                    if (existingEmoji) {
                        e = await client.application.emojis.edit(existingEmoji.id, createOptions);
                    } else {
                        e = await client.application.emojis.create(createOptions);
                    }                    

                    successString += ' ' + e.toString();
                } catch (e) {
                    helper.error(e);
                    continue;
                }
            }

            if (successString.length == 0) {
                throw "No compatible emotes found.";
            }

            return `Added:${successString}`;
        }

        let emotes = argv.slice(1);
        let output = "";

        emotes.forEach(emoteName => {
            let emote;

            if(emoteName.startsWith("<:") && emoteName.split(":").length > 1)
                emoteName = emoteName.split(":")[1];

            if(msg.channel.type == 'text')
                emote = helper.emote(emoteName, msg.guild, client);
            else
                emote = helper.emote(emoteName, null, client);

            if(!emote && emoji.has(emoteName))
                emote = emoji.find(emoteName).emoji;

            if(emote)
                output += emote.toString();
            else
                output += " " + emoteName;
        });

        if(output.length == 0)
            output = "No emote found";

        return output;
    }
};
