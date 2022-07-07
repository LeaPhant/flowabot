const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const URL = require('url');
const rosu = require('rosu-pp');

const helper = require('../helper.js');
const osu = require('../osu.js');
const config = require('../config.json');

const mods_enum = {
    ''    : 0,
    'NF'  : 1,
    'EZ'  : 2,
    'TD'  : 4,
    'HD'  : 8,
    'HR'  : 16,
    'SD'  : 32,
    'DT'  : 64,
    'RX'  : 128,
    'HT'  : 256,
    'NC'  : 512,
    'FL'  : 1024,
    'AT'  : 2048,
    'SO'  : 4096,
    'AP'  : 8192,
    'PF'  : 16384,
    '4K'  : 32768,
    '5K'  : 65536,
    '6K'  : 131072,
    '7K'  : 262144,
    '8K'  : 524288,
    'FI'  : 1048576,
    'RD'  : 2097152,
    'LM'  : 4194304,
    '9K'  : 16777216,
    '10K' : 33554432,
    '1K'  : 67108864,
    '3K'  : 134217728,
    '2K'  : 268435456,
    'V2'  : 536870912,
};

const ar_ms_step1 = 120;
const ar_ms_step2 = 150;

const ar0_ms = 1800;
const ar5_ms = 1200;
const ar10_ms = 450;

const od_ms_step = 6;
const od0_ms = 79.5;
const od10_ms = 19.5;

function getModsEnum(mods){
    let return_value = 0;

    if (mods.includes("nc")) mods.push("dt");

    mods.forEach(mod => {
        return_value |= mods_enum[mod.toUpperCase()];
    });
    return return_value;
}

function round(num) {
    var m = Number((Math.abs(num) * 100).toPrecision(15));
    return Math.round(m) / 100 * Math.sign(num);
}

