const config = require('../config.json');

module.exports = {
    command: 'flowabot',
    description: "Show information about this bot.",
    configRequired: ['prefix'],
    call: obj => {
        let embed = {
            description: "Modular Discord bot with various features including twitch commands and advanced osu! commands.",
            url: "https://github.com/LeaPhant/flowabot",
            color: 12277111,
            footer: {
                icon_url: "https://avatars1.githubusercontent.com/u/14080165?s=64&v=2",
                text: "LeaPhant"
            },
            thumbnail: {
                url: "https://raw.githubusercontent.com/LeaPhant/flowabot/master/res/logo.png"
            },
            author: {
                name: "flowabot",
                url: "https://github.com/LeaPhant/flowabot"
            },
            fields: [
                {
                    name: "GitHub Repo",
                    value: "https://github.com/LeaPhant/flowabot"
                },
                {
                    name: "Commands",
                    value: "https://github.com/LeaPhant/flowabot/blob/master/COMMANDS.md"
                },
                {
                    name: "Prefix",
                    value: `The command prefix on this server is \`${config.prefix}\`.`
                }
            ]
        };

        return {embed: embed};
    }
};
