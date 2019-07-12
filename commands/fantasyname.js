const namegen = require('../fantasynamegen.js');

module.exports = {
    command: 'fantasyname',
    argsRequired: 1,
    description: [
        "Generates a fantasy name.",
        `Available types: \`${namegen.fantasyTypes.join("\`, \`")}\``,
        `Available lengths: \`${namegen.fantasyLengths.join("\`, \`")}\``,
        "Data from <https://www.fantasynamegen.com/>."
    ],
    usage: '<type> [length]',
    example: {
        run: "fantasyname elf medium",
        result: "Returns a medium-length elf name."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let type = argv[1].toLowerCase();
            let length = "medium";

            if(argv.length > 2)
                length = argv[2];

            namegen.getFantasyName(type, length, msg.author.username).then(name => {
                msg.channel.send(name);
            }).catch(err => {
                reject(err);
            });
        });
    }
};
