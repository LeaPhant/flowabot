const axios = require('axios');
const moment = require('moment');
const ojsama = require('ojsama');
const osuBeatmapParser = require('osu-parser');
const path = require('path');
const fs = require('fs-extra');

const { createCanvas } = require('canvas');

const ur_calc = require('./renderer/ur.js');
const frame = require('./renderer/render_frame.js');
const helper = require('./helper.js');

const highcharts = require('highcharts-export-server');
const {execFileSync} = require('child_process');
const Jimp = require('jimp');

const MINUTE = 60 * 1000;
const STRAIN_STEP = 400.0;
const DECAY_BASE = [ 0.3, 0.15 ];
const STAR_SCALING_FACTOR = 0.0675;
const EXTREME_SCALING_FACTOR = 0.5;
const DECAY_WEIGHT = 0.9;

highcharts.initPool();

const config = require('./config.json');

let tracked_users = {};

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

const DIFF_MODS = ["HR","EZ","DT","HT"];

const TIME_MODS = ["DT", "HT"];

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

let api;

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

function sanitizeMods(mods){
    let return_array = mods;
    if(mods.includes("NC") && mods.includes("DT"))
        return_array.splice(mods.indexOf("DT"), 1);
    if(mods.includes("PF") && mods.includes("SD"))
        return_array.splice(mods.indexOf("SD"), 1);
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

function calculateCsArOdHp(cs_raw, ar_raw, od_raw, hp_raw, mods_enabled){
	var speed = 1, ar_multiplier = 1, ar, ar_ms;

	if(mods_enabled.includes("DT")){
		speed *= 1.5;
	}else if(mods_enabled.includes("HT")){
		speed *= .75;
	}

	if(mods_enabled.includes("HR")){
		ar_multiplier *= 1.4;
	}else if(mods_enabled.includes("EZ")){
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

	if(mods_enabled.includes("HR")){
		cs_multiplier *= 1.3;
	}else if(mods_enabled.includes("EZ")){
		cs_multiplier *= 0.5;
	}

	cs = cs_raw * cs_multiplier;

	if(cs > 10) cs = 10;

	var od, odms, od_multiplier = 1;

	if(mods_enabled.includes("HR")){
		od_multiplier *= 1.4;
	}else if(mods_enabled.includes("EZ")){
		od_multiplier *= 0.5;
	}

	od = od_raw * od_multiplier;
	odms = od0_ms - Math.ceil(od_ms_step * od);
	odms = Math.min(od0_ms, Math.max(od10_ms, odms));

	odms /= speed;

	od = (od0_ms - odms) / od_ms_step;

    var hp, hp_multiplier = 1;

    if(mods_enabled.includes("HR")){
		hp_multiplier *= 1.4;
	}else if(mods_enabled.includes("EZ")){
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
    if(a.date != b.date)
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

function getScore(recent_raw, cb){
    let recent = {};

    recent = Object.assign({
        user_id: recent_raw.user_id,
        beatmap_id: recent_raw.beatmap_id,
        rank: recent_raw.rank,
        score: Number(recent_raw.score),
        combo: Number(recent_raw.maxcombo),
        count300: Number(recent_raw.count300),
        count100: Number(recent_raw.count100),
        count50: Number(recent_raw.count50),
        countmiss: Number(recent_raw.countmiss),
        mods: getMods(Number(recent_raw.enabled_mods)),
        date: recent_raw.date + 'Z',
        unsubmitted: false
    }, recent);

	if('pp' in recent_raw && Number(recent_raw.pp) > 0){
		recent.pp = Number(recent_raw.pp);
	}

    let requests = [
        api.get('/get_user_best', { params: { u: recent_raw.user_id, limit: 100 } }),
        api.get('/get_scores', { params: { b: recent_raw.beatmap_id, limit: 100 } }),
        api.get('/get_scores', { params: { b: recent_raw.beatmap_id, u: recent_raw.user_id, mods: recent_raw.enabled_mods } }),
        api.get('/get_user', { params: { u: recent_raw.user_id } })
    ];

    Promise.all(requests).then(results => {

        let user_best = results[0].data;
        let leaderboard = results[1].data;
        let best_score = results[2].data[0];
        let user = results[3].data[0];

        let pb = 0;
        let lb = 0;
        let replay = 0;

        for(let i = 0; i < user_best.length; i++){
            if(compareScores(user_best[i], recent_raw)){
                pb = ++i;
                break;
            }
        }

        for(let i = 0; i < leaderboard.length; i++){
            if(compareScores(leaderboard[i], recent_raw)){
                lb = ++i;
                break;
            }
        }

        recent = Object.assign({
            pb: pb,
            lb: lb,
            username: user.username,
            user_rank: Number(user.pp_rank),
            user_pp: Number(user.pp_raw)
        }, recent);

        if(best_score){
            if(compareScores(best_score, recent_raw)){
                replay = Number(best_score.replay_available);
				recent.score_id = best_score.score_id;
            }else{
                recent.unsubmitted = true;
			}
        }

        axios.get(`${config.beatmap_api}/b/${recent.beatmap_id}`).then(response => {
            response = response.data;

            let beatmap = response.beatmap;

            let diff_settings = calculateCsArOdHp(beatmap.cs, beatmap.ar, beatmap.od, beatmap.hp, recent.mods);

            let speed = 1;

            if(recent.mods.includes('DT'))
                speed *= 1.5;
            else if(recent.mods.includes('HT'))
                speed *= 0.75;

            let fail_percent = 1;

            if(recent_raw.rank == 'F')
                fail_percent = (recent.count300 + recent.count100 + recent.count50 + recent.countmiss) / beatmap.hit_objects;

            recent = Object.assign({
                approved: beatmap.approved,
                beatmapset_id: beatmap.beatmapset_id,
                artist: beatmap.artist,
                title: beatmap.title,
                version: beatmap.version,
                bpm_min: beatmap.bpm_min * speed,
                bpm_max: beatmap.bpm_max * speed,
                max_combo: beatmap.max_combo,
                bpm: beatmap.bpm * speed,
                creator: beatmap.creator,
                creator_id: beatmap.creator_id,
                approved_date: beatmap.approved_date,
                cs: diff_settings.cs,
                ar: diff_settings.ar,
                od: diff_settings.od,
                hp: diff_settings.hp,
                duration: beatmap.total_length,
                fail_percent: fail_percent
            }, recent);

            let diff = response.difficulty[getModsEnum(recent.mods.filter(mod => DIFF_MODS.includes(mod)))];

            if(diff.aim && diff.speed){
                let pp = ojsama.ppv2({
                    aim_stars: diff.aim,
                    speed_stars: diff.speed,
                    base_ar: beatmap.ar,
                    base_od: beatmap.od,
                    n100: Number(recent_raw.count100),
                    n50: Number(recent_raw.count50),
                    mods: Number(recent_raw.enabled_mods),
                    combo: Number(recent_raw.maxcombo),
                    ncircles: beatmap.num_circles,
                    nsliders: beatmap.num_sliders,
                    nobjects: beatmap.hit_objects,
                    max_combo: beatmap.max_combo,
                    nmiss: Number(recent_raw.countmiss)
                });

                console.log(pp);

                let pp_fc = ojsama.ppv2({
                    aim_stars: diff.aim,
                    speed_stars: diff.speed,
                    base_ar: beatmap.ar,
                    base_od: beatmap.od,
                    n100: Number(recent_raw.count100),
                    n50: Number(recent_raw.count50),
                    mods: Number(recent_raw.enabled_mods),
                    ncircles: beatmap.num_circles,
                    nsliders: beatmap.num_sliders,
                    nobjects: beatmap.hit_objects,
                    max_combo: beatmap.max_combo,
                });

                recent = Object.assign({
                    stars: diff.total,
                    pp_fc: pp_fc.total,
                    acc: pp.computed_accuracy.value() * 100,
                    acc_fc: pp_fc.computed_accuracy.value() * 100
                }, recent);

				if(!('pp' in recent)){
					recent.pp = pp.total;
				}
            }else{
                cb('No difficulty data for this map! Please try again later');
                return;
            }

			helper.downloadBeatmap(recent_raw.beatmap_id).finally(() => {
				let beatmap_path = path.resolve(config.osu_cache_path, `${recent_raw.beatmap_id}.osu`);

				let strains_bar;

				if(fs.existsSync(beatmap_path)){
					strains_bar = module.exports.get_strains_bar(beatmap_path, recent.mods.join(''), recent.fail_percent);

					if(strains_bar)
						recent.strains_bar = true;
				}

	            if(replay && fs.existsSync(beatmap_path)){
	                let ur_promise = new Promise((resolve, reject) => {
						if(config.debug)
							helper.log('getting ur');

	                    ur_calc.get_ur(
	                        {
	                            apikey: settings.api_key,
	                            player: recent_raw.user_id,
	                            beatmap_id: recent_raw.beatmap_id,
	                            mods_enabled: recent_raw.enabled_mods,
								score_id: recent.score_id,
	                            mods: recent.mods
	                        }).then(response => {
                                recent.ur = response.ur;

                                if(recent.countmiss == (response.miss || 0) 
                                && recent.count100 == (response['100'] || 0)
                                && recent.count50 == (response['50'] || 0))
                                    recent.countsb = response.sliderbreak;

	                            if(recent.mods.includes("DT") || recent.mods.includes("NC"))
	                                recent.cvur = response.ur / 1.5;
	                            else if(recent.mods.includes("HT"))
	                                recent.cvur = response.ur * 1.5;

	                            resolve(recent);
	                        });
	                });

	                recent.ur = -1;
	                if(recent.mods.includes("DT") || recent.mods.includes("HT"))
	                    recent.cvur = -1;
	                cb(null, recent, strains_bar, ur_promise);
	            }else{
	                cb(null, recent, strains_bar);
	            }
			});
        }).catch(err => {
            cb('Map not in the database, maps that are too new don\'t work yet');
            helper.log(err);
            return;
        });
    }).catch(err => {
        helper.log(err);
    });
}

function calculateStrains(type, diffobjs, speed_multiplier){
    let strains = [];
    let strain_step = STRAIN_STEP * speed_multiplier;
    let interval_end = (
        Math.ceil(diffobjs[0].obj.time / strain_step) * strain_step
    );
    let max_strain = 0.0;

    for (let i = 0; i < diffobjs.length; ++i){
        while (diffobjs[i].obj.time > interval_end) {
        strains.push(max_strain);
        if (i > 0) {
            let decay = Math.pow(DECAY_BASE[type],
            (interval_end - diffobjs[i - 1].obj.time) / 1000.0);
            max_strain = diffobjs[i - 1].strains[type] * decay;
        } else {
            max_strain = 0.0;
        }
        interval_end += strain_step;
        }
        max_strain = Math.max(max_strain, diffobjs[i].strains[type]);
    }

    strains.push(max_strain);
    strains.forEach((strain, index) => {
        strain *= 9.999
        strains[index] = Math.sqrt(strain) * STAR_SCALING_FACTOR;
    });

    return strains;
}

function updateTrackedUsers(){
    for(user_id in tracked_users){
        let user = user_id;

        api.get('/get_user_best', {params: { u: user, limit: tracked_users[user].top, mode: 0 }}).then(response => {
            response = response.data;

            if(user in top_plays){
                response.forEach(score => {
                    score.score_id = Number(score.score_id);
                    if(!top_plays[user].includes(Number(score.score_id))){
                        getScore(score, (err, recent, strains_bar, ur_promise) => {
                            if(err)
                                return false;

                            if(ur_promise){
                                ur_promise.then(recent => {
                                    let embed = module.exports.format_embed(recent);
                                    tracked_users[user].channels.forEach(channel_id => {
                                        let channel = discord_client.channels.get(channel_id);
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
                                    let channel = discord_client.channels.get(channel_id);
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
                top_plays[user].push(Number(score.score_id));
            });

            helper.setItem('top_plays', JSON.stringify(top_plays));
        }).catch(err => {
			helper.error('Error updating tracking', err);
		});
    }

	setTimeout(updateTrackedUsers, 60 * 1000);
}

module.exports = {
    init: function(client, api_key, _last_beatmap){
		discord_client = client;
		last_beatmap = _last_beatmap;

		if(api_key){
	        settings.api_key = api_key;
	        api = axios.create({
	            baseURL: 'https://osu.ppy.sh/api',
	            params: {
	                k: api_key
	            }
	        });

			updateTrackedUsers();
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

    add_pp: function(user, pp_to_add, beatmap, cb){
        let pp = 0, pp_full = 0, pp_no_bonus = 0, max = 0;
        let pp_array, pp_array_new = [];
        let output_user;
        let no_bonus_pp = false;
        let old_rank = "";
        let new_rank = "";

        if(pp_to_add === null) return false;

        api.get('/get_user', { params: { u: user }}).then(response => {
            let start = Date.now();
            let json = response.data;

            if(json.length < 1){
                cb('User not found');
                return false;
            }

            output_user = json[0].username;
            pp_full = parseFloat(json[0].pp_raw);
            old_rank = parseInt(json[0].pp_rank);

            let total_scores = parseInt(json[0].count_rank_ss) + parseInt(json[0].count_rank_s) + parseInt(json[0].count_rank_a);

			api.get('/get_user_best', { params: { u: user, limit: 100 }}).then(response => {
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
            });
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
            embed.description = `**__#${recent.pb} Top Play!__**`;

		if(recent.strains_bar){
			embed.image = {
				url: 'attachment://strains_bar.png'
			};
		}

        let ranked_text = 'Submitted';

        switch(recent.approved){
            case 1:
                ranked_text = 'Ranked';
                break;
            case 2:
                ranked_text = 'Approved';
                break;
            case 3:
                ranked_text = 'Qualified';
                break;
            case 4:
                ranked_text = 'Loved';
                break;
        }

        embed.footer = {
            icon_url: `https://a.ppy.sh/${recent.creator_id}?${+new Date()}`,
            text: `Mapped by ${recent.creator}${helper.sep}${ranked_text} on ${moment(recent.approved_date).format('D MMMM YYYY')}`
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
        lines[0] += `${moment(recent.date).fromNow()}`;

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

        lines[3] += `${moment("2015-01-01").startOf('day').seconds(recent.duration).format('mm:ss')} ~ `;
        lines[3] += `CS**${+recent.cs.toFixed(1)}** AR**${+recent.ar.toFixed(1)}** OD**${+recent.od.toFixed(1)}** HP**${+recent.hp.toFixed(1)}** ~ `;

        if(recent.bpm_min != recent.bpm_max)
            lines[3] += `${+recent.bpm_min.toFixed(1)}-${+recent.bpm_max.toFixed(1)} (**`;
        else
            lines[3] += '**';

        lines[3] += +recent.bpm.toFixed(1);

        if(recent.bpm_min != recent.bpm_max)
            lines[3] += '**)';
        else
            lines[3] += '**';

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

    get_recent: function(options, cb){
        helper.log(options);
        let limit = options.pass ? 50 : options.index;

        api.get('/get_user_recent', { params: { u: options.user, limit: limit } }).then(response => {

            response = response.data;

            if(response.length < 1){
                cb(`No recent plays found for ${options.user}`);
                return;
            }

            let recent_raw;

            let recent = {};

            if(options.pass){
                let recent_pass = [];
                for(let i = 0; i < response.length; i++){
                    if(response[i].rank != 'F')
                        recent_pass.push(response[i]);
                }

                if(recent_pass.length > 0){
                    if(recent_pass.length < options.index)
                        options.index = recent_pass.length;

                    recent_raw = recent_pass[options.index - 1];
                }

                if(!recent_raw){
                    cb(`No recent passes found for ${options.user}`);
                    return;
                }
            }else{
                if(response.length < options.index)
                    options.index = response.length;

                recent_raw = response[options.index - 1];
            }


            getScore(recent_raw, cb);
        });
    },

    get_compare: function(options, cb){
        let params = {
            b: options.beatmap_id,
        };

        if(options.user){
            params.u = options.user;
        }else{
            if(options.mods)
                params.mods = getModsEnum(options.mods);
        }

        api.get('/get_scores', { params: params }).then(response => {
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
                cb(`No scores matching criteria found`);
                return;
            }

            score.beatmap_id = options.beatmap_id;

            getScore(score, cb);
        });
    },

    get_score: function(options, cb){
        let params = {
            b: options.beatmap_id,
            limit: options.index
        };

        if(options.user)
            params.u = options.user;

        if(options.mods)
            params.mods = getModsEnum(options.mods)

        api.get('/get_scores', { params: params }).then(response => {
            response = response.data;

            if(response.length < 1){
                cb(`No scores matching criteria found`);
                return;
            }

            if(response.length < options.index)
                optiins.index = response.length - 1;

            let recent_raw = response[options.index - 1];

            recent_raw.beatmap_id = options.beatmap_id;

            getScore(recent_raw, cb);
        });

    },

	get_tops: async function(options, cb){
		let requests = [
	        api.get('/get_user_best', { params: { u: options.user, limit: options.count } }),
	        api.get('/get_user', { params: { u: options.user } })
        ];
        
        const results = await Promise.all(requests);

        let user_best = results[0].data;
        let user = results[1].data[0];

        if(user_best.length < 1){
            cb(`No top plays found for ${options.user}`);
            return;
        }

        const tops = user_best.slice(0, options.count || 5);

        const { data } = await axios(`${config.beatmap_api}/b/${tops.map(a => a.beatmap_id).join(",")}`);

        for(const top of tops){
            const { beatmap, difficulty } = data.find(a => a.beatmap.beatmap_id == top.beatmap_id);

            top.accuracy = (accuracy(top.count300, top.count100, top.count50, top.countmiss) * 100).toFixed(2);
            top.mods = getMods(top.enabled_mods);

            const diff = difficulty[getModsEnum(top.mods.filter(mod => DIFF_MODS.includes(mod)))];

            const pp_fc = ojsama.ppv2({
                aim_stars: diff.aim,
                speed_stars: diff.speed,
                base_ar: beatmap.ar,
                base_od: beatmap.od,
                n300: Number(top.count300 + top.countmiss),
                n100: Number(top.count100),
                n50: Number(top.count50),
                mods: Number(top.enabled_mods),
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

        return { user, tops };
	},

    get_top: function(options, cb){
        let params = {
            limit: options.rb | options.ob ? 100 : options.index,
            u: options.user
        };

        api.get('/get_user_best', {params: params}).then(response => {
            response = response.data;

            if(response.length < 1){
                cb(`No top plays found for ${options.user}`);
                return;
            }

            let recent_raw;

            if(options.rb || options.ob){
                response.forEach((recent, index) => {
                   response[index].unix = moment(recent.date + 'Z').unix();
                });
            }

            if(options.rb)
                response = response.sort((a, b) => b.unix - a.unix);

            if(options.ob)
                response = response.sort((a, b) => a.unix - b.unix);

            if(response.length < options.index)
                options.index = response.length;

            recent_raw = response[options.index - 1];

            getScore(recent_raw, cb);
        });
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
                cb('No difficulty data for this map! Please try again later');
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
                    name: 'Nomod SS',
                    value: `${beatmap.max_score.toLocaleString()} Score`
                }
            ];

            cb(null, embed);
        }).catch(e => {
            cb('Map not in the database, maps that are too new don\'t work yet');
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
			});
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

    get_bpm_graph: function(osu_file_path, mods_string, cb){
        helper.log(osu_file_path);
        try{
            let parser = new ojsama.parser().feed(fs.readFileSync(osu_file_path, 'utf8'));

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

            let bpms = [];

            for(let t = 0; t < map.timing_points.length; t++){
                let timing_point = map.timing_points[t];
                if(!timing_point.change)
                    continue;

                let bpm = +(MINUTE / timing_point.ms_per_beat * speed_multiplier).toFixed(2);

                if(bpms.length > 0){
                    if(bpms[bpms.length - 1] != bpm){
                        bpms.push([timing_point.time, bpms[bpms.length - 1][1]]);
                        bpms.push([timing_point.time, bpm]);
                    }
                }else{
                    bpms.push([timing_point.time, bpm]);
                }
            }

            if(bpms.length == 0){
                cb('An error occured getting the Beatmap BPM values');
                return false;
            }

            bpms.push([map.objects[map.objects.length - 1].time, bpms[bpms.length - 1][1]]);

            let highcharts_settings = {
                type: 'png',
                options: {
                    chart: {
                        type: 'spline',
                    },
                    title: { text: `${map.artist} - ${map.title}` },
                    subtitle: { text: `Version: ${map.version}, Mapped by ${map.creator}` },
                    yAxis: {
                        title: {
                            align: 'high',
                            text: 'BPM',
                            style: {
                                'text-anchor': 'start'
                            },
                            rotation: 0,
                            y: -20,
                            x: 10
                        }
                    },
                    xAxis: {
                        type: 'datetime',
                        dateTimeLabelFormats: {
                            month: '%M:%S',
                            year: '%M:%S',
                            day: '%M:%S',
                            minute: '%M:%S',
                            second: '%M:%S',
                            millisecond: '%M:%S'
                        }
                    },
                    series: [{ showInLegend: false, data: bpms }]
                },
                themeOptions: CHART_THEME
            };

            highcharts.export(highcharts_settings, (err, res) => {
                if(err) cb('An error occured creating the graph')
                else cb(null, res.data);
            });
        }catch(e){
            cb('An error occured creating the graph');
            helper.error(e);
            return;
        }
    },

    get_user: function(user, cb){
        api.get('/get_user', {params: {u: user}}).then(response => {
            response = response.data;

			helper.log(response);

			if(response.length == 0){
				cb("Couldn't find user");
				return false;
			}

            let data = response[0];

            let grades = "";

            grades += `${getRankEmoji('XH')} ${Number(data.count_rank_ssh).toLocaleString()} `;
            grades += `${getRankEmoji('X')} ${Number(data.count_rank_ss).toLocaleString()} `;
            grades += `${getRankEmoji('SH')} ${Number(data.count_rank_sh).toLocaleString()} `;
            grades += `${getRankEmoji('S')} ${Number(data.count_rank_s).toLocaleString()} `;
            grades += `${getRankEmoji('A')} ${Number(data.count_rank_a).toLocaleString()}`;

            let play_time = `${Math.ceil(Number(data.total_seconds_played) / 3600)}h`;
            play_time += ` ${Math.floor(Number(data.total_seconds_played) % 3600 / 60)}m`;

            let embed = {
                color: 12277111,
                thumbnail: {
                    url: `https://a.ppy.sh/${data.user_id}?${+new Date()}`
                },
                author: {
                    name: `${data.username} – ${+Number(data.pp_raw).toFixed(2)}pp (#${Number(data.pp_rank).toLocaleString()}) (${data.country}#${Number(data.pp_country_rank).toLocaleString()})`,
                    icon_url: `https://a.ppy.sh/${data.user_id}?${+new Date()}`,
                    url: `https://osu.ppy.sh/u/${data.user_id}`
                },
                footer: {
                    text: `Playing for ${moment(data.join_date).fromNow(true)}${helper.sep}Joined on ${moment(data.join_date).format('D MMMM YYYY')}`
                },
                fields: [
                    {
                        name: 'Ranked Score',
                        value: Number(data.ranked_score).toLocaleString(),
                        inline: true
                    },
                    {
                        name: 'Total score',
                        value: Number(data.total_score).toLocaleString(),
                        inline: true
                    },
                    {
                        name: 'Play Count',
                        value: Number(data.playcount).toLocaleString(),
                        inline: true
                    },
                    {
                        name: 'Play Time',
                        value: play_time,
                        inline: true
                    },
                    {
                        name: 'Level',
                        value: (+Number(data.level).toFixed(2)).toString(),
                        inline: true
                    },
                    {
                        name: 'Hit Accuracy',
                        value: `${Number(data.accuracy).toFixed(2)}%`,
                        inline: true
                    },
                    {
                        name: 'Grades',
                        value: grades
                    }
                ]
            };

            helper.log(embed);

            cb(null, embed);
        }).catch(err => {
			if(err.status == 404)
				cb("Couldn't find user");
			else
	            cb("Couldn't reach osu!api");

            helper.error(err);
            return;
        });
    },

	get_strains_bar: function(osu_file_path, mods_string, progress){
		let map_strains = module.exports.get_strains(osu_file_path, mods_string);

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

    get_strains: function(osu_file_path, mods_string, type){
        try{
			console.log(osu_file_path);
            let parser = new ojsama.parser().feed(fs.readFileSync(osu_file_path, 'utf8'));
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

            let stars = new ojsama.diff().calc({map: map, mods: mods});

            let total = stars.total;

            if(type == 'aim')
                total = stars.aim;

            if(type == 'speed')
                total = stars.speed;

            let aim_strains = calculateStrains(1, stars.objects, speed_multiplier);
            let speed_strains = calculateStrains(0, stars.objects, speed_multiplier);

            let star_strains = [];

            let max_strain = 0;

            let _strain_step = STRAIN_STEP * speed_multiplier;

            let strain_offset = Math.floor(map.objects[0].time / _strain_step) * _strain_step - _strain_step

            let max_strain_time = strain_offset;

            for(let i = 0; i < aim_strains.length; i++)
                star_strains.push(aim_strains[i] + speed_strains[i] + Math.abs(speed_strains[i] - aim_strains[i]) * EXTREME_SCALING_FACTOR);

            let chosen_strains = star_strains;

            if(type == 'aim')
                chosen_strains = aim_strains;

            if(type == 'speed')
                chosen_strains = speed_strains;

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
        }catch(e){
            helper.log(e);
			return false;
        }
    },

    track_user: function(channel_id, user, top, cb){
        api.get('/get_user', { params: { u: user } }).then(response => {
            response = response.data;

            if(response.length > 0){
                let user = response[0];
                if(user.user_id in tracked_users){
                    if(tracked_users[user.user_id].channels.includes(channel_id)){
                        cb(`${user.username} is already being tracked in this channel`);
                    }else{
                        tracked_users[user.user_id].channels.push(channel_id);
                        tracked_users[user.user_id].top = top;

                        delete top_plays[user.user_id];

                        cb(null, `Now tracking ${user.username}'s top ${top} in this channel.`);
                    }
                }else{
                    tracked_users[user.user_id] = {
                        top: top,
                        channels: [channel_id]
                    };

                    cb(null, `Now tracking ${user.username}'s top ${top}.`);
                }

                helper.setItem('tracked_users', JSON.stringify(tracked_users));
                helper.setItem('top_plays', JSON.stringify(top_plays));
            }else{
                cb(`Couldn't find user \`${user}\``);
            }
		}).catch(err => {
			if(err.status == 404)
				cb("Couldn't find user");
			else
				cb("Couldn't reach osu!api");

			helper.error(err);
			return false;
        });
    },

    untrack_user: function(channel_id, user, cb){
        api.get('/get_user', { params: { u: user } }).then(response => {
            response = response.data;

            if(response.length > 0){
                let user = response[0];
                if(user.user_id in tracked_users){
                    if(tracked_users[user.user_id].channels.includes(channel_id)){
                        tracked_users[user.user_id].channels
                        = tracked_users[user.user_id].channels.filter(a => a != channel_id);

                        if(tracked_users[user.user_id].channels.length > 0){
                            cb(null, `Stopped tracking ${user.username} in this channel.`);
                        }else{
                            cb(null, `Stopped tracking ${user.username}.`);

                            delete tracked_users[user.user_id];
                            delete top_plays[user.user_id];
                        }

                        helper.setItem('tracked_users', JSON.stringify(tracked_users));
                        helper.setItem('top_plays', JSON.stringify(top_plays));
                    }else{
                        cb(`${user.username} is not being tracked in this channel`);
                    }
                }else{
                    cb(`${user.username} is not being tracked`);
                }
            }else{
                cb(`Couldn't find \`${user}\``);
            }
        }).catch(err => {
			if(err.status == 404)
				cb("Couldn't find user");
			else
				cb("Couldn't reach osu!api");

			helper.error(err);
			return false;
        });
    },

    get_strains_graph: function(osu_file_path, mods_string, cs, ar, type, cb){
        try{
            let strains = this.get_strains(osu_file_path, mods_string, type);
            let {map, mods_array, max_strain_time_real} = strains;

            helper.log('max strain time', max_strain_time_real);

            let chosen_strains = strains.strains;

            let strain_points = [];
            let max_chunks = 70;
            let chunk_size = Math.ceil(chosen_strains.length / max_chunks);

            for(let i = 0; i < chosen_strains.length; i += chunk_size){
                let _strains = chosen_strains.slice(i, i + chunk_size);
                strain_points.push([i * STRAIN_STEP, Math.max(..._strains)]);
            }

            let highcharts_settings = {
                type: 'png',
                options: {
                    chart: {
                        type: 'spline',
                    },
                    plotOptions: {
                        series: {
                            lineWidth: 3,
                            name: false
                        },
                        spline: {
                            marker: {
                                enabled: false
                            }
                        }
                    },
                    title: { text: `${map.artist} - ${map.title}` },
                    subtitle: { text: `Version: ${map.version}, Mapped by ${map.creator}` },
                    yAxis: {
                        title: {
                            align: 'high',
                            text: 'Stars',
                            style: {
                                'text-anchor': 'start'
                            },
                            rotation: 0,
                            y: -20,
                            x: 10
                        },
                         plotLines: [{
                            color: 'rgba(255,255,255,0.4)',
                            width: 2,
                            value: strains.total
                        }]
                    },
                    xAxis: {
                        type: 'datetime',
                        dateTimeLabelFormats: {
                            month: '%M:%S',
                            year: '%M:%S',
                            day: '%M:%S',
                            minute: '%M:%S',
                            second: '%M:%S',
                            millisecond: '%M:%S'
                        }
                    },
                    series: [
                        { name: 'Stars', showInLegend: false, data: strain_points },
                    ]
                },
                themeOptions: CHART_THEME
            };

            highcharts.export(highcharts_settings, (err, res) => {
                if(err) cb('An error occured creating the graph');
                else{
                    frame.get_frame(osu_file_path, max_strain_time_real - map.objects[0].time % 400, mods_array, [468, 351], {ar: ar, cs: cs}, (err, output_frame) => {
						if(err) cb(err);
                        else{
							Jimp.read(Buffer.from(res.data, 'base64')).then(_graph => {
	                            Jimp.read(output_frame).then(_frame => {
	                                _graph.composite(_frame, 75, 20, { opacitySource: 0.6 });
	                                _graph.getBufferAsync('image/png').then(buffer => {
	                                    cb(null, buffer);
	                                }).catch(helper.error);
	                            }).catch(helper.error);
	                        }).catch(helper.error);
						}
                    });
                }
            });
        }catch(e){
            cb('An error occured creating the graph');
            helper.error(e);
            return;
        }
    }
};
