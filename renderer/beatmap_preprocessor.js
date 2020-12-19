const osuBeatmapParser = require('osu-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const lzma = require('lzma');
const ojsama = require('ojsama');
const _ = require('lodash');
const helper = require('../helper.js');

let options, beatmap_path, enabled_mods, beatmap, speed_override, speed_multiplier = 1;

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;

const MAX_RADIAN = 360 * (Math.PI / 180);

const CATMULL_DETAIL = 50;
const CIRCULAR_ARC_TOLERANCE = 0.1;
const BEZIER_DETAIL = 100;

const STACK_DISTANCE = 3;
const OBJECT_RADIUS = 64;

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

function newScoringFrame(scoringFrames){
    const defaultFrame = {ur: 0, offset: 0, count300: 0, count100: 0, count50: 0, countMiss: 0, combo: 0, previousCombo: 0, maxCombo: 0};

    let scoringFrame = {...defaultFrame};

    if(scoringFrames.length > 0)
        scoringFrame = Object.assign(scoringFrame, scoringFrames[scoringFrames.length - 1]);

    scoringFrame.previousCombo = scoringFrame.combo;

    return scoringFrame;
}

function getCursorAt(timestamp, replay){
    while(replay.lastCursor < replay.replay_data.length && replay.replay_data[replay.lastCursor].offset < timestamp)
        replay.lastCursor++;

    let current = replay.replay_data[replay.lastCursor];
    let previous = replay.replay_data[replay.lastCursor - 1];

    if(current === undefined || next === undefined){
        if(replay.replay_data.length > 0){
            return {
                previous: replay.replay_data[replay.replay_data.length],
                current: replay.replay_data[replay.replay_data.length]
            }
        }else{
            return {
                previous: {
                    x: 0,
                    y: 0
                },
                next: {
                    x: 0,
                    y: 0
                }
            }
        }
    }

    return {previous, current};
}

function getCursor(replay){
    replay.lastCursor++;

    return { 
        previous: replay.replay_data[replay.lastCursor - 1],
        current: replay.replay_data[replay.lastCursor]
    };
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

function difficultyRange(difficulty, min, mid, max){
    if(difficulty > 5)
        return mid + (max - mid) * (difficulty - 5) / 5;
    if(difficulty < 5)
        return mid - (mid - min) * (5 - difficulty) / 5;
    return mid;
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

function getCursorAtRaw(replay, time){
    let lastIndex = replay.replay_data.findIndex(a => a.offset >= time) - 1;

    return replay.replay_data[lastIndex] || replay.replay_data[replay.replay_data.length - 1];
}

function processBeatmap(osuContents){
    // AR
    //beatmap.TimeFadein = difficultyRange(beatmap.ApproachRate, 1800, 1200, 450);
    //beatmap.TimePreempt = difficultyRange(beatmap.ApproachRate, 1200, 800, 300);

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

    // OD
    beatmap.HitWindow300 = (50 + 30 * (5  - beatmap.OverallDifficultyRealtime) / 5) - 0.5;
    beatmap.HitWindow100 = (100 + 40 * (5  - beatmap.OverallDifficultyRealtime) / 5) - 0.5;
    beatmap.HitWindow50 = (150 + 50 * (5  - beatmap.OverallDifficultyRealtime) / 5) - 0.5;

    console.log('hit window 300', beatmap.HitWindow300);
    console.log('hit window 100', beatmap.HitWindow100);
    console.log('hit window 50', beatmap.HitWindow50);

    // CS
    beatmap.Scale = (1.0 - 0.7 * (beatmap.CircleSize - 5) / 5) / 2;
    beatmap.Radius = OBJECT_RADIUS * beatmap.Scale;
    beatmap.FollowpointRadius = beatmap.Radius * 2;
    beatmap.ActualFollowpointRadius = beatmap.Radius * 2.4;

    beatmap.StackLeniency = parseFloat(beatmap.StackLeniency);

    if(beatmap.StackLeniency === undefined || beatmap.StackLeniency === NaN || beatmap.StackLeniency === null)
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

        if(hitObject.objectName == "spinner")
            hitObject.duration = hitObject.endTime - hitObject.startTime;

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

        let sampleSetToName = sampleSetId => {
            switch(sampleSetId){
                case 2:
                    return "soft";
                case 3:
                    return "drum";
                default:
                    return "normal";
            }
        };

        let getHitSounds = (timingPoint, name, soundTypes, additions) => {
            let output = [];

            let sampleSetName = sampleSetToName(timingPoint.sampleSetId);
            let sampleSetNameAddition = sampleSetName;

            if(!soundTypes.includes('normal'))
                soundTypes.push('normal');

            if('sample' in additions)
                sampleSetName = additions.sample;

            if('additionalSample' in additions)
                sampleSetNameAddition = additions.additionalSample;

            let hitSoundBase = `${sampleSetName}-${name}`;
            let hitSoundBaseAddition = `${sampleSetNameAddition}-${name}`;
            let customSampleIndex = timingPoint.customSampleIndex > 0 ? timingPoint.customSampleIndex : '';

            if(name == 'hit'){
                soundTypes.forEach(soundType => {
                    let base = soundType == 'normal' ? hitSoundBase : hitSoundBaseAddition;
                    output.push(
                        `${base}${soundType}${customSampleIndex}`
                    );
                });
            }else if(name == 'slider'){
                output.push(
                    `${hitSoundBase}slide${customSampleIndex}`
                );

                if(soundTypes.includes('whistle'))
                    output.push(
                        `${hitSoundBase}whistle${customSampleIndex}`
                    );
            }else if(name == 'slidertick'){
                output.push(
                    `${hitSoundBase}${customSampleIndex}`
                )
            }

            return output;
        };

        hitObject.HitSounds = getHitSounds(timingPoint, 'hit', hitObject.soundTypes, hitObject.additions);
        hitObject.EdgeHitSounds = [];
        hitObject.SliderHitSounds = [];

        if(hitObject.objectName == 'slider'){
            hitObject.edges.forEach((edge, i) => {
                let offset = i * (hitObject.duration / hitObject.repeatCount)

                let edgeTimingPoint = getTimingPoint(beatmap.timingPoints, hitObject.startTime + offset);

                hitObject.EdgeHitSounds.push(
                    getHitSounds(edgeTimingPoint, 'hit', edge.soundTypes, edge.additions)
                );

                hitObject.SliderHitSounds.push(
                    getHitSounds(edgeTimingPoint, 'slider', hitObject.soundTypes, hitObject.additions)
                );
            });

            hitObject.SliderTicks.forEach(tick => {
                for(let i = 0; i < hitObject.repeatCount; i++){
                    if(i == 0)
                        tick.HitSounds = [];

                    let edgeOffset =  i * (hitObject.duration / hitObject.repeatCount);
                    let offset = edgeOffset + (i % 2 == 0 ? tick.offset : tick.reverseOffset);

                    let tickTimingPoint = getTimingPoint(beatmap.timingPoints, hitObject.startTime + offset);

                    tick.HitSounds.push(
                        getHitSounds(tickTimingPoint, 'slidertick', hitObject.soundTypes, hitObject.additions)
                    );
                }
            });
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

    // Apply Stacking
    // Pretty much copied from osu-lazer https://github.com/ppy/osu/blob/master/osu.Game.Rulesets.Osu/Beatmaps/OsuBeatmapProcessor.cs#L41

    /*
    let startIndex = 0;
    let endIndex = beatmap.hitObjects.length - 1;
    let extendedEndIndex = endIndex;

    let stackThreshold = beatmap.TimePreempt * beatmap.StackLeniency * 10;

    if(endIndex < beatmap.hitObjects.length - 1){
        for(let i = endIndex; i >= startIndex; i--){
            let stackBaseIndex = i;

            for(let n = stackBaseIndex + 1; n < beatmap.hitObjects.length; n++){
                let stackBaseObject = beatmap.hitObjects[stackBaseIndex];

                if(stackBaseObject.objectName == 'spinner')
                    break;

                let objectN = beatmap.hitObjects[n];

                if(objectN.objectName == 'spinner')
                    continue;

                let endTime = stackBaseObject.endTime;

                if(objectN.startTime - endTime > stackThreshold)
                    break;

                if(vectorDistance(...stackBaseObject.position, ...objectN.position) < STACK_DISTANCE
                || (stackBaseObject.objectName == 'slider' && vectorDistance(...stackBaseObject.endPosition, ...objectN.position) < STACK_DISTANCE)){
                    stackBaseIndex = n;

                    objectN.StackHeight = 0;
                }
            }

            if(stackBaseIndex > extendedEndIndex){
                extendedEndIndex = stackBaseIndex;

                if(extendedEndIndex == beatmap.hitObjects.length - 1)
                    break;
            }
        }
    }

    let extendedStartIndex = startIndex;

    for(let i = extendedEndIndex; i > startIndex; i--){
        let n = 1;

        let objectI = beatmap.hitObjects[i];

        if(objectI.StackHeight != 0 || objectI.objectName == 'spinner')
            continue;

        if(objectI.objectName == 'circle'){
            while(--n >= 0){
                let objectN = beatmap.hitObjects[n];

                if(objectN.objectName == 'spinner')
                    continue;

                let endTime = objectN.endTime;

                if(objectI.startTime - endTime > stackThreshold)
                    break;

                if(n < extendedStartIndex){
                    objectN.StackHeight = 0;
                    extendedStartIndex = n;
                }

                if(objectN.objectName == 'slider' && vectorDistance(...objectN.position, ...objectI.position) < STACK_DISTANCE){
                    let offset = objectI.StackHeight - objectN.StackHeight + 1;

                    for(let j = n + 1; j <= i; j++){
                        let objectJ = beatmap.hitObjects[j];

                        if(vectorDistance(...objectN.endPosition, ...objectJ.position) < STACK_DISTANCE)
                            objectJ.StackHeight -= offset;
                    }

                    break;
                }

                if(vectorDistance(...objectN.position, ...objectI.position) < STACK_DISTANCE){
                    objectN.StackHeight = objectI.StackHeight + 1;
                    objectI = objectN;
                }
            }
        }else if(objectI.objectName == 'slider'){
            while(--n >= startIndex){
                let objectN = beatmap.hitObjects[n];

                if(objectN.objectName == 'spinner')
                    continue;

                if(objectI.startTime - objectN.startTime > stackThreshold)
                    break;

                if(vectorDistance(...objectN.endPosition, ...objectI.position) < STACK_DISTANCE){
                    objectN.StackHeight = objectI.StackHeight + 1;
                    objectI = objectN;
                }
            }
        }
    }*/
    

    let currentCombo = 1;
    let currentComboNumber = 0;

    // Set combo colors and stacking offset
    beatmap.hitObjects.forEach((hitObject, i) => {
        if(beatmap["Combo1"] === undefined){
            beatmap["Combo1"] = "255,192,0";
            beatmap["Combo2"] = "0,202,0";
            beatmap["Combo3"] = "18,124,255";
            beatmap["Combo4"] = "242,24,57";
        }

        let maxComboColor = 1;

        while(beatmap["Combo" + (maxComboColor + 1)] !== undefined)
            maxComboColor++;

        if(hitObject.newCombo || i == 0){
            currentComboNumber = 0;
            for(let x = hitObject.comboSkip; x >= 0; x--){
                currentCombo++;
                if(currentCombo > maxComboColor) currentCombo = 1;
            }
        }

        currentComboNumber++;
        hitObject.Color = "rgba(" + beatmap["Combo" + currentCombo] + ",0.6)";
        hitObject.ComboNumber = currentComboNumber;
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

    // Generate auto replay
    if(!beatmap.Replay){
        let replay = {
            lastCursor: 0,
            auto: true,
            replay_data: [{offset: 0, x: 0, y: 0}]
        };

        beatmap.hitObjects.forEach((hitObject, i) => {
            if(hitObject.objectName != "spinner"){
                if(i > 0){
                    replay.replay_data.push({
                        offset: Math.max(beatmap.hitObjects[i - 1].endTime, hitObject.startTime - 20),
                        x: hitObject.position[0],
                        y: hitObject.position[1]
                    });
                }

                replay.replay_data.push({
                    offset: hitObject.startTime,
                    x: hitObject.position[0],
                    y: hitObject.position[1]
                });

                replay.replay_data.push({
                    offset: hitObject.startTime + 1,
                    x: hitObject.position[0],
                    y: hitObject.position[1]
                });
            }else{
                // 7 rotations per second
                let rps = 7;
                let radius = 60;

                let rotations = hitObject.duration / 1000 * rps;

                for(let x = 0; x < rotations; x++){
                    let rotationLength = Math.min(1, rotations - x);

                    for(let a = 0; a < rotationLength * MAX_RADIAN; a += MAX_RADIAN / (rotationLength * 100)){
                        let offset = hitObject.startTime + x * (1000 / rps) + a / MAX_RADIAN * (1000 / rps);

                        let point = {
                            offset,
                            x: PLAYFIELD_WIDTH / 2 + radius * Math.cos(a),
                            y: PLAYFIELD_HEIGHT / 2 + radius * Math.sin(a)
                        };

                        replay.replay_data.push(point);
                    }
                }
            }

            if(hitObject.objectName == "slider"){
                let endPosition = hitObject.endPosition;

                let nextObject;

                if(beatmap.hitObjects.length > i + 1)
                    nextObject = beatmap.hitObjects[i + 1];

                if(nextObject){
                    let pos_current = hitObject.endPosition;
                    let pos_next = nextObject.position;

                    let distance = vectorDistance(pos_current, pos_next);

                    let n = Math.max(1, Math.min(beatmap.ActualFollowpointRadius, distance));

                    if(distance > 0){
                        endPosition = [
                            pos_current[0] + (n / distance) * (pos_next[0] - pos_current[0]),
                            pos_current[1] + (n / distance) * (pos_next[1] - pos_current[1])
                        ];
                    }
                }

                if(hitObject.duration < 100 && hitObject.repeatCount == 1){
                    replay.replay_data.push({
                        offset: hitObject.startTime,
                        x: hitObject.position[0],
                        y: hitObject.position[1]
                    });
                    replay.replay_data.push({
                        offset: hitObject.endTime,
                        x: endPosition[0],
                        y: endPosition[1]
                    });
                }else if(hitObject.repeatCount > 1 && hitObject.lazyStay && (hitObject.duration / hitObject.repeatCount) < 200){
                    replay.replay_data.push({
                        offset: hitObject.startTime,
                        x: hitObject.position[0],
                        y: hitObject.position[1]
                    }, {
                        offset: hitObject.startTime + hitObject.duration / hitObject.repeatCount,
                        x: hitObject.lazyEndPosition[0],
                        y: hitObject.lazyEndPosition[1]
                    }, {
                        offset: hitObject.endTime - Math.min(75, hitObject.duration),
                        x: hitObject.lazyEndPosition[0],
                        y: hitObject.lazyEndPosition[1]
                    }, {
                        offset: hitObject.endTime,
                        x: endPosition[0],
                        y: endPosition[1]
                    });
                }else{
                    let length = hitObject.duration / hitObject.repeatCount;

                    for(let i = 0; i < hitObject.repeatCount; i++){
                        let slider_dots = hitObject.SliderDots.slice();

                        if(i % 2 != 0)
                            slider_dots.reverse();

                        slider_dots.forEach((dot, index) => {
                            replay.replay_data.push({
                                offset: hitObject.startTime + i * length + index / slider_dots.length * length,
                                x: dot[0],
                                y: dot[1]
                            });
                        });
                    }
                }
            }
        });

        beatmap.Replay = replay;
    }

    
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
                    }
                }

                if(hitObject.hitResult != null)
                    break;
            }
        }while(current != null && current.offset < hitObject.latestHit);
    }

    
    /*
    for(let i = 0; i < beatmap.hitObjects.length; i++){
        const hitObject = beatmap.hitObjects[i];

        if(hitObject.objectName == 'spinner')
            continue; // process spinners later

        const prevHitObject = beatmap.hitObjects[i - 1];
        const firstPrevIndex = 0;

        const frames = [];
        const firstFrameIndex = beatmap.Replay.replay_data.findIndex(a => a.offset >= hitObject.startTime - beatmap.HitWindow50) - 1;

        for(let i = firstFrameIndex; i < beatmap.Replay.replay_data.length; i++){
            const frame = beatmap.Replay.replay_data[i];

            if(frame.offset > hitObject.latestHit)
                break;

            frames.push(frame);
        }

        for(let i = 1; i < frames.length; i++){
            const previous = frames[i - 1];
            const current = frames[i];

            if(current == null)
                continue;

            if(prevHitObject != null
            && prevHitObject.hitOffset == null
            && prevHitObject.objectName == "circle"
            && current.offset < prevHitObject.latestHit)
                continue;

            if(prevHitObject != null
            && prevHitObject.hitOffset != null
            && prevHitObject.objectName == "circle"
            && current.offset < prevHitObject.startTime + prevHitObject.hitOffset
            && withinCircle(current.x, current.y, ...prevHitObject.position, beatmap.Radius))
                continue;

            let currentPresses = 0;

            if((current.K1 || current.M1) 
            && previous.K1 == false 
            && previous.M1 == false)
                currentPresses++;

            if((current.K2 || current.M2) 
            && previous.K2 == false 
            && previous.M2 == false)
                currentPresses++;

            if(hitObject.objectName == 'circle' || hitObject.objectName == 'slider'){
                if(currentPresses > 0){
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

                        hitObject.hitOffset = offsetRaw;

                        if(hitObject.objectName == 'slider')
                            hitResult = hitResult > 0 ? 50 : 0;

                        hitObject.hitResult = hitResult;
                    }
                }

                if(hitObject.hitResult != null)
                    break;
            }
        }
    }*/

    beatmap.ScoringFrames = [];

    const allhits = [];

    for(const hitObject of beatmap.hitObjects){
        if(hitObject.objectName == 'circle'){
            const scoringFrame = newScoringFrame(beatmap.ScoringFrames);

            if(hitObject.hitResult == null)
                hitObject.hitResult = 0;

            scoringFrame.offset = hitObject.startTime + (hitObject.hitOffset != null ? hitObject.hitOffset : beatmap.HitWindow50);
            scoringFrame.position = hitObject.position;

            scoringFrame.result = hitObject.hitResult;

            if(hitObject.hitResult == 0){
                scoringFrame.result = 'miss';
                scoringFrame.combo = 0;
            }

            if(hitObject.hitResult > 0){
                scoringFrame.hitOffset = hitObject.hitOffset;
                scoringFrame.combo++;

                allhits.push(hitObject.hitOffset);
                scoringFrame.ur = variance(allhits) * 10;
            }

            if(scoringFrame.combo > scoringFrame.maxCombo)
                scoringFrame.maxCombo = scoringFrame.combo;

            switch(scoringFrame.result){
                case 300:
                    scoringFrame.count300++;
                    break;
                case 100:
                    scoringFrame.count100++;
                    break;
                case 50:
                    scoringFrame.count50++;
                    break;
                case 'miss':
                    scoringFrame.countMiss++;
                    break;
            }

            beatmap.ScoringFrames.push(scoringFrame);
            
            continue;
        }

        if(hitObject.objectName == 'spinner'){
            const scoringFrame = newScoringFrame(beatmap.ScoringFrames);

            scoringFrame.result = 300;
            scoringFrame.combo++;

            scoringFrame.count300++;

            if(scoringFrame.combo > scoringFrame.maxCombo)
                scoringFrame.maxCombo = scoringFrame.combo;

            scoringFrame.offset = hitObject.endTime;

            scoringFrame.position = [PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2];

            beatmap.ScoringFrames.push(scoringFrame);
        }

        if(hitObject.objectName == 'slider'){
            hitObject.hitResults = [];

            hitObject.MissedSliderStart = 0;
            hitObject.MissedSliderTick = 0;
            hitObject.MissedSliderEnd = 0;

            const scoringFrame = newScoringFrame(beatmap.ScoringFrames);
            
            scoringFrame.offset = hitObject.startTime + Math.min(
                hitObject.hitOffset != null ? hitObject.hitOffset : beatmap.HitWindow50,
                hitObject.endTime
                );
            
            if(hitObject.hitResult > 0){
                scoringFrame.result = 30;
                scoringFrame.combo++;

                scoringFrame.hitOffset = hitObject.hitOffset;
    
                allhits.push(hitObject.hitOffset);
                scoringFrame.ur = variance(allhits) * 10;

                if(scoringFrame.combo > scoringFrame.maxCombo)
                    scoringFrame.maxCombo = scoringFrame.combo;

            }else{
                hitObject.MissedSliderStart = 1;

                /*console.log('missed slider start at', hitObject.startTime);
                console.log('scoring frame offset', scoringFrame.offset);*/

                scoringFrame.result = 'sliderbreak';
                scoringFrame.combo = 0;
            }

            beatmap.ScoringFrames.push(scoringFrame);

            for(let i = 0; i < hitObject.repeatCount; i++){
                const repeatOffset = hitObject.startTime + i * (hitObject.duration / hitObject.repeatCount);
                const sliderTicks = hitObject.SliderTicks.slice();

                if(i % 2 == 1)
                    sliderTicks.reverse();

                if(i > 0){
                    const scoringFrame = newScoringFrame(beatmap.ScoringFrames);
                    const replayFrame = getCursorAtRaw(beatmap.Replay, repeatOffset);

                    scoringFrame.offset = repeatOffset;

                    const repeatPosition = i % 2 == 1 ? hitObject.endPosition : hitObject.position;

                    scoringFrame.position = repeatPosition;

                    const currentHolding = replayFrame.K1 || replayFrame.K2 || replayFrame.M1 || replayFrame.M2;

                    if(currentHolding && withinCircle(replayFrame.x, replayFrame.y, ...repeatPosition, beatmap.ActualFollowpointRadius)){
                        scoringFrame.result = 30;
                        scoringFrame.combo++;

                        if(scoringFrame.combo > scoringFrame.maxCombo)
                            scoringFrame.maxCombo = scoringFrame.combo;

                        beatmap.ScoringFrames.push(scoringFrame);
                    }else{
                        //console.log('missed repeat at', scoringFrame.offset);

                        scoringFrame.result = 'sliderbreak';
                        scoringFrame.combo = 0;
                        hitObject.MissedSliderTick = true;

                        beatmap.ScoringFrames.push(scoringFrame);
                    }
                }

                for(const tick of sliderTicks){
                    const scoringFrame = newScoringFrame(beatmap.ScoringFrames);
                    const tickOffset = i % 2 == 1 ? tick.reverseOffset : tick.offset;

                    const offset = repeatOffset + tickOffset;

                    scoringFrame.offset = offset;
                    scoringFrame.position = tick.position;

                    const replayFrame = getCursorAtRaw(beatmap.Replay, offset);

                    const currentHolding = replayFrame.K1 || replayFrame.K2 || replayFrame.M1 || replayFrame.M2;

                    if(currentHolding && withinCircle(replayFrame.x, replayFrame.y, ...tick.position, beatmap.ActualFollowpointRadius)){
                        scoringFrame.result = 10;
                        scoringFrame.combo++;

                        if(scoringFrame.combo > scoringFrame.maxCombo)
                            scoringFrame.maxCombo = scoringFrame.combo;

                        beatmap.ScoringFrames.push(scoringFrame);

                        continue;
                    }

                    hitObject.MissedSliderTick = 1;

                    //console.log('missed slider tick at', scoringFrame.offset);

                    scoringFrame.result = 'sliderbreak';
                    scoringFrame.combo = 0;

                    beatmap.ScoringFrames.push(scoringFrame);
                }

                if(i + 1 == hitObject.repeatCount){
                    const replayFrame = getCursorAtRaw(beatmap.Replay, hitObject.actualEndTime);

                    const endPosition = i % 2 == 1 ? hitObject.position : hitObject.actualEndPosition;

                    const currentHolding = replayFrame.K1 || replayFrame.K2 || replayFrame.M1 || replayFrame.M2;

                    if(currentHolding && withinCircle(replayFrame.x, replayFrame.y, ...endPosition, beatmap.ActualFollowpointRadius)){
                        const scoringFrame = newScoringFrame(beatmap.ScoringFrames);
                        scoringFrame.offset = hitObject.endTime;
                        scoringFrame.position = endPosition;

                        scoringFrame.result = 30;
                        scoringFrame.combo++;

                        if(scoringFrame.combo > scoringFrame.maxCombo)
                            scoringFrame.maxCombo = scoringFrame.combo;

                        beatmap.ScoringFrames.push(scoringFrame);
                    }else{
                        
                        /*console.log('missed slider end at', scoringFrame.offset, currentHolding);

                        console.log('fake   end position', ...hitObject.endPosition, 'fake   end time', hitObject.endTime);
                        console.log('missed slider end at', scoringFrame.offset);
                        console.log(`cursor:${replayFrame.x}+${replayFrame.y},${currentHolding}`);
                        console.log(`position:${endPosition[0]}+${endPosition[1]}`);
                        console.log(`startPosition:${hitObject.position[0]}+${hitObject.position[1]}`);
                        console.log(`endPosition:${hitObject.endPosition[0]}+${hitObject.endPosition[1]}`);*/

                        hitObject.MissedSliderEnd = 1;
                    }

                    const scoringFrameEnd = newScoringFrame(beatmap.ScoringFrames);

                    scoringFrameEnd.offset = repeatOffset + hitObject.duration / hitObject.repeatCount;

                    const totalPartsMissed = 
                      hitObject.MissedSliderStart
                    + hitObject.MissedSliderTick
                    + hitObject.MissedSliderEnd;

                    scoringFrameEnd.position = hitObject.repeatCount % 2 == 0 ? hitObject.position : hitObject.endPosition;

                    /*if(totalPartsMissed > 0){
                        console.log('---');
                        console.log('slider start missed', hitObject.MissedSliderStart);
                        console.log('slider tick missed', hitObject.MissedSliderTick);
                        console.log('slider end missed', hitObject.MissedSliderEnd);
                    }*/


                    switch(totalPartsMissed){
                        case 0:
                            scoringFrameEnd.result = 300;
                            scoringFrameEnd.count300++;
                            break;
                        case 1:
                            scoringFrameEnd.result = 100;
                            scoringFrameEnd.count100++;
                            break;
                        case 2:
                            scoringFrameEnd.result = 50;
                            scoringFrameEnd.count50++;
                            break;
                        default:
                            scoringFrameEnd.result = 'miss';
                            scoringFrameEnd.countMiss++;
                    }

                    beatmap.ScoringFrames.push(scoringFrameEnd);
                }
            }
        }
    }

    beatmap.ScoringFrames = beatmap.ScoringFrames.sort((a, b) => a.offset - b.offset);

    const parser = new ojsama.parser().feed(osuContents);

    const objects = parser.map.objects.slice();
    const mods = ojsama.modbits.from_string(enabled_mods.filter(a => ["HR", "EZ"].includes(a) == false).join(""));

    parser.map.cs = beatmap.CircleSize;
    parser.map.od = beatmap.OverallDifficulty;
    parser.map.ar = beatmap.ApproachRate;
    
    for(const scoringFrame of beatmap.ScoringFrames.filter(a => ['miss', 50, 100, 300].includes(a.result))){
        const hitCount = scoringFrame.countMiss + scoringFrame.count50 + scoringFrame.count100 + scoringFrame.count300;

        parser.map.objects = objects.slice(0, hitCount);

        const stars = new ojsama.diff().calc({map: parser.map, mods});

        const pp = ojsama.ppv2({
            stars,
            combo: scoringFrame.maxCombo,
            nmiss: scoringFrame.countMiss,
            n300: scoringFrame.count300,
            n100: scoringFrame.count100,
            n50: scoringFrame.count50
        });

        scoringFrame.pp = pp.total;
        scoringFrame.stars = stars.total;
    }

    let pp = 0, stars = 0;

    for(const scoringFrame of beatmap.ScoringFrames){
        if(scoringFrame.pp != null){
            ({pp, stars} = scoringFrame)
        }

        scoringFrame.pp = pp;
        scoringFrame.stars = stars;
    }

    const hitResults = _.countBy(beatmap.ScoringFrames, 'result');

    hitResults.ur = beatmap.ScoringFrames[beatmap.ScoringFrames.length - 1].ur;

    beatmap.HitResults = hitResults;

    console.log(hitResults);

    beatmap.Replay.lastCursor = 0;
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
            replay = {lastCursor: 0, replay_data: parseReplay(fs.readFileSync(replay_path))};
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

    processBeatmap(osuContents);
}

process.on('message', obj => {
    ({beatmap_path, options, speed, enabled_mods} = obj);

    prepareBeatmap().then(() => {
        process.send(beatmap, () => {
            process.exit();
        });
    })
});
