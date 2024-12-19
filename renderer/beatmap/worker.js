const parseBeatmap = require('./parse');
const applyMods = require('./mods/mods');

const processBeatmap = async (obj) => {
	const Beatmap = await parseBeatmap(obj);
	applyMods(Beatmap);
	
	return Beatmap;
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