function calculateCsArOdHp(cs_raw=5, ar_raw=5, od_raw=5, hp_raw=5, mods_enabled, clock_rate){
	var speed = 1, ar_multiplier = 1, ar, ar_ms;

	if(clock_rate){
        speed *= clock_rate;
    }else if(mods_enabled.includes("dt")){
		speed *= 1.5;
	}else if(mods_enabled.includes("ht")){
		speed *= .75;
	}

	if(mods_enabled.includes("hr")){
		ar_multiplier *= 1.4;
	}else if(mods_enabled.includes("ez")){
		ar_multiplier *= 0.5;
	}

	ar = ar_raw * ar_multiplier;

	if(ar <= 5) ar_ms = ar0_ms - ar_ms_step1 * ar;
	else		ar_ms = ar5_ms - ar_ms_step2 * (ar - 5);

	if(ar_ms < ar10_ms && mods_enabled.includes("hr")) ar_ms = ar10_ms;
	if(ar_ms > ar0_ms) ar_ms = ar0_ms;

	ar_ms /= speed;

	if(ar <= 5) ar = (ar0_ms - ar_ms) / ar_ms_step1;
	else		ar = 5 + (ar5_ms - ar_ms) / ar_ms_step2;

	var cs, cs_multiplier = 1;

	if(mods_enabled.includes("hr")){
		cs_multiplier *= 1.3;
	}else if(mods_enabled.includes("ez")){
		cs_multiplier *= 0.5;
	}

	cs = cs_raw * cs_multiplier;

	if(cs > 10) cs = 10;

	var od, odms, od_multiplier = 1;

	if(mods_enabled.includes("hr")){
		od_multiplier *= 1.4;
	}else if(mods_enabled.includes("ez")){
		od_multiplier *= 0.5;
	}

	od = od_raw * od_multiplier;
	odms = od0_ms - Math.ceil(od_ms_step * od);
	if(mods_enabled.includes("hr")) odms = Math.min(od0_ms, Math.max(od10_ms, odms));

	odms /= speed;

	od = (od0_ms - odms) / od_ms_step;

    var hp, hp_multiplier = 1;

    if(mods_enabled.includes("hr")){
		hp_multiplier *= 1.4;
	}else if(mods_enabled.includes("ez")){
		hp_multiplier *= 0.5;
	}

	hp = hp_raw * hp_multiplier;

    if(hp > 10) hp = 10;

	return {
		cs: cs,
		ar: ar,
		od: od,
        hp: hp
	}
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
    configRequired: ['pp_path', 'debug', 'osu_cache_path'],
    call: async obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;


            let beatmap_url = argv[1];
            let output = '';
            let mods = [];
            let download_path, download_promise;

            let acc_percent, combo, n100, n50, nmiss, od, ar, cs, hp, clock_rate;

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

                    let base_ar = ar
                    let base_od = od
                    let base_cs = cs
                    let base_hp = hp

                    if(isNaN(cs) || isNaN(ar) || isNaN(od) || isNaN(hp)){
                        let beatmap = await fs.readFile(beatmap_path, 'utf8');
                        let lines = beatmap.split("\n");
                        lines.forEach(function(line){
                        if(isNaN(ar) && line.startsWith("ApproachRate:"))
                            base_ar = line.split(":").pop().trim()
                        if(isNaN(od) && line.startsWith("OverallDifficulty:"))
                            base_od = line.split(":").pop().trim()
                        if(isNaN(cs) && line.startsWith("CircleSize:"))
                            base_cs = line.split(":").pop().trim()
                        if(isNaN(hp) && line.startsWith("HPDrainRate:"))
                            base_hp = line.split(":").pop().trim()
                        });
                    }

                    let args = {
                        path: beatmap_path,
                    }

                    if(mods.length > 0){
                        args.mods = getModsEnum(mods);
                    }

                    if(combo)
                        args.combo = combo;

                    if(n100)
                        args.n100 = n100;

                    if(n50)
                        args.n50 = n50;

                    if(nmiss)
                        args.nMisses = nmiss;

                    if(od)
                        args.od = od;

                    if(ar)
                        args.ar = ar;

                    if(hp)
                        args.hp = hp;

                    if(cs)
                        args.cs = cs;

                    if(acc_percent)
                        args.acc = acc_percent;

                    if(clock_rate)
                        args.clockRate = clock_rate;

                    if(beatmap_id){
                        helper.updateLastBeatmap({
                            beatmap_id,
                            mods,
                            fail_percent: last_beatmap[msg.channel.id].fail_percent || 1,
                            acc: last_beatmap[msg.channel.id].acc || 100
                        }, msg.channel.id, last_beatmap);
                    }

                    let result = rosu.calculate(args)[0];
                    let pp = round(result.pp)
                    let aim_pp = round(result.ppAim)
                    let speed_pp = round(result.ppSpeed)
                    let acc_pp = round(result.ppAcc)
                    let fl_pp = ''
                    let fl_stars = ''
                    let aim_stars = round(result.aimStrain)
                    let speed_stars = round(result.speedStrain)
                    let bpm = round(result.bpm)
                    let stars = round(result.stars)
                    if(mods.includes('fl')) {
                        fl_pp = `, ${round(result.ppFlashlight)} flashlight pp`
                        fl_stars = `, ${round(result.flashlightRating)} flashlight stars`
                    }
                    let diff_settings = calculateCsArOdHp(base_cs, base_ar, base_od, base_hp, mods, clock_rate)

                    //console.log(diff_settings)
                    //console.log(result)

                    ar = round(diff_settings.ar)
                    od = round(diff_settings.od)
                    if(base_cs <= 10) {
                        cs = round(diff_settings.cs)
                    } else {
                        cs = base_cs
                    }
                    if(base_hp <= 10) {
                        hp = round(diff_settings.hp)
                    } else {
                        hp = base_hp
                    }

                    output += `\`\`\`\n${pp}pp (${aim_pp} aim pp, ${speed_pp} speed pp, ${acc_pp} acc pp${fl_pp})\n`
                    output += `${stars}★ (${aim_stars} aim stars, ${speed_stars} speed stars${fl_stars})\n`
                    output += `CS${cs} AR${ar} OD${od} HP${hp} ${bpm} BPM`
                    output += `\`\`\``

                    resolve(output);

                });
            });
        });
    }
}
