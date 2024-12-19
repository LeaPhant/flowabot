const { promises: fs } = require('fs');
const path = require('path');

const osuBeatmapParser = require('osu-parser');
const axios = require('axios');

const config = require('../../config.json');

const { difficultyRange, float } = require('./util');
const { parseReplay, applyReplay } = require('./replay');

const applySliders = require('./slider');
const applyHitsounds = require('./hitsounds');
const applyStacking = require('./stacking');
const applyMods = require('./mods/mods');
const applyCounter = require('./pp');

const exists = path => fs.access(path).then(() => true, () => false);

const OBJECT_RADIUS = 64;
const ROUNDING_ALLOWANCE = float(1.00041);

class BeatmapProcessor {
	Beatmap;
	beatmap_path;
	osuContents;
	options;
	mods_raw;
	time;
	length;

	constructor (beatmap_path, options, mods_raw, time, length) {
		this.beatmap_path = beatmap_path;
		this.options = options;
		this.mods_raw = mods_raw;
		this.time = time;
		this.length = length;
	}

	async parseBeatmap () {
		this.osuContents = await fs.readFile(this.beatmap_path, 'utf8');

		const Beatmap = osuBeatmapParser.parseContent(this.osuContents);

		Beatmap.CircleSize = Number(Beatmap.CircleSize ?? 5);
		Beatmap.OverallDifficulty =  Number(Beatmap.OverallDifficulty ?? 5);
		// Very old maps use the OD as the AR 
		Beatmap.ApproachRate = Number(Beatmap.ApproachRate ?? Beatmap.OverallDifficulty ?? 5);

		console.time("download/parse replay");

		let Replay;

		if (this.options.score_id) {
			const replay_path = path.resolve(config.replay_path, `${this.options.score_id}.osr`);

			if (exists(replay_path)) {
				Replay = await parseReplay(await fs.readFile(replay_path));
			}
		}

		if (this.options.osr) {
			try {
				// @ts-ignore
				const response = await axios.get(options.osr, { timeout: 5000, responseType: 'arraybuffer' });

				Replay = await parseReplay(response.data);
				
				if (Replay.score_info) {
					this.mods_raw = Replay.score_info.mods;
				}
			} catch(e) {
				console.error(e);

				throw "Couldn't download replay";
			}
		}

		Beatmap.Replay = Replay;

		console.timeEnd("download/parse replay");

		const Mods = new Map();
		Beatmap.Mods = Mods;

		for (const mod of this.mods_raw) {
			Mods.set(mod.acronym, mod.settings ?? {});
		}

		return Beatmap;
	}

