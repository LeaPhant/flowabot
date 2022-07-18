const axios = require('axios');
const ojsama = require('ojsama');
const { std_ppv2 } = require('booba');
const rosu = require('rosu-pp')

const osuBeatmapParser = require('osu-parser');
const path = require('path');
const util = require('util');
const fs = require('fs').promises;

const { DateTime, Duration } = require('luxon');

const { createCanvas } = require('canvas');

const ur_calc = require('./renderer/ur.js');
const frame = require('./renderer/render_frame.js');
const helper = require('./helper.js');

const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const graphCanvas = new ChartJSNodeCanvas({ width: 600, height: 400 });

const Jimp = require('jimp');

const getFrame = util.promisify(frame.get_frame);

const MINUTE = 60 * 1000;
const STRAIN_STEP = 400.0;
const DECAY_BASE = [ 0.3, 0.15 ];
const STAR_SCALING_FACTOR = 0.0675;
const EXTREME_SCALING_FACTOR = 0.5;

const config = require('./config.json');
const { mod } = require('mathjs');

let tracked_users = {};
let retries = 0;

if(helper.getItem('tracked_users')){
	tracked_users = JSON.parse(helper.getItem('tracked_users'));
}else{
	helper.setItem('tracked_users', JSON.stringify(tracked_users));
}

let top_plays = {};

if(helper.getItem('top_plays')){
	top_plays = JSON.parse(helper.getItem('top_plays'));
}else{
	helper.setItem('top_plays', JSON.stringify(top_plays));
}

let discord_client, last_beatmap;

const DIFF_MODS = ["HR","EZ","DT","HT","FL"];

const TIME_MODS = ["DT", "HT"];

const CHART_OPTIONS = {
    fontColor: '#FFFFFFCC',
    legend: {
        display: false
    },
    layout: {
        padding: {
            top: 0,
            bottom: 20,
            left: 20,
            right: 20
        }
    },
    elements: {
        line: {
            borderColor: '#F06292',
            fill: false
        }
    },
    title: {
        display: true,
        fontColor: '#ECEFF1DD',
        fontSize: 14,
        fontStyle: 'bold',
        padding: 20
    },
    scales: {
        yAxes: [{
            gridLines: {
                display: true,
                color: '#607D8BAA',
                drawBorder: false,
                zeroLineColor: '#607D8BAA',
                drawTicks: false
            },
            ticks: {
                fontColor: '#FFFFFFAA',
                fontStyle: 'bold',
                padding: 10
            }
        }],
        xAxes: [{
            gridLines: {
                display: false
            },
            ticks: {
                fontColor: '#FFFFFFAA',
                fontStyle: 'bold',
                maxTicksLimit: 12,
                maxRotation: 0,
                padding: 10
            },
            type: 'time',
            time: { 
                unit: 'second', 
                displayFormats: { second: 'm:ss' } 
            }
        }]
    }
};

const CHART_THEME = {
    chart: {
        backgroundColor: 'rgba(38, 50, 56, 0.9)',
        spacingBottom: 20,
        spacingTop: 20,
        marginTop: 100,
        spacingLeft: 0,
        spacingRight: 30
    },
    yAxis: {
        gridLineColor:"#455A64",
        tickPixelInterval: 45,
        labels: {
            style: {
                color: '#B0BEC5'
            },
        },
        title: {
            style: {
                color: '#F48FB1'
            }
        }
    },
    xAxis: {
        tickPixelInterval: 60,
        gridLineColor:"#455A64",
        lineColor:"#607D8B",
        tickColor:'#607D8B',
        labels: {
            align: 'center',
            reserveSpace: true,
            style: {
                color: '#B0BEC5',
                textOverflow: 'none'
            }
        }
    },
    plotOptions: {
        series: {
            lineWidth: 3,
            name: false
        }
    },
    colors: ['#F06292', '#4DD0E1'],
    title: {
        style: {
            color: '#ECEFF1',
            fontSize: 16
        }
    },
    subtitle: {
        style: {
            color: '#CFD8DC',
            fontSize: 12
        }
    },
    legend: {
        itemStyle: {
            color: '#CFD8DC'
        }
    },
    credits: false
};

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

let api, access_token;

var settings = {
    api_key: ""
};

function accuracy(count300, count100, count50, countmiss){
	return (Number(count300) * 300 + Number(count100) * 100 + Number(count50) * 50)
		/  (Number(count300) * 300 + Number(count100) * 300 + Number(count50) * 300 + Number(countmiss) * 300);
}

function compare(a,b){
	if(parseFloat(a.pp) > parseFloat(b.pp)) return -1;
	if(parseFloat(a.pp) < parseFloat(b.pp)) return 1;
	return 0;
}

