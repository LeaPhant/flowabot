const math = require('mathjs');
const lzma = require('lzma');
const axios = require('axios');

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { fork } = require('child_process');

const helper = require('../helper.js');

const config = require('../config.json');

const STACK_DISTANCE = 3;
const OBJECT_RADIUS = 64;
const hittable_range = 300;

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;
const PLAYFIELD_PADDING = 100;

const ar_ms_step1 = 120;
const ar_ms_step2 = 150;

const ar0_ms = 1800;
const ar5_ms = 1200;
const ar10_ms = 450;

const od_ms_step = 6;
const od0_ms = 79.5;
const od10_ms = 19.5;

const mods_enum = {
	"": 0,
	"NF": Math.pow(2, 0),
	"EZ": Math.pow(2, 1),
	"TD": Math.pow(2, 2),
	"HD": Math.pow(2, 3),
	"HR": Math.pow(2, 4),
	"DT": Math.pow(2, 6),
	"HT": Math.pow(2, 8),
	"NC": Math.pow(2, 9),
	"FL": Math.pow(2, 10),
	"SO": Math.pow(2, 12)
}

const keys_enum = {
    "M1": Math.pow(2,0),
    "M2": Math.pow(2,1),
    "K1": Math.pow(2,2),
    "K2": Math.pow(2,3)
}

function getMods(enabled_mods){
    var return_array = [];
    for(var mod in mods_enum){
        if((mods_enum[mod] & enabled_mods) != 0)
            return_array.push(mod);
    }
    return return_array;
}

function vectorDistance(hitObject1, hitObject2){
    return Math.sqrt((hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
        + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]));
}

function withinCircle(x, y, centerX,  centerY, radius){
    return Math.pow((x - centerX), 2) + Math.pow((y - centerY), 2) < Math.pow(radius, 2);
}

function calculate_csarod(cs_raw, ar_raw, od_raw, mods_enabled){
	let speed = 1, ar_multiplier = 1, ar, ar_ms;

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

	let cs, cs_multiplier = 1;

	if(mods_enabled.includes("HR")){
		cs_multiplier *= 1.3;
	}else if(mods_enabled.includes("EZ")){
		cs_multiplier *= 0.5;
	}

	cs = cs_raw * cs_multiplier;

	if(cs > 10) cs = 10;

	let od, odms, od_multiplier = 1;

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

	return {
		cs: cs,
		ar: ar,
		od: od
	}
}

function parseKeysPressed(num){
    let keys = Number(num);
    let output_keys = {
        K1: false,
        K2: false,
        M1: false,
        M2: false
    };

    for(key in keys_enum){
        output_keys[key] = false;
        if(keys_enum[key] & keys)
            output_keys[key] = true;
    }

    if(output_keys.K1 && output_keys.M1)
        output_keys.M1 = false;

    if(output_keys.K2 && output_keys.M2)
        output_keys.M2 = false;

    return output_keys;
}

function parseReplay(buf){
    let replay_data = lzma.decompress(buf);
    let replay_frames = replay_data.split(",");

    let output_frames = [];

    let offset = 0;

    for(let i = 0; i < replay_frames.length; i++){
        let replay_frame = replay_frames[i].split("|");

        if(replay_frame.length < 4)
            continue;

        let output_frame = {
            offset: Number(replay_frame[0]) + offset,
            timeSinceLastAction: Number(replay_frame[0]),
            x: Number(replay_frame[1]),
            y: Number(replay_frame[2]),
            keys: parseKeysPressed(replay_frame[3])
        };

        let keys = parseKeysPressed(replay_frame[3]);

        output_frame = Object.assign(keys, output_frame);

        output_frames.push(output_frame);

        offset = output_frames[output_frames.length - 1].offset;
    }

    return output_frames;
}

function getReplayPoint(time){
    for(let i = 0; i < replay.replay_data.length; i++){
        if(replay.replay_data[i].offset >= Math.floor(time)) return replay.replay_data[i];
    }
}

function getCursorAt(timestamp, replay){
    while(replay.replay_data[replay.lastCursor].offset <= timestamp){
        replay.lastCursor++;
    }
    let current = replay.replay_data[replay.lastCursor - 1];
    let next = replay.replay_data[replay.lastCursor];
    return {current: current, next: next};
}

function variance(array){
    let sum = 0;
    array.forEach(a => sum += a);
	let avg = sum / array.length;
    let _sum = 0;
	let _array = array.map(function(a){ return Math.pow(a - avg, 2); });
    _array.forEach(a => _sum += a);
	return Math.sqrt(_sum / _array.length);
}

