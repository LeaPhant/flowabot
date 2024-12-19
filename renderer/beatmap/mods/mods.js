const RandomMod = require('./random');
const InversionMod = require('./inversion');

const applyMods = Beatmap => {
	new InversionMod(Beatmap).apply();
	new RandomMod(Beatmap).apply();
}

module.exports = applyMods;