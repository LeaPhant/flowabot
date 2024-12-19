const processBeatmap = require('./process');

process.on('message', async obj => {
	const { beatmap_path, options, mods_raw, time, length } = obj;
	const beatmap = await processBeatmap(beatmap_path, options, mods_raw, time, length);

	process.send(beatmap, () => {
		process.exit(0);
	});
});
