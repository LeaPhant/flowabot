const fs = require('fs');
const path = require('path');

let commands = [];
let commands_path = path.resolve(__dirname, 'commands');

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

    commands = commands.sort((a, b) => a.command[0] > b.command[0]);

    console.log(commands);
});
