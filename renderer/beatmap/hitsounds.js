const { getTimingPoint } = require('./util');

const sampleSetToName = sampleSetId => {
	switch(sampleSetId){
		case 2:
			return "soft";
		case 3:
			return "drum";
		default:
			return "normal";
	}
};

const getHitSounds = (timingPoint, name, soundTypes, additions) => {
	let output = [];

	let sampleSetName = sampleSetToName(timingPoint.sampleSetId);
	let sampleSetNameAddition = sampleSetName;

	if(!soundTypes.includes('normal'))
		soundTypes.push('normal');

	if('sample' in additions)
		sampleSetName = additions.sample;

	if('additionalSample' in additions)
		sampleSetNameAddition = additions.additionalSample;

	let hitSoundBase = `${sampleSetName}-${name}`;
	let hitSoundBaseAddition = `${sampleSetNameAddition}-${name}`;
	let customSampleIndex = timingPoint.customSampleIndex > 0 ? timingPoint.customSampleIndex : '';

	if(name == 'hit'){
		soundTypes.forEach(soundType => {
			let base = soundType == 'normal' ? hitSoundBase : hitSoundBaseAddition;
			output.push(
				`${base}${soundType}${customSampleIndex}`
			);
		});
	}else if(name == 'slider'){
		output.push(
			`${hitSoundBase}slide${customSampleIndex}`
		);

		if(soundTypes.includes('whistle'))
			output.push(
				`${hitSoundBase}whistle${customSampleIndex}`
			);
	}else if(name == 'slidertick'){
		output.push(
			`${hitSoundBase}${customSampleIndex}`
		)
	}

	return output;
};

class HitsoundProcessor {
	Beatmap;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	process (hitObject) {
		const { Beatmap } = this;

		const timingPoint = getTimingPoint(Beatmap.timingPoints, hitObject.startTime);

		hitObject.HitSounds = getHitSounds(timingPoint, 'hit', hitObject.soundTypes, hitObject.additions);
		hitObject.EdgeHitSounds = [];
        hitObject.SliderHitSounds = [];

		if (hitObject.objectName != 'slider') return;

		for (const [i, edge] of hitObject.edges.entries()) {
			let offset = i * (hitObject.duration / hitObject.repeatCount)

			let edgeTimingPoint = getTimingPoint(Beatmap.timingPoints, hitObject.startTime + offset);

			hitObject.EdgeHitSounds.push(
				getHitSounds(edgeTimingPoint, 'hit', edge.soundTypes, edge.additions)
			);

			hitObject.SliderHitSounds.push(
				getHitSounds(edgeTimingPoint, 'slider', hitObject.soundTypes, hitObject.additions)
			);
		}

		for (const tick of hitObject.SliderTicks) {
			for (let i = 0; i < hitObject.repeatCount; i++){
				if (i == 0)
					tick.HitSounds = [];

				let edgeOffset =  i * (hitObject.duration / hitObject.repeatCount);
				let offset = edgeOffset + (i % 2 == 0 ? tick.offset : tick.reverseOffset);

				let tickTimingPoint = getTimingPoint(Beatmap.timingPoints, hitObject.startTime + offset);

				tick.HitSounds.push(
					getHitSounds(tickTimingPoint, 'slidertick', hitObject.soundTypes, hitObject.additions)
				);
			}
		}
	}
}

const applyHitsounds = Beatmap => {
	const hitsoundProcessor = new HitsoundProcessor(Beatmap);

	for (const hitObject of Beatmap.hitObjects)
		hitsoundProcessor.process(hitObject);
};

module.exports = applyHitsounds;