	async applySettings () {
		const { Beatmap, options } = this;
		const { Mods } = Beatmap;		

		if (Mods.has('HR')) {
			Beatmap.CircleSize = Math.min(10, Beatmap.CircleSize * 1.3);
			Beatmap.ApproachRate = Math.min(10, Beatmap.CircleSize * 1.4);
			Beatmap.OverallDifficulty = Math.min(10, Beatmap.OverallDifficulty * 1.4);
		}
	
		if (Mods.has('EZ')) {
			Beatmap.CircleSize *= 0.5;
			Beatmap.ApproachRate *= 0.5;
			Beatmap.OverallDifficulty *= 0.5; 
		}
	
		Beatmap.SpeedMultiplier = 1;
	
		if (Mods.has('DT') || Mods.has('NC')) {
			const mod = Mods.get('DT') ?? Mods.get('NC');
	
			Beatmap.SpeedMultiplier = mod.speed_change ?? 1.5;
		}
	
		if (Mods.has('HT') || Mods.has('DC')) {
			const mod = Mods.get('HT') ?? Mods.get('DC');
	
			Beatmap.SpeedMultiplier = mod.speed_change ?? 0.75;
		}
	
		if (Mods.has('DA')) {
			const mod = Mods.get('DA');
	
			Beatmap.CircleSize = mod.circle_size ?? Beatmap.CircleSize;
			Beatmap.ApproachRate = mod.approach_rate ?? Beatmap.ApproachRate;
			Beatmap.OverallDifficulty = mod.overall_difficulty ?? Beatmap.OverallDifficulty;
		}
	
		if (Mods.has('CL')) {
			let mod = Mods.get('CL');
	
			mod.classic_note_lock = mod.classic_note_lock ?? true;
			mod.no_slider_head_accuracy = mod.no_slider_head_accuracy ?? false;
		}
	
		if (!isNaN(options.cs))
			Beatmap.CircleSize = options.cs;
	
		if (!isNaN(options.ar))
			Beatmap.ApproachRateRealtime = options.ar;
	
		if (!isNaN(options.od))
			Beatmap.OverallDifficulty = options.od;
	
		Beatmap.TimePreempt = difficultyRange(Beatmap.ApproachRate, 1800, 1200, 450);
		Beatmap.TimeFadein = difficultyRange(Beatmap.ApproachRate, 1200, 800, 300);
	
		if (Mods.has('HD') && options.hidden)
			Beatmap.TimeFadein = Beatmap.TimePreempt * 0.4;
	
		const hitWindows = {
			300: difficultyRange(Beatmap.OverallDifficulty, 80, 50, 20),
			100: difficultyRange(Beatmap.OverallDifficulty, 140, 100, 60),
			50: difficultyRange(Beatmap.OverallDifficulty, 200, 150, 100)
		};
	
		for (const key in hitWindows) {
			let judgement = hitWindows[key];
	
			if (Mods.has('CL'))
				judgement -= 0.5;
	
			//if (!options.od)
				//judgement /= Beatmap.SpeedMultiplier;
	
			judgement = float(judgement);
	
			hitWindows[key] = judgement;
		}
	
		// OD
		Beatmap.HitWindow300 = hitWindows[300];
		Beatmap.HitWindow100 = hitWindows[100];
		Beatmap.HitWindow50 = hitWindows[50];
		Beatmap.HitWindowMiss = 400;
	
		// CS
		Beatmap.Scale = float(float(1 - float(0.7) * difficultyRange(Beatmap.CircleSize)) / 2 * ROUNDING_ALLOWANCE);
		Beatmap.Radius = OBJECT_RADIUS * Beatmap.Scale;
		Beatmap.FollowpointRadius = Beatmap.Radius * 2;
		Beatmap.ActualFollowpointRadius = Beatmap.Radius * 2.4;
	
		Beatmap.StackLeniency = parseFloat(Beatmap.StackLeniency) || 0.7;

		for (const hitObject of Beatmap.hitObjects) {
			hitObject.latestHit = hitObject.startTime + Beatmap.HitWindow50;
			hitObject.StackHeight = 0;

			if (hitObject.objectName != 'circle')
				continue;
	
			hitObject.endTime = hitObject.startTime;
			hitObject.endPosition = hitObject.position;
		}
	}

	async applyMods () {
		applyMods(this.Beatmap);
	}

	async applyComboColors () {
		const { Beatmap } = this;

		// Set default combo colors
		if (Beatmap["Combo1"] === undefined) {
			Beatmap["Combo1"] = "255,192,0";
			Beatmap["Combo2"] = "0,202,0";
			Beatmap["Combo3"] = "18,124,255";
			Beatmap["Combo4"] = "242,24,57";
		}

		let currentCombo = 1;
		let currentComboNumber = 0;

		for (const [i, hitObject] of this.Beatmap.hitObjects.entries()) {
			let maxComboColor = 1;

			while (Beatmap["Combo" + (maxComboColor + 1)] !== undefined)
				maxComboColor++;

			if (hitObject.newCombo || i == 0){
				currentComboNumber = 0;

				for (let x = hitObject.comboSkip; x >= 0; x--) {
					currentCombo++;
					if (currentCombo > maxComboColor) currentCombo = 1;
				}
			}

			currentComboNumber++;

			hitObject.Color = "rgba(" + Beatmap["Combo" + currentCombo] + ",0.6)";
			hitObject.ComboNumber = currentComboNumber;
		}
	}

	async applySliders() {
		applySliders(this.Beatmap);
	}

