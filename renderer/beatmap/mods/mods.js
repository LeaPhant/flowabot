const ApplicableMods = {
	RandomMod: require('./random'),
	ReflectionMod: require('./reflection')
};

const DefaultMods = Object.values(ApplicableMods);

const applyMods = (Beatmap, ...EnabledMods) => {
	for (const Mod of EnabledMods ?? DefaultMods) {
		new Mod(Beatmap).apply();
	}
}

module.exports = { applyMods, ApplicableMods };