const { vectorSubtract, vectorLength, vectorAdd, vectorMultiply } = require('./util');

const SPACING = 32;

const PREEMPT = 800;
const PREEMPT_MIN = 450;

class FollowpointProcessor {
	Beatmap;
	Followpoints = [];

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	getFadeTimes (start, end, fraction) {
		const startTime = start.endTime;
		const duration = end.startTime - startTime;
	
		const preempt = PREEMPT * Math.min(1, this.Beatmap.TimePreempt / PREEMPT_MIN);

		const fadeOutTime = startTime + fraction * duration;
        const fadeInTime = fadeOutTime - preempt;

		return { fadeInTime, fadeOutTime };
	}

	getFollowpoints (start, end) {
		const { Beatmap } = this;

		const followpoints = [];

		let startPosition = start.endPosition;

		if (start.objectName == 'slider' && start.repeatCount % 2 == 0)
			startPosition = start.position;

		const endPosition = end.position;

		const distanceVector = vectorSubtract(endPosition, startPosition);
		const distance = vectorLength(distanceVector);
		const rotation = Math.atan2(distanceVector[1], distanceVector[0]);

		for (let d = SPACING * 1.5; d < distance - SPACING; d += SPACING) {
			const fraction = d / distance;
			const pointStartPosition = vectorAdd(startPosition, vectorMultiply(distanceVector, fraction - 0.1));
			const pointEndPosition = vectorAdd(startPosition, vectorMultiply(distanceVector, fraction));

			const { fadeInTime, fadeOutTime } = this.getFadeTimes(start, end, fraction);

			const fp = {
				startPosition: pointStartPosition,
				endPosition: pointEndPosition,
				rotation
			};

			fp.fadeInStart = fadeInTime;
			fp.fadeInEnd = fp.fadeInStart + Beatmap.TimeFadein;
			fp.fadeOutStart = Math.min(fp.fadeInEnd, end.startTime - Beatmap.HitWindow50);
			fp.fadeOutEnd = Math.min(fp.fadeOutStart + (fadeOutTime - fadeInTime), end.startTime);

			followpoints.push(fp);
		}

		return followpoints;
	}

	process () {
		const { Beatmap, Followpoints } = this;

		for (let i = 0; i < Beatmap.hitObjects.length - 1; i++) {
			const start = Beatmap.hitObjects[i];
			const end = Beatmap.hitObjects[i + 1];

			if (end.newCombo || start.objectName == 'spinner' || end.objectName == 'spinner')
				continue;

			const followpoints = this.getFollowpoints(start, end);

			Followpoints.push(...followpoints);
		}

		Beatmap.Followpoints = Followpoints;
	}
}

const applyFollowpoints = Beatmap => {
	new FollowpointProcessor(Beatmap).process();
};

module.exports = applyFollowpoints;