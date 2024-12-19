const { PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT } = require("../util");

class ReflectionMod {
	Beatmap;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	invert (axis, length) {
		for (const hitObject of this.Beatmap.hitObjects) {
			hitObject.position[axis] = length - hitObject.position[axis];

			if (hitObject.objectName != 'slider') continue;

			for (const point of hitObject.points)
				point[axis] = length - point[axis];
		}
	}

	apply () {
		const mirrorMod = this.Beatmap.Mods.get('MR');


		// MR.reflection: undefined = horizontal, 1 = vertical, 2 = both
		const invertVertical = 
			this.Beatmap.Mods.has('HR') || 
			mirrorMod?.reflection >= 1;

		const invertHorizontal = 
			mirrorMod?.reflection != 1; // undefined equals 0

		if (invertVertical)
			this.invert(1, PLAYFIELD_HEIGHT);

		if (invertHorizontal)
			this.invert(0, PLAYFIELD_WIDTH);
	}
}

module.exports = ReflectionMod;