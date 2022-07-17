if(require('semver').lt(process.version, '14.14.0'))
	throw "flowabot only runs on Node.js 14.14.0 or higher";

process.on('uncaughtException', function(err){
    console.error(err.stack);
});

const Discord = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const objectPath = require("object-path");
const chalk = require('chalk');

const osu = require('./osu.js');
const helper = require('./helper.js');

const client = new Discord.Client({autoReconnect:true});

client.on('error', helper.error);

const config = require('./config.json');

let user_ign = {};

if(helper.getItem('user_ign')){
	user_ign = JSON.parse(helper.getItem('user_ign'));
}else{
	helper.setItem("user_ign", JSON.stringify(user_ign));
}

let last_beatmap = {};

if(helper.getItem('last_beatmap')){
	last_beatmap = JSON.parse(helper.getItem('last_beatmap'));
}else{
	helper.setItem('last_beatmap', JSON.stringify(last_beatmap));
}

let last_message = {}

if(helper.getItem('last_message')){
	last_message = JSON.parse(helper.getItem('last_message'));
}else{
	helper.setItem('last_message', JSON.stringify(last_message));
}

if(config.credentials.client_id && config.credentials.client_secret)
    osu.init(client, config.credentials.client_id, config.credentials.client_secret, last_beatmap, config.credentials.osu_api_key);

function checkCommand(msg, command){
    if(!msg.content.startsWith(config.prefix))
        return false;

	if(msg.author.bot)
		return false;

    let argv = msg.content.split(' ');

    let command_match = false;

    let msg_check = msg.content.toLowerCase().substr(config.prefix.length).trim();

    let commands = command.command;

    let startswith = false;

    if(command.startsWith)
        startswith = true;

    if(!Array.isArray(commands))
        commands = [commands];

    for(let i = 0; i < commands.length; i++){
        let command_check = commands[i].toLowerCase().trim();
        if(startswith){
            if(msg_check.startsWith(command_check))
                command_match = true;
        }else{
            if(msg_check.startsWith(command_check + ' ')
            || msg_check == command_check)
                command_match = true;
        }
    }

    if(command_match){
        let hasPermission = true;

        if(command.permsRequired && msg.member != null)
            hasPermission = command.permsRequired.length == 0 || command.permsRequired.some(perm => msg.member.hasPermission(perm));

        if(!hasPermission)
            return 'Insufficient permissions for running this command.';

        if(command.argsRequired !== undefined && argv.length <= command.argsRequired)
            return helper.commandHelp(command.command);

        return true;
    }

    return false;
}

let commands = [];
let commands_path = path.resolve(__dirname, 'commands');

fs.readdir(commands_path).then(items => {
    items.forEach(item => {
        if(path.extname(item) == '.js'){
            let command = require(path.resolve(commands_path, item));

            command.filename = path.resolve(commands_path, item);

            let available = true;
            let unavailability_reason = [];

            if(command.folderRequired !== undefined && command.folderRequired.length > 0){
                let { folderRequired } = command;

                if(!Array.isArray(command.folderRequired))
                    folderRequired = [folderRequired];

                folderRequired.forEach(async folder => {
                    if(await helper.fileExists(path.resolve(__dirname, folder)) == false)
                        available = false;
                        unavailability_reason.push(`required folder ${folder} does not exist`);
                });
            }

            if(command.configRequired !== undefined && command.configRequired.length > 0){
                let { configRequired } = command;

                if(!Array.isArray(command.configRequired))
                    configRequired = [configRequired];

                configRequired.forEach(config_path => {
                    if(!objectPath.has(config, config_path)){
                        available = false;
                        unavailability_reason.push(`required config option ${config_path} not set`);
                    }else if(objectPath.get(config, config_path).length == 0){
                        available = false;
                        unavailability_reason.push(`required config option ${config_path} is empty`);
                    }
                });
            }

            if(command.emoteRequired !== undefined && command.emoteRequired.length > 0){
                let { emoteRequired } = command;

                if(!Array.isArray(command.emoteRequired))
                    emoteRequired = [emoteRequired];

                emoteRequired.forEach(emote_name => {
                    let emote = helper.emote(emote_name, null, client);
                    if(!emote){
                        available = false;
                        unavailability_reason.push(`required emote ${emote_name} is missing`);
                    }
                });
            }

            if(available){
                commands.push(command);
			}else{
				if(!Array.isArray(command.command))
					command.command = [command.command];

				console.log('');
				console.log(chalk.yellow(`${config.prefix}${command.command[0]} was not enabled:`));
				unavailability_reason.forEach(reason => {
					console.log(chalk.yellow(reason));
				});
			}
        }
    });

    helper.init(commands);
}).catch(err => {
    helper.error(err);
    throw "Unable to read commands folder";
});

