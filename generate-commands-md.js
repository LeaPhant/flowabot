const fs = require('fs');
const path = require('path');
const config = require('./config.json');

let commands = [];
let commands_path = path.resolve(__dirname, 'commands');

let output = `# Commands
### Table of contents`;

fs.readdir(commands_path, (err, items) => {

    if(err)
        throw "Unable to read commands folder";

    items.forEach(item => {
        if(path.extname(item) == '.js')
            commands.push(require(path.resolve(commands_path, item)));
    });

    commands.forEach(command => {
        if(!Array.isArray(command.command))
            command.command = [command.command];
    });

    commands.forEach(command => {
        output += `\n- [${config.prefix}${command.command[0]}](#${command.command[0]})`;
    });

    output += `\n---`

    commands.forEach(command => {
        output += `\n## ${config.prefix}${command.command[0]}`;

        if(command.description)
            output += `\n${command.description}`;

        if(command.command.length > 1)
            output += `\n\n**Variations**: \`${config.prefix}${command.command.join('`, `' + config.prefix)}\``;

        output += `\n\n**Usage**: \`${config.prefix}${command.command[0]}`;

        if(command.usage)
            output += ` ${command.usage}`;

        output += '`';

        if(command.example){
            if(!Array.isArray(command.example))
                command.example = [command.example];

            output += `\n### Example${command.example.length > 1 ? 's' : ''}:`;

            command.example.forEach(example => {
                output += `\n\n    ${config.prefix}${example.run}`;
                output += `\n${example.result}`;
            });
        }

    });

    fs.writeFileSync('COMMANDS.md', output);
    process.exit(0);
});