function calculateUr(options, cb){
    axios.get('https://osu.ppy.sh/api/get_replay',
	{
		params: {
			k: options.apikey,
			u: options.player,
			b: options.beatmap_id,
			mods: options.mods_enabled
		}
	}).then(response => {
        let enabled_mods = getMods(Number(options.mods_enabled));

        let speed_multiplier = 1;

        if(options.mods.includes("DT")){
            speed_multiplier = 1.5;
        }else if(options.mods.includes("HT")){
            speed_multiplier = 0.75;
        }

        let replay_raw = Buffer.from(response.data.content, "base64");
		fs.ensureDirSync(path.resolve(os.tmpdir(), 'replays'));
		fs.writeFileSync(path.resolve(os.tmpdir(), 'replays', `${options.score_id}`), replay_raw);
        let replay = {lastCursor: 0, replay_data: parseReplay(replay_raw)};


        helper.downloadBeatmap(options.beatmap_id)
		.catch(helper.error)
		.then(() => {
			let worker = fork(path.resolve(__dirname, 'beatmap_preprocessor.js'), ['--max-old-space-size=512']);

	        worker.send({
	            beatmap_path: path.resolve(config.osu_cache_path, `${options.beatmap_id}.osu`),
	            options,
	            enabled_mods: options.mods
	        });

			worker.on('close', code => {
				if(code > 0){
					cb("Error processing beatmap");
					return false;
				}
			});

	        worker.on('message', _beatmap => {
	            beatmap = _beatmap;

	            let hitObjectsOnScreen = [];
	            let alreadyAppeared = [];
	            let hitObjectIndex = 0;
	            let previousKeyStateK1 = false;
	            let previousKeyStateK2 = false;
	            let previousKeyStateM1 = false;
	            let previousKeyStateM2 = false;
	            let currentPresses = 0;
	            let currentReplayPoint = replay.replay_data[0];
	            let unstablerate = 0;
	            let errorearly = 0;
	            let errorlate = 0;
	            let allhits = [];
	            let allhitsraw = [];
	            let earlyhits = [];
	            let latehits = [];
	            let replayPoints = {};
	            let miss = 0;

	            let time = 0;

	            while(time <= beatmap.hitObjects[beatmap.hitObjects.length - 1].endTime){
	                try{
	                    replayPoints = getCursorAt(time, replay);
	                    currentReplayPoint = replayPoints.current;
	                }catch(e){
	                    helper.error(e);
	                }

	                if(currentReplayPoint.K1 && currentReplayPoint.K1 != previousKeyStateK1) currentPresses++;
	                if(currentReplayPoint.K2 && currentReplayPoint.K2 != previousKeyStateK2) currentPresses++;
	                if(currentReplayPoint.M1 && currentReplayPoint.M1 != previousKeyStateM1) currentPresses++;
	                if(currentReplayPoint.M2 && currentReplayPoint.M2 != previousKeyStateM2) currentPresses++;

	                previousKeyStateK1 = currentReplayPoint.K1;
	                previousKeyStateK2 = currentReplayPoint.K2;
	                previousKeyStateM1 = currentReplayPoint.M1;
	                previousKeyStateM2 = currentReplayPoint.M2;

	                if(beatmap.hitObjects[hitObjectIndex] != undefined && time >= beatmap.hitObjects[hitObjectIndex].startTime - beatmap.TimeFadein){
	                    hitObjectsOnScreen.push(beatmap.hitObjects[hitObjectIndex]);
	                    hitObjectIndex++;
	                }

	                hitObjectsOnScreen.sort(function(a, b){ return a.startTime - b.startTime; });

	                let hitRangeCircles = [];


	                for(var x = 0; x < hitObjectsOnScreen.length; x++){
	                    if(time >= hitObjectsOnScreen[x].startTime - beatmap.HitWindow50 && time <= hitObjectsOnScreen[x].startTime + beatmap.HitWindow50){
	                        hitObjectsOnScreen[x].masterIndex = x;
	                        if((hitObjectsOnScreen[x].objectName == "circle" || hitObjectsOnScreen[x].objectName == "slider") && !hitObjectsOnScreen[x].fadeOut) hitRangeCircles.push(hitObjectsOnScreen[x]);
	                    }
	                }

	                hitRangeCircles.sort(function(a, b){ return a.startTime - b.startTime; });

	                for(var x = currentPresses; x > 0; x--){
	                    let _currentPresses = currentPresses;
	                    currentPresses--;
	                    allhitsraw.push(currentReplayPoint.offset);
	                    if(hitRangeCircles.length > 0){
	                        if(withinCircle(currentReplayPoint.x, currentReplayPoint.y,
	                        hitRangeCircles[0].position[0], hitRangeCircles[0].position[1], beatmap.Radius)
	                        && !hitRangeCircles[0].hit
	                        ){
	                            hitRangeCircles[0].hit = true;
	                            let offsetraw = currentReplayPoint.offset - hitRangeCircles[0].startTime;
	                            let offset = Math.abs(offsetraw);

	                            if(offset <= beatmap.HitWindow50){
	                                allhits.push(offsetraw);
	                                if(offsetraw < 0) earlyhits.push(offsetraw);
	                                if(offsetraw >= 0) latehits.push(offsetraw);
	                            }

	                            let masterIndex = hitRangeCircles[0].masterIndex;

	                            hitObjectsOnScreen.splice(masterIndex, 1);
	                        }
	                    }
	                }

	                hitObjectsOnScreen.forEach(function(hitObject, index){
	                    if(time > hitObject.endTime + beatmap.HitWindow50){
							if(!hitObject.hit)
								miss++;
							
	                        hitObjectsOnScreen.splice(index, 1);
	                    }
	                });

	                hitObjectsOnScreen.reverse();

	                time = replayPoints.next.offset;
	            }

	            if(allhits.length > 0)
	                unstablerate = variance(allhits) * 10;

	            if(earlyhits.length > 0)
	                errorearly = math.mean(earlyhits);

	            if(latehits.length > 0)
	                errorlate  = math.mean(latehits);

	            cb(unstablerate);
			});
        });
    });
}

module.exports = {
    get_ur: calculateUr
};
