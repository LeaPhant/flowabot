const osuBeatmapParser = require('osu-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const lzma = require('lzma');
const helper = require('../helper.js');

let options, beatmap_path, enabled_mods, beatmap, speed_multiplier = 1;

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;

const STACK_DISTANCE = 3;
const OBJECT_RADIUS = 64;

const STACK_LENIENCE = 3;

const ar_ms_step1 = 120;
const ar_ms_step2 = 150;

const ar0_ms = 1800;
const ar5_ms = 1200;
const ar10_ms = 450;

const od_ms_step = 6;
const od0_ms = 79.5;
const od10_ms = 19.5;

const keys_enum = {
    "M1": Math.pow(2,0),
    "M2": Math.pow(2,1),
    "K1": Math.pow(2,2),
    "K2": Math.pow(2,3)
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

function coordsOnBezier(pointArray, t){
	var bx = 0, by = 0, n = pointArray.length - 1;

	if(n == 1){
		bx = (1 - t) * pointArray[0][0] + t * pointArray[1][0];
		by = (1 - t) * pointArray[0][1] + t * pointArray[1][1];
	}else if (n == 2){
		bx = (1 - t) * (1 - t) * pointArray[0][0] + 2 * (1 - t) * t * pointArray[1][0] + t * t * pointArray[2][0];
		by = (1 - t) * (1 - t) * pointArray[0][1] + 2 * (1 - t) * t * pointArray[1][1] + t * t * pointArray[2][1];
	}else if (n == 3){
		bx = (1 - t) * (1 - t) * (1 - t) * pointArray[0][0] + 3 * (1 - t) * (1 - t) * t * pointArray[1][0] + 3 * (1 - t) * t * t * pointArray[2][0] + t * t * t * pointArray[3][0];
		by = (1 - t) * (1 - t) * (1 - t) * pointArray[0][1] + 3 * (1 - t) * (1 - t) * t * pointArray[1][1] + 3 * (1 - t) * t * t * pointArray[2][1] + t * t * t * pointArray[3][1];
	}else{
		for(var i = 0; i <= n; i++){
			bx += binomialCoef(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i) * pointArray[i][0];
			by += binomialCoef(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i) * pointArray[i][1];
		}
    }

	return [bx,by];
}

function binomialCoef(n, k){
	var r = 1;

	if(k > n)
		return 0;

	for(var d = 1; d <= k; d++){
		r *= n--;
		r /= d;
	}

	return r;
}

function vectorDistance(hitObject1, hitObject2){
    return Math.sqrt((hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
        + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]));
}

function vectorDistanceSquared(hitObject1, hitObject2){
    return (hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
        + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]);
}

function difficultyRange(difficulty, min, mid, max){
    if(difficulty > 5)
        return mid + (max - mid) * (difficulty - 5) / 5;
    if(difficulty < 5)
        return mid - (mid - min) * (5 - difficulty) / 5;
    return mid;
}

function calculate_csarod(cs_raw, ar_raw, od_raw, mods_enabled){
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

	return {
		cs: cs,
		ar: ar,
		od: od
	}
}

