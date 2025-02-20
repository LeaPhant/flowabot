const axios = require('axios');
const ojsama = require('ojsama');
const rosu = require("rosu-pp-js");
const bparser = require("bparser-js");

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

const DIFF_MODS = ["HR","EZ","DT","HT","FL","HD","TD"];

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

// https://github.com/Francesco149/ojsama/blob/603578e7db3f5cc0325a4fcb73f1050aca20086e/ojsama.js#L1433
function hitsFromAcc(acc, nobjects, nmiss = 0) {
    let n300=0, n100=0, n50=0
    const max300 = nobjects - nmiss
    n100 = Math.round(
        -3.0 * ((acc * 0.01 - 1.0) * nobjects + nmiss) * 0.5
    )
    
    if (n100 > max300) {
        // acc lower than all 100s, use 50s
        n100 = 0;
        n50 = Math.round(
            -6.0 * ((acc * 0.01 - 1.0) * nobjects + nmiss) * 0.5
        );
        n50 = Math.min(max300, n50);
    }

    n300 = nobjects - n100 - n50 - nmiss;

    return {
        count300: n300,
        count100: n100,
        count50: n50,
        countmiss: nmiss
    }
}

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
        speed_change = mods_raw.filter(mod => mod.acronym == "DT" || mod.acronym == "HT" || mod.acronym == "NC" || mod.acronym == "DC")[0].settings?.speed_change ?? undefined;
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
        speed *= mods_enabled.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings?.speed_change ?? 1.5;
    } else if (mods.includes("HT") || mods.includes("DC")) {
        speed *= mods_enabled.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings?.speed_change ?? 0.75;
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

function getMaxCombo(score) {
    const great = score?.maximum_statistics?.great ?? 0
    const large_tick_hit = score?.maximum_statistics?.large_tick_hit ?? 0
    // TODO: check if legacy_combo_increase is still used even
    const legacy_combo_increase = score?.maximum_statistics?.legacy_combo_increase ?? 0
    const ignore_hit = score?.maximum_statistics?.ignore_hit ?? 0
    return Number(great + large_tick_hit + legacy_combo_increase + ignore_hit)
}

function convertStandardisedToClassic(score, object_count) {
    return Math.round((Math.pow(object_count, 2) * 32.57 + 100000) * score / 1000000);
}

function getModSettingsString(mods) {
	const appraochDifferentStyles = ["Linear", "Gravity", "InOut1", "InOut2", "Accelerate1", "Accelerate2", "Accelerate3", "Decelerate1", "Decelerate2", "Decelerate3"];
	let string = "";

	for (const mod of mods) {
		switch (mod.acronym) {
			case "EZ":
				if (!mod.settings)
					break;
				string += `**EZ** ~ Extra Lives: \`${mod.settings.retries}\`\n`;
				break;
            case "HT":
            case "DT":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("adjust_pitch"))
                    string += `**${mod.acronym}** ~ Adjust pitch: \`${mod.settings.adjust_pitch}\`\n`;
                break;
            case "SD":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("fail_on_slider_tail"))
                    string += `**${mod.acronym}** ~ Fail when missing a slider tail: \`${mod.settings.fail_on_slider_tail}\`\n`;
                if (mod.settings.hasOwnProperty("restart"))
                    string += `**${mod.acronym}** ~ Restart on fail: \`${mod.settings.restart}\`\n`;
                break;
            case "PF":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("restart"))
                    string += `**${mod.acronym}** ~ Restart on fail: \`${mod.settings.restart}\`\n`;
                break;
			case "HD":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("only_fade_approach_circles"))
					string += `**HD** ~ Only fade approach circles: \`${mod.settings.only_fade_approach_circles}\`\n`;
				break;
			case "FL":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("follow_delay"))
					string += `**FL** ~ Follow delay: \`${mod.settings.follow_delay}\`\n`;
				if (mod.settings.hasOwnProperty("size_multiplier"))
					string += `**FL** ~ Flashlight size: \`${mod.settings.size_multiplier}\`\n`;
				if (mod.settings.hasOwnProperty("combo_based_size"))
					string += `**FL** ~ Change size based on combo: \`${mod.settings.combo_based_size}\`\n`;
				break;
			case "AC":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("minimum_accuracy"))
					string += `**AC** ~ Minimum accuracy: \`${mod.settings.minimum_accuracy}\`\n`;
                if (mod.settings.hasOwnProperty("accuracy_judge_mode"))
                    string += `**AC** ~ Accuracy mode: \`${mod.settings.accuracy_judge_mode}\`\n`;
                if (mod.settings.hasOwnProperty("restart"))
                    string += `**AC** ~ Restart on fail: \`${mod.settings.restart}\`\n`;
				break;
            case "TP":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("seed"))
                    string += `**TP** ~ Seed: \`${mod.settings.seed}\`\n`;
                if (mod.settings.hasOwnProperty("metronome"))
                    string += `**TP** ~ Metronome ticks: \`${mod.settings.metronome}\`\n`;
                break;
			case "CL":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("no_slider_head_accuracy"))
					string += `**CL** ~ No slider head accuracy: \`${mod.settings.no_slider_head_accuracy}\`\n`;
				if (mod.settings.hasOwnProperty("classic_note_lock"))
					string += `**CL** ~ Apply Classic note lock: \`${mod.settings.classic_note_lock}\`\n`;
                if (mod.settings.hasOwnProperty("always_play_tail_sample"))
                    string += `**CL** ~ Always play a slider's tail sample: \`${mod.settings.always_play_tail_sample}\`\n`;
                if (mod.settings.hasOwnProperty("fade_hit_circle_early"))
                    string += `**CL** ~ Fade out hit circsles earlier: \`${mod.settings.fade_hit_circle_early}\`\n`;
				if (mod.settings.hasOwnProperty("classic_health"))
					string += `**CL** ~ Classic health: \`${mod.settings.classic_health}\`\n`;
				break;
            case "RD":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("seed"))
                    string += `**RD** ~ Seed: \`${mod.settings.seed}\`\n`;
                if (mod.settings.hasOwnProperty("angle_sharpness"))
                    string += `**RD** ~ Angle sharpness: \`${mod.settings.angle_sharpness}\`\n`;
                break;
            case "MR":
                if (!mod.settings)
                    string += `**MR** ~ Axis: \`horizontal\`\n`;
                else if (mod.settings.hasOwnProperty("reflection") && mod.settings.reflection == 1)
                    string += `**MR** ~ Axis: \`vertical\`\n`;
                else if (mod.settings.hasOwnProperty("reflection") && mod.settings.reflection == 2)
                    string += `**MR** ~ Axis: \`both\`\n`;
                break;
            case "WG":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("strength"))
                    string += `**WG** ~ Strength: \`${mod.settings.strength}\`\n`;
                break;
            case "GR":
            case "DF":
                if (!mod.settings)
                    break;
                if (mod.settings.hasOwnProperty("start_scale"))
                    string += `**${mod.acronym}** ~ Starting Size: \`${mod.settings.start_scale}\`\n`;
                break;
			case "WU":
            case "WD":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("initial_rate"))
					string += `**${mod.acronym}** ~ Initial rate: \`${mod.settings.initial_rate}\`\n`;
				if (mod.settings.hasOwnProperty("final_rate"))
					string += `**${mod.acronym}** ~ Final rate: \`${mod.settings.final_rate}\`\n`;
				break;
			case "BR":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("spin_speed"))
					string += `**BR** ~ Roll speed: \`${mod.settings.spin_speed}\`\n`;
				if (mod.settings.hasOwnProperty("direction"))
					string += `**BR** ~ Direction: \`${mod.settings.direction}\`\n`;
				break;
			case "AD":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("scale"))
					string += `**AD** ~ Initial size: \`${mod.settings.scale}\`\n`;
				if (mod.settings.hasOwnProperty("style"))
					string += `**AD** ~ Style: \`${appraochDifferentStyles[mod.settings.style]}\`\n`;
				break;
			case "MU":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("inverse_muting"))
					string += `**MU** ~ Start muted: \`${mod.settings.inverse_muting}\`\n`;
				if (mod.settings.hasOwnProperty("enable_metronome"))
					string += `**MU** ~ Metronome: \`${mod.settings.enable_metronome}\`\n`;
				if (mod.settings.hasOwnProperty("mute_combo_count"))
					string += `**MU** ~ Final volume at combo: \`${mod.settings.mute_combo_count}\`\n`;
				if (mod.settings.hasOwnProperty("affects_hit_sounds"))
					string += `**MU** ~ Mute hit sounds: \`${mod.settings.affects_hit_sounds}\`\n`;
				break;
			case "NS":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("hidden_combo_count"))
					string += `**NS** ~ Hidden at combo: \`${mod.settings.hidden_combo_count}\`\n`;
				break;
			case "MG":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("attraction_strength"))
					string += `**MG** ~ Attraction strength: \`${mod.settings.attraction_strength}\`\n`;
				break;
			case "RP":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("repulsion_strength"))
					string += `**RP** ~ Repulsion strength: \`${mod.settings.repulsion_strength}\`\n`;
				break;
			case "AS":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("initial_rate"))
					string += `**AS** ~ Initial rate: \`${mod.settings.initial_rate}\`\n`;
				break;
			case "DP":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("max_depth"))
					string += `**DP** ~ Maximum depth: \`${mod.settings.max_depth}\`\n`;
				if (mod.settings.hasOwnProperty("show_approach_circles"))
					string += `**DP** ~ Show Approach Circles: \`${mod.settings.show_approach_circles}\`\n`;
				break;
			case "BM":
				if (!mod.settings)
					break;
				if (mod.settings.hasOwnProperty("max_size_combo_count"))
					string += `**BM** ~ Maximum size at combo: \`${mod.settings.max_size_combo_count}\`\n`;
				if (mod.settings.hasOwnProperty("max_cursor_size"))
					string += `**BM** ~ Final size multiplier: \`${mod.settings.max_cursor_size}\`\n`;
				break;
		}
	}

	return string;
}

