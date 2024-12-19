const RandomMod = require('./random');
const ReflectionMod = require('./reflection');

const applyMods = Beatmap => {
	new ReflectionMod(Beatmap).apply();
	new RandomMod(Beatmap).apply();
}

module.exports = applyMods;