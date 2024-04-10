(async () => {
    const readline = require('readline-sync');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const chalk = require('chalk');
    const crypto = require('crypto');

    const Discord = require('discord.js');
    const axios = require('axios');

    let config = {}, default_value, value, valid_key;

    if(fs.existsSync('./config.json'))
        config = require('./config.json');

    console.log('');
    console.log('-----------------------------------------------');
    console.log('Welcome to the flowabot configuration wizard 🧙‍');
    console.log('-----------------------------------------------');
    console.log('');
    console.log(chalk.yellow('If you press enter without entering anything it will choose the default value in the [brackets]‍'));

    default_value = '!';

    if(config.prefix)
        default_value = config.prefix;

    console.log('');
    value = readline.question(`Command prefix [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.prefix = value;


    default_value = 'yes';

    if(config.debug)
        default_value = config.debug ? 'yes' : 'no';

    console.log('');
    value = readline.question(`Enable debug messages (yes/no) [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.debug = value == 'yes';


    default_value = path.resolve(os.tmpdir(), 'osumaps');

    if(config.osu_cache_path)
        default_value = config.osu_cache_path;

    console.log('');
    value = readline.question(`Path where to cache .osu files [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.osu_cache_path = value;


    default_value = 'none';

    if(config.pp_path)
        default_value = config.pp_path;

    console.log('');
    console.log(`(Optional) To enable the ${config.prefix}pp command you need to supply a path to PerformanceCalculator.dll.
    To get it you need to compile ${chalk.blue('https://github.com/ppy/osu-tools')}.`);
    value = readline.question(`Path to PerformanceCalculator.dll [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.pp_path = value == 'none' ? "" : value;


    default_value = 'https://osu.lea.moe';

    if(config.beatmap_api)
        default_value = config.beatmap_api;

    console.log('');
    console.log("(Optional) Here you could supply your own beatmap api for star rating values, just leave this as-is cause it's unfortunately not open-source yet.");
    value = readline.question(`Beatmap API [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.beatmap_api = value;


    if(!('credentials' in config))
        config.credentials = {};


    default_value = 'none';

    if(config.credentials.bot_token)
        default_value = config.credentials.bot_token;

    do{
        console.log('');
        console.log(`(Required) A Discord bot token is required. You can create a bot here to receive one: ${chalk.blueBright('https://discord.com/developers/applications/')}.`);
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

    if(config.credentials.discord_client_id)
        default_value = config.credentials.discord_client_id;

    console.log('');
    console.log(`(Optional) Providing a Discord client ID will allow the bot to generate an invite link for you. It's not needed if you want to do it manually.`);
    value = readline.question(`Discord client ID [${chalk.green(default_value)}]: `);

    if(!value)
        value = default_value;

    config.credentials.discord_client_id = value == 'none' ? "" : value;


    default_value = 'none';

    if(config.credentials.osu_api_key)
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

    if(config.credentials.twitch_client_id)
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

    if(config.credentials.pexels_key)
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

    if(config.credentials.last_fm_key)
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


	default_value = {
		client_id: 'none',
		client_secret: 'none',
		bucket_name: 'none',
		bucket_endpoint: 'none'
	};
	let temporary_credentials = {
		client_id: 'none',
		client_secret: 'none',
		bucket_name: 'none',
		bucket_endpoint: 'none'
	}
	const S3_credential_fields = ['client_id', 'client_secret', 'bucket_name', 'bucket_endpoint'];

	if (config.credentials.S3){
		// console.log("existing S3 credentials found, assigning to default_value");
		// console.log(config.credentials.S3);
		default_value = config.credentials.S3;
	}

	do {
		console.log('');
		console.log(`(Optional) An S3 Bucket and access credentials are needed for the \`toS3\` parameter of the ${config.prefix}render command to work.`);
		valid_key = true;

		for (const field of S3_credential_fields){
			value = readline.question(`${field} [${chalk.green(default_value[field])}]: `);
			if(!value){
				temporary_credentials[field] = default_value[field];
			}
			else{
				temporary_credentials[field] = value;
			}
		}

		if (temporary_credentials.client_id !== 'none'){
			try{
				const aws = require('aws-sdk');
				const S3Endpoint = new aws.Endpoint(temporary_credentials.bucket_endpoint);
				let s3 = new aws.S3({
					endpoint: S3Endpoint,
					accessKeyId: temporary_credentials.client_id,
					secretAccessKey: temporary_credentials.client_secret
				});

				let test_upload_params = {
					Bucket: temporary_credentials.bucket_name,
					Key: crypto.randomBytes(16).toString('hex'),
					Body: 'test'
				};
				await s3.upload(test_upload_params).promise();
				// console.log(upload_result)
			} catch(e){
				console.log(chalk.redBright("Invalid S3 Bucket Credentials!"));
				valid_key = false;
				temporary_credentials = default_value;
			}
		}

	} while (!valid_key &&
			temporary_credentials.client_id !== 'none' &&
			temporary_credentials.client_secret !== 'none' &&
			temporary_credentials.bucket_name !== 'none' &&
			temporary_credentials.bucket_endpoint !== 'none');

	config.credentials.S3 = temporary_credentials;

    console.log('');

    try{
        fs.writeFileSync('./config.json', JSON.stringify(config, false, 2));
        console.log(chalk.greenBright('Config file has been written successfully!'));
    }catch(e){
        console.error(e);
        console.error(chalk.redBright("Couldn't write config file"));
    }

    process.exit();
})();