	async applySpinners () {
		const { Beatmap } = this;
		const Spinners = Beatmap.hitObjects.filter(o => o.objectName == 'spinner');

		for (const Spinner of Spinners) {
			Spinner.duration = Spinner.endTime - Spinner.startTime;

            let spinsPerSecond = 5;

            if(Beatmap.OverallDifficultyRealtime > 5)
                spinsPerSecond = 5 + 2.5 * (Beatmap.OverallDifficultyRealtime - 5) / 5;
            else
                spinsPerSecond = 5 - 2 * (5 - Beatmap.OverallDifficultyRealtime) / 5;

			Spinner.spinsRequired = spinsPerSecond * Spinner.duration;
		}
	}

	async applyHitsounds () {
		applyHitsounds(this.Beatmap);
	}

	async applyStacking () {
		applyStacking(this.Beatmap);
	}

	async applyReplay () {
		applyReplay(this.Beatmap);
	}

	async applyTimespan() {
		let { Beatmap, time, length, options } = this;

		if (time == 0 && options.percent) {
			this.time = Beatmap.hitObjects[Math.floor(options.percent * (Beatmap.hitObjects.length - 1))].startTime - 2000;
		} else if(options.objects) {
			let objectIndex = 0;
	
			for (let i = 0; i < Beatmap.hitObjects.length; i++) {
				if (Beatmap.hitObjects[i].startTime >= time) {
					objectIndex = i;
					break;
				}
			}
	
			time -= 200;
	
			if(Beatmap.hitObjects.length > objectIndex + options.objects)
				this.length = Beatmap.hitObjects[objectIndex + options.objects].startTime - time + 400;
		} else {
			let firstNonSpinner = Beatmap.hitObjects.filter(x => x.objectName != 'spinner');
	
			if (firstNonSpinner.length == 0)
				firstNonSpinner = Beatmap.hitObjects[0];
	
			time = Math.max(time, Math.max(0, firstNonSpinner[0].startTime - 1000));
		}
	
		if (options.combo) {
			let current_combo = 0;
	
			for (const hitObject of Beatmap.hitObjects){
				if (hitObject.objectName == 'slider') {
					current_combo += 1;
	
					for (let i = 0; i < hitObject.repeatCount; i++) {
						current_combo += 1 + hitObject.SliderTicks.length;
						time = hitObject.startTime + i * (hitObject.duration / hitObject.repeatCount);
	
						if (current_combo >= options.combo)
							break;
					}
				} else {
					current_combo += 1;
					time = hitObject.endTime;
				}

				if (current_combo >= options.combo)
					break;
			}
		}
	
		let firstHitobjectIndex = Beatmap.hitObjects.findIndex(x => x.endTime > time - 1000) ?? 0;
		let lastHitobjectIndex = Beatmap.hitObjects.findIndex(x => x.startTime > (time + (length + 1000) * Beatmap.SpeedMultiplier)) - 1;
	
		if (lastHitobjectIndex < 0) 
			lastHitobjectIndex = Beatmap.hitObjects.length - 1;
	
		if (lastHitobjectIndex == firstHitobjectIndex) {
			if (lastHitobjectIndex + 2 > Beatmap.hitObjects.length)
				firstHitobjectIndex--;
			else
				lastHitobjectIndex++;
		}

		Beatmap.firstHitobjectIndex = firstHitobjectIndex;
		Beatmap.lastHitobjectIndex = lastHitobjectIndex;

		Beatmap.renderTime = time;
    	Beatmap.renderLength = length;

		// trim beatmap
		Beatmap.hitObjects[Beatmap.hitObjects.length - 1].lastObject = true;
    	Beatmap.hitObjects = Beatmap.hitObjects.slice(firstHitobjectIndex, lastHitobjectIndex + 1);
	}

	async applyCounter() {
		const { Beatmap, osuContents, mods_raw } = this;
		await applyCounter(Beatmap, osuContents, mods_raw);
	}

	async process () {
		this.Beatmap = await this.parseBeatmap();

		await this.applySettings();
		await this.applyMods();
		await this.applyComboColors();
		await this.applySliders();
		await this.applyStacking();
		await this.applyHitsounds();
		await this.applyReplay();
		await this.applyTimespan();
		await this.applyCounter();

		return this.Beatmap;
	}
}
const processBeatmap = async (beatmap_path, options, mods_raw, time, length) => {
	return await new BeatmapProcessor(beatmap_path, options, mods_raw, time, length).process();
};

module.exports = processBeatmap;