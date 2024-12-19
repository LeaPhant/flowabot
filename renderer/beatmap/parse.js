const { promises: fs } = require('fs');
const path = require('path');

const osuBeatmapParser = require('osu-parser');
const axios = require('axios');

const config = require('../../config.json');
const { parseReplay } = require('./replay');
const { difficultyRange, float } = require('./util');

const exists = path => fs.access(path).then(() => true, () => false);

const OBJECT_RADIUS = 64;
const ROUNDING_ALLOWANCE = float(1.00041);

const parseBeatmap = async (beatmap_path, options, mods_raw) => {
	const osuContents = await fs.readFile(beatmap_path, 'utf8');

    const Beatmap = osuBeatmapParser.parseContent(osuContents);

    Beatmap.CircleSize = Beatmap.CircleSize ?? 5;
    Beatmap.OverallDifficulty = Beatmap.OverallDifficulty ?? 5;
	// Very old maps use the OD as the AR 
    Beatmap.ApproachRate = Beatmap.ApproachRate ?? Beatmap.OverallDifficulty;

	console.time("download/parse replay");

	let Replay;

    if (options.score_id) {
        const replay_path = path.resolve(config.replay_path, `${options.score_id}.osr`);

        if (exists(replay_path)) {
            Replay = await parseReplay(await fs.readFile(replay_path));
		}
    }

    if (options.osr) {
        try {
            // @ts-ignore
            const response = await axios.get(options.osr, { timeout: 5000, responseType: 'arraybuffer' });

			Replay = await parseReplay(response.data);
			
			if (Replay.score_info) {
				mods_raw = Replay.score_info.mods;
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

	for (const mod of mods_raw) {
		Mods.set(mod.acronym, mod.settings ?? {});
	}

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

	Beatmap.TimeFadein = difficultyRange(Beatmap.ApproachRate, 1800, 1200, 450) / Beatmap.SpeedMultiplier;
    Beatmap.TimePreempt = difficultyRange(Beatmap.ApproachRate, 1200, 800, 300) / Beatmap.SpeedMultiplier;

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

		judgement /= Beatmap.SpeedMultiplier;
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

    Beatmap.StackLeniency = parseFloat(Beatmap.StackLeniency);

    if (isNaN(Beatmap.StackLeniency))
        Beatmap.StackLeniency = 0.7;

    for (const hitObject of Beatmap.hitObjects) {
        if (hitObject.objectName != 'circle')
			continue;

        hitObject.endTime = hitObject.startTime;
        hitObject.endPosition = hitObject.position;
    }

	return Beatmap;
};

module.exports = parseBeatmap;