const axios = require('axios');

const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { fork } = require('child_process');
const config = require('../config.json');
const processBeatmap = require("./beatmap/process");

function calculateUr(options){
	return new Promise(async (resolve, reject) => {

		let replay_path = path.resolve(config.replay_path, `${options.score_id}.osr`);
		let replay_exists = await fs.stat(replay_path).then(() => true, () => false);

		if(!replay_exists) {
			const response = await axios.get(`https://osu.ppy.sh/api/v2/scores/${options.score_id}/download`, {
				responseType: 'arraybuffer',
				headers: {
					'Authorization': 'Bearer ' + options.access_token,
					'Content-Type': 'application/x-osu-replay'
				}
			}).catch(error => console.log(error));

			const replay_raw = response.data
			//const replay_raw = Buffer.from(response.data.content, "base64");

			await fs.writeFile(path.resolve(config.replay_path, `${options.score_id}.osr`), replay_raw, { encoding: 'binary' });
		}

        options.full = true;

        const { frames, ur, cvur } = await processBeatmap(path.resolve(config.osu_cache_path, `${options.beatmap_id}.osu`), options, options.mods_enabled, 0, 0, true);
		
		resolve({ frames, ur, cvur });
	});
}

module.exports = {
    get_ur: calculateUr
};