function processBeatmap(cb){

    // AR
    beatmap.TimeFadein = difficultyRange(beatmap.ApproachRate, 1800, 1200, 450);
    beatmap.TimePreempt = difficultyRange(beatmap.ApproachRate, 1200, 800, 300);

    // OD
    beatmap.HitWindow50 = difficultyRange(beatmap.OverallDifficulty, 200, 150, 100);
    beatmap.HitWindow100 = difficultyRange(beatmap.OverallDifficulty, 140, 100, 60);
    beatmap.HitWindow300 = difficultyRange(beatmap.OverallDifficulty, 80, 50, 20);

    // CS
    beatmap.Scale = (1.0 - 0.7 * (beatmap.CircleSize - 5) / 5) / 2;
    beatmap.Radius = OBJECT_RADIUS * beatmap.Scale;
    beatmap.FollowpointRadius = beatmap.Radius * 3;

    beatmap.StackLeniency = parseFloat(beatmap.StackLeniency);

    if(beatmap.StackLeniency === undefined || beatmap.StackLeniency === NaN || beatmap.StackLeniency === null)
            beatmap.StackLeniency = 0.7;

    for(var i = 0; i <= beatmap.hitObjects.length - 1; i++){
        if(beatmap.hitObjects[i].objectName == "circle")
            beatmap.hitObjects[i].endPosition = beatmap.hitObjects[i].position;

        // HR inversion
        if(enabled_mods.includes("HR")){
            beatmap.hitObjects[i].position[1] = PLAYFIELD_HEIGHT - beatmap.hitObjects[i].position[1];
            if(beatmap.hitObjects[i].objectName == "slider"){
                beatmap.hitObjects[i].endPosition[1] = PLAYFIELD_HEIGHT - beatmap.hitObjects[i].endPosition[1];
                beatmap.hitObjects[i].points.forEach(function(point, index){
                    beatmap.hitObjects[i].points[index][1] = PLAYFIELD_HEIGHT - point[1];
                });
            }
        }

        // Stacking
        beatmap.hitObjects[i].StackHeight = 0;
    }

    var end = -1;
    var start = 0;
    let nObj = beatmap.hitObjects.length;
    while (end < 0)
      end += nObj;
    let stackThreshold = beatmap.TimeFadein * beatmap.StackLeniency;
    // helper.log("stack leniency:", stackLeniency);

    // reset stacking first
    for (let i = end; i >= start; --i)
      beatmap.hitObjects[i].stackHeight = 0;

    // just extend the end index in case it's not the base
    let extEnd = end;
    for (let i = end; i >= start; --i) {
      let stackBase = i;
      for (let n = stackBase + 1; n < nObj; ++n) {
        // bottom of the stack
        let stackBaseObj = beatmap.hitObjects[stackBase];
        if (stackBaseObj.objectName == "spinner")
          break;

        // current object
        let objN = beatmap.hitObjects[n];
        if (objN.objectName == "spinner")
          continue;

        // check if out of range
        if (objN.startTime - stackBaseObj.endTime > stackThreshold)
          break;

        if (vectorDistance(stackBaseObj.position, objN.position) < STACK_LENIENCE ||
            (stackBaseObj.objectName == "slider" &&
             vectorDistance(stackBaseObj.endPosition, objN.position) <
                 STACK_LENIENCE)) {
          stackBase = n;
          beatmap.hitObjects[n].stackHeight = 0;
        }
      }
      if (stackBase > extEnd) {
        extEnd = stackBase;
        if (extEnd == nObj - 1)
          break;
      }
    }

    // actually build the stacks now :D
    let extStart = start;
    for (let i = extEnd; i > start; --i) {
      let n = i;
      if (beatmap.hitObjects[i].stackHeight != 0 ||
          beatmap.hitObjects[i].objectName == "spinner")
        continue;

      let j = i;
      if (beatmap.hitObjects[i].objectName == "circle") {
        while (--n >= 0) {
          let objN = beatmap.hitObjects[n];
          if (objN.objectName == "spinner")
            continue;
          if (beatmap.hitObjects[j].startTime - objN.endTime > stackThreshold)
            break;
          if (n < extStart) {
            beatmap.hitObjects[n].stackHeight = 0;
            extStart = n;
          }
          if (objN.objectName == "slider" &&
              vectorDistance(objN.endPosition, beatmap.hitObjects[j].position) <
                  STACK_LENIENCE) {
            let offset = beatmap.hitObjects[j].stackHeight - objN.stackHeight + 1;
            for (let j = n + 1; j <= i; ++j) {
              let objJ = beatmap.hitObjects[j];
              if (vectorDistance(objN.endPosition, objJ.position) < STACK_LENIENCE)
                objJ.stackHeight -= offset;
            }
            break;
          }
          if (vectorDistance(objN.position, beatmap.hitObjects[j].position) <
              STACK_LENIENCE) {
            beatmap.hitObjects[n].stackHeight = beatmap.hitObjects[j].stackHeight + 1;
            // helper.log("new stack height =", objN.stackHeight);
            j = n;
          }
        }
      } else if (beatmap.hitObjects[i].objectName == "slider") {
        while (--n >= start) {
          let objN = beatmap.hitObjects[n];
          if (objN.objectName == "spinner")
            continue;
          if (beatmap.hitObjects[j].startTime - objN.endTime > stackThreshold)
            break;
          if (vectorDistance(objN.endPosition, beatmap.hitObjects[j].position) <
              STACK_LENIENCE) {
                beatmap.hitObjects[n].stackHeight = beatmap.hitObjects[j].stackHeight + 1;
            }
            // helper.log("new stack height =", objN.stackHeight);
            j = n;
        }
      }
    }

    var currentCombo = 1;
    var currentComboNumber = 0;

    beatmap.hitObjects.forEach(function(hitObject, i){
        if(hitObject.newCombo){
            currentCombo++;
            currentComboNumber = 0;
            if(currentCombo > 4) currentCombo = 1;
        }
        currentComboNumber++;
        beatmap.hitObjects[i].Color = "rgba(" + beatmap["Combo" + currentCombo] + ",0.6)";
        beatmap.hitObjects[i].ComboNumber = currentComboNumber;
        beatmap.hitObjects[i].StackOffset = hitObject.stackHeight * beatmap.Scale * -6.4;
        beatmap.hitObjects[i].position = [hitObject.position[0] + hitObject.StackOffset, hitObject.position[1] + hitObject.StackOffset];

        if(hitObject.objectName == "slider"){
            hitObject.endPosition = [hitObject.endPosition[0] + hitObject.StackOffset, hitObject.endPosition[1] + hitObject.StackOffset];
            hitObject.points.forEach(function(point, index){
                hitObject.points[index] = [point[0] + hitObject.StackOffset, point[1] + hitObject.StackOffset];
            });
        }
    });

    beatmap.hitObjects.forEach(function(hitObject, i){
        if(hitObject.objectName == "slider"){
            var slider_parts = [];
            var slider_part = [];
            var timingPoint;

            let slider_dots = [];

            for(var x = 0; x < beatmap.timingPoints.length; x++){
                timingPoint = beatmap.timingPoints[x];
                if(timingPoint.offset <= hitObject.startTime) break;
            }

            if(hitObject.curveType == 'pass-through' && hitObject.points.length == 3){
                // Pretty much copied from osu-lazer https://github.com/ppy/osu-framework/blob/master/osu.Framework/MathUtils/PathApproximator.cs#L114

                let a = hitObject.points[0];
                let b = hitObject.points[1];
                let c = hitObject.points[2];

                let aSq = vectorDistanceSquared(b, c);
                let bSq = vectorDistanceSquared(a, c);
                let cSq = vectorDistanceSquared(a, b);

                if(aSq != 0 && bSq != 0 && bSq != 0){
                    let s = aSq * (bSq + cSq - aSq);
                    let t = bSq * (aSq + cSq - bSq);
                    let u = cSq * (aSq + bSq - cSq);

                    let sum = s + t + u;

                    if(sum != 0){
                        let center = [
                            s * a[0] + t * b[0] + u * c[0],
                            s * a[1] + t * b[1] + u * c[1]
                        ];

                        center = [
                            center[0] / sum,
                            center[1] / sum
                        ];

                        let dA = [
                            a[0] - center[0],
                            a[1] - center[1]
                        ];

                        let dC = [
                            c[0] - center[0],
                            c[1] - center[1]
                        ];

                        let r = vectorDistance(a, center);

                        let thetaStart = Math.atan2(dA[1], dA[0]);
                        let thetaEnd = Math.atan2(dC[1], dC[0]);

                        while(thetaEnd < thetaStart)
                            thetaEnd += 2 * Math.PI;

                        let dir = 1;
                        let thetaRange = thetaEnd - thetaStart;

                        let orthoAtoC = [
                            c[0] - a[0],
                            c[1] - a[1]
                        ];

                        orthoAtoC = [
                            orthoAtoC[1],
                            -orthoAtoC[0]
                        ];

                        let bMinusA = [
                            b[0] - a[0],
                            b[1] - a[1]
                        ];

                        if(orthoAtoC[0] * bMinusA[0] + orthoAtoC[1] * bMinusA[1] < 0){
                            dir = -dir;
                            thetaRange = 2 * Math.PI - thetaRange;
                        }

                        let amountPoints = 1000;

                        for(let i = 0; i < amountPoints; ++i){
                            let fract = i / (amountPoints - 1);
                            let theta = thetaStart + dir * fract * thetaRange;

                            let o = [
                                Math.cos(theta),
                                Math.sin(theta)
                            ];

                            o = [
                                o[0] * r,
                                o[1] * r
                            ];

                            slider_dots.push([
                                center[0] + o[0],
                                center[1] + o[1]
                            ]);
                        }
                    }
                }
            }else{
                hitObject.points.forEach(function(point, index){
                    slider_part.push(point);
                    if(index < hitObject.points.length - 1){
                        if(point[0] == hitObject.points[index + 1][0] && point[1] == hitObject.points[index + 1][1]){
                            slider_parts.push(slider_part);
                            slider_part = [];
                        }
                    }else if(hitObject.points.length - 1 == index){
                        slider_part.push(point);
                        slider_parts.push(slider_part);
                    }
                });

                var last_slider_dot;

                slider_parts.forEach(function(part, index){
                    for(var x = 0; x <= 1; x += 0.001){
                        var slider_dot = coordsOnBezier(part, x);
                        if(last_slider_dot){
                            if(vectorDistanceSquared(slider_dot, last_slider_dot) >= 1){
                                slider_dots.push(slider_dot);
                                last_slider_dot = slider_dot;
                            }
                        }else{
                            slider_dots.push(slider_dot);
                            last_slider_dot = slider_dot;
                        }
                    }
                });
            }

            var slider_ticks = [];

            for(var x = timingPoint.beatLength /  beatmap.SliderTickRate; x < hitObject.duration; x += timingPoint.beatLength / beatmap.SliderTickRate){
                slider_ticks.push(slider_dots[Math.floor((x / hitObject.duration) * (slider_dots.length - 1))]);
            }

            slider_ticks.pop();

            beatmap.hitObjects[i].SliderDots = slider_dots;
            beatmap.hitObjects[i].SliderTicks = slider_ticks;
        }
    });

    beatmap.hitObjects.forEach(function(hitObject, i){
        if(hitObject.objectName == "circle")
            beatmap.hitObjects[i].endTime = beatmap.hitObjects[i].startTime;
    });

    cb();
}

