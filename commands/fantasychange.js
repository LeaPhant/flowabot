const namegen = require('../fantasynamegen.js');
const helper = require('../helper.js');

module.exports = {
    command: 'fantasychange',
    description: [
        "Generates a fantasy name and changes your nickname to it.",
        `Available types: \`${namegen.fantasyTypes.join("\`, \`")}\``,
        `Available lengths: \`${namegen.fantasyLengths.join("\`, \`")}\``,
        "Data from <https://www.fantasynamegen.com/>."
    ],
    usage: '<type> [length]',
    example: {
        run: "fantasychange elf medium",
        result: "Generates a medium-length elf name and sets it as your nickname."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let type = argv[1].toLowerCase();
            let length = "medium";

            if(argv.length > 2)
                length = argv[2];

            namegen.getFantasyName(type, length, msg.author.username).then(name => {
                msg.member.setNickname(name)
                .then( () => {
                    resolve(`You are now ${name}!`);
                })
                .catch(err => {
                    reject(`Couldn't change your nickname to ${name}`);
                    helper.error(err);
                });
            }).catch(err => {
                reject(err);
            });
        });
    }
};
