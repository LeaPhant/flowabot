const osuBeatmapParser = require('osu-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const osr = require('node-osr');
const axios = require('axios');
const helper = require('../helper.js');

let options, beatmap_path, enabled_mods, beatmap, speed_override;

const PLAYFIELD_HEIGHT = 384;

const CATMULL_DETAIL = 50;
const CIRCULAR_ARC_TOLERANCE = 0.1;
const BEZIER_DETAIL = 100;

const STACK_DISTANCE = 3;

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
    "K2": Math.pow(2,3),
    "S": Math.pow(2,4)
}

function parseKeysPressed(num){
    let keys = Number(num);
    let output_keys = {
        K1: false,
        K2: false,
        M1: false,
        M2: false,
        S: false
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

function getCursor(replay){
    replay.lastCursor++;

    return { 
        previous: replay.replay_data[replay.lastCursor - 1],
        current: replay.replay_data[replay.lastCursor]
    };
}

async function parseReplay(buf, decompress = true){
    let replay_data = buf;

    if(decompress)
        replay_data = (await osr.read(buf)).replay_data;
        //replay_data = (await lzma.decompress(replay_data)).toString();
        
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

function withinCircle(x, y, centerX,  centerY, radius){
    return Math.pow((x - centerX), 2) + Math.pow((y - centerY), 2) < Math.pow(radius, 2);
}

function catmullFindPoint(vec1, vec2, vec3, vec4, t){
    let t2 = t * t;
    let t3 = t * t2;

    return [
        0.5 * (2 * vec2[0] + (-vec1[0] + vec3[0]) * t + (2 * vec1[0] - 5 * vec2[0] + 4 * vec3[0] - vec4[0]) * t2 + (-vec1[0] + 3 * vec2[0] - 3 * vec3[0] + vec4[0]) * t3),
        0.5 * (2 * vec2[1] + (-vec1[1] + vec3[1]) * t + (2 * vec1[1] - 5 * vec2[1] + 4 * vec3[1] - vec4[1]) * t2 + (-vec1[1] + 3 * vec2[1] - 3 * vec3[1] + vec4[1]) * t3)
    ];
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

function vectorSubtract(a, b){
    return [
        a[0] - b[0],
        a[1] - b[1]
    ];
}

function vectorAdd(a, b){
    return [
        a[0] + b[0],
        a[1] + b[1]
    ];
}

function vectorMultiply(a, m){
    return [
        a[0] * m,
        a[1] * m
    ];
}

function vectorDivide(a, d){
    return [
        a[0] / d,
        a[1] / d
    ];
}

function vectorDistanceSquared(hitObject1, hitObject2){
    return (hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
        + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]);
}

function calculate_csarod(cs_raw, ar_raw, od_raw, mods_enabled){
	let speed = 1, ar_multiplier = 1, ar, ar_ms;

	if(mods_enabled.includes("DT") || mods_enabled.includes("NC")){
		speed *= 1.5;
	}else if(mods_enabled.includes("HT") || mods_enabled.includes("DC")){
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

	return { cs, ar, od };
}

function getTimingPoint(timingPoints, offset){
    let timingPoint = timingPoints[0];

    for(let x = timingPoints.length - 1; x >= 0; x--){
        if(timingPoints[x].offset <= offset){
            timingPoint = timingPoints[x];
            break;
        }
    }

    return timingPoint;
}

function variance(array){
    let sum = 0;
    array.forEach(a => sum += a);
    
	const avg = sum / array.length;
    let _sum = 0;
    let _array = array.map(function(a){ return Math.pow(a - avg, 2); });
    
    _array.forEach(a => _sum += a);

	return Math.sqrt(_sum / _array.length);
}

function processBeatmap(){

    if(beatmap.ApproachRateRealtime < 5){
        beatmap.TimeFadein = 1200 + 600 * (5 - beatmap.ApproachRateRealtime) / 5;
        beatmap.TimePreempt = 1200 + 600 * (5 - beatmap.ApproachRateRealtime) / 5;
    }else if(beatmap.ApproachRateRealtime == 5){
        beatmap.TimeFadein = 800;
        beatmap.TimePreempt = 1200;
    }else{
        beatmap.TimeFadein = 800 - 500 * (beatmap.ApproachRateRealtime - 5) / 5;
        beatmap.TimePreempt = 1200 - 750 * (beatmap.ApproachRateRealtime - 5) / 5;
    }

    if(options.ar == null){
        if(['DT', 'NC'].includes(enabled_mods)){
            beatmap.TimeFadein /= 1.5;
            beatmap.TimePreempt /= 1.5;
        }else if(['HT', 'DC'].includes(enabled_mods)){
            beatmap.TimeFadein /= 0.75;
            beatmap.TimePreempt /= 0.75;
        }
    }

    if(enabled_mods.includes("HD") && options.hidden)
        beatmap.TimeFadein = beatmap.TimePreempt * 0.4;

    // OD
    beatmap.HitWindow300 = (50 + 30 * (5  - beatmap.OverallDifficultyRealtime) / 5) - 0.5;
    beatmap.HitWindow100 = (100 + 40 * (5  - beatmap.OverallDifficultyRealtime) / 5) - 0.5;
    beatmap.HitWindow50 = (150 + 50 * (5  - beatmap.OverallDifficultyRealtime) / 5) - 0.5;

    // CS
    beatmap.Scale = (1.0 - 0.7 * (beatmap.CircleSize - 5) / 5) / 2;
    beatmap.Radius = 23.05 - (beatmap.CircleSize - 7) * 4.4825;
    beatmap.FollowpointRadius = beatmap.Radius * 2;
    beatmap.ActualFollowpointRadius = beatmap.Radius * 2.4;

    beatmap.StackLeniency = parseFloat(beatmap.StackLeniency);

    if(isNaN(beatmap.StackLeniency))
        beatmap.StackLeniency = 0.7;

    // HR inversion
    beatmap.hitObjects.forEach((hitObject, i) => {
        if(enabled_mods.includes("HR")){
            hitObject.position[1] = PLAYFIELD_HEIGHT - hitObject.position[1];

            if(hitObject.objectName == "slider"){
                for(let x = 0; x < hitObject.points.length; x++)
                    hitObject.points[x][1] = PLAYFIELD_HEIGHT - hitObject.points[x][1];
            }
        }
    });

    // Calculate slider curves
    beatmap.hitObjects.forEach((hitObject, i) => {
        if(hitObject.objectName == "slider"){
            let slider_parts = [];
            let slider_part = [];

            let slider_dots = [];

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

                        center = vectorDivide(center, sum);

                        let dA = vectorSubtract(a, center);
                        let dC = vectorSubtract(c, center);

                        let r = vectorDistance(a, center);

                        let thetaStart = Math.atan2(dA[1], dA[0]);
                        let thetaEnd = Math.atan2(dC[1], dC[0]);

                        while(thetaEnd < thetaStart)
                            thetaEnd += 2 * Math.PI;

                        let dir = 1;
                        let thetaRange = thetaEnd - thetaStart;

                        let orthoAtoC = vectorSubtract(c, a);

                        orthoAtoC = [
                            orthoAtoC[1],
                            -orthoAtoC[0]
                        ];

                        let bMinusA = vectorSubtract(b, a);

                        if(orthoAtoC[0] * bMinusA[0] + orthoAtoC[1] * bMinusA[1] < 0){
                            dir = -dir;
                            thetaRange = 2 * Math.PI - thetaRange;
                        }

                        let amountPoints = Math.max(25, 2 * r <= CIRCULAR_ARC_TOLERANCE ? 2 : Math.max(2, Math.ceil(thetaRange / (2 * Math.acos(1 - CIRCULAR_ARC_TOLERANCE / r)))));

                        for(let i = 0; i < amountPoints; ++i){
                            let fract = i / (amountPoints - 1);
                            let theta = thetaStart + dir * fract * thetaRange;

                            let o = [
                                Math.cos(theta),
                                Math.sin(theta)
                            ];

                            o = vectorMultiply(o, r);

                            slider_dots.push(vectorAdd(center, o));
                        }
                    }else{
                        slider_dots = hitObject.points.slice();
                    }
                }else{
                    slider_dots = hitObject.points.slice();
                }
            }else if(hitObject.curveType == 'catmull'){
                // Pretty much copied from osu-lazer https://github.com/ppy/osu-framework/blob/master/osu.Framework/MathUtils/PathApproximator.cs#L89

                for(let x = 0; x < hitObject.points.length - 1; x++){
                    let v1 = x > 0 ? hitObject.points[x - 1] : hitObject.points[x];
                    let v2 = hitObject.points[x];
                    let v3 = x < hitObject.points.length - 1 ? hitObject.points[x + 1] : vectorSubtract(vectorAdd(v2, v2), v1);
                    let v4 = x < hitObject.points.length - 2 ? hitObject.points[x + 2] : vectorSubtract(vectorAdd(v3, v3), v2);

                    for(let c = 0; c < CATMULL_DETAIL; c++){
                        slider_dots.push(
                            catmullFindPoint(v1, v2, v3, v4, c / CATMULL_DETAIL),
                            catmullFindPoint(v1, v2, v3, v4, (c + 1) / CATMULL_DETAIL)
                        );
                    }
                }
            }else{
                hitObject.points.forEach((point, index) => {
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

                slider_parts.forEach((part, index) => {
                    if(part.length == 2){
                        slider_dots.push(part[0], part[1])
                    }else{
                        for(let x = 0; x <= 1; x += 1 / BEZIER_DETAIL)
                            slider_dots.push(coordsOnBezier(part, x));
                    }
                });
            }

            hitObject.SliderDots = slider_dots;
        }
    });

    // Interpolate slider dots
    beatmap.hitObjects.forEach((hitObject, i) => {
        if(hitObject.objectName != 'slider')
            return;

        if(hitObject.SliderDots.length < 2)
            return;

        let slider_dots = [];

        let pos_current = hitObject.SliderDots[0];
        let next_index = 1;
        let pos_next = hitObject.SliderDots[next_index];
        let length = 0;

        while(next_index < hitObject.SliderDots.length - 1 && length < hitObject.pixelLength){
            while(vectorDistanceSquared(pos_current, pos_next) < 1 * 1 && next_index < hitObject.SliderDots.length - 1){
                next_index++;
                pos_next = hitObject.SliderDots[next_index];
            }

            let distance = vectorDistance(pos_current, pos_next);

            if(distance >= 1){
                let pos_interpolated = [
                    pos_current[0] + (1 / distance) * (pos_next[0] - pos_current[0]),
                    pos_current[1] + (1 / distance) * (pos_next[1] - pos_current[1])
                ];

                slider_dots.push(pos_interpolated);

                pos_current = pos_interpolated;
                length++;
            }
        }

        const turnDuration = hitObject.duration / hitObject.repeatCount;

        if(turnDuration < 72){
            hitObject.actualEndPosition = slider_dots[Math.floor(slider_dots.length / 2 - 1)];
            hitObject.actualEndTime = hitObject.startTime + (hitObject.repeatCount - 1) * turnDuration + turnDuration / 2;
        }else{
            const sliderDotDuration = turnDuration / slider_dots.length;

            const turnSliderDots = hitObject.repeatCount % 2 == 0 ? slider_dots.slice().reverse() : slider_dots;

            hitObject.actualEndTime = hitObject.endTime - 36;
            hitObject.actualEndPosition = turnSliderDots[Math.floor(turnSliderDots.length - 1 - 36 / sliderDotDuration)];
        }

        hitObject.SliderDots = slider_dots;
    });

    // Generate slider ticks and apply lazy end position
    beatmap.hitObjects.forEach((hitObject, i) => {
        hitObject.StackHeight = 0;

        if(hitObject.objectName == "circle")
            hitObject.endTime = hitObject.startTime;

        if(hitObject.objectName == "spinner"){
            hitObject.duration = hitObject.endTime - hitObject.startTime;

            let spinsPerSecond = 5;

            if(beatmap.OverallDifficultyRealtime > 5)
                spinsPerSecond = 5 + 2.5 * (beatmap.OverallDifficultyRealtime - 5) / 5;
            else
                spinsPerSecond = 5 - 2 * (5 - beatmap.OverallDifficultyRealtime) / 5;

            beatmap.spinsRequired = spinsPerSecond * hitObject.duration;
        }

        hitObject.latestHit = hitObject.startTime + beatmap.HitWindow50;

        if(hitObject.objectName == "slider")
            hitObject.latestHit = Math.min(hitObject.latestHit, hitObject.endTime);

        let timingPoint = getTimingPoint(beatmap.timingPoints, hitObject.startTime);

        if(hitObject.objectName == "circle")
            hitObject.endPosition = hitObject.position;

        if(hitObject.objectName == 'slider'){
            hitObject.endPosition = hitObject.SliderDots[hitObject.SliderDots.length - 1];

            // How far away you can stay away from the slider end without missing it
            let lazyEndOffset = Math.floor(beatmap.ActualFollowpointRadius);

            if(hitObject.SliderDots.length < lazyEndOffset){
                hitObject.lazyEndPosition = hitObject.endPosition;
                hitObject.lazyStay = true;
            }else if(hitObject.repeatCount == 1){
                hitObject.lazyEndPosition = hitObject.SliderDots[hitObject.SliderDots.length - 1 - lazyEndOffset];
            }else if(Math.floor((hitObject.SliderDots.length - 1) / 2) < lazyEndOffset){
                hitObject.lazyEndPosition = hitObject.SliderDots[Math.floor((hitObject.SliderDots.length - 1) / 2)];
                hitObject.lazyStay = true;
            }

            let slider_ticks = [];

            let scoringDistance = 100 * beatmap.SliderMultiplier * hitObject.velocity;

            let tickDistance = scoringDistance / beatmap.SliderTickRate;

            for(let x = tickDistance; x < hitObject.pixelLength; x += tickDistance){
                let position = hitObject.SliderDots[Math.floor(x)];

                if(!Array.isArray(position) || position.length != 2)
                    continue;

                let turnDuration = hitObject.duration / hitObject.repeatCount;

                let offset = (x / hitObject.pixelLength) * turnDuration;

                // Don't render slider tick on slider end
                if(Math.round(x) != hitObject.pixelLength)
                    slider_ticks.push({
                        offset: offset,
                        reverseOffset: turnDuration - offset,
                        position
                    });
            }

            hitObject.SliderTicks = slider_ticks;
        }
    });

    const stackThreshold = beatmap.TimePreempt * beatmap.StackLeniency;

    if(Number(beatmap.fileFormat.slice(1)) >= 6){
        let startIndex = 0;
        let endIndex = beatmap.hitObjects.length - 1;

        let extendedEndIndex = endIndex;
        let extendedStartIndex = startIndex;

        for(let i = extendedEndIndex; i > startIndex; i--){
            let n = i;

            let objectI = beatmap.hitObjects[i];
            
            if(objectI.StackHeight != 0 || objectI.objectName == 'spinner')
                continue;

            if(objectI.objectName == 'circle'){
                while(--n >= 0){
                    const objectN = beatmap.hitObjects[n];

                    if(objectN.objectName == 'spinner')
                        continue;

                    const { endTime } = objectN;

                    if(objectI.startTime - endTime > stackThreshold)
                        break;

                    if(n < extendedStartIndex){
                        objectN.StackHeight = 0;
                        extendedStartIndex = n;
                    }

                    if(objectN.objectName == 'slider' && vectorDistance(objectN.endPosition, objectI.position) < STACK_DISTANCE){
                        const offset = objectI.StackHeight - objectN.StackHeight + 1;

                        for(let j = n + 1; j <= i; j++){
                            const objectJ = beatmap.hitObjects[j];

                            if(vectorDistance(objectN.endPosition, objectJ.position) < STACK_DISTANCE)
                                objectJ.StackHeight -= offset;
                        }

                        break;
                    }

                    if(vectorDistance(objectN.position, objectI.position) < STACK_DISTANCE){
                        objectN.StackHeight = objectI.StackHeight + 1;
                        objectI = objectN;
                    }
                }
            }else if(objectI.objectName == 'slider'){
                while(--n >= startIndex){
                    const objectN = beatmap.hitObjects[n];

                    if(objectN.objectName == 'spinner')
                        continue;

                    if(objectI.startTime - objectN.startTime > stackThreshold)
                        break;

                    if(vectorDistance(objectN.endPosition, objectI.position) < STACK_DISTANCE){
                        objectN.StackHeight = objectI.StackHeight + 1;
                        objectI = objectN;
                    }
                }
            }
        }
    }else{
        for(let i = 0; i < beatmap.hitObjects.length; i++){
            const currHitObject = beatmap.hitObjects[i];

            if(currHitObject.StackHeight != 0 && currHitObject.objectName != 'slider')
                continue;

            let startTime = currHitObject.endTime;
            let sliderStack = 0;

            for(let j = i + 1; j < beatmap.hitObjects.length; j++){
                if(beatmap.hitObjects[j].startTime - stackThreshold > startTime)
                    break;

                const position2 = currHitObject.position;

                if(vectorDistance(beatmap.hitObjects[j].position, currHitObject.position) < STACK_DISTANCE){
                    currHitObject.StackHeight++;
                    startTime = beatmap.hitObjects[j].endTime;
                }else if(vectorDistance(beatmap.hitObjects[j].position, position2) < STACK_DISTANCE){
                    sliderStack++;
                    beatmap.hitObjects[j].StackHeight -= sliderStack;
                    startTime = beatmap.hitObjects[j].endTime;
                }
            }
        }
    }    

     // Set stacking offset
     beatmap.hitObjects.forEach((hitObject, i) => {

        hitObject.StackOffset = hitObject.StackHeight * beatmap.Scale * -6.4;
        hitObject.position = [hitObject.position[0] + hitObject.StackOffset, hitObject.position[1] + hitObject.StackOffset];

        if(hitObject.objectName == "slider"){
            hitObject.endPosition = [hitObject.endPosition[0] + hitObject.StackOffset, hitObject.endPosition[1] + hitObject.StackOffset];

            for(let x = 0; x < hitObject.SliderDots.length; x++){
                if(!Array.isArray(hitObject.SliderDots[x]) || hitObject.SliderDots[x].length != 2)
                    continue;

                hitObject.SliderDots[x] = [
                    hitObject.SliderDots[x][0] + hitObject.StackOffset,
                    hitObject.SliderDots[x][1] + hitObject.StackOffset
                ];
            }

            for(let x = 0; x < hitObject.SliderTicks.length; x++){
                if(!Array.isArray(hitObject.SliderTicks[x].position) || hitObject.SliderTicks[x].position.length != 2)
                    continue;

                hitObject.SliderTicks[x].position = [
                    hitObject.SliderTicks[x].position[0] + hitObject.StackOffset,
                    hitObject.SliderTicks[x].position[1] + hitObject.StackOffset
                ];
            }
        }
    });
    
    const allhits = [];

    for(let i = 0; i < beatmap.hitObjects.length; i++){
        const hitObject = beatmap.hitObjects[i];

        if(hitObject.objectName == 'spinner')
            continue; // process spinners later

        let nextFrame, previous, current;

        let currentPresses = 0;

        do{
            nextFrame = getCursor(beatmap.Replay);

            ({ previous, current } = nextFrame);

            if(current != null && current.offset > hitObject.latestHit){
                beatmap.Replay.lastCursor--;
                break;
            }

            if(current == null || current.offset < hitObject.startTime - beatmap.HitWindow50)
                continue;

            if((current.K1 || current.M1) 
            && previous.K1 == false 
            && previous.M1 == false)
                currentPresses++;

            if((current.K2 || current.M2) 
            && previous.K2 == false 
            && previous.M2 == false)
                currentPresses++;

            if(hitObject.objectName == 'circle' || hitObject.objectName == 'slider'){
                while(currentPresses > 0){
                    currentPresses--;

                    let offsetRaw = current.offset - hitObject.startTime;
                    let offset = Math.abs(offsetRaw);

                    if(withinCircle(current.x, current.y, ...hitObject.position, beatmap.Radius)){
                        let hitResult = 0;
                        if(offset <= beatmap.HitWindow300)
                            hitResult = 300;
                        else if(offset <= beatmap.HitWindow100)
                            hitResult = 100;
                        else if(offset <= beatmap.HitWindow50)
                            hitResult = 50;
                        else
                            hitResult = 0;

                        hitObject.hitOffset = offsetRaw;

                        if(hitObject.objectName == 'slider')
                            hitResult = hitResult > 0 ? 50 : 0;

                        hitObject.hitResult = hitResult;
                        if(hitResult > 0)
                            allhits.push(offsetRaw);
                    }
                }

                if(hitObject.hitResult != null)
                    break;
            }
        }while(current != null && current.offset < hitObject.latestHit);
    }

    return variance(allhits) * 10;
}

async function prepareBeatmap(){
    const osuContents = await fs.promises.readFile(beatmap_path, 'utf8');

    beatmap = osuBeatmapParser.parseContent(osuContents);

    beatmap.CircleSize = beatmap.CircleSize != null ? beatmap.CircleSize : 5;
    beatmap.OverallDifficulty = beatmap.OverallDifficulty != null ? beatmap.OverallDifficulty : 5;
    beatmap.ApproachRate = beatmap.ApproachRate != null ? beatmap.ApproachRate : beatmap.OverallDifficulty;

    let replay;

    if(options.score_id){
        let replay_path = path.resolve(os.tmpdir(), 'replays', `${options.score_id}`);

        if(fs.existsSync(replay_path))
            replay = {lastCursor: 0, replay_data: await parseReplay(fs.readFileSync(replay_path))};
    }

    if(options.osr){
        try{
            const response = await axios.get(options.osr, { timeout: 5000, responseType: 'arraybuffer' });

            const parsedOsr = await osr.read(response.data);

            replay = {lastCursor: 0, replay_data: await parseReplay(parsedOsr.replay_data, false)};
        }catch(e){
            console.error(e);

            throw "Couldn't download replay";
        }
    }

    speed_multiplier = 1;

    if(enabled_mods.includes("DT")){
        speed_multiplier = 1.5;
    }else if(enabled_mods.includes("HT")){
        speed_multiplier = 0.75;
    }

    if(speed_override)
        speed_multiplier = speed_override;

    const {cs, ar, od} = calculate_csarod(beatmap.CircleSize, beatmap.ApproachRate, beatmap.OverallDifficulty, enabled_mods);
    const realtime = calculate_csarod(beatmap.CircleSize, beatmap.ApproachRate, beatmap.OverallDifficulty, 
        enabled_mods.filter(a => ['DT', 'HT', 'NC', 'DC'].includes(a) == false));

    beatmap.CircleSize = cs;

    beatmap.ApproachRateRealtime = realtime.ar;
    beatmap.ApproachRate = ar;

    beatmap.OverallDifficultyRealtime = realtime.od;
    beatmap.OverallDifficulty = od;

    if(replay){
        beatmap.Replay = replay;
        helper.log('score has replay');
    }else{
        helper.log('score has no replay, will generate auto replay');
    }

    if(!isNaN(options.cs) && !(options.cs === undefined))
        beatmap.CircleSize = options.cs;

    if(!isNaN(options.ar) && !(options.ar === undefined)){
        beatmap.ApproachRateRealtime = options.ar;
        beatmap.ApproachRate = options.ar;
    }

    if(!isNaN(options.od) && !(options.od === undefined)){
        beatmap.OverallDifficulty = options.od;
        beatmap.OverallDifficultyRealtime = options.od;
    }
}

async function calculate_ur(obj) {
    beatmap_path = obj.beatmap_path;
    options = obj.options;
    enabled_mods = obj.enabled_mods;

    await prepareBeatmap();
    const ur = processBeatmap();
    return ur;
}

module.exports = {
    calculate_ur,
}