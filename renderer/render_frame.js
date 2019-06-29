
const osuBeatmapParser = require('osu-parser');
const osuReplayParser = require('osureplayparser');
const randomColor = require('randomcolor');
const math = require('mathjs');
const fs = require('fs');
const path = require('path');

const GifEncoder = require('gif-encoder');

const { createCanvas } = require('canvas');

let enabled_mods = ["HR"];

let palette = [0, 0, 0, 0];
for(let i = 1; i <= 255; i++){
    palette.push(i, i, i, 255);
}

const STACK_DISTANCE = 3;
const OBJECT_RADIUS = 64;

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;
const PLAYFIELD_PADDING = 85;

const STACK_LENIENCE = 3;

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

function withinCircle(x, y, centerX,  centerY, radius){
    return Math.pow((x - centerX), 2) + Math.pow((y - centerY), 2) < Math.pow(radius, 2);
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

function processBeatmap(beatmap, enabled_mods){

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
    // console.log("stack leniency:", stackLeniency);

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
            // console.log("new stack height =", objN.stackHeight);
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
            // console.log("new stack height =", objN.stackHeight);
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

            for(var x = 0; x < beatmap.timingPoints.length; x++){
                timingPoint = beatmap.timingPoints[x];
                if(timingPoint.offset <= hitObject.startTime) break;
            }

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

            var slider_dots = [];
            var last_slider_dot;

            slider_parts.forEach(function(part, index){
                for(var x = 0; x <= 1; x += 0.001){
                    var slider_dot = coordsOnBezier(part, x);
                    if(last_slider_dot){
                        if(vectorDistance(slider_dot, last_slider_dot) >= 0.1){
                            slider_dots.push(slider_dot);
                            last_slider_dot = slider_dot;
                        }
                    }else{
                        slider_dots.push(slider_dot);
                        last_slider_dot = slider_dot;
                    }
                }
            });

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
}

let canvas, ctx;

var active_area_width;;
var active_playfield_width, active_playfield_height, scale_multiplier;

let beatmap, speed_multiplier;

function resize(){
    active_playfield_width = canvas.width * 0.7;
    active_playfield_height = active_playfield_width * (3/4);
    var position = playfieldPosition(0, 0);
    var size = playfieldPosition(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
    scale_multiplier = (size[0] - position[0]) / PLAYFIELD_WIDTH;
}

function playfieldPosition(x, y){
    var ratio_x = x / PLAYFIELD_WIDTH;
    var ratio_y = y / PLAYFIELD_HEIGHT;

    return [
        active_playfield_width * ratio_x + canvas.width * 0.15,
        active_playfield_height * ratio_y + canvas.height * 0.15
    ];
}

function variance(array, total){
    let sum = 0;
    array.forEach(a => sum += a);
	var avg = sum / total;
	var _array = array.map(function(a){ return Math.pow(a - avg, 2); });
    let _sum = 0;
    _array.forEach(a => _sum += a);
	return Math.sqrt(_sum / total);
}

function prepareCanvas(size){
    canvas = createCanvas(...size);
    ctx = canvas.getContext("2d");
    resize();
}

function prepareBeatmap(beatmap_path, mods, options, cb){
    osuBeatmapParser.parseFile(beatmap_path, function(err, _beatmap){
        if(err)
            throw err;

        beatmap = _beatmap;

        speed_multiplier = 1;

        if(mods.includes("DT")){
            speed_multiplier = 1.5;
        }else if(mods.includes("HT")){
            speed_multiplier = 0.75;
        }

        let {cs, ar, od} = calculate_csarod(beatmap.CircleSize, beatmap.ApproachRate, beatmap.OverallDifficulty, mods);

        beatmap.CircleSize = cs;
        beatmap.ApproachRate = ar;
        beatmap.OverallDifficulty = od;

        console.log('ar option', options.ar);

        if(!isNaN(options.cs) && !(options.cs === undefined))
            beatmap.CircleSize = options.cs;

        if(!isNaN(options.ar) && !(options.ar === undefined))
            beatmap.ApproachRate = options.ar;

        console.log('AR', beatmap.ApproachRate);

        processBeatmap(beatmap, mods);
        cb();
    });
}

function processFrame(time, options){
    let hitObjectsOnScreen = [];

    ctx.globalAlpha = 1;

    beatmap.hitObjects.forEach(hitObject => {
        if(time >= hitObject.startTime - beatmap.TimeFadein && hitObject.endTime - time > -200)
            hitObjectsOnScreen.push(hitObject);
    });

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if(options.black){
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    hitObjectsOnScreen.sort(function(a, b){ return a.startTime - b.startTime; });

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3 * scale_multiplier;
    ctx.shadowColor = 'transparent';

    hitObjectsOnScreen.forEach(function(hitObject, index){
        if(index < hitObjectsOnScreen.length - 1){
            let nextObject = hitObjectsOnScreen[index + 1];
            let distance = vectorDistance(hitObject.endPosition, nextObject.position);

            if(time >= (nextObject.startTime - beatmap.TimeFadein) && time < (nextObject.startTime + beatmap.HitWindow50) && distance > 80){
                let start_position = playfieldPosition(...hitObject.endPosition);
                let end_position = playfieldPosition(...nextObject.position);

                let progress_0 = nextObject.startTime - beatmap.TimeFadein

                let a = progress_0;

                progress_0 += time - progress_0;
                let progress_1 = nextObject.startTime - beatmap.TimePreempt;

                progress_1 -= a
                progress_0 -= a;

                let progress = Math.min(1, progress_0 / progress_1 * 2);

                let v = [
                    end_position[0] - start_position[0],
                    end_position[1] - start_position[1]
                ];

                v[0] *= progress;
                v[1] *= progress;


                ctx.beginPath();
                ctx.moveTo(...start_position);
                ctx.lineTo(start_position[0] + v[0], start_position[1] + v[1]);
                ctx.stroke();

                //then shift x by cos(angle)*radius and y by sin(angle)*radius
            }
        }
    });

    hitObjectsOnScreen.reverse();

    hitObjectsOnScreen.forEach(function(hitObject, index){
        if(time < hitObject.startTime || hitObject.objectName != "circle" && time < hitObject.endTime){
            let opacity = (time - (hitObject.startTime - beatmap.TimeFadein)) / (beatmap.TimeFadein - beatmap.TimePreempt);
            let approachCircle = 1 - (time - (hitObject.startTime - beatmap.TimePreempt)) / beatmap.TimePreempt;
            if(approachCircle < 0) approachCircle = 0;
            if(opacity > 1) opacity = 1;
            ctx.globalAlpha = opacity;
            ctx.shadowBlur = 4 * scale_multiplier;
            ctx.fillStyle = "rgba(40,40,40,0.2)";
            let followpoint_dot;

            if(hitObject.objectName == "slider"){

                let render_dots = [];

                for(let x = 0; x < hitObject.SliderDots.length; x += 20){
                    render_dots.push(hitObject.SliderDots[x]);
                }


                ctx.lineWidth = 6 * scale_multiplier;
                ctx.strokeStyle = "white";

                ctx.beginPath();
                ctx.lineCap = "round";
                ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                ctx.shadowColor = 'transparent';
                ctx.lineJoin = "round"

                ctx.lineWidth = scale_multiplier * beatmap.Radius * 2;

                render_dots.forEach(function(dot, index){
                    var position = playfieldPosition(dot[0], dot[1]);
                    if(index == 0){
                        ctx.moveTo(position[0], position[1]);
                    }else{
                        ctx.lineTo(position[0], position[1]);
                    }
                });

                ctx.stroke();

                if(time >= hitObject.startTime && time <= hitObject.endTime){
                    var currentTurn = Math.floor((time - hitObject.startTime) / (hitObject.duration / hitObject.repeatCount));
                    var currentOffset = (time - hitObject.startTime) / (hitObject.duration / hitObject.repeatCount) - currentTurn;

                    if(currentTurn % 2 == 0)
                        followpoint_dot = hitObject.SliderDots[Math.floor(currentOffset * hitObject.SliderDots.length)];
                    else
                        followpoint_dot = hitObject.SliderDots[Math.floor((1 - currentOffset) * hitObject.SliderDots.length)];
                }
            }

            if(hitObject.objectName != "spinner"){

                if(!options.noshadow)
                    ctx.shadowColor = "rgba(0,0,0,0.7)";

                ctx.lineWidth = 6 * scale_multiplier;
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255,255,255,0.85)";

                var position = playfieldPosition(hitObject.position[0], hitObject.position[1]);

                if(options.fill){
                    ctx.beginPath();
                    ctx.fillStyle = hitObject.Color;
                    ctx.arc(position[0], position[1], scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(position[0], position[1], scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                ctx.stroke();

                ctx.fillStyle = 'white';
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";

                let fontSize = 16;
                fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                fontSize *= scale_multiplier;

                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillText(hitObject.ComboNumber, position[0], position[1]);

                if(approachCircle > 0){
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2 * scale_multiplier;
                    ctx.beginPath();
                    var position = playfieldPosition(hitObject.position[0], hitObject.position[1]);
                    ctx.arc(position[0], position[1], scale_multiplier * (beatmap.Radius + approachCircle * (beatmap.Radius * 2)), 0, 2 * Math.PI, false);
                    ctx.stroke();
                }

                if(followpoint_dot){
                    ctx.fillStyle = "rgba(255,255,255,0.3)";
                    ctx.beginPath();
                    var position = playfieldPosition(followpoint_dot[0], followpoint_dot[1]);
                    ctx.arc(position[0], position[1], scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                    ctx.fill();
                    ctx.fillStyle = "rgba(255,255,255,0.8)";
                    ctx.beginPath();
                    var position = playfieldPosition(followpoint_dot[0], followpoint_dot[1]);
                    ctx.arc(position[0], position[1], scale_multiplier * (beatmap.Radius * 3), 0, 2 * Math.PI, false);
                    ctx.stroke();
                }

            }
        }else if(hitObject.startTime - time > -200){
            if(hitObject.objectName != "spinner"){
                let timeSince = Math.abs(hitObject.endTime - time) / 200;
                let opacity = 1 - timeSince;
                let sizeFactor = 1 + timeSince * 0.3;

                ctx.globalAlpha = opacity;

                if(!options.noshadow)
                    ctx.shadowColor = "rgba(0,0,0,0.7)";

                ctx.lineWidth = 6 * scale_multiplier;
                ctx.beginPath();
                ctx.strokeStyle = "rgba(255,255,255,0.85)";

                var position = playfieldPosition(hitObject.position[0], hitObject.position[1]);

                if(options.fill){
                    ctx.beginPath();
                    ctx.fillStyle = hitObject.Color;
                    ctx.arc(position[0], position[1], sizeFactor * scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(position[0], position[1], sizeFactor * scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                ctx.stroke();

                ctx.fillStyle = 'white';
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";

                let fontSize = 16;
                fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                fontSize *= scale_multiplier * sizeFactor;

                ctx.font = `${fontSize}px sans-serif`;
                ctx.fillText(hitObject.ComboNumber, position[0], position[1]);
            }
        }
    });

    if(options.border){
        ctx.strokeStyle = "rgb(200,200,200)";
        ctx.lineWidth = 1;
        ctx.globalAlpha = 1;

        var position = playfieldPosition(0, 0);
        var size = playfieldPosition(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
        ctx.strokeRect(position[0], position[1], size[0] - position[0], size[1] - position[1]);
    }
}

module.exports = {
    get_frame: function(beatmap_path, time, enabled_mods, size, options, cb){
        prepareCanvas(size);

        prepareBeatmap(beatmap_path, enabled_mods, options, () => {
            if(time == 0 && options.percent){
                time = beatmap.hitObjects[Math.floor(options.percent * beatmap.hitObjects.length)].startTime - 2000;
            }else{
                let firstNonSpinner = beatmap.hitObjects.filter(x => x.objectName != 'spinner');
                time = Math.max(time, firstNonSpinner[0].startTime);
            }

            processFrame(time, options);
            cb(canvas.toBuffer());
        });
    },

    get_frames: function(beatmap_path, time, length, enabled_mods, size, options, cb){
        let gif = new GifEncoder(...size, {
            highWaterMark: 50 * 1024 * 1024 // 5MB
        });

        let rnd = Math.round(1e9 * Math.random());
        let path = `/tmp/osu_${rnd}.gif`;
        let file = require('fs').createWriteStream(path);
        gif.pipe(file);

        prepareCanvas(size);

        gif.writeHeader();

        gif.setQuality(200);
        gif.setRepeat(0);

        gif.setDispose(2);

        gif.setDelay(20);

        prepareBeatmap(beatmap_path, enabled_mods, options, () => {
            if(time == 0 && options.percent){
                time = beatmap.hitObjects[Math.floor(options.percent * beatmap.hitObjects.length)].startTime - 2000;
            }else if(options.objects){
                let objectIndex = 0;

                for(let i = 0; i < beatmap.hitObjects.length; i++){
                    if(beatmap.hitObjects[i].startTime >= time){
                        objectIndex = i;
                        break;
                    }
                }

                time -= 200;

                if(beatmap.hitObjects.length > objectIndex + options.objects)
                    length = beatmap.hitObjects[objectIndex + options.objects].startTime - time + 400;

            }else{
                let firstNonSpinner = beatmap.hitObjects.filter(x => x.objectName != 'spinner');
                time = Math.max(time, firstNonSpinner[0].startTime);
            }

            console.log('time', time);
            console.log('length', length);

            let time_max = time + length;
            let i = 0;

            let time_frame = 20;

            if(enabled_mods.includes('DT'))
                time_frame = 30;

            if(enabled_mods.includes('HT'))
                time_frame = 15;

            while(time < time_max){
                processFrame(time, options);

                let image_data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

                for(let i = 0; i < image_data.length; i += 4){
                    if(image_data[i + 3] > 0){
                        let scale = Math.round(image_data[i + 0] * image_data[i + 3] / 255);
                        image_data[i] = scale;
                        image_data[i + 1] = scale;
                        image_data[i + 2] = scale;
                        image_data[i + 3] = 255;
                    }
                }

                gif.addFrame(image_data);
                i++;
                time += time_frame;
            }

            gif.finish();

        });

        file.on('finish', () => {
            cb(path);
        });
    }
};
