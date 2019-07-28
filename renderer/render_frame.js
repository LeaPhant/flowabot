
const osuBeatmapParser = require('osu-parser');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const util = require('util');

const axios = require('axios');
const Jimp = require('jimp');
const crypto = require('crypto');
const ffmpeg = require('ffmpeg-static');
const unzip = require('unzip');
const disk = require('diskusage');

const { execFile, fork, spawn } = require('child_process');

const config = require('../config.json');
const helper = require('../helper.js');

const MAX_SIZE = 8 * 1024 * 1024;

let enabled_mods = [""];

const resources = path.resolve(__dirname, "res");

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

const default_hitsounds = [
	"normal-hitnormal",
	"normal-hitclap",
	"normal-hitfinish",
	"normal-hitwhistle",
	"normal-sliderslide",
	"normal-slidertick",
	"normal-sliderwhistle",
	"soft-hitnormal",
	"soft-hitclap",
	"soft-hitfinish",
	"soft-hitwhistle",
	"soft-sliderslide",
	"soft-slidertick",
	"soft-sliderwhistle",
	"drum-hitnormal",
	"drum-hitclap",
	"drum-hitfinish",
	"drum-hitwhistle",
	"drum-sliderslide",
	"drum-slidertick",
	"drum-sliderwhistle",
];

function getTimingPoint(timingPoints, offset){
    let timingPoint = timingPoints[0];

    for(let x = timingPoints.length - 1; x >= 0; x--){
        if(timingPoints[x].offset <= offset && !timingPoints[x].timingChange){
            timingPoint = timingPoints[x];
            break;
        }
    }

    return timingPoint;
}

async function processHitsounds(beatmap_path){
	let hitSoundPath = {};

	let setHitSound = (file, base_path) => {
		let hitSoundName = path.basename(file, path.extname(file));
		let absolutePath = path.resolve(base_path, file);

		if(path.extname(file) === '.wav')
			hitSoundPath[hitSoundName] = absolutePath;

		// prefer .wav over .mp3
		if(path.extname(file) === '.mp3' && !(hitSoundName in hitSoundPath))
			hitSoundPath[hitSoundName] = absolutePath;
	};

	let defaultFiles = await fs.readdir(path.resolve(resources, 'hitsounds'));

	defaultFiles.forEach(file => setHitSound(file, path.resolve(resources, 'hitsounds')));

	// overwrite default hitsounds with beatmap hitsounds
	let beatmapFiles = await fs.readdir(beatmap_path);

	beatmapFiles.forEach(file => setHitSound(file, beatmap_path));

	return hitSoundPath;
}

