const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: 'help',
    argsRequired: 1,
    description: "Get help for a command.",
    usage: '<command>',
    example: [
        {
            run: "help pp",
            result: `Returns help on how to use the \`${config.prefix}pp\` command.`
        }
    ],
    call: obj => {
        let { argv } = obj;
        return helper.commandHelp(argv[1]);
    }
};
