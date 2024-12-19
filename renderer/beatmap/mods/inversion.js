const { PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT } = require("../util");

class InversionMod {
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
		const reflectionMod = this.Beatmap.Mods.get('MR');

		const invertVertical = 
			this.Beatmap.Mods.has('HR') || 
			reflectionMod?.reflection >= 1;

		const invertHorizontal = 
			reflectionMod?.reflection != 1; // undefined equals 0

		if (invertVertical)
			this.invert(1, PLAYFIELD_HEIGHT);

		if (invertHorizontal)
			this.invert(0, PLAYFIELD_WIDTH);
	}
}

module.exports = InversionMod;