async function renderHitsounds(mediaPromise, beatmap, start_time, actual_length, time_scale, file_path){
	let media = await mediaPromise;
	let execFilePromise = util.promisify(execFile);

	try{
		await execFilePromise(ffmpeg.path, [
			'-ss', start_time / 1000, '-i', `"${media.audio_path}"`, '-t', actual_length / 1000,
			'-filter:a', `"afade=t=out:st=${actual_length / 1000 * time_scale - 0.5}:d=0.5,atempo=${time_scale},volume=0.7"`,
			path.resolve(file_path, 'audio.wav')
		], { shell: true });
	}catch(e){
		console.error(e);
		throw "Error trimming beatmap audio";
	}

	let hitSoundPaths = await processHitsounds(media.beatmap_path);

	let hitObjects = beatmap.hitObjects.filter(a => a.startTime >= start_time && a.startTime < start_time + actual_length * time_scale);
	let hitSounds = [];

	hitObjects.forEach(hitObject => {
		let timingPoint = getTimingPoint(beatmap.timingPoints, hitObject.startTime);

		if(hitObject.objectName == 'circle'){
			hitObject.HitSounds.forEach(hitSound => {
				let offset = hitObject.startTime;

				offset -= start_time;
				offset /= time_scale;

				if(hitSound in hitSoundPaths){
					hitSounds.push({
						offset,
						sound: hitSound,
						path: hitSoundPaths[hitSound],
						volume: timingPoint.sampleVolume / 100
					});
				}
			});
		}else if(hitObject.objectName == 'slider'){
			hitObject.EdgeHitSounds.forEach((edgeHitSounds, index) => {
				edgeHitSounds.forEach(hitSound => {
					let offset = hitObject.startTime + index * (hitObject.duration / hitObject.repeatCount);

					let edgeTimingPoint = getTimingPoint(beatmap.timingPoints, offset);

					offset -= start_time;
					offset /= time_scale;

					if(hitSound in hitSoundPaths){
						hitSounds.push({
							offset,
							sound: hitSound,
							path: hitSoundPaths[hitSound],
							volume: edgeTimingPoint.sampleVolume / 100
						});
					}
				});
			});

			hitObject.SliderTicks.forEach(tick => {
				for(let i = 0; i < hitObject.repeatCount; i++){
					let offset = hitObject.startTime + (i % 2 == 0 ? tick.offset : tick.reverseOffset) + i * (hitObject.duration / hitObject.repeatCount);

					let tickTimingPoint = getTimingPoint(beatmap.timingPoints, offset);

					offset -= start_time;
					offset /= time_scale;

					tick.HitSounds[i].forEach(hitSound => {
						if(hitSound in hitSoundPaths){
							hitSounds.push({
								type: 'slidertick',
								offset,
								sound: hitSound,
								path: hitSoundPaths[hitSound],
								volume: tickTimingPoint.sampleVolume / 100
							});
						}
					});
				}
			});
		}
	});

	let ffmpegArgs = [];

	let hitSoundIndexes = {};

	hitSounds.forEach(hitSound => {
		if(!(hitSound.sound in hitSoundIndexes)){
			ffmpegArgs.push('-guess_layout_max', '0', '-i', hitSound.path);
			hitSoundIndexes[hitSound.sound] = Object.keys(hitSoundIndexes).length;
		}
	});
	// process in chunks
	let chunkLength = 2500;
	let chunkCount = Math.ceil(actual_length / chunkLength);
	let hitSoundPromises = [];

	let mergeHitSoundArgs = [];

	for(let i = 0; i < chunkCount; i++){
		let hitSoundsChunk = hitSounds.filter(a => a.offset >= i * chunkLength && a.offset < (i + 1) * chunkLength);
		let ffmpegArgsChunk = ffmpegArgs.slice();

		ffmpegArgsChunk.push('-filter_complex');

		let filterComplex = "";
		let indexStart = Object.keys(hitSoundIndexes).length;

		hitSoundsChunk.forEach((hitSound, i) => {
			let fadeOutStart = actual_length - 500;
			let fadeOut = hitSound.offset >= fadeOutStart ? (1 - (hitSound.offset - (actual_length - 500)) / 500) : 1;

			filterComplex += `[${hitSoundIndexes[hitSound.sound]}]adelay=${hitSound.offset}|${hitSound.offset},volume=${hitSound.volume * 0.7 * fadeOut}[${i + indexStart}];`
		});

		hitSoundsChunk.forEach((hitSound, i) => {
			filterComplex += `[${i + indexStart}]`;
		});

		filterComplex += `amix=inputs=${hitSoundsChunk.length}:dropout_transition=${actual_length},volume=${hitSoundsChunk.length}`;

		ffmpegArgsChunk.push(`"${filterComplex}"`, '-ac', '2', path.resolve(file_path, `hitsounds${i}.wav`));
		mergeHitSoundArgs.push('-guess_layout_max', '0', '-i', path.resolve(file_path, `hitsounds${i}.wav`));

		hitSoundPromises.push(execFilePromise(ffmpeg.path, ffmpegArgsChunk, { shell: true }));
	}

	return new Promise((resolve, reject) => {
		Promise.all(hitSoundPromises).then(async () => {
			mergeHitSoundArgs.push('-filter_complex', `amix=inputs=${chunkCount}:dropout_transition=${actual_length},volume=${chunkCount}`, path.resolve(file_path, `hitsounds.wav`));

			await execFilePromise(ffmpeg.path, mergeHitSoundArgs, { shell: true });

			let mergeArgs = [
				'-guess_layout_max', '0', '-i', path.resolve(file_path, `audio.wav`),
				'-guess_layout_max', '0', '-i', path.resolve(file_path, `hitsounds.wav`),
				'-filter_complex', `amix=inputs=2:dropout_transition=${actual_length},volume=2`, path.resolve(file_path, 'merged.wav')
			];

			await execFilePromise(ffmpeg.path, mergeArgs, { shell: true });

			resolve(path.resolve(file_path, 'merged.wav'));
		});
	});
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
							output.beatmap_path = extraction_path;

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

let beatmap, speed_multiplier;

module.exports = {
    get_frame: function(beatmap_path, time, enabled_mods, size, options, cb){
        let worker = fork(path.resolve(__dirname, 'beatmap_preprocessor.js'), ['--max-old-space-size=512']);

        worker.send({
            beatmap_path,
            options,
            enabled_mods
        });

		worker.on('close', code => {
			if(code > 0){
				cb("Error processing beatmap");
				return false;
			}
		});

        worker.on('message', _beatmap => {
            beatmap = _beatmap;

            if(time == 0 && options.percent){
                time = beatmap.hitObjects[Math.floor(options.percent * beatmap.hitObjects.length)].startTime - 2000;
            }else{
                let firstNonSpinner = beatmap.hitObjects.filter(x => x.objectName != 'spinner');
                time = Math.max(time, firstNonSpinner[0].startTime);
            }

            let worker = fork(path.resolve(__dirname, 'render_worker.js'));

			worker.on('close', code => {
				if(code > 0){
					cb("Error rendering beatmap");
					return false;
				}
			});

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

        let worker = fork(path.resolve(__dirname, 'beatmap_preprocessor.js'));

        worker.send({
            beatmap_path,
            options,
            enabled_mods
        });

		worker.on('close', code => {
			if(code > 0){
				cb("Error processing beatmap");
				return false;
			}
		});

        worker.on('message', _beatmap => {
            beatmap = _beatmap;

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

				if(length >= 10 * 1000)
					options.type = 'mp4';

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
				let audioProcessingPromise = renderHitsounds(mediaPromise, beatmap, start_time, actual_length, time_scale, file_path);

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

                    worker.on('close', code => {
						if(code > 0){
							cb("Error rendering beatmap");
							return false;
						}

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
                                        cb("Error encoding video");
                                        return false;
                                    }

                                    if(config.debug)
                                        console.timeEnd('encode video');

                                    cb(null, `${file_path}/video.${options.type}`, file_path);
                                });
                            }else{
                                Promise.all([mediaPromise, audioProcessingPromise]).then(response => {
									let media = response[0];
									let audio = response[1];

                                    if(media.background_path)
                                        ffmpeg_args.unshift('-loop', '1', '-r', fps, '-i', `"${media.background_path}"`);
                                    else
                                        ffmpeg_args.unshift('-f', 'lavfi', '-r', fps, '-i', `color=c=black:s=${size.join("x")}`);

                                    ffmpeg_args.push('-i', audio);

                                    bitrate -= 128;
                                }).catch(e => {
									helper.error(e);
                                    ffmpeg_args.unshift('-f', 'lavfi', '-r', fps, '-i', `color=c=black:s=${size.join("x")}`);
                                    helper.log("rendering without audio");
                                }).finally(() => {
                                    ffmpeg_args.push(
                                        '-filter_complex', `"overlay=(W-w)/2:shortest=1"`,
                                        '-pix_fmt', 'yuv420p', '-r', fps, '-c:v', 'libx264', '-b:v', `${bitrate}k`, '-c:a', 'aac', '-b:a', '128k', '-shortest', '-preset', 'veryfast', `${file_path}/video.mp4`
                                    );

                                    execFile(ffmpeg.path, ffmpeg_args, { shell: true }, err => {
                                        if(err){
                                            helper.error(err);
                                            cb("Error encoding video");
                                            //fs.remove(file_path);
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
