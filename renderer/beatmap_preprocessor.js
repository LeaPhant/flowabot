const osuBeatmapParser = require('osu-parser');
const path = require('path');
const fs = require('fs');
const os = require('os');
const osu = require('../osu');
const osr = require('node-osr');
const lzma = require('lzma-native');
const ojsama = require('ojsama');
const rosu = require('rosu-pp-js');
const axios = require('axios');
const _ = require('lodash');
const helper = require('../helper.js');
const config = require('../config.json');

const { fround: float } = Math;

const MathF = {
	PI: float(Math.PI),
	atan2: (y, x) => float(Math.atan2(y, x)),
	sin: (x) => float(Math.sin(x)),
	cos: (x) => float(Math.cos(x))
}

let options, beatmap_path, enabled_mods, mods_raw, beatmap, score_info, speed_override, speed_multiplier = 1, renderTime, renderLength, firstHitobjectIndex, lastHitobjectIndex;
let isUsingClassicNotelock = false;
let isUsingSliderHeadAccuracy = true;
let isUsingClassicMod = false;
let isSetOnLazer = false;

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;
const PLAYFIELD_DIAGONAL_REAL = vectorLength([PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT]);
const PLAYFIELD_DIAGONAL = 640.995056;
const PLAYFIELD_CENTER = [PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2];

const PLAYFIELD_EDGE_RATIO = 0.375;
const BORDER_DISTANCE_X = PLAYFIELD_WIDTH * PLAYFIELD_EDGE_RATIO;
const BORDER_DISTANCE_Y = PLAYFIELD_HEIGHT * PLAYFIELD_EDGE_RATIO;

const MAX_RADIAN = 360 * (Math.PI / 180);

const STAR_SCALING_FACTOR = 0.0675;

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
    "K2": Math.pow(2,3),
    "S": Math.pow(2,4)
}

const FLOAT_EPSILON = 1e-3;

const AlmostEquals = (value1, value2, acceptableDifference = FLOAT_EPSILON) => Math.abs(value1 - value2) <= acceptableDifference;
const clamp = (number, min, max) => Math.max(Math.min(number, max), min);

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

function newScoringFrame(scoringFrames){
    const defaultFrame = {
        ur: 0, offset: 0, 
        count300: 0, count100: 0, count50: 0, countMiss: 0, 
        largeTickHits: 0, smallTickHits: 0, sliderEndHits: 0,
        largeTickMisses: 0, smallTickMisses: 0, sliderEndMisses: 0,
        combo: 0, previousCombo: 0, maxCombo: 0, accuracy: 100
    };

    let scoringFrame = {...defaultFrame};

    if(scoringFrames.length > 0)
        scoringFrame = Object.assign(scoringFrame, scoringFrames[scoringFrames.length - 1]);

    scoringFrame.previousCombo = scoringFrame.combo;

    return scoringFrame;
}

class Cursor {
    i = 0;
    replayData;

    constructor (replay) {
        this.replayData = replay.replay_data;
    }

    next () {
        return this.replayData[this.i++];
    }

    prev () {
        return this.replayData[--this.i];
    }

    at (time) {
        while (this.i + 1 < this.replayData.length 
            && this.replayData[this.i].offset < time) {
            this.i++;
        }

        return this.replayData[this.i];
    }

    reset () {
        this.i = 0;
    }
}

const INT32_MIN_VALUE = -2147483648;
const INT32_MAX_VALUE = 2147483647;

class Random {
    _seedArray;
    _inext;
    _inextp;

    constructor(seed) {
        this.seed = seed;

        let seedArray = new Array(56);
 
        let subtraction = (seed == INT32_MIN_VALUE) ? INT32_MAX_VALUE : Math.abs(seed);
        let mj = 161803398 - subtraction; // magic number based on Phi (golden ratio)
        seedArray[55] = mj;
        let mk = 1;

        let ii = 0;
        for (let i = 1; i < 55; i++)
        {
            // The range [1..55] is special (Knuth) and so we're wasting the 0'th position.
            if ((ii += 21) >= 55)
            {
                ii -= 55;
            }

            seedArray[ii] = mk;
            mk = mj - mk;
            if (mk < 0)
            {
                mk += INT32_MAX_VALUE;
            }

            mj = seedArray[ii];
        }

        for (let k = 1; k < 5; k++)
        {
            for (let i = 1; i < 56; i++)
            {
                let n = i + 30;
                if (n >= 55)
                {
                    n -= 55;
                }

                seedArray[i] -= seedArray[1 + n];
                if (seedArray[i] < 0)
                {
                    seedArray[i] += INT32_MAX_VALUE;
                }
            }
        }

        this._seedArray = seedArray;
        this._inext = 0;
        this._inextp = 21;
    }

    sample () {
		let sample = this.InternalSample() * (1.0 / INT32_MAX_VALUE);
		while (sample < 0) sample++;
		while (sample > 1) sample--;
        return sample;
    }

