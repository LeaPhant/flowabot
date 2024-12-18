const parseBeatmap = require('./parse');

const processBeatmap = async (obj) => {
	const beatmap = await parseBeatmap(obj);
	
	return beatmap;
}

process.on('message', async obj => {
    const {
		beatmap_path, 
		options, 
		speed, 
		mods_raw, 
		time: renderTime, 
		length: renderLength
	} = obj;

	const beatmap = await processBeatmap(obj);

	process.send(beatmap);
	process.exit(0);
});
