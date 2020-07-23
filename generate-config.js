(async () => {
    const readline = require('readline-sync');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const chalk = require('chalk');

    const Discord = require('discord.js');
    const axios = require('axios');

    let config = {}, config_default = {}, default_value, value, valid_key;

    if(fs.existsSync('./config.default.json'))
        config = require('./config.default.json');

    if(fs.existsSync('./config.json'))
        config = require('./config.json');

    console.log('');
    console.log('-----------------------------------------------');
    console.log('Welcome to the flowabot configuration wizard 🧙‍');
    console.log('-----------------------------------------------');
    console.log('');
    console.log(chalk.yellow('If you press enter without entering anything it will choose the default value in the [brackets]‍'));

    default_value = '!';

    if('prefix' in config_default && config_default.prefix.length > 0)
        default_value = config_default.prefix;
    else if('prefix' in config && config.prefix.length > 0)
        default_value = config.prefix;

    console.log('');
    value = readline.question(`Command prefix [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.prefix = value;


    default_value = 'yes';

    if('debug' in config_default && typeof config_default.debug === 'boolean')
        default_value = config_default.debug;
    else if('debug' in config)
        default_value = config.debug ? 'yes' : 'no';

    console.log('');
    value = readline.question(`Enable debug messages (yes/no) [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.debug = value == 'yes';


    default_value = path.resolve(os.tmpdir(), 'osumaps');

    if('osu_cache_path' in config_default && config_default.osu_cache_path.length > 0)
        default_value = config_default.osu_cache_path;
    else if('osu_cache_path' in config && config.osu_cache_path.length > 0)
        default_value = config.osu_cache_path;

    console.log('');
    value = readline.question(`Path where to cache .osu files [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.osu_cache_path = value;


    default_value = 'none';

    if('pp_path' in config_default && config_default.pp_path.length > 0)
        default_value = config_default.pp_path;
    else if('pp_path' in config && config.pp_path.length > 0)
        default_value = config.pp_path;

    console.log('');
    console.log(`(Optional) To enable the ${config.prefix}pp command you need to supply a path to PerformanceCalculator.dll.
    To get it you need to compile ${chalk.blue('https://github.com/ppy/osu-tools')}.`);
    value = readline.question(`Path to PerformanceCalculator.dll [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.pp_path = value == 'none' ? "" : value;


    default_value = 'https://osu.lea.moe';

    if('beatmap_api' in config_default && config_default.beatmap_api.length > 0)
        default_value = config_default.beatmap_api;
    else if('beatmap_api' in config && config.beatmap_api.length > 0)
        default_value = config.beatmap_api;

    console.log('');
    console.log("(Optional) Here you could supply your own beatmap api for star rating values, just leave this as-is cause it's unfortunately not open-source yet.");
    value = readline.question(`Beatmap API [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.beatmap_api = value;


    if(!('credentials' in config))
        config.credentials = {};

    if(!('credentials' in config_default))
        config_default.credentials = {};


    default_value = 'none';


    if('bot_token' in config_default.credentials && config_default.credentials.bot_token.length > 0)
        default_value = config_default.credentials.bot_token;
    else if('bot_token' in config.credentials && config.credentials.bot_token.length > 0)
        default_value = config.credentials.bot_token;

    do{
        console.log('');
        console.log(`(Required) A Discord bot token is required. You can create a bot here to receive one: ${chalk.blueBright('https://discordapp.com/developers/applications/')}.`);
        value = readline.question(`Discord bot token [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        let client = new Discord.Client();

        valid_key = true;

        try{
            await client.login(value);
        }catch(e){
            valid_key = false;
        }

        if(valid_key)
            console.log(chalk.greenBright("Valid Discord bot token!"));
        else
            console.log(chalk.redBright("Invalid Discord bot token!"));
    }while(value == 'none' || !valid_key);

    config.credentials.bot_token = value;


    default_value = 'none';

    if('discord_client_id' in config_default.credentials && config_default.credentials.discord_client_id.length > 0)
        default_value = config_default.credentials.discord_client_id;
    else if('discord_client_id' in config.credentials && config.credentials.discord_client_id.length > 0)
        default_value = config.credentials.discord_client_id;

    console.log('');
    console.log(`(Optional) Providing a Discord client ID will allow the bot to generate an invite link for you. It's not needed if you want to do it manually.`);
    value = readline.question(`Discord client ID [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.credentials.discord_client_id = value == 'none' ? "" : value;


    default_value = 'none';

    if('osu_api_key' in config_default.credentials && config_default.credentials.osu_api_key.length > 0)
        default_value = config_default.credentials.osu_api_key;
    else if('osu_api_key' in config.credentials && config.credentials.osu_api_key.length > 0)
        default_value = config.credentials.osu_api_key;

    do{
        console.log('');
        console.log(`(Optional) An osu!api key is needed for the osu! commands to work. You can get one here: ${chalk.blueBright('https://osu.ppy.sh/p/api')}.`);
        value = readline.question(`osu!api key [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                let result = await axios.get('https://osu.ppy.sh/api/get_beatmaps', { params: { limit: 1, k: value } });

                if(result.data.length == 0)
                    valid_key = false;
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid osu!api key!"));
            else
                console.log(chalk.redBright("Invalid osu!api key!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.osu_api_key = value == 'none' ? "" : value;

    default_value = 'none';

    if('twitch_client_id' in config_default.credentials && config_default.credentials.twitch_client_id.length > 0)
        default_value = config_default.credentials.twitch_client_id;
    else if('twitch_client_id' in config.credentials && config.credentials.twitch_client_id.length > 0)
        default_value = config.credentials.twitch_client_id;

    do{
        console.log('');
        console.log(`(Optional) A Twitch Client ID is needed for the Twitch commands to work. You can get one here: ${chalk.blueBright('https://dev.twitch.tv/console/apps')}.`);
        value = readline.question(`Twitch Client ID [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                await axios.get('https://api.twitch.tv/helix/streams', { headers: { 'Client-ID': value } });
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid Twitch Client ID!"));
            else
                console.log(chalk.redBright("Invalid Twitch Client ID!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.twitch_client_id = value == 'none' ? "" : value;


    default_value = 'none';

    if('pexels_key' in config_default.credentials && config_default.credentials.pexels_key.length > 0)
        default_value = config_default.credentials.pexels_key;
    else if('pexels_key' in config.credentials && config.credentials.pexels_key.length > 0)
        default_value = config.credentials.pexels_key;

    do{
        console.log('');
        console.log(`(Optional) A Pexels API Key is needed for the ${config.prefix}flowa command to work. You can get one here: ${chalk.blueBright('https://www.pexels.com/api/new/')}.`);
        value = readline.question(`Pexels API Key [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                await axios.get('https://api.pexels.com/v1/curated', { headers: { 'Authorization': value } });
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid Pexels API Key!"));
            else
                console.log(chalk.redBright("Invalid Pexels API Key!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.pexels_key = value == 'none' ? "" : value;


    default_value = 'none';

    if('last_fm_key' in config_default.credentials && config_default.credentials.last_fm_key.length > 0)
        default_value = config_default.credentials.last_fm_key;
    else if('last_fm_key' in config.credentials && config.credentials.last_fm_key.length > 0)
        default_value = config.credentials.last_fm_key;

    do{
        console.log('');
        console.log(`(Optional) A Last.fm API Key is needed for the Last.fm commands to work. You can get one here: ${chalk.blueBright('https://www.last.fm/api/account/create')}.`);
        value = readline.question(`Last.fm API Key [${chalk.green(default_value)}]: `);

        if(!value)
            value = default_value;

        valid_key = true;

        if(value != 'none'){
            try{
                await axios.get('http://ws.audioscrobbler.com/2.0/', { params: { method: 'chart.gettopartists', api_key: value } });
            }catch(e){
                valid_key = false;
            }

            if(valid_key)
                console.log(chalk.greenBright("Valid Last.fm API Key!"));
            else
                console.log(chalk.redBright("Invalid Last.fm API Key!"));
        }
    }while(!valid_key && value != 'none');

    config.credentials.last_fm_key = value == 'none' ? "" : value;

    console.log('');

    try{
        fs.writeFileSync('./config.json', JSON.stringify(config, false, 4));
        console.log(chalk.greenBright('Config file has been written successfully!'));
    }catch(e){
        console.error(e);
        console.error(chalk.redBright("Couldn't write config file"));
    }

    process.exit();
})();