    InternalSample () {
        let locINext = this._inext;
        if (++locINext >= 56)
        {
            locINext = 1;
        }

        let locINextp = this._inextp;
        if (++locINextp >= 56)
        {
            locINextp = 1;
        }

        let seedArray = this._seedArray;
        let retVal = seedArray[locINext] - seedArray[locINextp];

        if (retVal == INT32_MAX_VALUE)
        {
            retVal--;
        }
        if (retVal < 0)
        {
            retVal += INT32_MAX_VALUE;
        }

        seedArray[locINext] = retVal;
        this._inext = locINext;
        this._inextp = locINextp;

        return retVal;
    }
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

async function parseReplay(buf, decompress = true){
    let replay_data = buf;

    if(decompress) {
		let data = await osr.read(buf);
		if (data.hasOwnProperty("score_info")) {
			isSetOnLazer = true;
			score_info = data.score_info;
            console.log(JSON.stringify(score_info, undefined, 2))
		}
        replay_data = data.replay_data;
	}

        
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

function vectorF(v) {
	return [
		float(v[0]),
		float(v[1])
	];
}

function vectorLength(v) {
    return Math.sqrt(v[0] ** 2 + v[1] ** 2);
}

function vectorFLength(v) {
	return float(vectorLength(v));
}

function vectorDistance(hitObject1, hitObject2){
    return Math.sqrt((hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
        + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]));
}

function vectorFDistance(a, b) {
	return float(vectorDistance(a, b));
}

function vectorEquals(a, b) {
    return a[0] == b[0] && a[1] == b[1];
}

function vectorSubtract(a, b){
    return [
        a[0] - b[0],
        a[1] - b[1]
    ];
}

function vectorFSubtract(a, b) {
	return vectorF(vectorSubtract(a, b));
}

function vectorAdd(a, b){
    return [
        a[0] + b[0],
        a[1] + b[1]
    ];
}

function vectorFAdd(a, b) {
	return vectorF(vectorAdd(a, b));
}

function vectorMultiply(a, m){
    return [
        a[0] * m,
        a[1] * m
    ];
}

function vectorFMultiply(a, b) {
	return vectorF(vectorMultiply(a, b));
}

function vectorDivide(a, d){
    return [
        a[0] / d,
        a[1] / d
    ];
}

function vectorFDivide(a, b) {
	return vectorF(vectorDivide(a, b));
}

function vectorRotate(v, rotation)
{
    const angle = Math.atan2(v[1], v[0]) + rotation;
    const length = vectorLength(v);
    return [
        length * Math.cos(angle),
        length * Math.sin(angle)
    ];
}

function vectorFRotate(v, rotation) {
	return vectorF(vectorRotate(v, rotation));
}

function vectorDistanceSquared(hitObject1, hitObject2){
    return (hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
        + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]);
}

function vectorFDistanceSquared(a, b) {
	return float(vectorDistanceSquared(a, b));
}

