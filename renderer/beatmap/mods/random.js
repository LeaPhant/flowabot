

const { 
	float, MathF, clamp, AlmostEquals, INT32_MAX_VALUE,
	vectorF, vectorFAdd,vectorFLength, vectorFSubtract,
	vectorRotate, vectorDivide, vectorAdd, vectorSubtract, vectorMultiply,
	PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT, 
	BORDER_DISTANCE_X, BORDER_DISTANCE_Y,
	PLAYFIELD_CENTER,
	getTimingPoint, Random,
	PLAYFIELD_DIAGONAL,
	vectorEquals,
} = require('../util');

/*
RANDOM MOD
*/
function FlipSliderPointHorizontally(slider, point) {
	const relPosX = point[0] - slider.position[0];
	point[0] = -relPosX + slider.position[0];
}

function FlipSliderInPlaceHorizontally(slider) {
    FlipSliderPointHorizontally(slider, slider.endPosition);

    for (let point of slider.points)
        FlipSliderPointHorizontally(slider, point); 

    for (let dot of slider.SliderDots)
        FlipSliderPointHorizontally(slider, dot); 

    for (let tick of slider.SliderTicks)
        FlipSliderPointHorizontally(slider, tick); 

	1;
}

function RotateSlider(slider, rotation) {
    slider.position = vectorRotate(slider.position, rotation);
    slider.endPosition = vectorRotate(slider.endPosition, rotation);

    for (let point of slider.points)
        point = vectorRotate(point, rotation);

    for (let dot of slider.SliderDots)
        dot = vectorRotate(dot, rotation);

    for (let tick of slider.SliderTicks)
        tick = vectorRotate(tick, rotation);
}

function RotateAwayFromEdge(prevObjectPos, posRelativeToPrev, rotationRatio = 0.5) {
    let relativeRotationDistance = 0;

    if (prevObjectPos[0] < PLAYFIELD_CENTER[0]) {
        relativeRotationDistance = Math.max(
            float((BORDER_DISTANCE_X - prevObjectPos[0]) / BORDER_DISTANCE_X),
            relativeRotationDistance
        );
    } else {
        relativeRotationDistance = Math.max(
            float((prevObjectPos[0] - (PLAYFIELD_WIDTH - BORDER_DISTANCE_X)) / BORDER_DISTANCE_X),
            relativeRotationDistance
        );
    }

    if (prevObjectPos[1] < PLAYFIELD_CENTER[1]) {
        relativeRotationDistance = Math.max(
            float((BORDER_DISTANCE_Y - prevObjectPos[1]) / BORDER_DISTANCE_Y),
            relativeRotationDistance
        );
    } else {
        relativeRotationDistance = Math.max(
            float((prevObjectPos[1] - (PLAYFIELD_HEIGHT - BORDER_DISTANCE_Y)) / BORDER_DISTANCE_Y),
            relativeRotationDistance
        );
    }

    return RotateVectorTowardsVector(
        posRelativeToPrev,
        vectorSubtract(PLAYFIELD_CENTER, prevObjectPos),
        Math.min(1, relativeRotationDistance * rotationRatio)
    );
}

function RotateVectorTowardsVector(initial, destination, rotationRatio) {
	initial = vectorF(initial);
	destination = vectorF(destination);
	rotationRatio = float(rotationRatio);

    const initialAngleRad = MathF.atan2(initial[1], initial[0]);
    const destAngleRad = MathF.atan2(destination[1], destination[0]);

    let diff = float(destAngleRad - initialAngleRad);

    while (diff < -MathF.PI) diff = float(diff + 2 * MathF.PI);

    while (diff > MathF.PI) diff = float(diff - 2 * MathF.PI);

    const finalAngleRad = float(initialAngleRad + rotationRatio * diff);

    return vectorF([
        vectorFLength(initial) * MathF.cos(finalAngleRad),
        vectorFLength(initial) * MathF.sin(finalAngleRad)
    ]);
}

function calculateCentreOfMass(slider) {
    const sample_step = 50;

    // just sample the start and end positions if the slider is too short
    if (slider.pixelLength <= sample_step) {
        return vectorDivide(vectorAdd(slider.position, slider.endPosition), 2);
    }

    let count = 0;
    let sum = [0, 0];
    const pathDistance = slider.pixelLength;

    for (let i = 0; i < pathDistance; i += sample_step)
    {
        sum = vectorAdd(sum, slider.SliderDots[Math.max(0, Math.floor(i / pathDistance) * slider.SliderDots.length - 1)])
        count++;
    }

    return vectorDivide(sum, count);
}

function getSliderRotation(slider) {
    return Math.atan2(slider.endPosition[1], slider.endPosition[0]);
}

