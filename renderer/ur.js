const axios = require('axios');

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const config = require('../config.json');

function calculateUr(options){
	return new Promise(async (resolve, reject) => {
		const response = await axios.get('https://osu.ppy.sh/api/get_replay', {
			params: {
				k: options.apikey,
				u: options.player,
				b: options.beatmap_id,
				mods: options.mods_enabled
			}
		});

		const replay_raw = Buffer.from(response.data.content, "base64");

		await fs.mkdir(path.resolve(os.tmpdir(), 'replays'), { recursive: true });
		await fs.writeFile(path.resolve(os.tmpdir(), 'replays', `${options.score_id}`), replay_raw);

		const worker = fork(path.resolve(__dirname, 'beatmap_preprocessor.js'), ['--max-old-space-size=512']);

		worker.send({
			beatmap_path: path.resolve(config.osu_cache_path, `${options.beatmap_id}.osu`),
			options,
			enabled_mods: options.mods
		});

		worker.on('close', code => {
			if(code > 0){
				cb("Error processing beatmap");
				return false;
			}
		});

		worker.on('message', beatmap => {
			const { HitResults } = beatmap;

			resolve(HitResults);
		});
	});
}

module.exports = {
    get_ur: calculateUr
};
