
const osuBeatmapParser = require('osu-parser');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const lzma = require('lzma');
const axios = require('axios');
const Jimp = require('jimp');
const crypto = require('crypto');
const ffmpeg = require('ffmpeg-static');
const unzip = require('unzip');
const disk = require('diskusage');

const { execFile, fork } = require('child_process');

const config = require('../config.json');
const helper = require('../helper.js');

const MAX_SIZE = 8 * 1024 * 1024;

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;

let enabled_mods = ["HR"];

let palette = [0, 0, 0, 0];
for(let i = 1; i <= 255; i++){
    palette.push(i, i, i, 255);
}

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

function downloadMedia(options, beatmap, beatmap_path, size, download_path){
    return new Promise((resolve, reject) => {
        let output = {};

        if(options.type != 'mp4' || !options.audio || !config.credentials.osu_api_key){
            reject();
            return false;
        }

        fs.readFile(beatmap_path, 'utf8', (err, content) => {
            if(err){
                reject();
                return false;
            }

            let params = {
                k: config.credentials.osu_api_key
            };

            if(beatmap.BeatmapID){
                params.b = beatmap.BeatmapID;
            }else{
                let md5_hash = crypto.createHash('md5').update(content).digest("hex");
                params.h = md5_hash;
            }

            axios.get('https://osu.ppy.sh/api/get_beatmaps', { params }).then(response => {
                response = response.data;
                if(response.length == 0){
                    reject();
                    return false;
                }

                let beatmapset_id = response[0].beatmapset_id;

                helper.log('downloading from', `https://osu.gatari.pw/d/${beatmapset_id}`);

                axios.get(`https://osu.gatari.pw/d/${beatmapset_id}`, {responseType: 'stream'}).then(response => {
                    if(Number(response.data.headers['content-length']) < 500){
                        reject();
                        return false;
                    }

                    let stream = response.data.pipe(fs.createWriteStream(path.resolve(download_path, 'map.zip')));

                    stream.on('finish', () => {
                        let extraction_path = path.resolve(download_path, 'map');
                        let extraction = fs.createReadStream(path.resolve(download_path, 'map.zip')).pipe(unzip.Extract({ path: extraction_path }));

                        extraction.on('close', () => {
                            if(beatmap.AudioFilename && fs.existsSync(path.resolve(extraction_path, beatmap.AudioFilename)))
                                output.audio_path = path.resolve(extraction_path, beatmap.AudioFilename);

                            if(beatmap.bgFilename && fs.existsSync(path.resolve(extraction_path, beatmap.bgFilename)))
                                output.background_path = path.resolve(extraction_path, beatmap.bgFilename);

                            if(beatmap.bgFilename && output.background_path){
                                helper.log('resizing image');

                                Jimp.read(output.background_path).then(img => {
                                    img
                                    .cover(...size)
                                    .color([
                                        { apply: 'shade', params: [80] }
                                    ])
                                    .writeAsync(path.resolve(extraction_path, 'bg.png')).then(() => {
                                        output.background_path = path.resolve(extraction_path, 'bg.png');

                                        resolve(output);
                                    }).catch(err => {
                                        output.background_path = null;
                                        resolve(output);
                                        helper.error(err);
                                    });
                                }).catch(err => {
                                    output.background_path = null;
                                    resolve(output);
                                    helper.error(err);
                                });
                            }else{
                                if(Object.keys(output).length == 0){
                                    reject();
                                    return false;
                                }

                                resolve(output);
                            }
                        });

                        extraction.on('error', () => {
                            reject();
                        });
                    });

                    stream.on('error', () => {
                        reject();
                    });
                }).catch(() => {
                    reject();
                });
            }).catch(reject);
        });

        if(config.debug)
            helper.log('downloading beatmap osz');
    });
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

function processBeatmap(beatmap, enabled_mods, cb){

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
                        if(vectorDistanceSquared(slider_dot, last_slider_dot) >= 0.01){
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

    cb();
}

let beatmap, speed_multiplier;

function prepareBeatmap(beatmap_path, mods, options, cb){
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

        if(mods.includes("DT")){
            speed_multiplier = 1.5;
        }else if(mods.includes("HT")){
            speed_multiplier = 0.75;
        }

        let {cs, ar, od} = calculate_csarod(beatmap.CircleSize, beatmap.ApproachRate, beatmap.OverallDifficulty, mods);

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

        processBeatmap(beatmap, mods, cb);
    });
}

