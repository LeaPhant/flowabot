const { execFileSync, execFile } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const URL = require('url');

const helper = require('../helper.js');
const osu = require('../osu.js');
const config = require('../config.json');

function parseLine(line, decimals){
    let output = parseFloat(line.split(": ").pop());

    if(decimals >= 0)
        return +output.toFixed(decimals);

    return output;
}

module.exports = {
    command: 'pp',
    description: "Uses osu-tools to calculate pp for a beatmap.",
    argsRequired: 1,
    usage: '<map link> [+HDDT] [99.23%] [2x100] [1x50] [3m] [342x] [OD9.5] [AR10.3] [CS6]',
    example: {
        run: "pp https://osu.ppy.sh/b/75 +HD 4x100 343x CS2",
        result: "Calculates pp on this beatmap with HD applied, 4 100s, 343 Combo and CS set to 2."
    },
    configRequired: ['pp_path', 'debug', 'osu_cache_path'],
    call: async obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_url = argv[1];
            let mods = [];
            let download_path, download_promise;

            let acc_percent, combo, n100, n50, nmiss, od, ar, cs;

            if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
                beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

            for(let i = 2; i < argv.length; ++i){
                if(argv[i].startsWith("+"))
                    mods = argv[i].substr(1).toLowerCase().match(/.{1,2}/g);
                else if(argv[i].endsWith("%"))
                    acc_percent = parseFloat(argv[i]);
                else if(argv[i].endsWith("x"))
                    combo = parseInt(argv[i]);
                else if(argv[i].endsWith("x100"))
                    n100 = parseInt(argv[i]);
                else if(argv[i].endsWith("x50"))
                    n50 = parseInt(argv[i]);
                else if(argv[i].endsWith("m"))
                    nmiss = parseInt(argv[i]);
                else if(argv[i].toLowerCase().startsWith("od"))
                    od = parseFloat(argv[i].substr(2));
                else if(argv[i].toLowerCase().startsWith("ar"))
                    ar = parseFloat(argv[i].substr(2));
                else if(argv[i].toLowerCase().startsWith("cs"))
                    cs = parseFloat(argv[i].substr(2));
            }

            osu.parse_beatmap_url(beatmap_url, true).then(response => {
                let beatmap_id = response;

                if(!beatmap_id){
                    let download_url = URL.parse(beatmap_url);
                    download_path = path.resolve(os.tmpdir(), `${Math.floor(Math.random() * 1000000) + 1}.osu`);

                    download_promise = helper.downloadFile(download_path, download_url);
                    download_promise.catch(reject);
                }

                Promise.resolve(download_promise).then(async () => {
                    if(beatmap_id === undefined && download_path === undefined){
                        reject('Invalid beatmap url');
                        return false;
                    }

                    let beatmap_path = download_path ? download_path : path.resolve(config.osu_cache_path, `${beatmap_id}.osu`);

                    if(!isNaN(cs) || !isNaN(ar) || !isNaN(od)){
                        let beatmap = await fs.readFile(beatmap_path, 'utf8');
                        let beatmap_new = "";
                        let lines = beatmap.split("\n");
                        lines.forEach(function(line){
                        let _line = line;
                        if(!isNaN(ar) && line.startsWith("ApproachRate:"))
                            _line = "ApproachRate:" + ar;
                        if(!isNaN(od) && line.startsWith("OverallDifficulty:"))
                            _line = "OverallDifficulty:" + od;
                        if(!isNaN(cs) && line.startsWith("CircleSize:"))
                            _line = "CircleSize:" + cs;

                        beatmap_new += _line + "\n";
                        });
                        beatmap_path = path.resolve(os.tmpdir(), `${Math.floor(Math.random() * 1000000) + 1}.osu`);
                        
                        await fs.writeFile(beatmap_path, beatmap_new);

                        if(config.debug)
                            helper.log(beatmap_path);
                    }

                    let args = [
                        config.pp_path,
                        'simulate',
                        'osu'
                    ];

                    let args_diff = [
                        config.pp_path,
                        'difficulty'
                    ];

                    args.push(beatmap_path);

                    if(mods.length > 0){
                        mods.forEach(function(mod){
                            args.push('-m', mod);
                        });
                    }

                    if(acc_percent)
                        args.push('-a', acc_percent);

                    if(combo)
                        args.push('-c', combo);

                    if(n100)
                        args.push('-G', n100);

                    if(n50)
                        args.push('-M', n50);

                    if(nmiss)
                        args.push('-X', nmiss);

                    execFile('dotnet', args, (err, stdout, stderr) => {
                        if(err || stderr){
                            if(err){
                                helper.error(err);
                                reject(err);
                                return false;
                            }

                            let error = stderr.split("\n")[1];
                            reject(error);

                            if(config.debug)
                                helper.error(stderr);

                            return false;
                        }else{
                            let lines = stdout.split("\n");

                            let aim_pp, speed_pp, acc_pp, pp;

                            lines.forEach(line => {
                                if(line.startsWith('Aim'))
                                    aim_pp = parseLine(line, 2);

                                if(line.startsWith('Speed'))
                                    speed_pp = parseLine(line, 2);

                                if(line.startsWith('Accuracy'))
                                    acc_pp = parseLine(line, 2);

                                if(line.startsWith('pp'))
                                    pp = parseLine(line, 2);
                            });

                            let output = `\`\`\`\n${pp}pp (${aim_pp} aim pp, ${speed_pp} speed pp, ${acc_pp} acc pp)\`\`\``;

                            if(beatmap_id){
                                helper.updateLastBeatmap({
                                    beatmap_id,
                                    mods,
                                    fail_percent: last_beatmap[msg.channel.id].fail_percent || 1,
                                    acc: last_beatmap[msg.channel.id].acc || 100
                                }, msg.channel.id, last_beatmap);
                            }

                            resolve(output);
                        }
                    });
                });
            });
        });
    }
}