function difficultyRange(difficulty, min, mid, max){
    let result;

    if(difficulty > 5)
        result = mid + (max - mid) * (difficulty - 5) / 5;
    else if(difficulty < 5)
        result = mid + (mid - min) * (difficulty - 5) / 5;
    else
        result = mid

    // floating point precision blehhhh
    return parseFloat(result.toPrecision(2));
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

/*function variance(array){
    let sum = 0;
    array.forEach(a => sum += a);
    
	const avg = sum / array.length;
    let _sum = 0;
    let _array = array.map(function(a){ return Math.pow(a - avg, 2); });
    
    _array.forEach(a => _sum += a);

	return Math.sqrt(_sum / _array.length);
}*/

function variance(array){
    let m = 0;
    let s = 0;
    let oldM;
    
    for (let k = 1; k <= array.length; k++) {
        let x = array[k - 1];
        oldM = m;
        m += (x - m) / k;
        s += (x - m) * (x - oldM);
    }

    const v = s / (array.length - 1);

    return Math.sqrt(s / array.length);
}

function getCursorAtRaw(replay, time){
    let lastIndex = replay.replay_data.findIndex(a => a.offset >= time) - 1;

    return replay.replay_data[lastIndex] || replay.replay_data[replay.replay_data.length - 1];
}

function RandomGaussian(random, mean = 0, stdDev = 1){
    // Generate 2 random numbers in the interval (0,1].
    // x1 must not be 0 since log(0) = undefined.
    const x1 = 1 - random.sample();
    const x2 = 1 - random.sample();

    const stdNormal = Math.sqrt(-2 * Math.log(x1)) * Math.sin(2 * Math.PI * x2);
    return mean + stdDev * float(stdNormal);
}

function getRandomOffset(random, stdDev, angleSharpness = 7){
    // Range: [0.5, 2]
    // Higher angle sharpness -> lower multiplier
    const customMultiplier = (1.5 * 10 - angleSharpness) / (1.5 * 10 - 7);

    return RandomGaussian(random, 0, stdDev * customMultiplier);
}

function getRelativeTargetAngle(angleSharpness = 7, targetDistance, offset, flowDirection) {
    // Range: [0.1, 1]
    angleSharpness = float(angleSharpness / 10);
    // Range: [0, 0.9]
    const angleWideness = float(1 - angleSharpness);

    // Range: [-60, 30]
    const customOffsetX = float(angleSharpness * 100 - 70);
    // Range: [-0.075, 0.15]
    const customOffsetY = float(angleWideness * 0.25 - 0.075);

    targetDistance = float(targetDistance + customOffsetX);
    let angle = float(2.16 / (1 + 200 * Math.exp(0.036 * (targetDistance - 310 + customOffsetX))) + 0.5);
    angle = float(angle + offset + customOffsetY);

    const relativeAngle = float(MathF.PI - angle);

    return flowDirection ? -relativeAngle : relativeAngle;
}

function IsHitObjectOnBeat(hitObject, downbeatsOnly = false) {
    const timingPoint = getTimingPoint(beatmap.timingPoints, hitObject.startTime);

    const timeSinceTimingPoint = hitObject.startTime - timingPoint.offset;
    let { beatLength } = timingPoint;

    if (downbeatsOnly)
        beatLength *= timingPoint.timingSignature;

    // Ensure within 1ms of expected location.
    return Math.abs(timeSinceTimingPoint + 1) % beatLength < 2;
}

function shouldStartNewSection(random, i){
    if (i == 0)
        return true;

    // Exclude new-combo-spam and 1-2-combos.
    const previousObjectStartedCombo = (beatmap.hitObjects[Math.max(0, i - 2)].ComboNumber - 1) > 1 &&
                                        beatmap.hitObjects[i - 1].newCombo;
    const previousObjectWasOnDownbeat = IsHitObjectOnBeat(beatmap.hitObjects[i - 1], true);
    const previousObjectWasOnBeat = IsHitObjectOnBeat(beatmap.hitObjects[i - 1]);

    return (previousObjectStartedCombo && random.sample() < 0.6) ||
            previousObjectWasOnDownbeat ||
            (previousObjectWasOnBeat &&  random.sample() < 0.4);
}

function shouldApplyFlowChange(random, i) {
    const previousObjectStartedCombo = (beatmap.hitObjects[Math.max(0, i - 2)].ComboNumber - 1) > 1 &&
                                        beatmap.hitObjects[i - 1].newCombo;

    return previousObjectStartedCombo && random.sample() < 0.6;
}

function FlipSliderPointHorizontally(slider, point) {
	const relPosX = point[0] - slider.position[0];
	point[0] = -relPosX + slider.position[0];
}

function FlipSliderInPlaceHorizontally(slider) {
    FlipSliderPointHorizontally(slider, slider.endPosition);

    for (let point of slider.points)
        FlipSliderPointHorizontally(slider, point); 

    for (let dot of slider.SliderDots)
        FlipSliderPointHorizontally(slider, dot); 

    for (let tick of slider.SliderTicks)
        FlipSliderPointHorizontally(slider, tick); 

	1;
}

function RotateSlider(slider, rotation) {
    slider.position = vectorRotate(slider.position, rotation);
    slider.endPosition = vectorRotate(slider.endPosition, rotation);

    for (let point of slider.points)
        point = vectorRotate(point, rotation);

    for (let dot of slider.SliderDots)
        dot = vectorRotate(dot, rotation);

    for (let tick of slider.SliderTicks)
        tick = vectorRotate(tick, rotation);
}

function RotateAwayFromEdge(prevObjectPos, posRelativeToPrev, rotationRatio = 0.5) {
    let relativeRotationDistance = 0;

    if (prevObjectPos[0] < PLAYFIELD_CENTER[0]) {
        relativeRotationDistance = Math.max(
            float((BORDER_DISTANCE_X - prevObjectPos[0]) / BORDER_DISTANCE_X),
            relativeRotationDistance
        );
    } else {
        relativeRotationDistance = Math.max(
            float((prevObjectPos[0] - (PLAYFIELD_WIDTH - BORDER_DISTANCE_X)) / BORDER_DISTANCE_X),
            relativeRotationDistance
        );
    }

    if (prevObjectPos[1] < PLAYFIELD_CENTER[1]) {
        relativeRotationDistance = Math.max(
            float((BORDER_DISTANCE_Y - prevObjectPos[1]) / BORDER_DISTANCE_Y),
            relativeRotationDistance
        );
    } else {
        relativeRotationDistance = Math.max(
            float((prevObjectPos[1] - (PLAYFIELD_HEIGHT - BORDER_DISTANCE_Y)) / BORDER_DISTANCE_Y),
            relativeRotationDistance
        );
    }

    return RotateVectorTowardsVector(
        posRelativeToPrev,
        vectorSubtract(PLAYFIELD_CENTER, prevObjectPos),
        Math.min(1, relativeRotationDistance * rotationRatio)
    );
}

function RotateVectorTowardsVector(initial, destination, rotationRatio) {
	initial = vectorF(initial);
	destination = vectorF(destination);
	rotationRatio = float(rotationRatio);

    const initialAngleRad = MathF.atan2(initial[1], initial[0]);
    const destAngleRad = MathF.atan2(destination[1], destination[0]);

    let diff = float(destAngleRad - initialAngleRad);

    while (diff < -MathF.PI) diff = float(diff + 2 * MathF.PI);

    while (diff > MathF.PI) diff = float(diff - 2 * MathF.PI);

    const finalAngleRad = float(initialAngleRad + rotationRatio * diff);

    return vectorF([
        vectorFLength(initial) * MathF.cos(finalAngleRad),
        vectorFLength(initial) * MathF.sin(finalAngleRad)
    ]);
}

function calculateCentreOfMass(slider) {
    const sample_step = 50;

    // just sample the start and end positions if the slider is too short
    if (slider.pixelLength <= sample_step) {
        return vectorDivide(vectorAdd(slider.position, slider.endPosition), 2);
    }

    let count = 0;
    let sum = [0, 0];
    const pathDistance = slider.pixelLength;

    for (let i = 0; i < pathDistance; i += sample_step)
    {
        sum = vectorAdd(sum, slider.SliderDots[Math.max(0, Math.floor(i / pathDistance) * slider.SliderDots.length - 1)])
        count++;
    }

    return vectorDivide(sum, count);
}

function getSliderRotation(slider) {
    return Math.atan2(slider.endPosition[1], slider.endPosition[0]);
}

function getAngleDifference(angle1, angle2) {
    const diff = Math.abs(angle1 - angle2) % (Math.PI * 2);
    return Math.min(diff, Math.PI * 2 - diff);
}

function computeModifiedPosition(current, previous, beforePrevious) {
    let previousAbsoluteAngle = 0;

    if (previous != null) {
        if (previous.objectName == 'slider') {
            previousAbsoluteAngle = getSliderRotation(previous);
        } else {
            const earliestPosition = beforePrevious?.endPositionModified ?? PLAYFIELD_CENTER;
            const relativePosition = vectorSubtract(previous.position, earliestPosition);
            previousAbsoluteAngle = MathF.atan2(float(relativePosition[1]), float(relativePosition[0]));
        }
    }

    let absoluteAngle = float(previousAbsoluteAngle + current.RelativeAngle);

    let posRelativeToPrev = [
        current.DistanceFromPrevious * MathF.cos(absoluteAngle),
        current.DistanceFromPrevious * MathF.sin(absoluteAngle)
    ];

    const lastEndPosition = previous?.endPositionModified ?? PLAYFIELD_CENTER;

    posRelativeToPrev = RotateAwayFromEdge(lastEndPosition, posRelativeToPrev);

    current.positionModified = vectorFAdd(lastEndPosition, posRelativeToPrev);

    if (current.objectName != 'slider')
        return;

    absoluteAngle = Math.atan2(posRelativeToPrev[1], posRelativeToPrev[0]);

    const centreOfMassOriginal = calculateCentreOfMass(current);
    let centreOfMassModified = vectorRotate(centreOfMassOriginal, current.Rotation + absoluteAngle - getSliderRotation(current));
    centreOfMassModified = RotateAwayFromEdge(current.positionModified, centreOfMassModified);

    const relativeRotation = Math.atan2(centreOfMassModified[1], centreOfMassModified[0]) - Math.atan2(centreOfMassOriginal[1], centreOfMassOriginal[0]);
    if (!AlmostEquals(relativeRotation, 0))
        RotateSlider(current, relativeRotation);
}

function GeneratePositionInfos() {
    let previousPosition = PLAYFIELD_CENTER;
    let previousAngle = 0;

    for (const hitObject of beatmap.hitObjects) {
        const relativePosition = vectorFSubtract(hitObject.position, previousPosition);
        const absoluteAngle = MathF.atan2(relativePosition[1], relativePosition[0]);
        const relativeAngle = float(absoluteAngle - previousAngle);

        hitObject.RelativeAngle = relativeAngle;
        hitObject.DistanceFromPrevious = vectorFLength(relativePosition);

        if (hitObject.objectName == 'slider') {
            const absoluteRotation = getSliderRotation(hitObject);
            hitObject.Rotation = absoluteRotation - absoluteAngle;
        }

        previousPosition = hitObject.endPosition;
        previousAngle = absoluteAngle;
    }
}

function clampToPlayfieldWithPadding(position, padding) {
    return vectorF([
        clamp(position[0], padding, PLAYFIELD_WIDTH - padding),
        clamp(position[1], padding, PLAYFIELD_HEIGHT - padding)
    ]);
}

function clampHitCircleToPlayfield(hitObject)
{
    const previousPosition = hitObject.positionModified.slice();
    hitObject.endPositionModified = hitObject.positionModified = clampToPlayfieldWithPadding(
        hitObject.positionModified,
        float(beatmap.Radius)
    );

	hitObject.position = hitObject.positionModified.slice();

    return vectorFSubtract(hitObject.positionModified, previousPosition);
}

function CalculatePossibleMovementBounds(slider) {
    const sliderDotXs = slider.SliderDots.map(d => d[0]);
    const sliderDotYs = slider.SliderDots.map(d => d[1]);

    // Compute the bounding box of the slider.
    let minX = Math.min(...sliderDotXs);
    let maxX = Math.max(...sliderDotXs);

    let minY = Math.min(...sliderDotYs);
    let maxY = Math.max(...sliderDotYs);

    // Take the circle radius into account.
	const radius = float(beatmap.Radius);

    minX -= radius;
    minY -= radius;

    maxX += radius;
    maxY += radius;

    // Given the bounding box of the slider (via min/max X/Y),
    // the amount that the slider can move to the left is minX (with the sign flipped, since positive X is to the right),
    // and the amount that it can move to the right is WIDTH - maxX.
    // Same calculation applies for the Y axis.
    const left = -minX;
    const right = PLAYFIELD_WIDTH - maxX;
    const top = -minY;
    const bottom = PLAYFIELD_HEIGHT - maxY;

    return {
        left,
        right,
        top,
        bottom,
        width: right - left,
        height:  bottom - top
    }
}

function clampSliderToPlayfield(slider) {
    let possibleMovementBounds = CalculatePossibleMovementBounds(slider);

    // The slider rotation applied in computeModifiedPosition might make it impossible to fit the slider into the playfield
    // For example, a long horizontal slider will be off-screen when rotated by 90 degrees
    // In this case, limit the rotation to either 0 or 180 degrees
    if (possibleMovementBounds.width < 0 || possibleMovementBounds.height < 0)
    {
        const currentRotation = getSliderRotation(slider);
        const diff1 = getAngleDifference(slider.Rotation, currentRotation);
        const diff2 = getAngleDifference(slider.Rotation + Math.PI, currentRotation);

        if (diff1 < diff2) {
            RotateSlider(slider, slider.Rotation - getSliderRotation(slider));
        } else {
            RotateSlider(slider, slider.Rotation + Math.PI - getSliderRotation(slider));
        }

        possibleMovementBounds = CalculatePossibleMovementBounds(slider);
    }

    const previousPosition = slider.positionModified;

    // Clamp slider position to the placement area
    // If the slider is larger than the playfield, at least make sure that the head circle is inside the playfield
    const newX = possibleMovementBounds.width < 0
        ? clamp(possibleMovementBounds.left, 0, PLAYFIELD_WIDTH)
        : clamp(previousPosition[0], possibleMovementBounds.left, possibleMovementBounds.right);

        const newY = possibleMovementBounds.height < 0
        ? clamp(possibleMovementBounds.top, 0, PLAYFIELD_HEIGHT)
        : clamp(previousPosition[1], possibleMovementBounds.top, possibleMovementBounds.bottom);

    slider.position = slider.positionModified = [newX, newY];
	slider.endPositionModified = slider.endPosition;

    return vectorSubtract(slider.positionModified, previousPosition);
}

function applyDecreasingShift(hitObjects, shift) {
    for (const [i, hitObject] of hitObjects.entries()) {
        // The first object is shifted by a vector slightly smaller than shift
        // The last object is shifted by a vector slightly larger than zero
        const position = vectorFAdd(hitObject.position, vectorMultiply(shift, (hitObjects.length - i) / (hitObjects.length + 1)));

        hitObject.position = clampToPlayfieldWithPadding(position, float(beatmap.Radius));
    }
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

    if(enabled_mods.includes("HD") && options.hidden)
        beatmap.TimeFadein = beatmap.TimePreempt * 0.4;

    const legacyHitWindowCorrection = isUsingClassicMod ? 0.5 : 0;

    // OD
    beatmap.HitWindow300 = difficultyRange(beatmap.OverallDifficultyRealtime, 80, 50, 20) - legacyHitWindowCorrection;
    beatmap.HitWindow100 = difficultyRange(beatmap.OverallDifficultyRealtime, 140, 100, 60) - legacyHitWindowCorrection;
    beatmap.HitWindow50 = difficultyRange(beatmap.OverallDifficultyRealtime, 200, 150, 100) - legacyHitWindowCorrection;
    beatmap.HitWindowMiss = 400;

    // CS
    beatmap.Scale = (1.0 - 0.7 * (beatmap.CircleSize - 5) / 5) / 2;
    beatmap.Radius = 33.357669830322266 ?? 23.05 - (beatmap.CircleSize - 7) * 4.4825;
    beatmap.FollowpointRadius = beatmap.Radius * 2;
    beatmap.ActualFollowpointRadius = beatmap.Radius * 2.4;

    beatmap.StackLeniency = parseFloat(beatmap.StackLeniency);

    if(isNaN(beatmap.StackLeniency))
        beatmap.StackLeniency = 0.7;

    for (const hitObject of beatmap.hitObjects) {
        if (hitObject.objectName != 'circle') continue;

        hitObject.endTime = hitObject.startTime;
        hitObject.endPosition = hitObject.position;
    }

    // HR/MR inversion
	// MR default setting is horizontal (settings is missing), reflection=1 means vertical, reflection=2 means both vertical and horizontal
    beatmap.hitObjects.forEach((hitObject, i) => {
		// vertical
        if(enabled_mods.includes("HR") || 
		(enabled_mods.includes("MR") && mods_raw.filter(mod => mod.acronym == "MR")[0].settings?.reflection >= 1)){
            hitObject.position[1] = PLAYFIELD_HEIGHT - hitObject.position[1];

            if(hitObject.objectName == "slider"){
                for(let x = 0; x < hitObject.points.length; x++)
                    hitObject.points[x][1] = PLAYFIELD_HEIGHT - hitObject.points[x][1];
            }
        }
		// horizontal
		if(enabled_mods.includes("MR")){
			let settings = mods_raw.filter(mod => mod.acronym == "MR")[0].settings;
			// either no settings or reflection not set to vertical
			if (!settings || (settings && settings.reflection != 1)) {
				hitObject.position[0] = PLAYFIELD_WIDTH - hitObject.position[0];

				if(hitObject.objectName == "slider"){
					for(let x = 0; x < hitObject.points.length; x++)
						hitObject.points[x][0] = PLAYFIELD_WIDTH - hitObject.points[x][0];
				}
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

	let currentCombo = 1;
    let currentComboNumber = 0;

    // Set combo colors
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
	});

    // Generate slider ticks and apply lazy end position
    beatmap.hitObjects.forEach((hitObject, i) => {
        hitObject.StackHeight = 0;

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

    if(renderTime == 0 && options.percent){
        renderTime = beatmap.hitObjects[Math.floor(options.percent * (beatmap.hitObjects.length - 1))].startTime - 2000;
    }else if(options.objects){
        let objectIndex = 0;

        for(let i = 0; i < beatmap.hitObjects.length; i++){
            if(beatmap.hitObjects[i].startTime >= renderTime){
                objectIndex = i;
                break;
            }
        }

        renderTime -= 200;

        if(beatmap.hitObjects.length > objectIndex + options.objects)
            renderLength = beatmap.hitObjects[objectIndex + options.objects].startTime - renderTime + 400;
    }else{
        let firstNonSpinner = beatmap.hitObjects.filter(x => x.objectName != 'spinner');

        if (firstNonSpinner.length == 0)
            firstNonSpinner = beatmap.hitObjects[0];

        renderTime = Math.max(renderTime, Math.max(0, firstNonSpinner[0].startTime - 1000));
    }

    if(options.combo){
        let current_combo = 0;

        for(let hitObject of beatmap.hitObjects){
            if(hitObject.objectName == 'slider'){
                current_combo += 1;

                for(let i = 0; i < hitObject.repeatCount; i++){
                    current_combo += 1 + hitObject.SliderTicks.length;
                    renderTime = hitObject.startTime + i * (hitObject.duration / hitObject.repeatCount);

                    if(current_combo >= options.combo)
                        break;
                }

                if(current_combo >= options.combo)
                    break;
            }else{
                current_combo += 1;
                renderTime = hitObject.endTime;

                if(current_combo >= options.combo)
                    break;
            }
        }
    }

    firstHitobjectIndex = beatmap.hitObjects.findIndex(x => x.endTime > renderTime - 1000) ?? 0;
    lastHitobjectIndex = beatmap.hitObjects.findIndex(x => x.startTime > (renderTime + (renderLength + 1000) * speed_multiplier)) - 1;

    if (lastHitobjectIndex < 0) 
        lastHitobjectIndex = beatmap.hitObjects.length - 1;

    if (lastHitobjectIndex == firstHitobjectIndex) {
        if (lastHitobjectIndex + 2 > beatmap.hitObjects.length)
            firstHitobjectIndex--;
        else
            lastHitobjectIndex++;
    }

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
		hitObject.endPosition = [hitObject.endPosition[0] + hitObject.StackOffset, hitObject.endPosition[1] + hitObject.StackOffset];

        if(hitObject.objectName == "slider"){
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

	if (enabled_mods.includes('RD')) {
        const settings = score_info?.mods?.find(m => m.acronym == 'RD')?.settings;

        const seed = settings?.seed ?? Math.floor(Math.random() * INT32_MAX_VALUE); 
        const angleSharpness = settings?.angle_sharpness ?? 7; 

        const random = new Random(seed);

        GeneratePositionInfos();

        let sectionOffset = 0;

        // Whether the angles are positive or negative (clockwise or counter-clockwise flow).
        let flowDirection = false;

        for (const [i, hitObject] of beatmap.hitObjects.entries()) {
            if (shouldStartNewSection(random, i)) {
                sectionOffset = getRandomOffset(random, 0.0008, angleSharpness);
                flowDirection = !flowDirection;
            }

            if (hitObject.objectName == 'slider' && random.sample() < 0.5) {
                FlipSliderInPlaceHorizontally(hitObject);
            }

            if (i == 0) {
                hitObject.DistanceFromPrevious = float(random.sample() * PLAYFIELD_HEIGHT / 2);
				hitObject.RelativeAngle = float(random.sample() * 2 * MathF.PI - MathF.PI);
			} else {
                // Offsets only the angle of the current hit object if a flow change occurs.
                let flowChangeOffset = 0;

                // Offsets only the angle of the current hit object.
                let oneTimeOffset = getRandomOffset(random, 0.002, angleSharpness);

                if (shouldApplyFlowChange(random, i)) {
                    flowChangeOffset = getRandomOffset(random, 0.002, angleSharpness);
                    flowDirection = !flowDirection;
                }

                const totalOffset =
                    // sectionOffset and oneTimeOffset should mainly affect patterns with large spacing.
                    (sectionOffset + oneTimeOffset) * hitObject.DistanceFromPrevious +
                    // flowChangeOffset should mainly affect streams.
                    flowChangeOffset * (PLAYFIELD_DIAGONAL - hitObject.DistanceFromPrevious);

                hitObject.RelativeAngle = getRelativeTargetAngle(angleSharpness, hitObject.DistanceFromPrevious, totalOffset, flowDirection);
            }
        }

        let previous;

        for (const [i, hitObject] of beatmap.hitObjects.entries()) {
            if (hitObject.objectName == 'spinner') {
                previous = hitObject;
                continue;
            }

            computeModifiedPosition(hitObject, previous, i > 1 ? beatmap.hitObjects[i - 2] : undefined);

            let shift = [0, 0];

            switch (hitObject.objectName) {
                case 'circle':
                    shift = clampHitCircleToPlayfield(hitObject);
                    break;

                case 'slider':
                    shift = clampSliderToPlayfield(hitObject);
                    break;
            }

            const preceding_hitobjects_to_shift = 10;

            if (!vectorEquals(shift, [0, 0])) {
                const toBeShifted = []

                for (let j = i - 1; j >= i - preceding_hitobjects_to_shift && j >= 0; j--)
                {
                    // only shift hit circles
                    if (hitObject.objectName != 'circle') break;

                    toBeShifted.push(beatmap.hitObjects[j]);
                }

                if (toBeShifted.length > 0)
                    applyDecreasingShift(toBeShifted, shift);
            }

            previous = hitObject;
        }
    }

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
    }else{
        /*for(const frame of replay.replay_data){
            
        }*/
    }

    const cursor = new Cursor(beatmap.Replay);

    let latehit = 0;
    
    for(let i = 0; i < beatmap.hitObjects.length; i++){
        const hitObject = beatmap.hitObjects[i];
		const nextEarliestHit = (beatmap.hitObjects[i+1]?.startTime ?? hitObject.startTime) - beatmap.HitWindowMiss;

        if(hitObject.objectName == 'spinner')
            continue; // process spinners later

        let previous, current = cursor.next();
        let currentPresses = 0;
        let earliestCursor = cursor.i ?? 0;

        do{
            previous = current;
            current = cursor.next();

            if(current != null && current.offset < nextEarliestHit)
				earliestCursor++;

            if(current != null && current.offset > hitObject.latestHit){
                if (isUsingClassicNotelock) {
                    cursor.prev();
                } else {
                    cursor.i = earliestCursor;
                }

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
                        hitObject.hitResult = hitResult;
                    }
                }

                if(hitObject.hitResult != null)
                    break;
            }
        }while(current != null && current.offset < hitObject.latestHit);
    }

    beatmap.ScoringFrames = [];

    const allhits = [];

    cursor.reset();

    for(const hitObject of beatmap.hitObjects){
        if(hitObject.objectName == 'circle' || isUsingSliderHeadAccuracy && hitObject.objectName == 'slider'){
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
            
            if (hitObject.objectName != 'slider')
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

            if (!isUsingSliderHeadAccuracy) {
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
                    scoringFrame.result = 'sliderbreak';
                    
                    scoringFrame.combo = 0;
                }

                beatmap.ScoringFrames.push(scoringFrame);
            }

            for(let i = 0; i < hitObject.repeatCount; i++){
                const repeatOffset = hitObject.startTime + i * (hitObject.duration / hitObject.repeatCount);
                const sliderTicks = hitObject.SliderTicks.slice();

                if(i % 2 == 1)
                    sliderTicks.reverse();

                if(i > 0){
                    const scoringFrame = newScoringFrame(beatmap.ScoringFrames);
                    const replayFrame = cursor.at(repeatOffset);

                    scoringFrame.offset = repeatOffset;

                    const repeatPosition = i % 2 == 1 ? hitObject.endPosition : hitObject.position;

                    scoringFrame.position = repeatPosition;

                    const currentHolding = replayFrame.K1 || replayFrame.K2 || replayFrame.M1 || replayFrame.M2;

                    const isLateStart = isUsingSliderHeadAccuracy && hitObject.hitOffset <= beatmap.HitWindow50 && hitObject.hitOffset > repeatOffset;

                    if(isLateStart || currentHolding && withinCircle(replayFrame.x, replayFrame.y, ...repeatPosition, beatmap.ActualFollowpointRadius)){
                        scoringFrame.result = 30;
                        scoringFrame.combo++;
                        scoringFrame.largeTickHits++;

                        if(scoringFrame.combo > scoringFrame.maxCombo)
                            scoringFrame.maxCombo = scoringFrame.combo;

                        beatmap.ScoringFrames.push(scoringFrame);
                    }else{
                        // missed a slider repeat
                        if (isUsingSliderHeadAccuracy) {
                            scoringFrame.result = 'sliderbreak';
                        } else {
                            scoringFrame.result = 'large_tick_miss';
                            scoringFrame.largeTickMisses++;
                        }
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

                    const replayFrame = cursor.at(offset);

                    const currentHolding = replayFrame.K1 || replayFrame.K2 || replayFrame.M1 || replayFrame.M2;

                    const isLateStart = isUsingSliderHeadAccuracy && hitObject.hitOffset <= beatmap.HitWindow50 && hitObject.hitOffset > repeatOffset;

                    if(isLateStart || currentHolding && withinCircle(replayFrame.x, replayFrame.y, ...tick.position, beatmap.ActualFollowpointRadius)){
                        scoringFrame.result = 10;
                        scoringFrame.combo++;
                        scoringFrame.largeTickHits++;

                        if(scoringFrame.combo > scoringFrame.maxCombo)
                            scoringFrame.maxCombo = scoringFrame.combo;

                        beatmap.ScoringFrames.push(scoringFrame);

                        continue;
                    }

                    // missed a slider tick
                    hitObject.MissedSliderTick = 1;
                    if (isUsingSliderHeadAccuracy) {
                        scoringFrame.result = 'sliderbreak';
                    } else {
                        scoringFrame.result = 'large_tick_miss';
                        scoringFrame.largeTickMisses++;
                    }
                    scoringFrame.combo = 0;

                    beatmap.ScoringFrames.push(scoringFrame);
                }

                if(i + 1 == hitObject.repeatCount){
                    const replayFrame = cursor.at(hitObject.actualEndTime);

                    const endPosition = i % 2 == 1 ? hitObject.position : hitObject.actualEndPosition;

                    const currentHolding = replayFrame.K1 || replayFrame.K2 || replayFrame.M1 || replayFrame.M2;

                    const isLateStart = isUsingSliderHeadAccuracy 
                    && hitObject.hitOffset <= beatmap.HitWindow50 
                    && hitObject.hitOffset > (hitObject.actualEndTime - hitObject.startTime);

                    if(isLateStart || currentHolding && withinCircle(replayFrame.x, replayFrame.y, ...endPosition, beatmap.ActualFollowpointRadius)){
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

                    if (isUsingSliderHeadAccuracy) {
                        if (hitObject.MissedSliderEnd) {
                            scoringFrameEnd.result = 'slider_end_miss';
                            scoringFrameEnd.smallTickMisses++;
                            scoringFrameEnd.sliderEndMisses++;
                        } else {
                            scoringFrameEnd.result = 30;
                            scoringFrameEnd.smallTickHits++;
                            scoringFrameEnd.sliderEndHits++;
                        }
                        beatmap.ScoringFrames.push(scoringFrameEnd);
                        continue;
                    }

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

	const rosu_map = new rosu.Beatmap(osuContents);
    const rosu_diff = new rosu.Difficulty({
        mods: mods_raw,
        clockRate: speed_multiplier,
		lazer: isSetOnLazer,
    });
    const rosu_perf = rosu_diff.gradualPerformance(rosu_map);

    const scoringFrames = beatmap.ScoringFrames.filter(a => ['miss', 50, 100, 300].includes(a.result));

    for(const sf of scoringFrames){
        const hitCount = sf.countMiss + sf.count50 + sf.count100 + sf.count300;

        if (hitCount < firstHitobjectIndex) continue;
        if (hitCount >= lastHitobjectIndex && hitCount != beatmap.hitObjects.length) continue;

		let params = {
			maxCombo: sf.maxCombo,
			n300: sf.count300,
			n100: sf.count100,
			n50: sf.count50,
			misses: sf.countMiss
		};

        let numerator = 300 * sf.count300 + 100 * sf.count100 + 50 * sf.count50;
        let denominator = 300 * hitCount;

		if (isSetOnLazer) {
			params = {
				osuLargeTickHits: sf.largeTickHits,
				osuSmallTickHits: sf.smallTickHits,
				sliderEndHits: sf.sliderEndHits,
				...params,
			}

            const maxSliderEndHits = sf.sliderEndHits + sf.sliderEndMisses;
            const maxLargeTickHits = sf.largeTickMisses + sf.largeTickHits;
            const maxSmallTickHits = sf.smallTickMisses + sf.smallTickHits;

            if (isUsingSliderHeadAccuracy) {
                const sliderEndHits = Math.min(sf.sliderEndHits, maxSliderEndHits);
                const largeTickHits = Math.min(sf.largeTickHits, maxLargeTickHits);

                numerator += 150 * sliderEndHits + 30 * largeTickHits;
                denominator += 150 * maxSliderEndHits + 30 * maxLargeTickHits;
            } else {
                const largeTickHits = Math.min(sf.largeTickHits, maxLargeTickHits);
                const smallTickHits = maxSmallTickHits;

                numerator += 30 * largeTickHits + 10 * smallTickHits;
                denominator += 30 * largeTickHits + 10 * maxSmallTickHits;
            }
		}

        sf.accuracy = numerator / denominator * 100;

		let perfResult;
		if (hitCount == firstHitobjectIndex || hitCount == beatmap.hitObjects.length) 
			perfResult = rosu_perf.nth(params, hitCount);
		else 
			perfResult = rosu_perf.next(params);

        const pp = perfResult?.pp ?? 0;
        const stars = perfResult?.difficulty.stars ?? 0;

        //const stars = new ojsama.diff().calc({map: parser.map, mods});
        //const index = Math.floor((sf.offset - start_offset) / 400)
        //const rosu_stars = star_strains[index < star_strains.length ? index : star_strains.length - 1]
        //console.log(rosu_stars)

        // const pp = ojsama.ppv2({
        //     stars,
        //     combo: sf.maxCombo,
        //     nmiss: sf.countMiss,
        //     n300: sf.count300,
        //     n100: sf.count100,
        //     n50: sf.count50
        // });

        sf.pp = pp;
        sf.stars = stars;
    }

    let pp = 0, stars = 0, accuracy = 100;

    for(const scoringFrame of beatmap.ScoringFrames){
        if(scoringFrame.pp != null){
            ({pp, stars, accuracy} = scoringFrame)
        }

        scoringFrame.pp = pp;
        scoringFrame.stars = stars;
        scoringFrame.accuracy = accuracy;
    }

    const hitResults = _.countBy(beatmap.ScoringFrames, 'result');

    hitResults.ur = beatmap.ScoringFrames[beatmap.ScoringFrames.length - 1].ur;

    beatmap.HitResults = hitResults;

    beatmap.Replay.lastCursor = 0;
    beatmap.Replay.Mods = enabled_mods;
}

async function prepareBeatmap(){
    const osuContents = await fs.promises.readFile(beatmap_path, 'utf8');

    beatmap = osuBeatmapParser.parseContent(osuContents);

    beatmap.CircleSize = beatmap.CircleSize != null ? beatmap.CircleSize : 5;
    beatmap.OverallDifficulty = beatmap.OverallDifficulty != null ? beatmap.OverallDifficulty : 5;
    beatmap.ApproachRate = beatmap.ApproachRate != null ? beatmap.ApproachRate : beatmap.OverallDifficulty;

    let replay;

	console.time("download/parse replay");

    if(options.score_id){
        let replay_path = path.resolve(config.replay_path, `${options.score_id}.osr`);

        if(fs.existsSync(replay_path))
            replay = {lastCursor: 0, replay_data: await parseReplay(fs.readFileSync(replay_path))};
    }

    if(options.osr){
        try{
            const response = await axios.get(options.osr, { timeout: 5000, responseType: 'arraybuffer' });

            replay = {lastCursor: 0, replay_data: await parseReplay(response.data)};
			if (score_info) {
				mods_raw = score_info.mods;
			}
        }catch(e){
            console.error(e);

            throw "Couldn't download replay";
        }
    }

	console.timeEnd("download/parse replay");

    speed_multiplier = 1;

	enabled_mods = mods_raw.map(mod => mod.acronym);

    if(enabled_mods.includes("DT") || enabled_mods.includes("NC")){
		speed_multiplier = mods_raw.filter(mod => mod.acronym == "DT" || mod.acronym == "NC")[0].settings?.speed_change ?? 1.5;
    }else if(enabled_mods.includes("HT") || enabled_mods.includes("DC")){
		speed_multiplier = mods_raw.filter(mod => mod.acronym == "HT" || mod.acronym == "DC")[0].settings?.speed_change ?? 0.75;
    }

	if(enabled_mods.includes("DA")) {
		let settings = mods_raw.filter(mod => mod.acronym == "DA")[0].settings;
		if(settings) {
			beatmap.CircleSize = settings.circle_size ?? beatmap.CircleSize;
			beatmap.ApproachRate = settings.approach_rate ?? beatmap.ApproachRate;
			beatmap.OverallDifficulty = settings.overall_difficulty ?? beatmap.OverallDifficulty;
		}
	}

	if(enabled_mods.includes("CL")) {
		isUsingClassicMod = true;
		let settings = mods_raw.filter(mod => mod.acronym == "CL")[0].settings;

		if(!settings) {
			isUsingClassicNotelock = true;
			isUsingSliderHeadAccuracy = false;
		} else {
			isUsingClassicNotelock = (settings.classic_note_lock == true) ? true : false;
			isUsingSliderHeadAccuracy = (settings.no_slider_head_accuracy == false) ? true : false;
		}
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

    beatmap.renderTime = renderTime;
    beatmap.renderLength = renderLength;

    // trim beatmap
    beatmap.hitObjects[beatmap.hitObjects.length - 1].lastObject = true;
    beatmap.hitObjects = beatmap.hitObjects.slice(firstHitobjectIndex, lastHitobjectIndex + 1);
}

process.on('message', obj => {
    ({beatmap_path, options, speed, mods_raw, time: renderTime, length: renderLength} = obj);

    prepareBeatmap().then(() => {
        process.send(beatmap, () => {
            process.exit();
        });
    })
});