async function getScore(recent_raw, cb){
    let recent = {};
    let best_score;

    recent = Object.assign({
        score_id: recent_raw.id,
        replay: recent_raw.has_replay,
        user_id: recent_raw.user_id,
        beatmap_id: recent_raw.beatmap.id,
        rank: recent_raw.passed ? recent_raw.rank: "F",
        passed: recent_raw.passed,
        score: Number(recent_raw.total_score),
        legacy_score: Number(recent_raw.legacy_total_score),
        combo: Number(recent_raw.max_combo),
        max_combo: getMaxCombo(recent_raw),
        legacy_perfect: recent_raw.legacy_perfect,
        count300: Number(recent_raw.statistics.great ?? 0),
        count100: Number(recent_raw.statistics.ok ?? 0),
        count50: Number(recent_raw.statistics.meh ?? 0),
        countmiss: Number(recent_raw.statistics.miss ?? 0),
        mods: recent_raw.mods,
        date: recent_raw.ended_at,
        unsubmitted: false,
        thumbnail_url: recent_raw.beatmapset.covers["list@2x"]
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
        const response = await api.get(`/beatmaps/${recent_raw.beatmap.id}/scores/users/${recent_raw.user_id}`)
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

        // if(best_score){
        //     if(compareScores(best_score, recent_raw)){
        //         replay = Number(best_score.replay ? 1 : 0);
		// 		recent.score_id = best_score.id;
        //     }else{
        //         recent.unsubmitted = true;
		// 	}
        // }

        let beatmap = recent_raw.beatmap;
        //let beatmapset = recent_raw.beatmapset;

        if(recent.mods.map(x => x.acronym).includes('DA')) {
            recent.mods.forEach( mod => {
                if(mod.acronym == "DA" && Object.entries(mod.settings ?? {}).length > 0){ 
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
            speed *= recent.mods.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings?.speed_change ?? 1.5;
        } else if (recent.mods.map(x => x.acronym).includes("HT") || recent.mods.map(x => x.acronym).includes("DC")) {
            speed *= recent.mods.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings?.speed_change ?? 0.75;
        }

        let fail_percent = 1;

        if(!recent_raw.passed)
        fail_percent = (recent.count300 + recent.count100 + recent.count50 + recent.countmiss) / (beatmap.count_spinners + beatmap.count_sliders + beatmap.count_circles);

        helper.downloadBeatmap(recent_raw.beatmap.id).finally(async () => {
            let beatmap_path = path.resolve(config.osu_cache_path, `${recent_raw.beatmap.id}.osu`);
			const beatmap_content = await fs.readFile(beatmap_path, 'utf8');

            const set_on_lazer = recent_raw.build_id ? true : false;

            const play_params = {
                lazer: set_on_lazer,
                mods: recent_raw.mods,
                n300: recent_raw.statistics.great ?? 0,
                n100: recent_raw.statistics.ok ?? 0,
                n50: recent_raw.statistics.meh ?? 0,
                misses: recent_raw.statistics.miss ?? 0,
                combo: recent_raw.max_combo,
                clockRate: speed,
            }

			if (recent_raw.statistics.large_tick_hit)
				play_params.largeTickHits = recent_raw.statistics.large_tick_hit;

			if (recent_raw.statistics.slider_tail_hit)
				play_params.sliderEndHits = recent_raw.statistics.slider_tail_hit;

            const fc_play_params = {
                lazer: set_on_lazer,
                mods: recent_raw.mods,
                clockRate: speed,
                n300: (recent_raw.statistics.great ?? 0) + (recent_raw.statistics.miss ?? 0),
                n100: recent_raw.statistics.ok ?? 0,
                n50: recent_raw.statistics.meh ?? 0,
            }


            const rosu_map = new rosu.Beatmap(beatmap_content)
			const play = new rosu.Performance(play_params).calculate(rosu_map);
			const fc_play = new rosu.Performance(fc_play_params).calculate(rosu_map);

			rosu_map.free();

            recent = Object.assign({
                approved: beatmapset.status,
                beatmapset_id: beatmapset.id,
                artist: beatmapset.artist,
                title: beatmapset.title,
                version: beatmap.version,
                bpm_min: beatmap.bpm_min * speed,
                bpm_max: beatmap.bpm_max * speed,
                legacy_max_combo: play.difficulty.maxCombo,
                bpm: beatmap.bpm * speed,
                creator: beatmapset.creator,
                creator_id: beatmapset.user_id,
                approved_date: beatmapset.ranked_date,
                cs: diff_settings.cs,
                ar: play.difficulty.ar,
                od: play.difficulty.od,
                hp: diff_settings.hp,
                duration: beatmap.total_length,
                fail_percent: fail_percent
            }, recent);

            recent = Object.assign({
                stars: play.difficulty.stars,
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
                strains_bar = await module.exports.get_strains_bar(beatmap_path, recent.mods.map(mod => mod.acronym).join(''), recent.fail_percent, (recent.beatmapset_id == 481703 ? '#31858d' : undefined));

                if(strains_bar)
                    recent.strains_bar = true;
            }

            if(recent.replay && await helper.fileExists(beatmap_path)){
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

async function updateTrackedUsers(){
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

        await new Promise(r => setTimeout(r, 1000));
    }

    // every 5 min
	setTimeout(updateTrackedUsers, 300 * 1000);
}

async function getAccessToken(){

    const token_url = "https://osu.ppy.sh/oauth/token";

    let headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
    };

    let body = {
        "client_id": config.credentials.client_id,
        "client_secret": config.credentials.client_secret,
        "grant_type": "client_credentials",
        "scope": "public"  
    }

    const token_response = await axios(token_url, {
        method: "POST",
        headers,
        data: body,
    })

    const token_res = await token_response.data;
    const token = token_res.access_token;
    const expires = token_res.expires_in - 1;

    access_token = token;

	api = axios.create({
        baseURL: 'https://osu.ppy.sh/api/v2',
        headers: {
            Authorization: `Bearer ${access_token}`,
            "x-api-version": 20240124
        }
    });

    setTimeout(getAccessToken, expires * 1000);

}

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
    init: async function(client, client_id, client_secret, _last_beatmap){
		discord_client = client;
		last_beatmap = _last_beatmap;

		if(client_id && client_secret){
            await getAccessToken();
            updateTrackedUsers();
		}
    },

    sanitize_mods: function(mods) {
        return sanitizeMods(mods)
    },

    get_user_id: async function (username) {
        return await getUserId(username)
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
                let current_pp = parseFloat(value.pp || 0);
                let current_factor = Math.pow(0.95, index);
                let current_pp_weighted = current_pp * current_factor;

                pp += current_pp_weighted;
            });

            if(max == 100){
                let differences_array = [];
                json.forEach(function(value, index){
                    if(index >= 90){
                        differences_array.push(parseFloat(json[index-1].pp || 0) - parseFloat(json[index].pp || 0));
                    }
                });

                let sum = 0;
                differences_array.forEach(function(value, index){
                    sum += value;
                });

                let avg = sum / differences_array.length;
                let current_pp = parseFloat(json[99].pp || 0);

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
                    let current_pp = parseFloat(value.pp || 0);
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
		if (recent.beatmapset_id == 481703) embed.color = 0x31858d;
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
            url: recent.thumbnail_url
        };
        let lines = ['', '', '', ''];

        lines[0] += `${getRankEmoji(recent.rank)}`;

        if(!recent.passed)
            lines[0] += ` @${Math.round(recent.fail_percent * 100)}%`;

        lines[0] += helper.sep;

        if(recent.mods.length > 0)
            lines[0] += `+${sanitizeMods(recent.mods).map(m => m === "DA" ? "__DA__" : m).join(',')}${helper.sep}`;

        if(recent.lb > 0)
            lines[0] += `#${recent.lb}`;
        if(recent.mods.length > 0 || recent.lb > 0)
            lines[0] += "\n"

        if(recent.legacy_score > 0) {
            let score_string =`${recent.legacy_score.toLocaleString()} (${recent.score.toLocaleString()})`
            lines[0] += `${score_string}${helper.sep}`;
        } else {
            let object_count = recent.count300 + recent.count100 + recent.count50 + recent.countmiss;
            let score_string = `${convertStandardisedToClassic(recent.score, object_count).toLocaleString()} (${recent.score.toLocaleString()})`;
            lines[0] += `${score_string}${helper.sep}`;
        }

        lines[0] += `${+recent.acc.toFixed(2)}%\n`;
        lines[0] += `<t:${DateTime.fromISO(recent.date).toSeconds()}:R>`;

        if(recent.pp_fc.toFixed(2) != recent.pp.toFixed(2))
            lines[1] += `**${recent.unsubmitted ? '*' : ''}${+recent.pp.toFixed(2)}pp**${recent.unsubmitted ? '*' : ''} ➔ ${+recent.pp_fc.toFixed(2)}pp for ${+recent.acc_fc.toFixed(2)}% FC\n`;
        else
            lines[1] += `**${+recent.pp.toFixed(2)}pp**\n`

        if(recent.legacy_perfect)
            lines[1] += `${recent.combo}x`;
        else if(recent.max_combo == 0)
            lines[1] += `${recent.combo}/${recent.legacy_max_combo}x`;
        else if(recent.combo < recent.max_combo)
            lines[1] += `${recent.combo}/${recent.max_combo}x`;
        else
            lines[1] += `${recent.combo}x`;

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

        let b_info = {
            cs: +recent.cs.toFixed(2),
            ar: +recent.ar.toFixed(2),
            od: +recent.od.toFixed(2),
            hp: +recent.hp.toFixed(2)
        };

        if (recent.mods.map(m => m.acronym).includes("DA")) {
            recent.mods.forEach(mod => {
                if (mod.acronym === "DA" && "settings" in mod) {
                    b_info.cs = `${"circle_size" in mod.settings ? "__" + +recent.cs.toFixed(2) +"__" : +recent.cs.toFixed(2)}`;
                    b_info.ar = `${"approach_rate" in mod.settings ? "__" + +recent.ar.toFixed(2) +"__" : +recent.ar.toFixed(2)}`;
                    b_info.od = `${"overall_difficulty" in mod.settings ? "__" + +recent.od.toFixed(2) +"__" : +recent.od.toFixed(2)}`;
                    b_info.hp = `${"drain_rate" in mod.settings ? "__" + +recent.hp.toFixed(2) +"__" : +recent.hp.toFixed(2)}`;
                }
            })
        }

        lines[3] += `${Duration.fromMillis(recent.duration * 1000).toFormat('mm:ss')} ~ `;
        lines[3] += `CS**${b_info.cs}** AR**${b_info.ar}** OD**${b_info.od}** HP**${b_info.hp}** ~ `;

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

		let mod_settings_value = getModSettingsString(recent.mods);

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

		if (mod_settings_value.length > 0) {
			embed.fields.push({
				name: "Mod Settings",
				value: mod_settings_value
			});
		}

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

	get_beatmap: async function(beatmap_id) {
		try {
			return await api.get(`/beatmaps/lookup`, { params: { id: beatmap_id }})
		} catch (err) {
			throw "Couldn't find that beatmap. 😔";
		}
	},

    get_score: async function(options, cb){
        let beatmap;

		if (options.score_id) {
			const { data: score } = await api.get(`/scores/${options.score_id}`, { params: { mode: "osu" } });

			getScore(score, cb);
        } else {
			try {
				beatmap = await module.exports.get_beatmap(options.beatmap_id);
			} catch(err) {
				cb(err);
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
						//console.log(response);
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
		}
    },

	get_tops: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

		let requests = [
	        api.get(`/users/${user_id}/scores/best`, { params: { limit: options.count, mode: "osu" } }),
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

        for(const top of tops){

            top.accuracy = (top.accuracy * 100).toFixed(2);

            let speed = 1;

            if (top.mods.map(x => x.acronym).includes("DT") || top.mods.map(x => x.acronym).includes("NC")) {
                speed *= top.mods.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings?.speed_change ?? 1.5;
            } else if (top.mods.map(x => x.acronym).includes("HT") || top.mods.map(x => x.acronym).includes("DC")) {
                speed *= top.mods.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings?.speed_change ?? 0.75;
            }

            await helper.downloadBeatmap(top.beatmap.id)
            const beatmap_path = path.resolve(config.osu_cache_path, `${top.beatmap.id}.osu`);
			const beatmap_content = await fs.readFile(beatmap_path, 'utf8');

            const play_params = {
                mods: top.mods,
                n300: Number(top.statistics.great ?? 0 + top.statistics.miss ?? 0),
                n100: Number(top.statistics.ok ?? 0),
                n50: Number(top.statistics.meh ?? 0),
                clockRate: speed,
            }

            const rosu_map = new rosu.Beatmap(beatmap_content);
			const pp_fc = new rosu.Performance(play_params).calculate(rosu_map);

			rosu_map.free();

            top.stars = pp_fc.difficulty.stars;
            top.pp_fc = pp_fc.pp;
            top.acc_fc = calculateAccuracy({great: play_params.n300, ok: play_params.n100, meh: play_params.n50}).toFixed(2);
            top.rank_emoji = getRankEmoji(top.rank);
        }

        cb(null, { user, tops });
	},

    get_pins: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

        let requests = [
	        api.get(`/users/${user_id}/scores/pinned`, { params: { limit: options.count, mode: "osu" } }),
	        api.get(`/users/${user_id}/osu`)
        ];
        
        const results = await Promise.all(requests);

        let pins = results[0].data;
        let user = results[1].data;

        if(pins.length < 1){
            cb(`No pins found for ${user.username}. 😔`);   
            return;
        }

        for(const pin of pins){

            pin.accuracy = (pin.accuracy * 100).toFixed(2);

            let speed = 1;

            if (pin.mods.map(x => x.acronym).includes("DT") || pin.mods.map(x => x.acronym).includes("NC")) {
                speed *= pin.mods.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings?.speed_change ?? 1.5;
            } else if (pin.mods.map(x => x.acronym).includes("HT") || pin.mods.map(x => x.acronym).includes("DC")) {
                speed *= pin.mods.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings?.speed_change ?? 0.75;
            }

            await helper.downloadBeatmap(pin.beatmap.id)
            const beatmap_path = path.resolve(config.osu_cache_path, `${pin.beatmap.id}.osu`);
			const beatmap_content = await fs.readFile(beatmap_path, 'utf8');

            const play_params = {
                mods: pin.mods,
                n300: Number(pin.statistics.great ?? 0 + pin.statistics.miss ?? 0),
                n100: Number(pin.statistics.ok ?? 0),
                n50: Number(pin.statistics.meh ?? 0),
                clockRate: speed,
            }

            const rosu_map = new rosu.Beatmap(beatmap_content);
			const pp_fc = new rosu.Performance(play_params).calculate(rosu_map);

			rosu_map.free();

            pin.stars = pp_fc.difficulty.stars;
            pin.pp_fc = pp_fc.pp;
            pin.acc_fc = calculateAccuracy({great: play_params.n300, ok: play_params.n100, meh: play_params.n50}).toFixed(2);
            pin.rank_emoji = getRankEmoji(pin.rank);

        }
        
        cb(null, { user, pins });
	},

    get_firsts: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

        let requests = [
	        api.get(`/users/${user_id}/scores/firsts`, { params: { limit: options.count, mode: "osu" } }),
	        api.get(`/users/${user_id}/osu`)
        ];
        
        const results = await Promise.all(requests);

        let firsts = results[0].data;
        let user = results[1].data;

        if(firsts.length < 1){
            cb(`No firsts found for ${user.username}. 😔`);   
            return;
        }

        for(const first of firsts){

            first.accuracy = (first.accuracy * 100).toFixed(2);

            let speed = 1;

            if (first.mods.map(x => x.acronym).includes("DT") || first.mods.map(x => x.acronym).includes("NC")) {
                speed *= first.mods.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings?.speed_change ?? 1.5;
            } else if (first.mods.map(x => x.acronym).includes("HT") || first.mods.map(x => x.acronym).includes("DC")) {
                speed *= first.mods.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings?.speed_change ?? 0.75;
            }

            await helper.downloadBeatmap(first.beatmap.id)
            const beatmap_path = path.resolve(config.osu_cache_path, `${first.beatmap.id}.osu`);
			const beatmap_content = await fs.readFile(beatmap_path, 'utf8');

            const play_params = {
                mods: first.mods,
                n300: Number(first.statistics.great ?? 0 + first.statistics.miss ?? 0),
                n100: Number(first.statistics.ok ?? 0),
                n50: Number(first.statistics.meh ?? 0),
                clockRate: speed,
            }

            const rosu_map = new rosu.Beatmap(beatmap_content);
			const pp_fc = new rosu.Performance(play_params).calculate(rosu_map);

			rosu_map.free();

            first.stars = pp_fc.difficulty.stars;
            first.pp_fc = pp_fc.pp;
            first.acc_fc = calculateAccuracy({great: play_params.n300, ok: play_params.n100, meh: play_params.n50}).toFixed(2);
            first.rank_emoji = getRankEmoji(first.rank);
        }
        
        cb(null, { user, firsts });
	},

    get_top: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

		let requests = [
	        api.get(`/users/${user_id}/scores/best`, { params: { limit: 100, mode: "osu" } })
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

    get_pp: async function(options, cb){
        try {
			const result = await api.get(`/beatmaps/${options.beatmap_id}`);
            const beatmap = result.data;

            if(options.speed_change && options.speed_change > 1) {
                let mod = options.mods.find(m => m.acronym === "DT")
                if(mod)
                    mod.settings = { speed_change: options.speed_change};
                else 
                    options.mods.push({acronym: "DT", settings: {speed_change: options.speed_change}})
            } else if(options.speed_change && options.speed_change < 1) {
                let mod = options.mods.find(m => m.acronym === "HT")
                if(mod)
                    mod.settings = { speed_change: options.speed_change};
                else 
                    options.mods.push({acronym: "HT", settings: {speed_change: options.speed_change}})
            }

            let mods = options.mods.map(mod => mod.acronym)
            if(!mods)
                mods = [];

			if(options.mods.map(x => x.acronym).includes('DA')) {
				options.mods.forEach( mod => {
					if(mod.acronym == "DA" && Object.entries(mod.settings ?? {}).length > 0){ 
						beatmap.ar = mod.settings.approach_rate ?? beatmap.ar
						beatmap.cs = mod.settings.circle_size ?? beatmap.cs
						beatmap.accuracy = mod.settings.overall_difficulty ?? beatmap.accuracy
						beatmap.drain = mod.settings.drain_rate ?? beatmap.drain
					}
				})
			}

            let diff_settings = calculateCsArOdHp(beatmap.cs, beatmap.ar, beatmap.accuracy, beatmap.drain, options.mods);

            let speed = 1;

            const isDT = options.mods.find(m => {
                return m.acronym === "DT"
            })
            const isHT = options.mods.find(m => {
                return m.acronym === "HT"
            })

            if(isDT)
                speed *= isDT.settings?.speed_change ?? 1.5;
            else if(isHT)
                speed *= isHT.settings?.speed_change ?? 0.75;;

            let bpm = beatmap.bpm * speed;

            await helper.downloadBeatmap(beatmap.id)
            const beatmap_path = path.resolve(config.osu_cache_path, `${beatmap.id}.osu`);
			const beatmap_content = await fs.readFile(beatmap_path, 'utf8');

            const rosu_map = new rosu.Beatmap(beatmap_content);
			let diff = new rosu.Difficulty({
				mods: options.mods,
				clockRate: speed,
			}).calculate(rosu_map);

            let accuracies = [90, 95, 97, 98, 99, 99.5, 100];

            let custom_acc = 100;

            if(options.custom_acc)
                custom_acc = +options.custom_acc.toFixed(2);

            custom_acc = Math.max(0, Math.min(custom_acc, 100));

            if(!accuracies.includes(custom_acc))
                accuracies.push(custom_acc);
            accuracies = accuracies.sort((a, b) => a - b);

            let pps = [];

            for (acc of accuracies) {


                const play_params = {
                    mods: options.mods,
                    clockRate: speed,
                    accuracy: acc,
                }

				const pp_result = new rosu.Performance(play_params).calculate(rosu_map);

                pps.push(Math.round(pp_result.pp))
            }

			rosu_map.free();

            let embed = {};

            embed.color = 12277111;
            embed.title = `${beatmap.beatmapset.artist} – ${beatmap.beatmapset.title} [${beatmap.version}]`;
            embed.url = `https://osu.ppy.sh/b/${beatmap.id}`;
            embed.description = `**${mods.length > 0 ? '+' + sanitizeMods(options.mods).join('') : 'NOMOD'}**`;

            let lines = ['', '', 'Difficulty', ''];

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

            lines[3] = `CS**${+diff_settings.cs.toFixed(2)}** AR**${+diff.ar.toFixed(2)}** OD**${+diff.od.toFixed(2)}** HP**${+diff_settings.hp.toFixed(2)}** - `;

            lines[3] += `**${+bpm.toFixed(1)}** BPM ~ `;
            lines[3] += `**${+diff.stars.toFixed(2)}**★`;

			const bparsed = new bparser.BeatmapParser(beatmap_path);

            embed.fields = [
                {
                    name: lines[0],
                    value: lines[1]
                },
                {
                    name: lines[2],
                    value: lines[3],
                },
                {
                    name: 'ScoreV1 Nomod SS',
                    value: `${bparsed.maxScore.toLocaleString()} Score`,
                    inline: true
                },
                {
                    name: "ScoreV1 HDHRDTFL SS",
                    value: `${bparsed.getMaxScore(1112).toLocaleString()} Score`,
                    inline: true
                },
            ];

            cb(null, embed);
        } catch (e) {
            cb('Map not in the database, or invalid beatmap url. 😐');
            helper.error(e);
            return false;
        }
    },

    parse_beatmap_url: function(beatmap_url, id_only = false){
		return new Promise((resolve, reject) => {
			if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
	            beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

	        let beatmap_id;

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
	        else if(parseInt(beatmap_url) == beatmap_url && id_only)
	            beatmap_id = parseInt(beatmap_url);

			helper.downloadBeatmap(beatmap_id).finally(() => {
				resolve(beatmap_id);
			}).catch(helper.error);
		});
    },

	parse_beatmap_url_sync: function(beatmap_url, id_only = false){
		if(beatmap_url.startsWith('<') && beatmap_url.endsWith('>'))
            beatmap_url = beatmap_url.substring(1, beatmap_url.length - 1);

		if(beatmap_url.endsWith('/'))
			beatmap_url = beatmap_url.substring(0, beatmap_url.length - 1);

        let beatmap_id;

        if(beatmap_url.includes("#osu/"))
            beatmap_id = parseInt(beatmap_url.split("#osu/").pop());
        else if(beatmap_url.includes("/b/"))
            beatmap_id = parseInt(beatmap_url.split("/b/").pop());
        else if(beatmap_url.includes("/osu/"))
            beatmap_id = parseInt(beatmap_url.split("/osu/").pop());
        else if(beatmap_url.includes("/beatmaps/"))
            beatmap_id = parseInt(beatmap_url.split("/beatmaps/").pop());
        else if(parseInt(beatmap_url) == beatmap_url && id_only)
            beatmap_id = parseInt(beatmap_url);

		return beatmap_id;
    },

	parse_score_url_sync: function(score_url, id_only = false){
		if(score_url.startsWith('<') && score_url.endsWith('>'))
            score_url = score_url.substring(1, score_url.length - 1);

		if(score_url.endsWith('/'))
			score_url = score_url.substring(0, score_url.length - 1);

		let score_id;

		if(score_url.includes('/scores/'))
			score_id = score_url.split('/').pop();
		else if(parseInt(score_id) == score_id && id_only)
			score_id = parseInt(score_id);

		return score_id;
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
			// custom user agent might be useful for getting some stats (i know this isnt the best way to track that)
			const headers = { "User-Agent": "flowabot" };

            await axios.get(`https://score.respektive.pw/u/${data.id}`, { headers }).then(function (response) {
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
                        value: (+Number(data.statistics.level.current + '.' + String(data.statistics.level.progress).padStart(2, "0")).toFixed(2)).toString(),
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

    get_users: async function(options, cb){

        let { user_id, error } = await getUserId(options.user);
        if(error) { cb("Couldn't reach osu!api. 💀") }

		let requests = [
	        api.get(`/users?ids%5B%5D=${user_id}`),
            api.get(`/users/${user_id}/osu`)
        ];
        
        const results = await Promise.all(requests);

        let users = results[0].data.users;
        let user = results[1].data;

        let medal_count = user.user_achievements.length;

        cb(null, { users, medal_count });
	},

    calculate_strains: calculateStrains,

	get_strains_bar: async function(osu_file_path, mods_string, progress, color = '#F06292'){
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

		ctx.fillStyle = color;
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

		ctx.fillStyle = color;
		ctx.globalAlpha = 0.5;
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
		let beatmap_content = await fs.readFile(osu_file_path, 'utf8');
        let parser = new ojsama.parser().feed(await fs.readFile(osu_file_path, 'utf8'));
        let map = parser.map;

        let mods = ojsama.modbits.from_string(mods_string || "");
        let mods_array = getMods(mods);

        let diffmods = mods_array
        if (mods_array.includes("HD") && !mods_array.includes("FL")) diffmods = mods_array.filter(m => m !== "HD")

        let mods_filtered = diffmods.filter(mod => DIFF_MODS.includes(mod));

        if(mods_filtered.length > 0){
            map.version += ' +' + mods_filtered.join('');
        }

        let speed_multiplier = 1;

        if(mods_array.includes("DT"))
            speed_multiplier *= 1.5;

        if(mods_array.includes("HT"))
            speed_multiplier *= 0.75;

		const rosu_map = new rosu.Beatmap(beatmap_content);
		const rosu_diff = new rosu.Difficulty({ mods: mods })

        const rosu_stars = rosu_diff.calculate(rosu_map);
        const rosu_strains = rosu_diff.strains(rosu_map);

		rosu_map.free();

        let total = rosu_stars.stars;

        if(type == 'aim')
            total = rosu_stars.aim;

        if(type == 'flashlight')
            total = rosu_stars.flashlight;

        if(type == 'speed')
            total = rosu_stars.speed;

        let aim_strains = rosu_strains.aim.map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR)
        let speed_strains = rosu_strains.speed.map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR)
        let flashligh_strains = rosu_strains.flashlight.map((e, i) => e = Math.sqrt(calculateFlashlightDifficultyValue(rosu_strains.flashlight.slice(i - 1, i)))) //.map(a => a = Math.sqrt(a * 9.9999) * STAR_SCALING_FACTOR)

        let star_strains = [];

        let max_strain = 0;

        //let _strain_step = STRAIN_STEP * speed_multiplier;

		let _strain_step = rosu_strains.sectionLength;
        let strain_offset = Math.floor(map.objects[0].time / _strain_step) * _strain_step - _strain_step
        //let strain_offset = rosu_strains.sectionLength;
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
        api.get(`/users/${user}/osu`).then(response => {
            response = response.data;

			if(response.length == 0){
				cb(`Couldn't find user \`${user}\`. 😔`);
				return;
			}

			let user = response;
			if(user.id in tracked_users){
				if(tracked_users[user.id].channels.includes(channel_id)){
					cb(`${user.username} is already being tracked in this channel. 🤡`);
				}else{
					tracked_users[user.id].channels.push(channel_id);
					tracked_users[user.id].top = top;

					delete top_plays[user.id];

					cb(null, `Now tracking ${user.username}'s top ${top} in this channel. 🤓`);
				}
			}else{
				tracked_users[user.id] = {
					top: top,
					channels: [channel_id]
				};

				cb(null, `Now tracking ${user.username}'s top ${top}. 🤓`);
			}

			helper.setItem('tracked_users', JSON.stringify(tracked_users));
			helper.setItem('top_plays', JSON.stringify(top_plays));

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
        api.get(`/users/${user}/osu`).then(response => {
            response = response.data;


			if(response.length == 0){
				cb(`Couldn't find user \`${user}\`. 😔`);
				return;
			}

			let user = response;	
			if(user.id in tracked_users){
				if(tracked_users[user.id].channels.includes(channel_id)){
					tracked_users[user.id].channels
					= tracked_users[user.id].channels.filter(a => a != channel_id);

					if(tracked_users[user.id].channels.length > 0){
						cb(null, `Stopped tracking ${user.username} in this channel. 😔`);
					}else{
						cb(null, `Stopped tracking ${user.username}. 😔`);

						delete tracked_users[user.id];
						delete top_plays[user.id];
					}

					helper.setItem('tracked_users', JSON.stringify(tracked_users));
					helper.setItem('top_plays', JSON.stringify(top_plays));
				}else{
					cb(`${user.username} is not being tracked in this channel. 🤡`);
				}
			}else{
				cb(`${user.username} is not being tracked. 🤡`);
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

            const output_frame = await getFrame(osu_file_path, max_strain_time_real - map.objects[0].time % 400, mods_array, [427, 320], {ar: ar, cs: cs, noreplay: true})
            
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