function getAngleDifference(angle1, angle2) {
    const diff = Math.abs(angle1 - angle2) % (Math.PI * 2);
    return Math.min(diff, Math.PI * 2 - diff);
}

function clampToPlayfieldWithPadding(position, padding) {
    return vectorF([
        clamp(position[0], padding, PLAYFIELD_WIDTH - padding),
        clamp(position[1], padding, PLAYFIELD_HEIGHT - padding)
    ]);
}

function computeModifiedPosition(current, previous, beforePrevious) {
    let previousAbsoluteAngle = 0;

    if (previous != null) {
        if (previous.objectName == 'slider') {
            previousAbsoluteAngle = getSliderRotation(previous);
        } else {
            const earliestPosition = beforePrevious?.position ?? PLAYFIELD_CENTER;
            const relativePosition = vectorSubtract(previous.position, earliestPosition);
			previousAbsoluteAngle = MathF.atan2(float(relativePosition[1]), float(relativePosition[0]));
        }
    }

    let absoluteAngle = float(previousAbsoluteAngle + current.RelativeAngle);

    let posRelativeToPrev = [
        current.DistanceFromPrevious * MathF.cos(absoluteAngle),
        current.DistanceFromPrevious * MathF.sin(absoluteAngle)
    ];

    const lastEndPosition = previous?.endPositionModified ?? PLAYFIELD_CENTER;

    posRelativeToPrev = RotateAwayFromEdge(lastEndPosition, posRelativeToPrev);

    current.positionModified = vectorFAdd(lastEndPosition, posRelativeToPrev);

    if (current.objectName != 'slider')
        return;

    absoluteAngle = Math.atan2(posRelativeToPrev[1], posRelativeToPrev[0]);

    const centreOfMassOriginal = calculateCentreOfMass(current);
    let centreOfMassModified = vectorRotate(centreOfMassOriginal, current.Rotation + absoluteAngle - getSliderRotation(current));
    centreOfMassModified = RotateAwayFromEdge(current.positionModified, centreOfMassModified);

    const relativeRotation = Math.atan2(centreOfMassModified[1], centreOfMassModified[0]) - Math.atan2(centreOfMassOriginal[1], centreOfMassOriginal[0]);
    if (!AlmostEquals(relativeRotation, 0))
        RotateSlider(current, relativeRotation);
}

class RandomMod {
	Random;
	Beatmap;
	AngleSharpness = 7;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;

		const settings = Beatmap.Mods.get('RD');
		const seed = settings?.seed ?? Math.floor(Math.random() * INT32_MAX_VALUE); 

