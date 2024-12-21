const { vectorDistance } = require('./util');

const STACK_DISTANCE = 3;

class StackingProcessor {
	Beatmap;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	setOffsets () {
		const { Beatmap } = this;

		let startIndex = 0;
        let endIndex = Beatmap.hitObjects.length - 1;

        let extendedEndIndex = endIndex;
        let extendedStartIndex = startIndex;

        for(let i = extendedEndIndex; i > startIndex; i--){
            let n = i;

            let objectI = Beatmap.hitObjects[i];
            
            if(objectI.StackHeight != 0 || objectI.objectName == 'spinner')
                continue;

            if(objectI.objectName == 'circle'){
                while(--n >= 0){
                    const objectN = Beatmap.hitObjects[n];

                    if(objectN.objectName == 'spinner')
                        continue;

                    const { endTime } = objectN;

                    if(objectI.startTime - endTime > Beatmap.StackThreshold)
                        break;

                    if(n < extendedStartIndex){
                        objectN.StackHeight = 0;
                        extendedStartIndex = n;
                    }

                    if(objectN.objectName == 'slider' && vectorDistance(objectN.endPosition, objectI.position) < STACK_DISTANCE){
                        const offset = objectI.StackHeight - objectN.StackHeight + 1;

                        for(let j = n + 1; j <= i; j++){
                            const objectJ = Beatmap.hitObjects[j];

                            if(vectorDistance(objectN.endPosition, objectJ.position) < STACK_DISTANCE)
                                objectJ.StackHeight -= offset;
                        }

                        break;
                    }

                    if(vectorDistance(objectN.position, objectI.position) < STACK_DISTANCE){
                        objectN.StackHeight = objectI.StackHeight + 1;
                        objectI = objectN;
                    }
                }
            }else if(objectI.objectName == 'slider'){
                while(--n >= startIndex){
                    const objectN = Beatmap.hitObjects[n];

                    if(objectN.objectName == 'spinner')
                        continue;

                    if(objectI.startTime - objectN.startTime > Beatmap.StackThreshold)
                        break;

                    if(vectorDistance(objectN.endPosition, objectI.position) < STACK_DISTANCE){
                        objectN.StackHeight = objectI.StackHeight + 1;
                        objectI = objectN;
                    }
                }
            }
        }
	}

	setLegacyOffsets () {
		const { Beatmap } = this;
		
		for (let i = 0; i < Beatmap.hitObjects.length; i++){
            const currHitObject = Beatmap.hitObjects[i];

            if (currHitObject.StackHeight != 0 && currHitObject.objectName != 'slider')
                continue;

            let startTime = currHitObject.endTime;
            let sliderStack = 0;

            for (let j = i + 1; j < Beatmap.hitObjects.length; j++){
                if(Beatmap.hitObjects[j].startTime - Beatmap.StackThreshold > startTime)
                    break;

                const position2 = currHitObject.position;

                if (vectorDistance(Beatmap.hitObjects[j].position, currHitObject.position) < STACK_DISTANCE) {
                    currHitObject.StackHeight++;
                    startTime = Beatmap.hitObjects[j].endTime;
                } else if (vectorDistance(Beatmap.hitObjects[j].position, position2) < STACK_DISTANCE){
                    sliderStack++;
                    Beatmap.hitObjects[j].StackHeight -= sliderStack;
                    startTime = Beatmap.hitObjects[j].endTime;
                }
            }
        }
	}

	applyOffsets () {
		const { Beatmap } = this;

		for (const hitObject of this.Beatmap.hitObjects) {
			hitObject.StackOffset = hitObject.StackHeight * Beatmap.Scale * -6.4;
			hitObject.position = [hitObject.position[0] + hitObject.StackOffset, hitObject.position[1] + hitObject.StackOffset];

			if (hitObject.objectName != 'slider') continue;

			hitObject.endPosition = [
				hitObject.endPosition[0] + hitObject.StackOffset, 
				hitObject.endPosition[1] + hitObject.StackOffset
			];

			for (const dot of hitObject.SliderDots) {
				if(!Array.isArray(dot) || dot.length != 2)
					continue;

				dot[0] += hitObject.StackOffset;
				dot[1] += hitObject.StackOffset;
			}

			for (const tick of hitObject.SliderTicks) {
				if(!Array.isArray(tick.position) || tick.position.length != 2)
					continue;

				tick[0] += hitObject.StackOffset;
				tick[1] += hitObject.StackOffset;
			}
		}
	}

	process () {
		const { Beatmap } = this;

		for (const hitObject of Beatmap.hitObjects) {
			hitObject.StackHeight = 0;

			if (hitObject.objectName != 'circle')
				continue;
	
			hitObject.endTime = hitObject.startTime;
			hitObject.endPosition = hitObject.position;
		}

		Beatmap.StackThreshold = Beatmap.TimePreempt * Beatmap.StackLeniency;

		const fileFormat = Number(Beatmap.fileFormat.slice(1));

		if (fileFormat >= 6) {
			this.setOffsets();
		} else {
			this.setLegacyOffsets();
		}

		this.applyOffsets();
	}
}

const applyStacking = Beatmap => {
	new StackingProcessor(Beatmap).process();
};

module.exports = applyStacking;