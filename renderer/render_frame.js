const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

const axios = require('axios');
const Jimp = require('jimp');
const crypto = require('crypto');

const unzip = require('unzipper');
const disk = require('diskusage');

const { exec, execFile, fork, spawn } = require('child_process');

const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);
const diskCheck = util.promisify(disk.check);

const processBeatmap = require('./beatmap/process.js');

const config = require('../config.json');
const helper = require('../helper.js');

const ffmpeg = config.ffmpeg_path || require('ffmpeg-static');

const MAX_SIZE = 25 * 1024 * 1024;
const MAX_SIZE_DM = 8 * 1024 * 1024;

let enabled_mods = [""];

const resources = path.resolve(__dirname, "res");

async function copyDir(src,dest) {
    const entries = await fs.promises.readdir(src, {withFileTypes: true});
    await fs.promises.mkdir(dest);
    for(let entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if(entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        } else {
            await fs.promises.copyFile(srcPath, destPath);
        }
    }
}


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
        if(timingPoints[x].offset <= offset){
            timingPoint = timingPoints[x];
            break;
        }
    }

    return timingPoint;
}

async function processHitsounds(beatmap_path, argon){
	let hitSoundPath = {};

	let setHitSound = (file, base_path, custom) => {
		let hitSoundName = path.basename(file, path.extname(file));

		if(hitSoundName.match(/\d+/) === null && custom)
			hitSoundName += '1';

		let absolutePath = path.resolve(base_path, file);

		if(path.extname(file) === '.wav' || path.extname(file) === '.mp3')
			hitSoundPath[hitSoundName] = absolutePath;
	};

	let defaultFiles = await fs.promises.readdir(path.resolve(resources, argon ? 'argon' : 'hitsounds'));

	defaultFiles.forEach(file => setHitSound(file, path.resolve(resources, argon ? 'argon' : 'hitsounds')));

	// some beatmaps use custom 1 without having a file for it, set default custom 1 hitsounds
	defaultFiles.forEach(file => setHitSound(file, path.resolve(resources, argon ? 'argon' : 'hitsounds'), true));

	// overwrite default hitsounds with beatmap hitsounds
	let beatmapFiles = await fs.promises.readdir(beatmap_path);

	beatmapFiles.forEach(file => setHitSound(file, beatmap_path, true));

	return hitSoundPath;
}