module.exports = {
    get_frame: function(beatmap_path, time, enabled_mods, size, options, cb){
        prepareBeatmap(beatmap_path, enabled_mods, options, () => {
            if(time == 0 && options.percent){
                time = beatmap.hitObjects[Math.floor(options.percent * beatmap.hitObjects.length)].startTime - 2000;
            }else{
                let firstNonSpinner = beatmap.hitObjects.filter(x => x.objectName != 'spinner');
                time = Math.max(time, firstNonSpinner[0].startTime);
            }

            let worker = fork(path.resolve(__dirname, 'render_worker.js'));

            worker.on('message', buffer => {
                cb(null, Buffer.from(buffer, 'base64'));
            });

            worker.send({
                beatmap,
                start_time: time,
                options,
                size
            });
        });
    },

    get_frames: function(beatmap_path, time, length, enabled_mods, size, options, cb){
        if(config.debug)
            console.time('process beatmap');

        prepareBeatmap(beatmap_path, enabled_mods, options, () => {
            if(config.debug)
                console.timeEnd('process beatmap');

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

            length = Math.min(400 * 1000, length);

            let start_time = time;

            let time_max = Math.min(time + length + 1000, beatmap.hitObjects[beatmap.hitObjects.length - 1].endTime + 1500);

            let actual_length = time_max - time;

            let rnd = Math.round(1e9 * Math.random());
            let file_path;
            let fps = options.fps || 60;

            let i = 0;

            let time_scale = 1;

            if(enabled_mods.includes('DT'))
                time_scale *= 1.5;

            if(enabled_mods.includes('HT'))
                time_scale *= 0.75;

            if(!('type' in options))
                options.type = 'gif';

            if(options.type == 'gif')
                fps = 50;

            let time_frame = 1000 / fps;

            let bitrate = 500 * 1024;

            if(actual_length > 160 * 1000 && actual_length < 210 * 1000)
                size = [250, 262];
            else if(actual_length >= 210 * 1000)
                size = [180, 128];

            if(actual_length > 360 * 1000){
                actual_length = 360 * 1000;
                max_time = time + actual_length;
            }

            file_path = path.resolve(os.tmpdir(), 'frames', `${rnd}`);
            fs.ensureDirSync(file_path);

            let frames_size = actual_length / time_frame * size[0] * size[1] * 4;

            disk.check(file_path, (err, info) => {
                if(err){
                    helper.error(err);
                    cb(err);
                    return false;
                }

                if(info.available * 0.9 < frames_size){
                    cb("Not enough disk space");
                    return false;
                }

                let ffmpeg_args = [
                    '-f', 'image2', '-r', fps, '-s', size.join('x'), '-pix_fmt', 'rgba', '-c:v', 'rawvideo',
                    '-i', `${file_path}/%d.rgba`
                ];

                let mediaPromise = downloadMedia(options, beatmap, beatmap_path, size, file_path);

                mediaPromise.catch(() => {});

                if(options.type == 'mp4')
                    bitrate = Math.min(bitrate, (0.7 * MAX_SIZE) * 8 / (actual_length / 1000) / 1024);

                time_frame *= time_scale;

                let workers = [];
                let threads = require('os').cpus().length;

                for(let i = 0; i < threads; i++){
                    workers.push(
                        fork(path.resolve(__dirname, 'render_worker.js'))
                    );
                }

                let done = 0;

                if(config.debug)
                    console.time('render beatmap');

                workers.forEach((worker, index) => {
                    worker.send({
                        beatmap,
                        start_time: time + index * time_frame,
                        end_time: time + index * time_frame + time_scale * actual_length,
                        time_frame: time_frame * threads,
                        file_path,
                        options,
                        threads,
                        current_frame: index,
                        size
                    });

                    worker.on('close', () => {
                        done++;

                        if(done == threads){
                            if(config.debug){
                                console.timeEnd('render beatmap');
                                console.time('encode video');
                            }

                            if(options.type == 'gif'){
                                ffmpeg_args.push(`${file_path}/video.gif`);

                                execFile(ffmpeg.path, ffmpeg_args, err => {
                                    if(err){
                                        helper.error(err);
                                        cb("Couldn't encode video");
                                        return false;
                                    }

                                    if(config.debug)
                                        console.timeEnd('encode video');

                                    cb(null, `${file_path}/video.${options.type}`, file_path);
                                });
                            }else{
                                Promise.resolve(mediaPromise).then(media => {
                                    if(media.background_path)
                                        ffmpeg_args.unshift('-loop', '1', '-r', fps, '-i', `"${media.background_path}"`);
                                    else
                                        ffmpeg_args.unshift('-f', 'lavfi', '-r', fps, '-i', `color=c=black:s=${size.join("x")}`);

                                    ffmpeg_args.push(
                                        '-ss', start_time / 1000, '-i', `"${media.audio_path}"`, '-filter:a', `"afade=t=out:st=${actual_length / 1000 * time_scale - 0.5}:d=0.5,atempo=${time_scale},volume=0.7"`
                                    );
                                }).catch(() => {
                                    ffmpeg_args.unshift('-f', 'lavfi', '-r', fps, '-i', `color=c=black:s=${size.join("x")}`);
                                    helper.log("rendering without audio");
                                }).finally(() => {
                                    ffmpeg_args.push(
                                        '-filter_complex', `"overlay=(W-w)/2:shortest=1"`,
                                        '-pix_fmt', 'yuv420p', '-r', fps, '-c:v', 'libx264', '-b:v', `${bitrate}k`, '-c:a', 'aac', '-shortest', '-preset', 'veryfast', `${file_path}/video.mp4`
                                    );

                                    execFile(ffmpeg.path, ffmpeg_args, { shell: true }, err => {
                                        if(err){
                                            helper.error(err);
                                            cb("Couldn't encode video");
                                            fs.remove(file_path);
                                            return false;
                                        }

                                        if(config.debug)
                                            console.timeEnd('encode video');

                                        cb(null, `${file_path}/video.${options.type}`, file_path);
                                    });
                                });
                            }
                        }
                    });
                });
            });
        });
    }
};