		this.Random = new Random(seed);
		this.AngleSharpness = settings?.angle_sharpness ?? 7; 
	}

	generatePositionInfos () {
		let previousPosition = PLAYFIELD_CENTER;
		let previousAngle = 0;
	
		for (const hitObject of this.Beatmap.hitObjects) {
			const relativePosition = vectorFSubtract(hitObject.position, previousPosition);
			const absoluteAngle = MathF.atan2(relativePosition[1], relativePosition[0]);
			const relativeAngle = float(absoluteAngle - previousAngle);
	
			hitObject.RelativeAngle = relativeAngle;
			hitObject.DistanceFromPrevious = vectorFLength(relativePosition);
	
			if (hitObject.objectName == 'slider') {
				const absoluteRotation = getSliderRotation(hitObject);
				hitObject.Rotation = absoluteRotation - absoluteAngle;
			}
	
			previousPosition = hitObject.endPosition;
			previousAngle = absoluteAngle;
		}
	}

	randomGaussian (mean = 0, stdDev = 1) {
		const x1 = 1 - this.Random.sample();
		const x2 = 1 - this.Random.sample();

		const stdNormal = Math.sqrt(-2 * Math.log(x1)) * Math.sin(2 * Math.PI * x2);
		return float(mean) + float(stdDev) * float(stdNormal);
	}

	getRandomOffset (stdDev){
		// Range: [0.5, 2]
		// Higher angle sharpness -> lower multiplier
		const customMultiplier = float((float(1.5) * 10 - this.AngleSharpness) / (float(1.5) * 10 - 7));
	
		return float(this.randomGaussian(0, float(stdDev) * customMultiplier));
	}

	getRelativeTargetAngle (targetDistance, offset, flowDirection) {
		// Range: [0.1, 1]
		const angleSharpness = float(this.AngleSharpness / 10);
		// Range: [0, 0.9]
		const angleWideness = float(1 - angleSharpness);
	
		// Range: [-60, 30]
		const customOffsetX = float(angleSharpness * 100 - 70);
		// Range: [-0.075, 0.15]
		const customOffsetY = float(angleWideness * 0.25 - 0.075);
	
		targetDistance = float(targetDistance + customOffsetX);
		let angle = float(2.16 / (1 + 200 * Math.exp(0.036 * (targetDistance - 310 + customOffsetX))) + 0.5);
		angle = float(angle + offset + customOffsetY);
	
		const relativeAngle = float(MathF.PI - angle);
	
		return flowDirection ? -relativeAngle : relativeAngle;
	}

	isHitObjectOnBeat (i, hitObject, downbeatsOnly = false) {
		const timingPoint = getTimingPoint(this.Beatmap.timingPoints, hitObject.startTime, true);
	
		const timeSinceTimingPoint = hitObject.startTime - timingPoint.offset;
		let { beatLength } = timingPoint;
	
		if (downbeatsOnly)
			beatLength *= timingPoint.timingSignature;
	
		if (i == 214 && !downbeatsOnly) {
			i;
		}
	
		// Ensure within 1ms of expected location.
		return Math.abs(timeSinceTimingPoint + 1) % beatLength < 2;
	}

	shouldStartNewSection (i) {
		if (i == 0)
			return true;
	
		// Exclude new-combo-spam and 1-2-combos.
		const previousObjectStartedCombo = (this.Beatmap.hitObjects[Math.max(0, i - 2)].ComboNumber - 1) > 1 &&
											this.Beatmap.hitObjects[i - 1].newCombo;
		const previousObjectWasOnDownbeat = this.isHitObjectOnBeat(i, this.Beatmap.hitObjects[i - 1], true);
		const previousObjectWasOnBeat = this.isHitObjectOnBeat(i, this.Beatmap.hitObjects[i - 1]);
	
		return (previousObjectStartedCombo && this.Random.sample() < 0.6) ||
				previousObjectWasOnDownbeat ||(previousObjectWasOnBeat &&  this.Random.sample() < 0.4);
	}

	shouldApplyFlowChange (i) {
		const previousObjectStartedCombo = (this.Beatmap.hitObjects[Math.max(0, i - 2)].ComboNumber - 1) > 1 &&
											this.Beatmap.hitObjects[i - 1].newCombo;
	
		return previousObjectStartedCombo && this.Random.sample() < 0.6;
	}

	clampHitCircleToPlayfield (hitObject) {
		const previousPosition = hitObject.positionModified.slice();
		const clampPosition = clampToPlayfieldWithPadding(
			hitObject.positionModified,
			float(this.Beatmap.Radius)
		);

		hitObject.endPositionModified = [...clampPosition]
		hitObject.positionModified = [...clampPosition];

		hitObject.position = [...hitObject.positionModified]

		return vectorFSubtract(hitObject.positionModified, previousPosition);
	}

	calculatePossibleMovementBounds (slider) {
		const sliderDotXs = slider.SliderDots.map(d => d[0]);
		const sliderDotYs = slider.SliderDots.map(d => d[1]);
	
		// Compute the bounding box of the slider.
		let minX = Math.min(...sliderDotXs);
		let maxX = Math.max(...sliderDotXs);
	
		let minY = Math.min(...sliderDotYs);
		let maxY = Math.max(...sliderDotYs);
	
		// Take the circle radius into account.
		const radius = float(this.Beatmap.Radius);
	
		minX -= radius;
		minY -= radius;
	
		maxX += radius;
		maxY += radius;
	
		// Given the bounding box of the slider (via min/max X/Y),
		// the amount that the slider can move to the left is minX (with the sign flipped, since positive X is to the right),
		// and the amount that it can move to the right is WIDTH - maxX.
		// Same calculation applies for the Y axis.
		const left = -minX;
		const right = PLAYFIELD_WIDTH - maxX;
		const top = -minY;
		const bottom = PLAYFIELD_HEIGHT - maxY;
	
		return {
			left,
			right,
			top,
			bottom,
			width: right - left,
			height:  bottom - top
		}
	}

	clampSliderToPlayfield (slider) {
		let possibleMovementBounds = this.calculatePossibleMovementBounds(slider);
	
		// The slider rotation applied in computeModifiedPosition might make it impossible to fit the slider into the playfield
		// For example, a long horizontal slider will be off-screen when rotated by 90 degrees
		// In this case, limit the rotation to either 0 or 180 degrees
		if (possibleMovementBounds.width < 0 || possibleMovementBounds.height < 0)
		{
			const currentRotation = getSliderRotation(slider);
			const diff1 = getAngleDifference(slider.Rotation, currentRotation);
			const diff2 = getAngleDifference(slider.Rotation + Math.PI, currentRotation);
	
			if (diff1 < diff2) {
				RotateSlider(slider, slider.Rotation - getSliderRotation(slider));
			} else {
				RotateSlider(slider, slider.Rotation + Math.PI - getSliderRotation(slider));
			}
	
			possibleMovementBounds = this.calculatePossibleMovementBounds(slider);
		}
	
		const previousPosition = slider.positionModified;
	
		// Clamp slider position to the placement area
		// If the slider is larger than the playfield, at least make sure that the head circle is inside the playfield
		const newX = possibleMovementBounds.width < 0
			? clamp(possibleMovementBounds.left, 0, PLAYFIELD_WIDTH)
			: clamp(previousPosition[0], possibleMovementBounds.left, possibleMovementBounds.right);
	
			const newY = possibleMovementBounds.height < 0
			? clamp(possibleMovementBounds.top, 0, PLAYFIELD_HEIGHT)
			: clamp(previousPosition[1], possibleMovementBounds.top, possibleMovementBounds.bottom);
	
		slider.position = slider.positionModified = [newX, newY];
		slider.endPositionModified = slider.endPosition;
	
		return vectorSubtract(slider.positionModified, previousPosition);
	}

	applyDecreasingShift (hitObjects, shift) {
		for (const [i, hitObject] of hitObjects.entries()) {
			// The first object is shifted by a vector slightly smaller than shift
			// The last object is shifted by a vector slightly larger than zero
			const position = vectorFAdd(hitObject.position, vectorMultiply(shift, (hitObjects.length - i) / (hitObjects.length + 1)));
	
			hitObject.position = clampToPlayfieldWithPadding(position, float(this.Beatmap.Radius));
		}
	}

	apply () {
		if (!this.Beatmap.Mods.has('RD')) 
			return;
		
		this.generatePositionInfos();

		let sectionOffset = 0;
		let flowDirection = false;

		for (const [i, hitObject] of this.Beatmap.hitObjects.entries()) {
			if (this.shouldStartNewSection(i)) {
				sectionOffset = this.getRandomOffset(0.0008);
				flowDirection = !flowDirection;
			}
	
			if (hitObject.objectName == 'slider' && this.Random.sample() < 0.5) {
				FlipSliderInPlaceHorizontally(hitObject);
			}
	
			if (i == 0) {
				hitObject.DistanceFromPrevious = float(this.Random.sample() * PLAYFIELD_HEIGHT / 2);
				hitObject.RelativeAngle = float(this.Random.sample() * 2 * Math.PI - Math.PI);
			} else {
				// Offsets only the angle of the current hit object if a flow change occurs.
				let flowChangeOffset = 0;
	
				// Offsets only the angle of the current hit object.
				let oneTimeOffset = this.getRandomOffset(0.002);
	
				if (this.shouldApplyFlowChange(i)) {
					flowChangeOffset = this.getRandomOffset(0.002);
					flowDirection = !flowDirection;
				}
	
				const totalOffset =
					float(
						// sectionOffset and oneTimeOffset should mainly affect patterns with large spacing.
						(sectionOffset + oneTimeOffset) * hitObject.DistanceFromPrevious +
						// flowChangeOffset should mainly affect streams.
						flowChangeOffset * (PLAYFIELD_DIAGONAL - hitObject.DistanceFromPrevious)
					);
	
				hitObject.RelativeAngle = this.getRelativeTargetAngle(hitObject.DistanceFromPrevious, totalOffset, flowDirection);
			}
		}
	
		let previous;
	
		for (const [i, hitObject] of this.Beatmap.hitObjects.entries()) {
			if (hitObject.objectName == 'spinner') {
				previous = hitObject;
				continue;
			}
	
			computeModifiedPosition(hitObject, previous, i > 1 ? this.Beatmap.hitObjects[i - 2] : undefined);
	
			let shift = [0, 0];
	
			switch (hitObject.objectName) {
				case 'circle':
					shift = this.clampHitCircleToPlayfield(hitObject);
					break;
	
				case 'slider':
					shift = this.clampSliderToPlayfield(hitObject);
					break;
			}
	
			const preceding_hitobjects_to_shift = 10;
	
			if (!vectorEquals(shift, [0, 0])) {
				const toBeShifted = []
	
				for (let j = i - 1; j >= i - preceding_hitobjects_to_shift && j >= 0; j--)
				{
					// only shift hit circles
					if (hitObject.objectName != 'circle') break;
	
					toBeShifted.push(this.Beatmap.hitObjects[j]);
				}
	
				if (toBeShifted.length > 0)
					this.applyDecreasingShift(toBeShifted, shift);
			}
	
			previous = hitObject;
		}
	}
}

module.exports = RandomMod;