async function renderHitsounds(mediaPromise, beatmap, start_time, actual_length, modded_length, time_scale, file_path, argon){
	let media = await mediaPromise;

	if(!media)
		throw "Beatmap data not available";

	let beatmapAudio = false;

	try{
		await execFilePromise(ffmpeg, [
			'-ss', start_time / 1000, '-i', `"${media.audio_path}"`, '-to', start_time / 1000 + actual_length / 1000,
			'-filter:a', `"afade=t=out:st=${Math.max(0, actual_length / 1000 - 0.5 / time_scale)}:d=0.5,atempo=${time_scale},volume=0.7"`,
			path.resolve(file_path, 'audio.wav')
		], { shell: true });

		beatmapAudio = true;
	}catch(e){
		console.error(e);
		//throw "Error trimming beatmap audio";
	}

	let hitSoundPaths = await processHitsounds(media.beatmap_path, argon);

	let hitObjects = beatmap.hitObjects.filter(a => a.startTime >= start_time && a.startTime < start_time + actual_length);
	let hitSounds = [];

	const scoringFrames = beatmap.ScoringFrames.filter(a => a.offset >= start_time && a.offset < start_time + actual_length);

	if(beatmap.Replay.auto !== true){
		for(const scoringFrame of scoringFrames){
			if(scoringFrame.combo >= scoringFrame.previousCombo || scoringFrame.previousCombo < 30)
				continue;
	
			hitSounds.push({
				offset: (scoringFrame.offset - start_time) / time_scale,
				sound: 'combobreak',
				path: hitSoundPaths['combobreak'],
				volume: 2.5
			});
		}
	}

	for(const hitObject of hitObjects){
		let timingPoint = getTimingPoint(beatmap.timingPoints, hitObject.startTime);

		if(hitObject.objectName == 'circle' && Array.isArray(hitObject.HitSounds)){
			let offset = hitObject.startTime;

			if(beatmap.Replay.auto !== true){
				if(hitObject.hitOffset == null)
					continue;
	
				offset += hitObject.hitOffset;
			}

			offset -= start_time;
			offset /= time_scale;

			for(const hitSound of hitObject.HitSounds){

				if(hitSound in hitSoundPaths){
					hitSounds.push({
						offset,
						sound: hitSound,
						path: hitSoundPaths[hitSound],
						volume: timingPoint.sampleVolume / 100
					});
				}
			}
		}
		
		if(hitObject.objectName == 'slider'){
			hitObject.EdgeHitSounds.forEach((edgeHitSounds, index) => {
				edgeHitSounds.forEach(hitSound => {
					let offset = hitObject.startTime + index * (hitObject.duration / hitObject.repeatCount);

					if(index == 0 && beatmap.Replay.auto !== true){
						if(hitObject.hitOffset == null)
							return;
						
						offset += hitObject.hitOffset;
					}

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
	}

	let ffmpegArgs = [];

	let hitSoundIndexes = {};

	hitSounds.forEach(hitSound => {
		if(!(hitSound.sound in hitSoundIndexes)){
			ffmpegArgs.push('-guess_layout_max', '0', '-i', hitSound.path);
			hitSoundIndexes[hitSound.sound] = Object.keys(hitSoundIndexes).length;
		}
	});
	// process in chunks
	const chunkCount = require('os').cpus().length;
	const chunkLength = Math.floor(modded_length / chunkCount);

	let hitSoundPromises = [];

	let mergeHitSoundArgs = [];
	let chunksToMerge = 0;

	for(let i = 0; i < chunkCount; i++){
		let hitSoundsChunk = hitSounds.filter(a => a.offset >= i * chunkLength && a.offset < (i + 1) * chunkLength);

		if(hitSoundsChunk.length == 0)
			continue;

		chunksToMerge++;

		let ffmpegArgsChunk = ffmpegArgs.slice();

		ffmpegArgsChunk.push('-filter_complex');

		let filterComplex = "";
		let indexStart = Object.keys(hitSoundIndexes).length;

		hitSoundsChunk.forEach((hitSound, i) => {
			filterComplex += `[${hitSoundIndexes[hitSound.sound]}]adelay=${hitSound.offset}|${hitSound.offset},volume=${(hitSound.volume * 0.7).toFixed(1)}[${i + indexStart}];`
		});

		hitSoundsChunk.forEach((hitSound, i) => {
			filterComplex += `[${i + indexStart}]`;
		});

		filterComplex += `amix=inputs=${hitSoundsChunk.length}:normalize=0`;

		ffmpegArgsChunk.push(`"${filterComplex}"`, '-ac', '2', path.resolve(file_path, `hitsounds${i}.wav`));
		mergeHitSoundArgs.push('-guess_layout_max', '0', '-i', path.resolve(file_path, `hitsounds${i}.wav`));

		hitSoundPromises.push(execFilePromise(ffmpeg, ffmpegArgsChunk, { shell: true }));
	}

	return new Promise((resolve, reject) => {
		if(chunksToMerge < 1){
			reject();
			return;
		}

		Promise.all(hitSoundPromises).then(async () => {
			mergeHitSoundArgs.push('-filter_complex', `amix=inputs=${chunksToMerge}:normalize=0`, path.resolve(file_path, `hitsounds.wav`));

			await execFilePromise(ffmpeg, mergeHitSoundArgs, { shell: true });

			const mergeArgs = [];
			let mixInputs = beatmapAudio ? 2 : 1;

			if(beatmapAudio)
				mergeArgs.push('-guess_layout_max', '0', '-i', path.resolve(file_path, `audio.wav`));

			mergeArgs.push(
				'-guess_layout_max', '0', '-i', path.resolve(file_path, `hitsounds.wav`),
				'-filter_complex', `amix=inputs=${mixInputs}:duration=first:dropout_transition=${modded_length}:normalize=0`, path.resolve(file_path, 'merged.wav')
			);

			await execFilePromise(ffmpeg, mergeArgs, { shell: true });

			resolve(path.resolve(file_path, 'merged.wav'));
		});
	});
}

async function downloadMedia(options, beatmap, beatmap_path, size, download_path){
	if(options.type != 'mp4' || options.custom_url || !options.audio || !config.credentials.osu_api_key)
		throw 'No mapset available';

	let output = {};

	let beatmapset_id = beatmap.BeatmapSetID;

	if(beatmapset_id == null){
		const content = await fs.promises.readFile(beatmap_path, 'utf8');
		const hash = crypto.createHash('md5').update(content).digest("hex");

		const { data } = await axios.get('https://osu.ppy.sh/api/get_beatmaps', { params: {
			k: config.credentials.osu_api_key,
			h: hash
		}});

		if(data.length == 0){
			throw "Couldn't find beatmap";
		}

		beatmapset_id = data[0].beatmapset_id;
	}

	if(await helper.fileExists(path.resolve(config.maps_path, beatmapset_id))){
		let extraction_path = path.resolve(config.maps_path, beatmapset_id);
        output.beatmap_path = extraction_path;

		if(options.lagtrain){
			output.audio_path = path.resolve(resources, "lagtrain.mp3");
		}else if(beatmap.AudioFilename && fs.existsSync(path.resolve(extraction_path, beatmap.AudioFilename))){
            output.audio_path = path.resolve(extraction_path, beatmap.AudioFilename);
		}

        output.background_path = path.resolve(extraction_path, 'bg.png');

        return output;
    }

	let mapStream;

	try{
		try {
			const osuDirectMap = await axios.get(`https://catboy.best/d/${beatmapset_id}n`, { timeout: 10000, responseType: 'stream' });
			mapStream = osuDirectMap.data;
		} catch (e) {
			const nerinyanMap = await axios.get(`https://osu.direct/api/d/${beatmapset_id}`, { responseType: 'stream' });
			mapStream = nerinyanMap.data;
		}
	}catch(e){
		const beatconnectMap = await axios.get(`https://api.nerinyan.moe/d/${beatmapset_id}`, { responseType: 'stream' });
		mapStream = beatconnectMap.data;
	}

	const extraction_path = path.resolve(download_path, 'map');

	const extraction = mapStream.pipe(unzip.Extract({ path: extraction_path }));

	await new Promise((resolve, reject) => {
		extraction.on('close', resolve);
		extraction.on('error', reject);
	});

	output.beatmap_path = extraction_path;

	if(options.lagtrain){
		output.audio_path = path.resolve(resources, "lagtrain.mp3");
	}else if(beatmap.AudioFilename && await helper.fileExists(path.resolve(extraction_path, beatmap.AudioFilename))){
		output.audio_path = path.resolve(extraction_path, beatmap.AudioFilename);
	}

	if(beatmap.bgFilename && await helper.fileExists(path.resolve(extraction_path, beatmap.bgFilename)))
		output.background_path = path.resolve(extraction_path, beatmap.bgFilename);

	if(beatmap.bgFilename && output.background_path){
		try{
			const img = await Jimp.read(output.background_path);

			await img
			.cover(...size)
			.color([
				{ apply: 'shade', params: [80] }
			])
			.writeAsync(path.resolve(extraction_path, 'bg.png'));
	
			output.background_path = path.resolve(extraction_path, 'bg.png');
		}catch(e){
			output.background_path = null;
			helper.error(e);
		}
	}else if(Object.keys(output).length == 0){
		return false;
	}

	copyDir(extraction_path, path.resolve(config.maps_path, beatmapset_id)).catch(helper.error);

	return output;
}

let beatmap, speed_multiplier;

module.exports = {
    get_frame: function(beatmap_path, time, mods_raw, size, options, cb){
		enabled_mods = mods_raw.map(mod => mod.acronym);
        let worker = fork(path.resolve(__dirname, 'beatmap/worker.js'), ['--max-old-space-size=512']);

        worker.send({
            beatmap_path,
            options,
            mods_raw,
			time,
			length: 0
        });

		worker.on('close', code => {
			if(code > 0){
				cb("Error processing beatmap");
				return false;
			}
		});

        worker.on('message', _beatmap => {
            beatmap = _beatmap;

			time = beatmap.renderTime;

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

    get_frames: async function(beatmap_path, time, length, mods_raw, size, options, cb){
		enabled_mods = mods_raw.map(mod => mod.acronym);
		const { msg } = options;

		options.msg = null;

		const renderStatus = ['– processing beatmap', '– rendering frames', '– encoding video'];

		let renderMessage;

		msg.channel.send({embed: {description: renderStatus.join("\n")}}).then(msg => {
			renderMessage = msg;
		}).catch(helper.error);

		const updateRenderStatus = async () => {
			if (!renderMessage) return;
			await renderMessage.edit({
				embed: {
					description: renderStatus.join("\n")
				}
			});
		};

		const updateInterval = setInterval(() => { updateRenderStatus().catch(console.error) }, 3000);

		updateRenderStatus().catch(console.error);

		const resolveRender = async opts => {
			updateRenderStatus();
			clearInterval(updateInterval);

			await msg.channel.send(opts);
			if (renderMessage) await renderMessage.delete();
		};

		const beatmapProcessStart = Date.now();

		console.time('process beatmap');

		let frames_rendered = [], frames_piped = [], current_frame = 0;

		if (!config.process_beatmap_sync) {
			let worker = fork(path.resolve(__dirname, 'beatmap/worker.js'));

			worker.send({
				beatmap_path,
				options,
				mods_raw,
				speed_override: options.speed,
				time,
				length,
			});

			worker.on('close', code => {
				if(code > 0){
					resolveRender("Error processing beatmap or replay").catch(console.error);

					return false;
				}

				renderStatus[0] = `✓ processing beatmap (${((Date.now() - beatmapProcessStart) / 1000).toFixed(3)}s)`;
			});

			beatmap = await new Promise(resolve => {
				worker.on('message', _beatmap => {
					resolve(_beatmap);
				});
			});
		} else {
			try {
				beatmap = await processBeatmap(beatmap_path, options, mods_raw, time, length);
				renderStatus[0] = `✓ processing beatmap (${((Date.now() - beatmapProcessStart) / 1000).toFixed(3)}s)`;
			} catch(e) {
				console.error(e);
				resolveRender("Error processing beatmap or replay").catch(console.error);
				return false;
			}
			
		}

		console.timeEnd('process beatmap');

		time = beatmap.renderTime;
		length = beatmap.renderLength;
		
		let lastObject = beatmap.hitObjects[beatmap.hitObjects.length - 1];

		let lastObjectTime = lastObject.endTime;

		if (lastObject.lastObject) lastObjectTime += 1500;

		length = Math.min(800 * 1000, length);

		if(length >= 10 * 1000)
			options.type = 'mp4';

		let start_time = time;

		let time_max = Math.min(time + length + 1000, lastObjectTime);

		let actual_length = time_max - time;

		let rnd = Math.round(1e9 * Math.random());
		let file_path;
		let fps = options.fps || 60;

		let i = 0;

		let time_scale = beatmap.SpeedMultiplier;

		if(options.speed != 1)
			time_scale = options.speed;

		if(!('type' in options))
			options.type = 'gif';

		if(options.type == 'gif')
			fps = 50;

		let time_frame = 1000 / fps * time_scale;

		let bitrate = 1200;

		file_path = path.resolve(config.frame_path != null ? config.frame_path : os.tmpdir(), 'frames', `${rnd}`);

		await fs.promises.mkdir(file_path, { recursive: true });

		let threads = require('os').cpus().length;

		let modded_length = Math.min(actual_length / time_scale, lastObjectTime / time_scale);
		let amount_frames = Math.floor(actual_length / time_frame);

		let frames_size = amount_frames * size[0] * size[1] * 4;

		let pipeFrameLoop = (ffmpegProcess, cb) => {
			if(frames_rendered.includes(current_frame)){
				let frame_path = path.resolve(file_path, `${current_frame}.rgba`);
				fs.promises.readFile(frame_path).then(buf => {
					ffmpegProcess.stdin.write(buf, err => {
						if(err){
							cb(null);
							return;
						}

						fs.promises.rm(frame_path, { recursive: true }).catch(helper.error);

						frames_piped.push(current_frame);
						frames_rendered.slice(frames_rendered.indexOf(current_frame), 1);

						if(frames_piped.length == amount_frames){
							ffmpegProcess.stdin.end();
							cb(null);
							return;
						}

						current_frame++;
						pipeFrameLoop(ffmpegProcess, cb);
					});
				}).catch(err => {
					resolveRender("Error encoding video").catch(console.error);
					helper.error(err);

					return;
				});
			}else{
				setTimeout(() => {
					pipeFrameLoop(ffmpegProcess, cb);
				}, 100);
			}
		}

		const info = await diskCheck(file_path);

		if(info.available * 0.9 < frames_size){
			resolveRender("Not enough disk space").catch(console.error);

			return false;
		}

		let ffmpeg_args = [
			'-f', 'rawvideo', '-r', fps, '-s', size.join('x'), '-pix_fmt', 'rgba',
			'-c:v', 'rawvideo', '-thread_queue_size', 1024,
			'-i', 'pipe:0'
		];

		let mediaPromise = downloadMedia(options, beatmap, beatmap_path, size, file_path).catch(() => {});
		let audioProcessingPromise = renderHitsounds(mediaPromise, beatmap, start_time, actual_length, modded_length, time_scale, file_path, options.argon).catch(() => {});

		if(options.type == 'mp4')
			bitrate = Math.max(850, Math.min(bitrate, (0.95 * MAX_SIZE) * 8 / (actual_length / 1000) / 1024));

		let workers = [];

		for(let i = 0; i < threads; i++){
			workers.push(
				fork(path.resolve(__dirname, 'render_worker.js'))
			);
		}

		let done = 0;

		if(config.debug)
			console.time('render beatmap');

		if(options.type == 'gif'){
			if(config.debug)
				console.time('encode video');

			ffmpeg_args.push(`${file_path}/video.gif`);

			const encodingProcessStart = Date.now();

			let ffmpegProcess = spawn(ffmpeg, ffmpeg_args, { shell: true });

			ffmpegProcess.on('close', async code => {
				if(code > 0){
					resolveRender("Error encoding video")
					.then(() => {
						fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
					}).catch(console.error);

					return false;
				}

				if(config.debug)
					console.timeEnd('encode video');

				renderStatus[1] = `✓ encoding video (${((Date.now() - encodingProcessStart) / 1000).toFixed(3)}s)`;

				resolveRender({files: [{
					attachment: `${file_path}/video.${options.type}`,
					name: `video.${options.type}`
				}]}).then(() => {
					fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
				})
				.catch(console.error)
				.finally(() => {
					fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
				});
			});

			pipeFrameLoop(ffmpegProcess, err => {
				if(err){
					resolveRender("Error encoding video")
					.then(() => {
						fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
					}).catch(console.error);

					return false;
				}
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
				if(config.debug)
					console.time('encode video');

				ffmpeg_args.push(
					'-filter_complex', `"overlay=(W-w)/2:shortest=1"`,
					'-pix_fmt', 'yuv420p', '-r', fps, '-c:v', 'libx264', /*'-b:v', `${bitrate}k`*/ '-crf', 18,
					'-c:a', 'aac', '-b:a', '164k', '-t', modded_length / 1000, '-preset', 'veryfast',
					'-movflags', 'faststart', '-g', fps, '-force_key_frames', '00:00:00.000', `${file_path}/video.mp4`
				);

				const encodingProcessStart = Date.now();

				let ffmpegProcess = spawn(ffmpeg, ffmpeg_args, { shell: true });

				ffmpegProcess.on('close', async code => {
					if(code > 0){
						resolveRender("Error encoding video")
						.then(() => {
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						}).catch(console.error);

						return false;
					}

					if(config.debug)
						console.timeEnd('encode video');

					renderStatus[2] = `✓ encoding video (${((Date.now() - encodingProcessStart) / 1000).toFixed(3)}s)`;

						const stat = await fs.promises.stat(`${file_path}/video.${options.type}`);

					console.log('size', stat.size / 1024, 'KiB');
					console.log('max size', MAX_SIZE / 1024, 'KiB');

					if(stat.size < MAX_SIZE && msg.channel.type == "text" || options.webui){
						resolveRender({files: [{
							attachment: `${file_path}/video.${options.type}`,
							name: `video.${options.type}`
						}]}).then(() => {
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						})
						.catch(console.error)
						.finally(() => {
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						});
					}else if(stat.size < MAX_SIZE_DM){
						resolveRender({files: [{
							attachment: `${file_path}/video.${options.type}`,
							name: `video.${options.type}`
						}]}).then(() => {
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						})
						.catch(console.error)
						.finally(() => {
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						});
					}else{
						if (!config.upload_command) {
							resolveRender("File too large and no upload command specified.").finally(() => {
								fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
							});
							return;
						}

						try{
							const upload_command = config.upload_command.replace('{path}', `${file_path}/video.${options.type}`);

							if (config.debug)
								console.log('running upload command: ', config.upload_command);

							const response = await execPromise(upload_command);
							const url = new URL(response.stdout);

							await resolveRender(url.href);
						}catch(err){
							await resolveRender("File too large and failed to upload to specified upload command.")
							console.error(err);
						}finally{
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						}
					}
				});

				ffmpegProcess.stderr.on('data', data => {
					const line = data.toString();

					if(!line.startsWith('frame='))
						return;

					const frame = parseInt(line.substring(6).trim());

					renderStatus[2] = `– encoding video (${Math.round(frame/amount_frames*100)}%)`;
				});

				pipeFrameLoop(ffmpegProcess, err => {
					if(err){
						resolveRender("Error encoding video")
						.then(() => {
							fs.promises.rm(file_path, { recursive: true }).catch(helper.error);
						}).catch(console.error);

						return false;
					}
				});
			});
		}

		const framesProcessStart = Date.now();

		workers.forEach((worker, index) => {
			worker.send({
				beatmap,
				start_time: time + index * time_frame,
				end_time: time + index * time_frame + actual_length,
				time_frame: time_frame * threads,
				file_path,
				options,
				threads,
				current_frame: index,
				size
			});

			worker.on('message', frame => {
				frames_rendered.push(frame);

				renderStatus[1] = `– rendering frames (${Math.round(frames_rendered.length/amount_frames*100)}%)`;
			});

			worker.on('close', code => {
				if(code > 0){
					cb("Error rendering beatmap");
					return false;
				}

				done++;

				if(done == threads){
					renderStatus[1] = `✓ rendering frames (${((Date.now() - framesProcessStart) / 1000).toFixed(3)}s)`;

					if(config.debug)
						console.timeEnd('render beatmap');
				}
			});
		});
    }
};
