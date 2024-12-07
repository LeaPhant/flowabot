const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const URL = require('url');
const { Beatmap, Performance, BeatmapAttributesBuilder } = require('rosu-pp-js');

const helper = require('../helper.js');
const osu = require('../osu.js');
const config = require('../config.json');

function round(num) {
    var m = Number((Math.abs(num) * 100).toPrecision(15));
    return Math.round(m) / 100 * Math.sign(num);
}

function isFloat(value) {
    return (!isNaN(value) && value.toString().indexOf('.') != -1)
} 

module.exports = {
    command: ['rosu', 'rosu-pp', 'rpp', 'pp'],
    description: "Uses rosu-pp to calculate pp for a beatmap.",
    argsRequired: 1,
    usage: '<map link> [+HDDT] [99.23%] [2x100] [1x50] [3m] [342x] [1.2*] [OD9.5] [AR10.3] [CS6] [HP8]',
    example: [
        {
        run: "rosu https://osu.ppy.sh/b/75 +HD 4x100 343x CS2",
        result: "Calculates pp on this beatmap with HD applied, 4 100s, 343 Combo and CS set to 2."
        },
        {
            run: "rosu https://osu.ppy.sh/b/774965 99% 1.3*",
            result: "Calculates pp on this beatmap with 99% accuracy and a custom speed rate of 1.3*."
        }
    ],
    configRequired: ['debug', 'osu_cache_path'],
    call: async obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;


            let beatmap_url = argv[1];
            let output = '';
            let mods = [];
            let download_path, download_promise;

            let acc_percent, combo, n100, n50, nmiss, od, ar, cs, hp, clock_rate, large_tick_hit, slider_tail_hit;

            if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
                beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

            for(let i = 2; i < argv.length; ++i){
                if(argv[i].startsWith("+"))
                    mods = argv[i].substr(1).toLowerCase().match(/.{1,2}/g);
                else if(argv[i].endsWith("%"))
                    acc_percent = parseFloat(argv[i]);
                else if(argv[i].endsWith("x"))
                    if(isFloat(argv[i].slice(0, -1))) {
                        clock_rate = parseFloat(argv[i])
                    } else {
                        combo = parseInt(argv[i]);
                    }
                else if(argv[i].endsWith("x100"))
                    n100 = parseInt(argv[i]);
                else if(argv[i].endsWith("x50"))
                    n50 = parseInt(argv[i]);
                else if(argv[i].endsWith("m"))
                    nmiss = parseInt(argv[i]);
                else if(argv[i].endsWith("*"))
                    clock_rate = parseFloat(argv[i]);
                else if(argv[i].toLowerCase().startsWith("od"))
                    od = parseFloat(argv[i].substr(2));
                else if(argv[i].toLowerCase().startsWith("ar"))
                    ar = parseFloat(argv[i].substr(2));
                else if(argv[i].toLowerCase().startsWith("cs"))
                    cs = parseFloat(argv[i].substr(2));
                else if(argv[i].toLowerCase().startsWith("hp"))
                    hp = parseFloat(argv[i].substr(2));
				else if(argv[i].endsWith("L"))
					large_tick_hit = parseInt(argv[i]);
				else if(argv[i].endsWith("S"))
					slider_tail_hit = parseInt(argv[i]);
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

                    let params = {
                    }

                    if (od)
                        params.od = od;

                    if (ar)
                        params.ar = ar;

                    if (hp)
                        params.hp = hp;

                    if (cs)
                        params.cs = cs;

                    if(mods.length > 0){
						params.mods = mods.join('').toUpperCase();
                    }

                    if(combo)
                        params.combo = combo;

                    if(n100)
                        params.n100 = n100;

                    if(n50)
                        params.n50 = n50;

                    if(nmiss)
                        params.nMisses = nmiss;

                    if(acc_percent)
                        params.accuracy = acc_percent;

                    if(clock_rate)
                        params.clockRate = clock_rate;

					if(large_tick_hit)
						params.largeTickHits = large_tick_hit;

					if(slider_tail_hit)
						params.sliderEndHits = slider_tail_hit;

                    if(beatmap_id){
                        helper.updateLastBeatmap({
                            beatmap_id,
                            mods,
                            fail_percent: last_beatmap[msg.channel.id]?.fail_percent || 1,
                            acc: last_beatmap[msg.channel.id]?.acc || 100
                        }, msg.channel.id, last_beatmap);
                    }
					const osuContents = await fs.readFile(beatmap_path, 'utf8');
                    const map = new Beatmap(osuContents);
                    const perf = new Performance(params).calculate(map);

                    let pp = round(perf.pp)
                    let aim_pp = round(perf.ppAim)
                    let speed_pp = round(perf.ppSpeed)
                    let acc_pp = round(perf.ppAccuracy)
                    let fl_pp = ''
                    let fl_stars = ''
                    let aim_stars = round(perf.difficulty.aim)
                    let speed_stars = round(perf.difficulty.speed)
                    let stars = round(perf.difficulty.stars)
                    if(mods.includes('fl')) {
                        fl_pp = `, ${round(perf.ppFlashlight)} flashlight pp`
                        fl_stars = `, ${round(perf.difficulty.flashlight)} flashlight stars`
                    }
                    
					let mapAttr = new BeatmapAttributesBuilder({map: map, ...params}).build();

                    ar = round(mapAttr.ar)
                    od = round(mapAttr.od)
                    cs = round(mapAttr.cs)
                    hp = round(mapAttr.hp)

					let bpm = round(map.bpm * mapAttr.clockRate)

                    output += `\`\`\`\n${pp}pp (${aim_pp} aim pp, ${speed_pp} speed pp, ${acc_pp} acc pp${fl_pp})\n`
                    output += `${stars}★ (${aim_stars} aim stars, ${speed_stars} speed stars${fl_stars})\n`
                    output += `CS${cs} AR${ar} OD${od} HP${hp} ${bpm} BPM`
                    output += `\`\`\``

					map.free();
                    resolve(output);

                });
            });
        });
    }
}