function prepareBeatmap(cb){
    osuBeatmapParser.parseFile(beatmap_path, function(err, _beatmap){
        if(err)
            throw err;

        beatmap = _beatmap;

        let replay;

        if(options.score_id){
            let replay_path = path.resolve(os.tmpdir(), 'replays', `${options.score_id}`);

            if(fs.existsSync(replay_path))
                replay = {lastCursor: 0, replay_data: parseReplay(fs.readFileSync(replay_path))};
        }

        speed_multiplier = 1;

        if(enabled_mods.includes("DT")){
            speed_multiplier = 1.5;
        }else if(enabled_mods.includes("HT")){
            speed_multiplier = 0.75;
        }

        let {cs, ar, od} = calculate_csarod(beatmap.CircleSize, beatmap.ApproachRate, beatmap.OverallDifficulty, enabled_mods);

        beatmap.CircleSize = cs;
        beatmap.ApproachRate = ar;
        beatmap.OverallDifficulty = od;

        if(replay){
            beatmap.Replay = replay;
            helper.log('score has replay');
        }else{
            helper.log('score has no replay');
        }

        if(!isNaN(options.cs) && !(options.cs === undefined))
            beatmap.CircleSize = options.cs;

        if(!isNaN(options.ar) && !(options.ar === undefined))
            beatmap.ApproachRate = options.ar;

        processBeatmap(cb);
    });
}

process.on('message', obj => {
    ({beatmap_path, options, enabled_mods} = obj);

    prepareBeatmap(() => {
        process.send(beatmap, () => {
            process.exit();
        });
    })
});