function numberWithCommas(x){
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getMods(enabled_mods){
    var return_array = [];
    for(var mod in mods_enum){
        if((mods_enum[mod] & enabled_mods) != 0)
            return_array.push(mod);
    }
    return return_array;
}

function sanitizeMods(mods_raw){
    let speed_change;
    let mods = mods_raw.map(m => m.acronym);
    let return_array = mods;

    if (mods.includes("DT") || mods.includes("HT") || mods.includes("NC") || mods.includes("DC")) {
        speed_change = mods_raw.filter(mod => mod.acronym == "DT" || mod.acronym == "HT" || mod.acronym == "NC" || mod.acronym == "DC")[0].settings.speed_change ?? undefined;
    }

    if(mods.includes("NC") && mods.includes("DT"))
        return_array.splice(mods.indexOf("DT"), 1);
    if(mods.includes("PF") && mods.includes("SD"))
        return_array.splice(mods.indexOf("SD"), 1);
    if (speed_change) {
        return_array.forEach((mod, index) => {
            if (mod == "DT" || mod == "HT" || mod == "NC" || mod == "DC")
                mods[index] += `(${speed_change}x)`
        })
    }

    return return_array;
}

function getModsEnum(mods){
    let return_value = 0;
    mods.forEach(mod => {
        return_value |= mods_enum[mod.toUpperCase()];
    });
    return return_value;
}

function hasMods(mods, disabledmods, scores){
    let output = [];

    scores.forEach(score => {
        let check = true;
        let enabled_mods = getMods(parseInt(score.enabled_mods));
        mods.forEach(mod => {
            if(!enabled_mods.includes(mod))
                check = false;
        });

        disabledmods.forEach(mods => {
            if(mods.every(a => enabled_mods.includes(a)))
                check = false;
        });

        if(check)
            output.push(score);
    });

    return output;
}

function getBestMods(scores, mods){
    let filter = [];

    function sortScore(a, b){
        return parseInt(b.score) - parseInt(a.score);
    }

    let mod_combos = [
        ['HR', 'DT', 'FL'],
        ['EZ', 'DT', 'FL'],
        ['HR', 'HT', 'FL'],
        ['EZ', 'HT', 'FL'],
        ['HR', 'DT'],
        ['EZ', 'DT'],
        ['HR', 'HT'],
        ['EZ', 'HT'],
        ['HR'],
        ['EZ'],
        ['DT'],
        ['PF'],
        ['SD'],
        ['TD'],
        ['HT']
    ];

    let non_combos = [];

    mod_combos.forEach(mod_combo => {
        if(mod_combo.every(a => mods.includes(a))){
            filter = hasMods(mod_combo, non_combos, scores);
            if(filter.length > 0) return filter.sort(sortScore);
        }
        non_combos.push(mod_combo);
    });

    return filter;
}

function getDifficultyAttribs(results){
    let output = { };

    results.forEach(result => {
        let name = DIFF_ATTRIBS[result.type];
        output[name] = result.value;
    });

    return output;
}
function calculateAccuracy(stats) {
    const acc = (300 * (stats.great ?? 0) + 100 * (stats.ok ?? 0) + 50 * (stats.meh ?? 0)) / (300 * totalHits(stats))
    return acc * 100;
}

function totalHits(stats) {
    const hits = (stats.great ?? 0) + (stats.ok ?? 0) + (stats.meh ?? 0) + (stats.miss ?? 0)
    return hits;
}

function calculateCsArOdHp(cs_raw, ar_raw, od_raw, hp_raw, mods_enabled){
	var speed = 1, ar_multiplier = 1, ar, ar_ms;
    let mods = mods_enabled.map(x => x.acronym)

    if (mods.includes("DT") || mods.includes("NC")) {
        speed *= mods_enabled.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings.speed_change ?? 1.5;
    } else if (mods.includes("HT") || mods.includes("DC")) {
        speed *= mods_enabled.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings.speed_change ?? 0.75;
    }

	if(mods.includes("HR")){
		ar_multiplier *= 1.4;
	}else if(mods.includes("EZ")){
		ar_multiplier *= 0.5;
	}

	ar = ar_raw * ar_multiplier;

	if(ar <= 5) ar_ms = ar0_ms - ar_ms_step1 * ar;
	else		ar_ms = ar5_ms - ar_ms_step2 * (ar - 5);

	if(ar_ms < ar10_ms) ar_ms = ar10_ms;
	if(ar_ms > ar0_ms) ar_ms = ar0_ms;

	ar_ms /= speed;

	if(ar <= 5) ar = (ar0_ms - ar_ms) / ar_ms_step1;
	else		ar = 5 + (ar5_ms - ar_ms) / ar_ms_step2;

	var cs, cs_multiplier = 1;

	if(mods.includes("HR")){
		cs_multiplier *= 1.3;
	}else if(mods.includes("EZ")){
		cs_multiplier *= 0.5;
	}

	cs = cs_raw * cs_multiplier;

	if(cs > 10) cs = 10;

	var od, odms, od_multiplier = 1;

	if(mods.includes("HR")){
		od_multiplier *= 1.4;
	}else if(mods.includes("EZ")){
		od_multiplier *= 0.5;
	}

	od = od_raw * od_multiplier;
	odms = od0_ms - Math.ceil(od_ms_step * od);
	odms = Math.min(od0_ms, Math.max(od10_ms, odms));

	odms /= speed;

	od = (od0_ms - odms) / od_ms_step;

    var hp, hp_multiplier = 1;

    if(mods.includes("HR")){
		hp_multiplier *= 1.4;
	}else if(mods.includes("EZ")){
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

function getRankEmoji(rank){
    switch(rank){
        case 'XH':
            return helper.emote('XH_Rank', null, discord_client) || "Silver SS";
        case 'X':
            return helper.emote('X_Rank', null, discord_client) || "SS";
        case 'SH':
            return helper.emote('SH_Rank', null, discord_client) || "Silver S";
        case 'S':
            return helper.emote('S_Rank', null, discord_client) || "S";
        case 'A':
            return helper.emote('A_Rank', null, discord_client) || "A";
        case 'B':
            return helper.emote('B_Rank', null, discord_client) || "B";
        case 'C':
            return helper.emote('C_Rank', null, discord_client) || "C";
        case 'D':
            return helper.emote('D_Rank', null, discord_client) || "D";
        case 'F':
            return helper.emote('F_Rank', null, discord_client) || "Fail";
    }
}

function compareScores(a, b){
    if(a.ended_at != b.ended_at)
        return false;

    if(a.user_id != b.user_id)
        return false;

    return true;
}

function ordinalSuffix(i) {
    var j = i % 10,
        k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
}

async function getScore(recent_raw, cb){
    let recent = {};
    let best_score;

    recent = Object.assign({
        user_id: recent_raw.user_id,
        beatmap_id: recent_raw.beatmap.id,
        rank: recent_raw.passed ? recent_raw.rank: "F",
        score: Number(recent_raw.total_score),
        combo: Number(recent_raw.max_combo),
        count300: Number(recent_raw.statistics.great ?? 0),
        count100: Number(recent_raw.statistics.ok ?? 0),
        count50: Number(recent_raw.statistics.meh ?? 0),
        countmiss: Number(recent_raw.statistics.miss ?? 0),
        mods: recent_raw.mods,
        date: recent_raw.ended_at,
        unsubmitted: false
    }, recent);

	if('pp' in recent_raw && Number(recent_raw.pp) > 0){
		recent.pp = Number(recent_raw.pp);
	}

    let requests = [
        api.get(`/users/${recent_raw.user_id}/scores/best`, { params: { limit: 100 } }),
        //api.get(`/beatmaps/${recent_raw.beatmap.id}/scores`, { params: { mode: 'osu' } }),
        //api.get(`/beatmaps/${recent_raw.beatmap.id}/scores/users/${recent_raw.user_id}`, { params: { mods: recent_raw.mods } }),
        api.get(`/users/${recent_raw.user_id}/osu`),
        api.get(`/beatmapsets/${recent_raw.beatmapset.id}`)
    ];

    try {
        const response = await api.get(`/beatmaps/${recent_raw.beatmap.id}/scores/users/${recent_raw.user_id}`, { params: { mods: recent_raw.mods } })
        best_score = response.data.score
        best_score.position = response.data.position
    } catch(e) {
        best_score = e.response.data.score ?? {}
        best_score.position = e.response.data.position ?? 0
    }

    Promise.all(requests).then(results => {

        let user_best = results[0].data;
        //let leaderboard = results[1].data;
        //let best_score = results[2].data;
        let user = results[1].data;
        let beatmapset = results[2].data

        let pb = 0;
        let lb = 0;
        let replay = 0;

        for(let i = 0; i < user_best.length; i++){
            if(compareScores(user_best[i], recent_raw)){
                pb = ++i;
                break;
            }
        }

        // for(let i = 0; i < leaderboard.length; i++){
        //     if(compareScores(leaderboard[i], recent_raw)){
        //         lb = ++i;
        //         break;
        //     }
        // }

        if(compareScores(best_score, recent_raw)){
            lb = best_score.position
        }

        recent = Object.assign({
            pb: pb,
            lb: lb,
            username: user.username,
            user_rank: Number(user.statistics.global_rank),
            user_pp: Number(user.statistics.pp)
        }, recent);

        if(best_score){
            if(compareScores(best_score, recent_raw)){
                replay = Number(best_score.replay ? 1 : 0);
				recent.score_id = best_score.id;
            }else{
                recent.unsubmitted = true;
			}
        }

        let beatmap = recent_raw.beatmap;
        //let beatmapset = recent_raw.beatmapset;

        if(recent.mods.map(x => x.acronym).includes('DA')) {
            recent.mods.forEach( mod => {
                if(mod.acronym == "DA" && Object.entries(mod.settings).length > 0){ 
                    beatmap.ar = mod.settings.approach_rate ?? beatmap.ar
                    beatmap.cs = mod.settings.circle_size ?? beatmap.cs
                    beatmap.accuracy = mod.settings.overall_difficulty ?? beatmap.accuracy
                    beatmap.drain = mod.settings.drain_rate ?? beatmap.drain
                }
            })
        }
                    
        let diff_settings = calculateCsArOdHp(beatmap.cs, beatmap.ar, beatmap.accuracy, beatmap.drain, recent.mods);

        let speed = 1;

        if (recent.mods.map(x => x.acronym).includes("DT") || recent.mods.map(x => x.acronym).includes("NC")) {
            speed *= recent.mods.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings.speed_change ?? 1.5;
        } else if (recent.mods.map(x => x.acronym).includes("HT") || recent.mods.map(x => x.acronym).includes("DC")) {
            speed *= recent.mods.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings.speed_change ?? 0.75;
        }

        let fail_percent = 1;

        if(!recent_raw.passed)
        fail_percent = (recent.count300 + recent.count100 + recent.count50 + recent.countmiss) / (beatmap.count_spinners + beatmap.count_sliders + beatmap.count_circles);

        helper.downloadBeatmap(recent_raw.beatmap.id).finally(async () => {
            let beatmap_path = path.resolve(config.osu_cache_path, `${recent_raw.beatmap.id}.osu`);

            let rosu_arg = {
                path: beatmap_path,
                params: [
                    {
                        mods: getModsEnum(recent_raw.mods.map(x => x.acronym)),
                        n300: recent_raw.statistics.great ?? 0,
                        n100: recent_raw.statistics.ok ?? 0,
                        n50: recent_raw.statistics.meh ?? 0,
                        nMisses: recent_raw.statistics.miss ?? 0,
                        combo: recent_raw.max_combo,
                        clockRate: speed,
                        ar: beatmap.ar,
                        cs: beatmap.cs,
                        hp: beatmap.hp,
                        od: beatmap.od,
                    },
                    {
                        mods: getModsEnum(recent_raw.mods.map(x => x.acronym)),
                        clockRate: speed,
                        n100: recent_raw.statistics.ok ?? 0,
                        n50: recent_raw.statistics.meh ?? 0,
                        ar: beatmap.ar,
                        cs: beatmap.cs,
                        hp: beatmap.hp,
                        od: beatmap.od,
                    }
                ]
            }

            const plays = rosu.calculate(rosu_arg)
            const play = plays[0]
            const fc_play = plays[1]

            recent = Object.assign({
                approved: beatmapset.status,
                beatmapset_id: beatmapset.id,
                artist: beatmapset.artist,
                title: beatmapset.title,
                version: beatmap.version,
                bpm_min: beatmap.bpm_min * speed,
                bpm_max: beatmap.bpm_max * speed,
                max_combo: play.maxCombo,
                bpm: beatmap.bpm * speed,
                creator: beatmapset.creator,
                creator_id: beatmapset.user_id,
                approved_date: beatmapset.ranked_date,
                cs: diff_settings.cs,
                ar: diff_settings.ar,
                od: diff_settings.od,
                hp: diff_settings.hp,
                duration: beatmap.total_length,
                fail_percent: fail_percent
            }, recent);

            recent = Object.assign({
                stars: play.stars,
                pp_fc: fc_play.pp,
                acc: recent_raw.accuracy * 100,
                acc_fc: calculateAccuracy({ 
                    great: recent_raw.statistics.great ?? 0,
                    ok: recent_raw.statistics.ok ?? 0,
                    meh: recent_raw.statistics.meh ?? 0,
                }),
            }, recent);

            if(recent.pp == null)
                recent.pp = play.pp;

            let strains_bar;

            if(await helper.fileExists(beatmap_path)){
                strains_bar = await module.exports.get_strains_bar(beatmap_path, recent.mods.map(mod => mod.acronym).join(''), recent.fail_percent);

                if(strains_bar)
                    recent.strains_bar = true;
            }

            if(replay && await helper.fileExists(beatmap_path)){
                let ur_promise = new Promise((resolve, reject) => {
                    if(config.debug)
                        helper.log('getting ur');

                    ur_calc.get_ur(
                        {
                            access_token: access_token,
                            player: recent_raw.user_id,
                            beatmap_id: recent_raw.beatmap.id,
                            mods_enabled: getModsEnum(recent_raw.mods.map(x => x.acronym)),
                            score_id: recent.score_id,
                            mods: recent.mods.map(x => x.acronym)
                        }).then(response => {
                            recent.ur = response.ur;

                            if(recent.countmiss == (response.miss || 0) 
                            && recent.count100 == (response['100'] || 0)
                            && recent.count50 == (response['50'] || 0))
                                recent.countsb = response.sliderbreak;

                            if(recent.mods.map(x => x.acronym).includes("DT") || recent.mods.map(x => x.acronym).includes("NC"))
                                recent.cvur = response.ur / 1.5;
                            else if(recent.mods.map(x => x.acronym).includes("HT"))
                                recent.cvur = response.ur * 1.5;

                            resolve(recent);
                        });
                });

                recent.ur = -1;
                if(recent.mods.map(mod => mod.acronym).includes("DT") || recent.mods.map(mod => mod.acronym).includes("HT"))
                    recent.cvur = -1;
                cb(null, recent, strains_bar, ur_promise);
            }else{
                cb(null, recent, strains_bar);
            }
        }).catch(helper.error);
    }).catch(err => {
        cb("Couldn't reach osu!api. 💀");
        helper.log(err);
    });
}
function calculateStrains(type, diffobjs, speed_multiplier){
    let strains = [];
    let strain_step = STRAIN_STEP * speed_multiplier;
    let interval_end = strain_step
    let max_strain = 0.0;

    for (let i = 0; i < diffobjs.length; ++i){
        while (i * strain_step > interval_end) {
        strains.push(max_strain);
        if (i > 0) {
            let decay = Math.pow(DECAY_BASE[type],
            (interval_end - ((i - 1) * strain_step)) / 1000.0);
            max_strain = diffobjs[i - 1] * decay;
        } else {
            max_strain = 0.0;
        }
        interval_end += strain_step;
        }
        max_strain = Math.max(max_strain, diffobjs[i]);
    }

    strains.push(max_strain);

    return strains;
}

function calculateDifficultyValue(strains) {
    const decayWeight = 0.9
    let difficulty = 0
    let weight = 1

    let peaks = strains.filter(n => n > 0)
    .sort((a, b) => a - b).reverse();
    
    peaks.forEach(strain => {
        difficulty += strain * weight;
        weight *= decayWeight;
    })

    return difficulty;
}

function calculateFlashlightDifficultyValue(strains) {
    let sum = 0;

    for (let i = 0; i < strains.length; i++) {
        sum += strains[i];
    }

    return sum * 1.06;
}

async function updateAccessToken(){
    let data = await fs.readFile('../osu-oauth-token-refresh/access_token.json', 'utf8')
    let json = JSON.parse(data)
    access_token = json.access_token

    api = axios.create({
        baseURL: 'https://osu.ppy.sh/api/v2',
        headers: {
            Authorization: `Bearer ${access_token}`,
            "x-api-version": 20220707
        }
    });

    setTimeout(updateAccessToken, 60 * 1000)
}

function updateTrackedUsers(){
    for(user_id in tracked_users){
        let user = user_id;

        api.get(`/users/${user}/scores/best`, {params: { limit: tracked_users[user].top, mode: 'osu' }}).then(response => {
            response = response.data;

            if(user in top_plays){
                response.forEach(score => {
                    score.score_id = Number(score.id);
                    if(!top_plays[user].includes(Number(score.score_id))){
                        getScore(score, (err, recent, strains_bar, ur_promise) => {
                            if(err)
                                return false;

                            if(ur_promise){
                                ur_promise.then(recent => {
                                    let embed = module.exports.format_embed(recent);
                                    tracked_users[user].channels.forEach(channel_id => {
                                        let channel = discord_client.channels.cache.get(channel_id);
                                        if(channel)
                                            channel.send(`${recent.username} got a new #${recent.pb} top play!`,
												{
													embed,
													files: [{attachment: strains_bar, name: 'strains_bar.png'}]
												}
											).then(() => {
												helper.updateLastBeatmap(recent, channel.id, last_beatmap);
											}).catch(helper.error);
                                    });
                                });
                            }else{
                                let embed = module.exports.format_embed(recent);
                                tracked_users[user].channels.forEach(channel_id => {
                                    let channel = discord_client.channels.cache.get(channel_id);
                                    if(channel)
                                        channel.send(`${recent.username} got a new #${recent.pb} top play!`,
											{
												embed,
												files: [{attachment: strains_bar, name: 'strains_bar.png'}]
											})
										.then(() => {
											helper.updateLastBeatmap(recent, channel.id, last_beatmap);
										}).catch(helper.error);
                                });
                            }
                        });
                    }
                });
            }

            top_plays[user] = [];
            response.forEach(score => {
                top_plays[user].push(Number(score.id));
            });

            helper.setItem('top_plays', JSON.stringify(top_plays));
        }).catch(err => {
			helper.error('Error updating tracking', err);
		});
    }

	setTimeout(updateTrackedUsers, 60 * 1000);
}

// async function getAccessToken(){

//     const token_url = "https://osu.ppy.sh/oauth/token";

//     let headers = {
//         "Accept": "application/json",
//         "Content-Type": "application/json",
//     };

//     let body = {
//         "client_id": config.credentials.client_id,
//         "client_secret": config.credentials.client_secret,
//         "grant_type": "client_credentials",
//         "scope": "public"  
//     }

//     const token_response = await axios(token_url, {
//         method: "POST",
//         headers,
//         data: body,
//     })

//     const token_res = await token_response.data;
//     const token = token_res.access_token;
//     const expires = token_res.expires_in - 1;

//     access_token = token;

//     setTimeout(getAccessToken, expires * 1000);

// }

async function getUserId(u){
    let res;
    let username = await u.replace(/\+/g, " ")
    try {
        res = await api.get(`/users/${username}/osu`, { params: { key: "user" } });
    } catch (err) {
        if(err.response.status == 404) {
            if(retries < 1) {
                retries += 1
                username = username.replace(/_/g, " ")
                try {
                res = await api.get(`/users/${username}/osu`, { params: { key: "user" } });
                } catch (err) {
                    return {error: err}
                }
                let user = res.data;
                retries = 0
                return {user_id: user.id}
            }
            //cb("Couldn't find user");
            retries = 0
            return {error: err}
        }
        else
            //cb("Couldn't reach osu!api");
            retries = 0
            return {error: err}
    }
    let user = res.data;
    return {user_id: user.id}
}

module.exports = {
    init: async function(client, client_id, client_secret, _last_beatmap, api_key){
		discord_client = client;
		last_beatmap = _last_beatmap;

		if(client_id && client_secret){
            
            updateAccessToken();
			updateTrackedUsers();
            
		}

        if(api_key){
	        settings.api_key = api_key;
	        apiv1 = axios.create({
	            baseURL: 'https://osu.ppy.sh/api',
	            params: {
	                k: api_key
	            }
	        });
        }

    },

    get_mode_name: function(mode){
        switch(mode){
            case 0:
                return "osu!std";
                break;
            case 1:
                return "osu!taiko";
                break;
            case 2:
                return "osu!catch";
                break;
            case 3:
                return "osu!mania";
                break;
        }
    },

    add_pp: async function(user, pp_to_add, beatmap, cb){
        let pp = 0, pp_full = 0, pp_no_bonus = 0, max = 0;
        let pp_array, pp_array_new = [];
        let output_user;
        let no_bonus_pp = false;
        let old_rank = "";
        let new_rank = "";

        if(pp_to_add === null) return false;

        username = user.replace(/\+/g, " ")
        let res;
        try {
            res = await api.get(`/users/${username}/osu`, { params: { key: "user" } });
        } catch (error) {
            if (error.response.status == 404) cb("User not found. 😔")
            else cb("Something went wrong. 😔")
            return false
        }

        let json = res.data;
        output_user = json.username;
        pp_full = parseFloat(json.statistics.pp);
        old_rank = parseInt(json.statistics.global_rank);

        let total_scores = 0;
        for (let grade in json.statistics.grade_counts) {
            total_scores += json.statistics.grade_counts[grade]
        }

        api.get(`/users/${json.id}/scores/best`, { params: { limit: 100 } }).then(response => {
            json = response.data;

            pp_array = json;

            max = json.length;
            let fixing_score = "";

            json.forEach(function(value, index){
                let current_pp = parseFloat(value.pp);
                let current_factor = Math.pow(0.95, index);
                let current_pp_weighted = current_pp * current_factor;

                pp += current_pp_weighted;
            });

            if(max == 100){
                let differences_array = [];
                json.forEach(function(value, index){
                    if(index >= 90){
                        differences_array.push(parseFloat(json[index-1].pp) - parseFloat(json[index].pp));
                    }
                });

                let sum = 0;
                differences_array.forEach(function(value, index){
                    sum += value;
                });

                let avg = sum / differences_array.length;
                let current_pp = parseFloat(json[99].pp);

                for(let x = 0; x < 100; x++){
                    current_pp -= avg;
                    let current_factor = Math.pow(0.95, 100 + x);
                    let current_pp_weighted = current_pp * current_factor;

                    if(current_pp > 0) pp += current_pp_weighted;
                    pp_array.push({pp: current_pp });
                }
            }

            pp_no_bonus = pp_full - pp;

            let bonus_pp = pp_no_bonus;

            let beta_bonus_pp = 416.6667 * (1 - Math.pow(0.9994, total_scores));

            let avg_bonus_pp = (bonus_pp + beta_bonus_pp) / 2;

            if(pp_no_bonus < 0 || !pp_full){
                pp_no_bonus = 0;
                no_bonus_pp = true;

            }

            if(beatmap){
                if(Number.isInteger(Number(beatmap))){
                    let index = findWithAttr(pp_array, "beatmap_id", beatmap);
                    if(index < 0){
                        cb("https://osu.ppy.sh/b/" + beatmap + ": beatmap not found in top scores");
                        return false;
                    }

                    pp_array[index].pp = pp_to_add;
                    pp_array.sort(compare);
                    fixing_score = " (fixing score on https://osu.ppy.sh/b/" + beatmap + ")";
                }
            }else{
                pp_to_add.forEach(function(value, index){
                    pp_array.push({pp: value });
                });
                pp_array.sort(compare);
                pp_array.splice(max, pp_to_add.length);
            }

            setTimeout(function(){
                pp_array.forEach(function(value, index){
                    let current_pp = parseFloat(value.pp);
                    let current_factor = Math.pow(0.95, index);
                    let current_pp_weighted = current_pp * current_factor;

                    pp_no_bonus += current_pp_weighted;
                });

                let total_pp_weighted = (pp_no_bonus - pp_full);
                if(total_pp_weighted < 0) total_pp_weighted = 0;

                if(pp_no_bonus < pp_full) pp_no_bonus = pp_full;

                let adding_pp = "";

                pp_to_add.forEach(function(value, index){
                    adding_pp += value + "pp";
                    if(index + 1 < pp_to_add.length) adding_pp += "+";
                });

                let output_message = "";

                if(no_bonus_pp){
                    output_message += output_user + ": " + pp_full + "pp (#" + numberWithCommas(old_rank) + ") ► +" + adding_pp + " (" + (pp_no_bonus - pp_full).toFixed(1) + "pp weighted) ► " + numberWithCommas(pp_no_bonus.toFixed(1)) + "pp" + new_rank + " (inactive account, no bonus pp)" + fixing_score;
                }else{
                    output_message += output_user + ": " + pp_full + "pp (#" + numberWithCommas(old_rank) + ") ► +" + adding_pp + " (" + (pp_no_bonus - pp_full).toFixed(1) + "pp weighted) ► " + numberWithCommas(pp_no_bonus.toFixed(1)) + "pp" + new_rank + " (" + bonus_pp.toFixed(1) + " bonus pp)" + fixing_score;
                }

                cb(output_message);

                if(config.debug){
                    helper.log("Current pp: " + pp_full);
                    helper.log("Added pp: " + adding_pp + " -> " + (pp_no_bonus - pp_full).toFixed(1));
                    helper.log("Result: " + pp_no_bonus.toFixed(1));
                }

            }, 350);
        })
        .catch((error) => {
            if (error.response.status == 404) cb("User not found. 😔")
            else cb("⚠️ Something went wrong. ⚠️")
            return false
        });
    },

    calculate_ar: function(ar_raw, mods){
        var mods_string = mods.toLowerCase().replace("+", "");
        var mods_array = mods_string.match(/.{1,2}/g);

        if(!mods_array)
            var mods_array = [];

        helper.log(mods_string);
        helper.log(mods_array);
        var speed = 1, ar_multiplier = 1, ar, ar_ms;

        if(mods_array.indexOf("dt") > -1){
            speed *= 1.5;
        }else if(mods_array.indexOf("ht") > -1){
            speed *= .75;
        }

        if(mods_array.indexOf("hr") > -1){
            ar_multiplier *= 1.4;
        }else if(mods_array.indexOf("ez") > -1){
            ar_multiplier *= 0.5;
        }

        ar = ar_raw * ar_multiplier;

        if(ar <= 5) ar_ms = ar0_ms - ar_ms_step1 * ar;
        else		ar_ms = ar5_ms - ar_ms_step2 * (ar - 5);

        if(ar_ms < ar10_ms) ar_ms = ar10_ms;
        if(ar_ms > ar0_ms) ar_ms = ar0_ms;

        ar_ms /= speed;

        if(ar <= 5) ar = (ar0_ms - ar_ms) / ar_ms_step1;
        else		ar = 5 + (ar5_ms - ar_ms) / ar_ms_step2;

        var output = "";

        if(mods_array.length > 0)
            output += "AR" + ar_raw + "+" + mods_array.join("").toUpperCase() + " -> ";

        output += "AR" + +ar.toFixed(2) + " (" + ar_ms.toFixed(0) + "ms)";

        return output;
    },

    format_embed: function(recent){
        let embed = {fields: []};
        embed.color = 12277111;
        embed.author = {
            url: `https://osu.ppy.sh/u/${recent.user_id}`,
            name: `${recent.username} – ${recent.user_pp}pp (#${recent.user_rank.toLocaleString()})`,
            icon_url: `https://a.ppy.sh/${recent.user_id}?${+new Date()}}`
        };
        embed.title = `${recent.artist} – ${recent.title} [${recent.version}]`;
        embed.url = `https://osu.ppy.sh/b/${recent.beatmap_id}`;
        if(recent.pb)
            embed.description = `**__#${recent.pb} Top Play!__** 👀`;

		if(recent.strains_bar){
			embed.image = {
				url: 'attachment://strains_bar.png'
			};
		}

        let ranked_text = 'Last updated';
        let ranked_date = recent.approved_date;

        switch(recent.approved){
            case 'ranked':
                ranked_text = 'Ranked';
                break;
            case 'approved':
                ranked_text = 'Approved';
                break;
            case 'qualified':
                ranked_text = 'Qualified';
                break;
            case 'loved':
                ranked_text = 'Loved';
                break;
            default:
                ranked_date = recent.approved_date;
        }

        embed.footer = {
            icon_url: `https://a.ppy.sh/${recent.creator_id}?${+new Date()}`,
            text: `Mapped by ${recent.creator}${helper.sep}${ranked_text} on ${DateTime.fromISO(ranked_date).toFormat('dd MMMM yyyy')}`
        };
        embed.thumbnail = {
            url: `https://b.ppy.sh/thumb/${recent.beatmapset_id}l.jpg`
        };
        let lines = ['', '', '', ''];

        lines[0] += `${getRankEmoji(recent.rank)}`;

        if(recent.rank == 'F')
            lines[0] += ` @${Math.round(recent.fail_percent * 100)}%`;

        lines[0] += helper.sep;

        if(recent.mods.length > 0)
            lines[0] += `+${sanitizeMods(recent.mods).join(',')}${helper.sep}`;

        if(recent.lb > 0)
            lines[0] += `r#${recent.lb}${helper.sep}`;

        lines[0] += `${recent.score.toLocaleString()}${helper.sep}`;
        lines[0] += `${+recent.acc.toFixed(2)}%${helper.sep}`;
        lines[0] += `<t:${DateTime.fromISO(recent.date).toSeconds()}:R>`;

        if(recent.pp_fc > recent.pp)
            lines[1] += `**${recent.unsubmitted ? '*' : ''}${+recent.pp.toFixed(2)}pp**${recent.unsubmitted ? '*' : ''} ➔ ${+recent.pp_fc.toFixed(2)}pp for ${+recent.acc_fc.toFixed(2)}% FC${helper.sep}`;
        else
            lines[1] += `**${+recent.pp.toFixed(2)}pp**${helper.sep}`

        if(recent.combo < recent.max_combo)
            lines[1] += `${recent.combo}/${recent.max_combo}x`;
        else
            lines[1] += `${recent.max_combo}x`;

        if(recent.pp_fc > recent.pp)
            lines[1] += `\n`;
        else if(recent.ur || recent.count100 || recent.count50 || recent.countmiss)
            lines[1] += helper.sep;

        if(recent.count100 > 0)
            lines[1] += `${recent.count100}x100`;

        if(recent.count50 > 0){
            if(recent.count100 > 0) lines[1] += helper.sep;
            lines[1] += `${recent.count50}x50`;
        }

        if(recent.countmiss > 0){
            if(recent.count100 > 0 || recent.count50 > 0) lines[1] += helper.sep;
            lines[1] += `${recent.countmiss}xMiss`;
        }

        if(recent.countsb > 0){
            if(recent.count100 > 0 || recent.count50 > 0 || recent.countmiss > 0) lines[1] += helper.sep;
            lines[1] += `${recent.countsb}xSB`;
        }

        if(recent.ur > 0){
            if(recent.count100 > 0 || recent.count50 > 0 || recent.countmiss > 0) lines[1] += helper.sep;
            lines[1] += `${+recent.ur.toFixed(2)} UR`;
            if(recent.cvur)
                lines[1] += ` (${+recent.cvur.toFixed(2)}cv)`;
        }else if(recent.ur < 0){
            if(recent.count100 > 0 || recent.count50 > 0 || recent.countmiss > 0) lines[1] += helper.sep;
            lines[1] += `xx.xx UR`;
            if(recent.cvur < 0)
                lines[1] += ` (xx.xxcv)`;
        }

        lines[2] = 'Beatmap Information';

        lines[3] += `${Duration.fromMillis(recent.duration * 1000).toFormat('mm:ss')} ~ `;
        lines[3] += `CS**${+recent.cs.toFixed(1)}** AR**${+recent.ar.toFixed(1)}** OD**${+recent.od.toFixed(1)}** HP**${+recent.hp.toFixed(1)}** ~ `;

        lines[3] += `**${+recent.bpm.toFixed(1)}**`
        // if(recent.bpm_min != recent.bpm_max)
        //     lines[3] += `${+recent.bpm_min.toFixed(1)}-${+recent.bpm_max.toFixed(1)} (**`;
        // else
        //     lines[3] += '**';

        // lines[3] += +recent.bpm.toFixed(1);

        // if(recent.bpm_min != recent.bpm_max)
        //     lines[3] += '**)';
        // else
        //     lines[3] += '**';


        lines[3] += ' BPM ~ ';
        lines[3] += `**${+recent.stars.toFixed(2)}**★`;

        embed.fields.push(
            {
                name: lines[0],
                value: lines[1]
            },
            {
                name: lines[2],
                value: lines[3]
            }
        );

        return embed;

    },

    get_recent: async function(options, cb){
        helper.log(options);
        let limit = options.index;
        let pass = options.pass ? 0 : 1;
        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

        api.get(`/users/${user_id}/scores/recent`, { params: { limit: limit, include_fails: pass, mode: "osu" } }).then(response => {

            response = response.data;
            //console.log(response)
            if(response.length < 1){
                cb(`No recent ${options.pass ? 'passes' : 'plays'} found for ${options.user}. 🤡`);
                return;
            }

            let recent_raw;

            let recent = {};

            if(response.length < options.index)
                options.index = response.length;

            recent_raw = response[options.index - 1];

            getScore(recent_raw, cb);
        });
    },

    get_compare: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

        if(options.mods) {
            api.get(`/beatmaps/${options.beatmap_id}/scores/users/${user_id}`, { params: { mods: options.mods } }).then(response => {
                console.log(response);
                response = response.data;
    
                let recent_raw = response.score;
                recent_raw.beatmap = {};
                recent_raw.beatmap.id = options.beatmap_id;
    
                getScore(recent_raw, cb);
            })         
            .catch(err => {
                console.log(err);
                cb(`No scores matching criteria found. 💀`);
            });

        } else {
            api.get(`/beatmaps/${options.beatmap_id}/scores/users/${user_id}/all`, { params: { mode: "osu" } }).then(response => {
                response = response.data;
    
                if(response.scores.length < options.index)
                    optiins.index = response.scores.length - 1;
    
                let recent_raw = response.scores[options.index - 1];
                recent_raw.beatmap = {};
                recent_raw.beatmap.id = options.beatmap_id;
    
                getScore(recent_raw, cb);
            })
            .catch(err => {
                console.log(err);
                cb(`No scores matching criteria found. 💀`);
            });
        }



        let params = {
            b: options.beatmap_id,
        };

        if(options.user){
            params.u = options.user;
        }else{
            if(options.mods)
                params.mods = getModsEnum(options.mods);
        }

        apiv1.get('/get_scores', { params: params }).then(response => {
            response = response.data;

            let score;
            let filter = [];

            if(options.mods){
                let mods_enum = getModsEnum(options.mods);
                filter = response.filter(a => parseInt(a.enabled_mods) == mods_enum);

                if(options.mods[0] == 'mods'){
                    filter = [];

                    filter = getBestMods(response, options.mods);

                    if(filter.length == 0){
                        filter = response.filter(a => parseInt(a.enabled_mods) == mods_enum);
                        if(filter.length == 0)
                            score = response[0];
                        else
                            score = filter[0];
                    }else{
                        score = filter[0];
                    }
                }else{
                    score = filter[0];
                }
            }else{
                if(response.length > 0)
                    score = response[0];
            }

            if(!score){
                cb(`No scores matching criteria found. 💀`);
                return;
            }

            score.beatmap_id = options.beatmap_id;

            getScore(score, cb);
        });
    },

    get_score: async function(options, cb){
        let beatmap;
        try {
            beatmap = await api.get(`/beatmaps/lookup`, { params: { id: options.beatmap_id }})
        } catch (err) {
            cb("Couldn't find that beatmap. 😔")
            return
        }

        beatmap = beatmap.data

        if(options.solo_score) {
            if(options.mods) {
                let route = `/beatmaps/${options.beatmap_id}/solo-scores/?type=global&mode=osu`

                options.mods.forEach( mod => route += `&mods[]=${mod}`)

                api.get(route).then(response => {
                    response = response.data;

                    if(response.scores.length < options.index)
                    options.index = response.scores.length - 1;
    
                    let recent_raw = response.scores[options.index - 1];
                    recent_raw.beatmap = beatmap;
                    recent_raw.beatmapset = beatmap.beatmapset;
                    //recent_raw.beatmap.id = options.beatmap_id;
        
                    getScore(recent_raw, cb);
                })         
                .catch(err => {
                    console.log(err);
                    cb(`No scores matching criteria found. 💀`);
                });
    
            } else {
                api.get(`/beatmaps/${options.beatmap_id}/solo-scores/`, { params: { mode: "osu" } }).then(response => {
                    response = response.data;
        
                    if(response.scores.length < options.index)
                        options.index = response.scores.length - 1;
        
                    let recent_raw = response.scores[options.index - 1];
                    recent_raw.beatmap = beatmap;
                    recent_raw.beatmapset = beatmap.beatmapset;
                    //recent_raw.beatmap.id = options.beatmap_id;
        
                    getScore(recent_raw, cb);
                })
                .catch(err => {
                    console.log(err);
                    cb(`No scores matching criteria found. 💀`);
                });
            }
        } else if(options.user) {
            let { user_id, error } = await getUserId(options.user);
            if(error) { cb("Couldn't reach osu!api. 💀") }

            if(options.mods) {
                api.get(`/beatmaps/${options.beatmap_id}/scores/users/${user_id}`, { params: { mods: options.mods } }).then(response => {
                    console.log(response);
                    response = response.data;
        
                    let recent_raw = response.score;
                    recent_raw.beatmap = beatmap;
                    recent_raw.beatmapset = beatmap.beatmapset;
                    //recent_raw.beatmap.id = options.beatmap_id;
        
                    getScore(recent_raw, cb);
                })         
                .catch(err => {
                    console.log(err);
                    cb(`No scores matching criteria found. 💀`);
                });
    
            } else {
                api.get(`/beatmaps/${options.beatmap_id}/scores/users/${user_id}/all`, { params: { mode: "osu" } }).then(response => {
                    response = response.data;
        
                    if(response.scores.length < options.index)
                        options.index = response.scores.length - 1;
        
                    let recent_raw = response.scores[options.index - 1];
                    recent_raw.beatmap = beatmap;
                    recent_raw.beatmapset = beatmap.beatmapset;
                    //recent_raw.beatmap.id = options.beatmap_id;
        
                    getScore(recent_raw, cb);
                })
                .catch(err => {
                    console.log(err);
                    cb(`No scores matching criteria found. 💀`);
                });
            }
        } else {
            if(options.mods) {
                api.get(`/beatmaps/${options.beatmap_id}/scores`, { params: { mods: options.mods } }).then(response => {
                    response = response.data;
        
                    if(response.scores.length < options.index)
                        options.index = response.scores.length - 1;
        
                    let recent_raw = response.scores[options.index - 1];
                    recent_raw.beatmap = beatmap;
                    recent_raw.beatmapset = beatmap.beatmapset;
                    //recent_raw.beatmap.id = options.beatmap_id;
        
                    getScore(recent_raw, cb);
                })
                .catch(err => {
                    console.log(err);
                    cb(`No scores matching criteria found. 💀`);
                });
            } else {
                api.get(`/beatmaps/${options.beatmap_id}/scores`, { params: { mode: "osu" } }).then(response => {
                    response = response.data;
        
                    if(response.scores.length < options.index)
                        options.index = response.scores.length - 1;
        
                    let recent_raw = response.scores[options.index - 1];

                    recent_raw.beatmap = beatmap;
                    recent_raw.beatmapset = beatmap.beatmapset;
                    //recent_raw.beatmap.id = options.beatmap_id;
        
                    getScore(recent_raw, cb);
                })
                .catch(err => {
                    console.log(err);
                    cb(`No scores matching criteria found. 💀`);
                });
            }
        }
    },

	get_tops: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

		let requests = [
	        api.get(`/users/${user_id}/scores/best`, { params: { limit: options.count } }),
	        api.get(`/users/${user_id}/osu`)
        ];
        
        const results = await Promise.all(requests);

        let user_best = results[0].data;
        let user = results[1].data;

        if(user_best.length < 1){
            cb(`No top plays found for ${options.user}. 🤨`);
            return;
        }

        const tops = user_best.slice(0, options.count || 5);

        const { data } = await axios(`${config.beatmap_api}/b/${tops.map(a => a.beatmap.id).join(",")}`);

        for(const top of tops){
            const { beatmap, difficulty } = data.find(a => a.beatmap.beatmap_id == top.beatmap.id);

            top.accuracy = (top.accuracy * 100).toFixed(2);
            const mods = top.mods.map(mod => mod.acronym)
            if (mods.includes("NC")) mods.push("DT")

            const diff = difficulty[getModsEnum(mods.filter(mod => DIFF_MODS.includes(mod)))];

            top.stars = diff.total;

            const pp_fc = ojsama.ppv2({
                aim_stars: diff.aim,
                speed_stars: diff.speed,
                base_ar: beatmap.ar,
                base_od: beatmap.od,
                n300: Number(top.statistics.great ?? 0 + top.statistics.miss ?? 0),
                n100: Number(top.statistics.ok ?? 0),
                n50: Number(top.statistics.meh ?? 0),
                mods: Number(getModsEnum(top.mods.map(mod => mod.acronym))),
                ncircles: beatmap.num_circles,
                nsliders: beatmap.num_sliders,
                nobjects: beatmap.hit_objects,
                max_combo: beatmap.max_combo,
            });

            top.pp_fc = pp_fc.total;
            top.acc_fc = (pp_fc.computed_accuracy.value() * 100).toFixed(2);
            top.rank_emoji = getRankEmoji(top.rank);

            top.beatmap = beatmap;
        }

        cb(null, { user, tops });
	},

    get_pins: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

        let requests = [
	        api.get(`/users/${user_id}/scores/pinned`, { params: { limit: options.count } }),
	        api.get(`/users/${user_id}/osu`)
        ];
        
        const results = await Promise.all(requests);

        let pins = results[0].data;
        let user = results[1].data;

        if(pins.length < 1){
            cb(`No pins found for ${user.username}. 😔`);   
            return;
        }

        let { data } = await axios(`${config.beatmap_api}/b/${pins.map(a => a.beatmap.id).join(",")}`)
        
        if(Array.isArray(data) == false){
            data = [data]
        }

        for(const pin of pins){
            const { beatmap, difficulty } = data.find(a => a.beatmap.beatmap_id == pin.beatmap.id);

            pin.accuracy = (pin.accuracy * 100).toFixed(2);
            const mods = top.mods.map(mod => mod.acronym)
            if (mods.includes("NC")) mods.push("DT")

            const diff = difficulty[getModsEnum(mods.filter(mod => DIFF_MODS.includes(mod)))];

            pin.stars = diff.total;

            const pp_fc = ojsama.ppv2({
                aim_stars: diff.aim,
                speed_stars: diff.speed,
                base_ar: beatmap.ar,
                base_od: beatmap.od,
                n300: Number(pin.statistics.great ?? 0 + pin.statistics.miss ?? 0),
                n100: Number(pin.statistics.ok ?? 0),
                n50: Number(pin.statistics.meh ?? 0),
                mods: Number(getModsEnum(pin.mods.map(mod => mod.acronym))),
                ncircles: beatmap.num_circles,
                nsliders: beatmap.num_sliders,
                nobjects: beatmap.hit_objects,
                max_combo: beatmap.max_combo,
            });

            pin.pp_fc = pp_fc.total;
            pin.acc_fc = (pp_fc.computed_accuracy.value() * 100).toFixed(2);
            pin.rank_emoji = getRankEmoji(pin.rank);

            pin.beatmap = beatmap;
        }
        
        cb(null, { user, pins });
	},

    get_top: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

		let requests = [
	        api.get(`/users/${user_id}/scores/best`, { params: { limit: 100 } })
        ];
        
        const results = await Promise.all(requests);

        let user_best = results[0].data;

        if(user_best.length < 1){
            cb(`No top plays found for ${options.user}. 🤨`);
            return;
        }

        if(options.rb || options.ob){
            user_best.forEach((recent, index) => {
                user_best[index].unix = Math.floor(DateTime.fromISO(recent.ended_at).toSeconds());
            });
        }

        if(options.rb)
        user_best = user_best.sort((a, b) => b.unix - a.unix);

        if(options.ob)
        user_best = user_best.sort((a, b) => a.unix - b.unix);

        if(user_best.length < options.index)
            options.index = user_best.length;

        recent_raw = user_best[options.index - 1];

        getScore(recent_raw, cb);
},

    get_pp: function(options, cb){
        axios.get(`${config.beatmap_api}/b/${options.beatmap_id}`).then(response => {
            response = response.data;
            helper.log(response);

            let beatmap = response.beatmap;

            if(!options.mods)
                options.mods = [];

            let diff_settings = calculateCsArOdHp(beatmap.cs, beatmap.ar, beatmap.od, beatmap.hp, options.mods);

            let speed = 1;

            if(options.mods.includes('DT'))
                speed *= 1.5;
            else if(options.mods.includes('HT'))
                speed *= 0.75;

            let bpm = beatmap.bpm * speed;
            let bpm_min = beatmap.bpm_min * speed;
            let bpm_max = beatmap.bpm_max * speed;

            let diff = response.difficulty[getModsEnum(options.mods.filter(mod => DIFF_MODS.includes(mod)))];

            if(!diff.aim && !diff.speed){
                cb('No difficulty data for this map! Please try again later. 😭');
                return;
            }

            let pp_calc_obj = {
                aim_stars: diff.aim,
                speed_stars: diff.speed,
                base_ar: beatmap.ar,
                base_od: beatmap.od,
                mods: getModsEnum(options.mods),
                ncircles: beatmap.num_circles,
                nsliders: beatmap.num_sliders,
                nobjects: beatmap.hit_objects,
                max_combo: beatmap.max_combo,
            };

            let accuracies = [90, 95, 97, 98, 99, 99.5, 100];

            let custom_acc = 100;

            if(options.custom_acc)
                custom_acc = +options.custom_acc.toFixed(2);

            custom_acc = Math.max(0, Math.min(custom_acc, 100));

            if(!accuracies.includes(custom_acc))
                accuracies.push(custom_acc);
            accuracies = accuracies.sort((a, b) => a - b);

            let pps = [];

            accuracies.forEach(acc => {
                let pp = ojsama.ppv2(Object.assign(pp_calc_obj, {acc_percent: acc}));
                pps.push(Math.round(pp.total));
            });

            let embed = {};

            embed.color = 12277111;
            embed.title = `${beatmap.artist} – ${beatmap.title} [${beatmap.version}]`;
            embed.url = `https://osu.ppy.sh/b/${beatmap.beatmap_id}`;
            embed.description = options.mods.length > 0 ? '+' + options.mods.join('') : 'NOMOD';

            let lines = ['', '', 'Difficulty                Eyup Star Rating', ''];

            accuracies.forEach((acc, index) => {
                if(index > 0)
                    lines[0] += '  ';
                if(acc == custom_acc && options.custom_acc) lines[0] += '**';
                lines[0] += `${acc}%`;
                if(acc == custom_acc && options.custom_acc) lines[0] += '**';
            });

            pps.forEach((pp, index) => {
                if(index > 0){
                    if(pp < 1000)
                        lines[1] += '  ';
                    else
                        lines[1] += ' ';
                }
                if(options.custom_acc && accuracies.indexOf(custom_acc) == index)
                    lines[1] += '**';
                lines[1] += `${pp}pp`;
                if(options.custom_acc && accuracies.indexOf(custom_acc) == index)
                    lines[1] += '**';
            });

            lines[3] = `CS**${+diff_settings.cs.toFixed(1)}** AR**${+diff_settings.ar.toFixed(1)}** OD**${+diff_settings.od.toFixed(1)}** HP**${+diff_settings.hp.toFixed(1)}** - `;

            if(bpm_min != bpm_max)
                lines[3] += `${+bpm_min.toFixed(1)}-${+bpm_max.toFixed(1)} (**`;
            else
                lines[3] += '**';

            lines[3] += +bpm.toFixed(1);

            if(bpm_min != bpm_max)
                lines[3] += '**)';
            else
                lines[3] += '**';

            lines[3] += ' BPM ~ ';
            lines[3] += `**${+diff.total.toFixed(2)}**★`;

            lines[3] += `   **${beatmap.eyup_star_rating ? beatmap.eyup_star_rating.toFixed(2) + "**★": "Unavailable**"}`

            embed.fields = [
                {
                    name: lines[0],
                    value: lines[1]
                },
                {
                    name: lines[2],
                    value: lines[3]
                },
                {
                    name: 'Nomod SS     HDHRDTFL SS',
                    value: `${beatmap.max_score ? beatmap.max_score.toLocaleString() + " Score" : "Unavailable"}   ${beatmap.max_score_fullmod ? beatmap.max_score_fullmod.toLocaleString() + " Score" : "Unavailable"}`
                }
            ];

            cb(null, embed);
        }).catch(e => {
            cb('Map not in the database, maps that are too new don\'t work yet. 😐');
            helper.error(e);
            return false;
        });
    },

    parse_beatmap_url: function(beatmap_url, id_only){
		return new Promise((resolve, reject) => {
			if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
	            beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

	        let beatmap_id;

	        if(id_only === undefined)
				id_only = false;

	        if(beatmap_url.includes("#osu/"))
	            beatmap_id = parseInt(beatmap_url.split("#osu/").pop());
	        else if(beatmap_url.includes("/b/"))
	            beatmap_id = parseInt(beatmap_url.split("/b/").pop());
	        else if(beatmap_url.includes("/osu/"))
	            beatmap_id = parseInt(beatmap_url.split("/osu/").pop());
	        else if(beatmap_url.includes("/beatmaps/"))
	            beatmap_id = parseInt(beatmap_url.split("/beatmaps/").pop());
			else if(beatmap_url.includes("/discussion/"))
				beatmap_id = parseInt(beatmap_url.split("/discussion/").pop().split("/")[0]);
	        else if(parseInt(beatmap_url) == beatmap_url && _id_only)
	            beatmap_id = parseInt(beatmap_url);

			helper.downloadBeatmap(beatmap_id).finally(() => {
				resolve(beatmap_id);
			}).catch(helper.error);
		});
    },

	parse_beatmap_url_sync: function(beatmap_url, id_only){
		if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
            beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

        let beatmap_id;
        let _id_only = id_only;
        if(id_only === undefined) _id_only = false;

        if(beatmap_url.includes("#osu/"))
            beatmap_id = parseInt(beatmap_url.split("#osu/").pop());
        else if(beatmap_url.includes("/b/"))
            beatmap_id = parseInt(beatmap_url.split("/b/").pop());
        else if(beatmap_url.includes("/osu/"))
            beatmap_id = parseInt(beatmap_url.split("/osu/").pop());
        else if(beatmap_url.includes("/beatmaps/"))
            beatmap_id = parseInt(beatmap_url.split("/beatmaps/").pop());
        else if(parseInt(beatmap_url) == beatmap_url && _id_only)
            beatmap_id = parseInt(beatmap_url);

		return beatmap_id;
    },

    get_bpm_graph: async function(osu_file_path, mods_string = ""){
        try{
            let parser = new ojsama.parser().feed(await fs.readFile(osu_file_path, 'utf8'));

            let mods = ojsama.modbits.from_string(mods_string || "");
            let mods_array = getMods(mods);

            let speed_multiplier = 1;

            if(mods_array.includes("DT"))
                speed_multiplier *= 1.5;

            if(mods_array.includes("HT"))
                speed_multiplier *= 0.75;

            let map = parser.map;

            let mods_filtered = mods_array.filter(mod => TIME_MODS.includes(mod));

            if(mods_filtered.length > 0){
                map.version += ' +' + mods_filtered.join('');
            }

            const bpms = [];

            for(let t = 0; t < map.timing_points.length; t++){
                let timing_point = map.timing_points[t];
                if(!timing_point.change)
                    continue;

                let bpm = +(MINUTE / timing_point.ms_per_beat * speed_multiplier).toFixed(2);

                if(t == 0)
                    bpms.push({ t: 0, y: bpm });

                bpms.push({ t: timing_point.time, y: bpm });
            }

            if(bpms.length == 0)
                throw 'An error occured getting the Beatmap BPM values';

            bpms.push({ t: map.objects[map.objects.length - 1].time, y: bpms[bpms.length - 1]['y'] });

            const chartOptions = Object.assign({}, CHART_OPTIONS);

            chartOptions.title.text = [`${map.artist} - ${map.title}`, `Version: ${map.version}, Mapped by ${map.creator}`];
            chartOptions.scales.yAxes[0].ticks.precision = 0;

            const configuration = {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'BPM',
                        steppedLine: true,
                        lineTension: 0,
                        borderJoinStyle: 'round',
                        data: bpms
                    }]
                },
                options: chartOptions
            };

            const outputChart = await graphCanvas.renderToBuffer(configuration);

            const graphImage = new Jimp(600, 400, '#263238E6');
            const _graph = await Jimp.read(outputChart);
            graphImage.composite(_graph, 0, 0);

            const buffer = await graphImage.getBufferAsync('image/png');

            return buffer;
        }catch(e){
            helper.error(e);
            throw 'An error occured creating the graph';
        }
    },

    get_user: function(options, cb){
        api.get(`/users/${options.u}/osu`).then(async function (response) {
            response = response.data;

			if(response.length == 0){
				cb("Couldn't find user. 😔");
				return false;
			}

            let data = response;

            let sr;

            await axios.get(`https://score.respektive.pw/u/${data.id}`).then(function (response) {
                sr = response.data[0].rank;
            }).catch(err => {
                sr = 0;
                console.log(err);
            });
            let score_rank = ""; 
            if (sr > 0) {
                score_rank = ` (#${sr})`;
            }

            let grades = "";

            grades += `${getRankEmoji('XH')} ${Number(data.statistics.grade_counts.ssh).toLocaleString()} `;
            grades += `${getRankEmoji('X')} ${Number(data.statistics.grade_counts.ss).toLocaleString()} `;
            grades += `${getRankEmoji('SH')} ${Number(data.statistics.grade_counts.sh).toLocaleString()} `;
            grades += `${getRankEmoji('S')} ${Number(data.statistics.grade_counts.s).toLocaleString()} `;
            grades += `${getRankEmoji('A')} ${Number(data.statistics.grade_counts.a).toLocaleString()}`;

            let play_time = `${Math.floor(Number(data.statistics.play_time) / 3600)}h`;
            play_time += ` ${Math.floor(Number(data.statistics.play_time) % 3600 / 60)}m`;

            let embed = {
                color: 12277111,
                thumbnail: {
                    url: data.avatar_url
                },
                author: {
                    name: `${data.username} – ${+Number(data.statistics.pp).toFixed(2)}pp (#${Number(data.statistics.global_rank).toLocaleString()}) (${data.country_code}#${Number(data.statistics.country_rank).toLocaleString()})`,
                    icon_url: data.avatar_url,
                    url: `https://osu.ppy.sh/u/${data.id}`
                },
                footer: {
                    text: `Playing for ${DateTime.fromISO(data.join_date).toRelative().slice(0, -4)}${helper.sep}Joined on ${DateTime.fromISO(data.join_date).toFormat('dd MMMM yyyy')}`
                },
                fields: [
                    {
                        name: 'Ranked Score',
                        value: Number(data.statistics.ranked_score).toLocaleString() + score_rank,
                        inline: true
                    },
                    {
                        name: 'Total score',
                        value: Number(data.statistics.total_score).toLocaleString(),
                        inline: true
                    },
                    {
                        name: 'Play Count',
                        value: Number(data.statistics.play_count).toLocaleString(),
                        inline: true
                    },
                    {
                        name: 'Play Time',
                        value: play_time,
                        inline: true
                    },
                    {
                        name: 'Level',
                        value: (+Number(data.statistics.level.current + '.' + data.statistics.level.progress).toFixed(2)).toString(),
                        inline: true
                    },
                    {
                        name: 'Hit Accuracy',
                        value: `${Number(data.statistics.hit_accuracy).toFixed(2)}%`,
                        inline: true
                    }
                ]
            };

            if(options.extended){
                const hitCount = Number(data.statistics.total_hits);
                const s_count = (Number(data.statistics.grade_counts.sh) + Number(data.statistics.grade_counts.s)).toLocaleString();
                const ss_count = (Number(data.statistics.grade_counts.ssh) + Number(data.statistics.grade_counts.ss)).toLocaleString();

                embed.fields.push({
                    name: 'Combined Ranks',
                    value: `${getRankEmoji('X')} ${ss_count} ${getRankEmoji('S')} ${s_count}`,
                    inline: true
                },
                {
                    name: 'Hit Count',
                    value: hitCount.toLocaleString(),
                    inline: true
                },
                {
                    name: 'Hits per Play',
                    value: (hitCount / Number(data.statistics.play_count)).toFixed(1),
                    inline: true
                });
            }

            embed.fields.push(
                {
                    name: 'Grades',
                    value: grades,
                    inline: false
                }
            );

            retries = 0
            cb(null, embed);
        }).catch(err => {
			if(err.response.status == 404) {
                if(retries < 1) {
                    retries += 1
                    options.u = options.u.replace(/_/g, " ")
                    this.get_user(options, cb)
                    return
                }

				cb("Couldn't find user. 😔");
            }
			else
	            cb("Couldn't reach osu!api. 💀");

            helper.error(err);
            retries = 0
            return;
        });
    },

    calculate_strains: calculateStrains,

	get_strains_bar: async function(osu_file_path, mods_string, progress){
		let map_strains = await module.exports.get_strains(osu_file_path, mods_string);

		if(!map_strains)
			return false;

		let { strains, max_strain } = map_strains;
		let bar = createCanvas(399, 40);
		let ctx = bar.getContext('2d');

		ctx.fillStyle = 'transparent';
		ctx.fillRect(0, 0, 399, 40);

		let points = [];
		let strain_chunks = [];

		let max_chunks = 100;
        let chunk_size = Math.ceil(strains.length / max_chunks);

        for(let i = 0; i < strains.length; i += chunk_size){
            let _strains = strains.slice(i, i + chunk_size);
            strain_chunks.push(Math.max(..._strains));
        }

		strain_chunks.forEach((strain, index) => {
			let _strain = strain / max_strain;
			let x = (index + 1) / strain_chunks.length * 399;
			let y = Math.min(30, 5 + 35 - _strain * 35);
			points.push({x, y});
		});

		ctx.fillStyle = '#F06292';
		ctx.moveTo(0, 40);
		ctx.lineTo(0, 30);

		for(let i = 1; i < points.length - 2; i++){
	        var xc = (points[i].x + points[i + 1].x) / 2;
	        var yc = (points[i].y + points[i + 1].y) / 2;
	        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
	    }

		ctx.lineTo(399,30);
		ctx.lineTo(399,40);
		ctx.closePath();
		ctx.fill();

		ctx.clearRect(progress * 399, 0, 399 - progress * 399, 40);

		ctx.fillStyle = 'transparent';
		ctx.fillRect(progress * 399, 0, 399 - progress * 399, 40);

		ctx.fillStyle = 'rgba(244, 143, 177, 0.5)';
		ctx.moveTo(0, 40);
		ctx.lineTo(0, 30);

		for(let i = 1; i < points.length - 2; i++){
	        var xc = (points[i].x + points[i + 1].x) / 2;
	        var yc = (points[i].y + points[i + 1].y) / 2;
	        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
	    }

		ctx.lineTo(399,30);
		ctx.lineTo(399,40);
		ctx.closePath();
		ctx.fill();

		return bar.toBuffer();
	},

	get_preview_point: function(osu_file_path){
		return new Promise((resolve, reject) => {
			osuBeatmapParser.parseFile(osu_file_path, function(err, beatmap){
				if(err){
					helper.log(err);
					reject();
				}

				let previewTime = Number(beatmap.PreviewTime);

				if(previewTime < 0 || isNaN(previewTime))
					previewTime = 0.4 * Number(beatmap.totalTime) * 1000;

				resolve(previewTime);
			});
		});
	},

    get_strains: async function(osu_file_path, mods_string, type){
        let parser = new ojsama.parser().feed(await fs.readFile(osu_file_path, 'utf8'));
        let map = parser.map;

        let mods = ojsama.modbits.from_string(mods_string || "");
        let mods_array = getMods(mods);

        let mods_filtered = mods_array.filter(mod => DIFF_MODS.includes(mod));

        if(mods_filtered.length > 0){
            map.version += ' +' + mods_filtered.join('');
        }

        let speed_multiplier = 1;

        if(mods_array.includes("DT"))
            speed_multiplier *= 1.5;

        if(mods_array.includes("HT"))
            speed_multiplier *= 0.75;

        //let stars = new ojsama.diff().calc({map: map, mods: mods});
        //console.log(stars)
        let rosu_stars = rosu.calculate({path: osu_file_path, mods: mods})[0]
        //console.log(rosu_stars)
        let rosu_strains = rosu.strains(osu_file_path, mods)
        //console.log(rosu_strains)

        let total = rosu_stars.stars;

        if(type == 'aim')
            total = rosu_stars.aimStrain;

        if(type == 'flashlight')
            total = rosu_stars.flashlightRating;

        if(type == 'speed')
            total = rosu_stars.speedStrain;

        //let aim_strains = calculateStrains(1, stars.objects, speed_multiplier).map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR);
        //let speed_strains = calculateStrains(0, stars.objects, speed_multiplier).map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR);

        //let aim_strains = rosu_strains.aim.map((e, i) => e = Math.sqrt(calculateDifficultyValue(rosu_strains.aim.slice(i-2,i+2))) * STAR_SCALING_FACTOR)
        let aim_strains = rosu_strains.aim.map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR)
        let speed_strains = rosu_strains.speed.map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR)
        let flashligh_strains = rosu_strains.flashlight.map((e, i) => e = Math.sqrt(calculateFlashlightDifficultyValue(rosu_strains.flashlight.slice(i-1,i)))) //.map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR)
        
        //console.log(Math.sqrt(calculateDifficultyValue(rosu_strains.aim)) * STAR_SCALING_FACTOR)

        let star_strains = [];

        let max_strain = 0;

        //let _strain_step = STRAIN_STEP * speed_multiplier;

        //let strain_offset = Math.floor(map.objects[0].time / _strain_step) * _strain_step - _strain_step
        let strain_offset = rosu_strains.section_length
        //console.log(strain_offset)

        let max_strain_time = strain_offset;

        for(let i = 0; i < aim_strains.length; i++) {
            //star_strains.push(aim_strains[i] + speed_strains[i] + Math.abs(speed_strains[i] - aim_strains[i]) * EXTREME_SCALING_FACTOR);
            let baseAimPerformance = Math.pow(5 * Math.max(1, aim_strains[i] / 0.0675) - 4, 3) / 100000;
            let baseSpeedPerformance = Math.pow(5 * Math.max(1, speed_strains[i] / 0.0675) - 4, 3) / 100000;
            let baseFlashlightPerformance = 0.0;

            if (mods_array.includes("FL"))
                baseFlashlightPerformance = Math.pow(flashligh_strains[i], 2.0) * 25.0;

            let basePerformance = Math.pow(
                Math.pow(baseAimPerformance, 1.1) +
                Math.pow(baseSpeedPerformance, 1.1) +
                Math.pow(baseFlashlightPerformance, 1.1), 1.0 / 1.1
            );
            
            let starRating = basePerformance > 0.00001 ? Math.cbrt(1.12) * 0.027 * (Math.cbrt(100000 / Math.pow(2, 1 / 1.1) * basePerformance) + 4) : 0;
            
            star_strains.push(starRating)
        }


        let chosen_strains = star_strains;

        if(type == 'aim')
            chosen_strains = aim_strains;

        if(type == 'speed')
            chosen_strains = speed_strains;

        if(type == 'flashlight')
            chosen_strains = flashligh_strains;

        chosen_strains.forEach((strain, i) => {
            if(strain > max_strain){
                max_strain_time = i * STRAIN_STEP + strain_offset;
                max_strain = strain;
            }
        });

        return {
            strains: chosen_strains,
            max_strain: max_strain,
            max_strain_time: max_strain_time,
            max_strain_time_real: max_strain_time * speed_multiplier,
            total: total,
            mods_array: mods_array,
            map: map
        };
    },

    track_user: function(channel_id, user, top, cb){
        apiv1.get('/get_user', { params: { u: user } }).then(response => {
            response = response.data;

            if(response.length > 0){
                let user = response[0];
                if(user.user_id in tracked_users){
                    if(tracked_users[user.user_id].channels.includes(channel_id)){
                        cb(`${user.username} is already being tracked in this channel. 🤡`);
                    }else{
                        tracked_users[user.user_id].channels.push(channel_id);
                        tracked_users[user.user_id].top = top;

                        delete top_plays[user.user_id];

                        cb(null, `Now tracking ${user.username}'s top ${top} in this channel. 🤓`);
                    }
                }else{
                    tracked_users[user.user_id] = {
                        top: top,
                        channels: [channel_id]
                    };

                    cb(null, `Now tracking ${user.username}'s top ${top}. 🤓`);
                }

                helper.setItem('tracked_users', JSON.stringify(tracked_users));
                helper.setItem('top_plays', JSON.stringify(top_plays));
            }else{
                cb(`Couldn't find user \`${user}\`. 😔`);
            }
		}).catch(err => {
			if(err.status == 404)
				cb("Couldn't find user. 😔");
			else
				cb("Couldn't reach osu!api. 💀");

			helper.error(err);
			return false;
        });
    },

    untrack_user: function(channel_id, user, cb){
        apiv1.get('/get_user', { params: { u: user } }).then(response => {
            response = response.data;

            if(response.length > 0){
                let user = response[0];
                if(user.user_id in tracked_users){
                    if(tracked_users[user.user_id].channels.includes(channel_id)){
                        tracked_users[user.user_id].channels
                        = tracked_users[user.user_id].channels.filter(a => a != channel_id);

                        if(tracked_users[user.user_id].channels.length > 0){
                            cb(null, `Stopped tracking ${user.username} in this channel. 😔`);
                        }else{
                            cb(null, `Stopped tracking ${user.username}. 😔`);

                            delete tracked_users[user.user_id];
                            delete top_plays[user.user_id];
                        }

                        helper.setItem('tracked_users', JSON.stringify(tracked_users));
                        helper.setItem('top_plays', JSON.stringify(top_plays));
                    }else{
                        cb(`${user.username} is not being tracked in this channel. 🤡`);
                    }
                }else{
                    cb(`${user.username} is not being tracked. 🤡`);
                }
            }else{
                cb(`Couldn't find \`${user}\`. 😔`);
            }
        }).catch(err => {
			if(err.status == 404)
				cb("Couldn't find user. 😔");
			else
				cb("Couldn't reach osu!api. 💀");

			helper.error(err);
			return false;
        });
    },

    get_strains_graph: async function(osu_file_path, mods_string = "", cs, ar, type){
        try{
            let strains = await module.exports.get_strains(osu_file_path, mods_string, type);
            let { map, mods_array, max_strain_time_real } = strains;

            let chosen_strains = strains.strains;

            let max_chunks = 70;
            let chunk_size = Math.ceil(chosen_strains.length / max_chunks);

            const stars = [];

            for(let i = 0; i < chosen_strains.length; i += chunk_size){
                let _strains = chosen_strains.slice(i, i + chunk_size);

                stars.push({ t: i * STRAIN_STEP, y: Math.max(..._strains) });
            }

            const chartOptions = Object.assign({}, CHART_OPTIONS);

            chartOptions.title.text = [`${map.artist} - ${map.title}`, `Version: ${map.version}, Mapped by ${map.creator}`];
            chartOptions.scales.yAxes[0].ticks.suggestedMax = Math.ceil(Math.max(...stars.map(a => a['y'])));
            chartOptions.scales.yAxes[0].ticks.beginAtZero = true;

            const configuration = {
                type: 'line',
                data: {
                    datasets: [{
                        label: 'Stars',
                        data: stars
                    }, { // draws horizontal line for total star rating
                        data: [{ t: 0, y: strains.total}, { t: stars[stars.length - 1]['t'], y: strains.total }],
                        fill: false,
                        radius: 0,
                        borderColor: 'rgba(255,255,255,0.4)'
                    }]
                },
                options: chartOptions
            };

            const outputChart = await graphCanvas.renderToBuffer(configuration);

            const output_frame = await getFrame(osu_file_path, max_strain_time_real - map.objects[0].time % 400, mods_array, [427, 320], {ar: ar, cs: cs})
            
            const graphImage = new Jimp(600, 400, '#263238E6');
            
            const _graph = await Jimp.read(outputChart);
            const _frame = await Jimp.read(output_frame);
            _graph.composite(_frame, 90, 55, { opacitySource: 0.6 });

            graphImage.composite(_graph, 0, 0);

            const buffer = await graphImage.getBufferAsync('image/png');

            return buffer;
        }catch(e){
            helper.error(e);
            throw "Failed processing strains graph";
        }
    }
};