let handlers = [];
let handlers_path = path.resolve(__dirname, 'handlers');

fs.readdir(handlers_path).then(items => {
    items.forEach(item => {
        if(path.extname(item) == '.js'){
            let handler = require(path.resolve(handlers_path, item));
            handlers.push(handler);
        }
    });
}).catch(err => {
    helper.error(err);
    throw "Unable to read handlers folder";
});

function onMessage(msg){
    let argv = msg.content.split(' ');

    argv[0] = argv[0].substr(config.prefix.length);

    if(config.debug)
        helper.log(msg.author.username, ':', msg.content);

    commands.forEach(command => {
        let check_command = checkCommand(msg, command);

        if(check_command === true){
            if(command.call && typeof command.call === 'function'){
                let promise = command.call({
                    msg,
                    argv,
                    client,
                    user_ign,
                    last_beatmap,
                    last_message
                });

                Promise.resolve(promise).then(response => {
                    if(response){
                        let message_promise, edit_promise, replace_promise, remove_path, content;

                        if(typeof response === 'object' && 'edit_promise' in response){
                            ({edit_promise} = response);
                            delete response.edit_promise;
                        }

						if(typeof response === 'object' && 'replace_promise' in response){
                            ({replace_promise} = response);
                            delete response.replace_promise;
                        }

                        if(typeof response === 'object' && 'remove_path' in response){
							({remove_path} = response);
                            delete response.remove_path;
                        }

						if(typeof response === 'object' && 'content' in response){
							({content} = response);
                            delete response.content;
						}

						if(content)
	                        message_promise = msg.channel.send(content, response);
						else
							message_promise = msg.channel.send(response);

						message_promise.catch(err => {
							msg.channel.send(`Couldn't run command: **${err}**`);
						});


                        Promise.all([message_promise, edit_promise, replace_promise]).then(responses => {
                            let message = responses[0];
                            let edit_promise = responses[1];
							let replace_promise = responses[2];

                            if(edit_promise)
                                message.edit(edit_promise).catch(helper.error);

							if(replace_promise){
								msg.channel.send(replace_promise)
								.catch(err => {
									msg.channel.send(`Couldn't run command: **${err}**`);
								}).finally(() => {
									message.delete();

									if(typeof replace_promise === 'object' && 'remove_path' in replace_promise){
										({remove_path} = replace_promise);
			                            delete replace_promise.remove_path;
			                        }

									if(remove_path)
										fs.rm(remove_path, { recursive: true }).catch(helper.error);
								});
							}

                            if(remove_path)
                                fs.rm(remove_path, { recursive: true }).catch(helper.error);
                        }).catch(err => {
							msg.channel.send(`Couldn't run command: **${err}**`);
						});
                    }
                }).catch(err => {
                    if(typeof err === 'object')
                        msg.channel.send(err);
                    else
                        msg.channel.send(`Couldn't run command: **${err}**`);

                    helper.error(err);
                });
            }
        }else if(check_command !== false){
            msg.channel.send(check_command);
        }
    });

    handlers.forEach(handler => {
        if(handler.message && typeof handler.message === 'function'){
            handler.message({
                msg,
                argv,
                client,
                user_ign,
                last_beatmap,
                last_message
            });
        }
    });
}

client.on('message', onMessage);

client.on('ready', () => {
	helper.log('flowabot is ready');
	if(config.credentials.discord_client_id)
		helper.log(
			`Invite bot to server: ${chalk.blueBright('https://discord.com/api/oauth2/authorize?client_id='
			+ config.credentials.discord_client_id + '&permissions=8&scope=bot')}`);
});

client.login(config.credentials.bot_token).catch(err => {
	console.error('');
	console.error(chalk.redBright("Couldn't log into Discord. Wrong bot token?"));
	console.error('');
	console.error(err);
	process.exit();
});
