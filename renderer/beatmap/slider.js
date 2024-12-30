const { 
	vectorMultiply, vectorDivide, vectorAdd, vectorSubtract, 
	vectorDistance, vectorDistanceSquared 
} = require('./util');

const CATMULL_DETAIL = 50;
const CIRCULAR_ARC_TOLERANCE = 0.1;
const BEZIER_DETAIL = 100;

const catmullFindPoint = (vec1, vec2, vec3, vec4, t) => {
    let t2 = t * t;
    let t3 = t * t2;

    return [
        0.5 * (2 * vec2[0] + (-vec1[0] + vec3[0]) * t + (2 * vec1[0] - 5 * vec2[0] + 4 * vec3[0] - vec4[0]) * t2 + (-vec1[0] + 3 * vec2[0] - 3 * vec3[0] + vec4[0]) * t3),
        0.5 * (2 * vec2[1] + (-vec1[1] + vec3[1]) * t + (2 * vec1[1] - 5 * vec2[1] + 4 * vec3[1] - vec4[1]) * t2 + (-vec1[1] + 3 * vec2[1] - 3 * vec3[1] + vec4[1]) * t3)
    ];
}

const binomialCoef = (n, k) => {
	var r = 1;

	if (k > n)
		return 0;

	for (let d = 1; d <= k; d++){
		r *= n--;
		r /= d;
	}

	return r;
}

const coordsOnBezier = (pointArray, t) => {
	var bx = 0, by = 0, n = pointArray.length - 1;

	if (n == 1) {
		bx = (1 - t) * pointArray[0][0] + t * pointArray[1][0];
		by = (1 - t) * pointArray[0][1] + t * pointArray[1][1];
	} else if (n == 2) {
		bx = (1 - t) * (1 - t) * pointArray[0][0] + 2 * (1 - t) * t * pointArray[1][0] + t * t * pointArray[2][0];
		by = (1 - t) * (1 - t) * pointArray[0][1] + 2 * (1 - t) * t * pointArray[1][1] + t * t * pointArray[2][1];
	} else if (n == 3) {
		bx = (1 - t) * (1 - t) * (1 - t) * pointArray[0][0] + 3 * (1 - t) * (1 - t) * t * pointArray[1][0] + 3 * (1 - t) * t * t * pointArray[2][0] + t * t * t * pointArray[3][0];
		by = (1 - t) * (1 - t) * (1 - t) * pointArray[0][1] + 3 * (1 - t) * (1 - t) * t * pointArray[1][1] + 3 * (1 - t) * t * t * pointArray[2][1] + t * t * t * pointArray[3][1];
	} else {
		for (let i = 0; i <= n; i++) {
			bx += binomialCoef(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i) * pointArray[i][0];
			by += binomialCoef(n, i) * Math.pow(1 - t, n - i) * Math.pow(t, i) * pointArray[i][1];
		}
    }

	return [bx,by];
}

class SliderProcessor {
	Beatmap;
	Slider;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	// Pretty much copied from osu-lazer https://github.com/ppy/osu-framework/blob/master/osu.Framework/MathUtils/PathApproximator.cs#L114
	apply3Point () {
		const { Slider } = this;
		const [a, b, c] = this.Slider.points;

		let aSq = vectorDistanceSquared(b, c);
		let bSq = vectorDistanceSquared(a, c);
		let cSq = vectorDistanceSquared(a, b);

		if (aSq == 0 || bSq == 0 || bSq == 0) {
			Slider.SliderDots = [...Slider.points];
			return;
		}

		let s = aSq * (bSq + cSq - aSq);
		let t = bSq * (aSq + cSq - bSq);
		let u = cSq * (aSq + bSq - cSq);

		let sum = s + t + u;

		if (sum == 0) {
			Slider.SliderDots = [...Slider.points];
			return;
		}

		let center = [
			s * a[0] + t * b[0] + u * c[0],
			s * a[1] + t * b[1] + u * c[1]
		];

		center = vectorDivide(center, sum);

		let dA = vectorSubtract(a, center);
		let dC = vectorSubtract(c, center);

		let r = vectorDistance(a, center);

		let thetaStart = Math.atan2(dA[1], dA[0]);
		let thetaEnd = Math.atan2(dC[1], dC[0]);

		while (thetaEnd < thetaStart)
			thetaEnd += 2 * Math.PI;

		let dir = 1;
		let thetaRange = thetaEnd - thetaStart;

		let orthoAtoC = vectorSubtract(c, a);

		orthoAtoC = [
			orthoAtoC[1],
			-orthoAtoC[0]
		];

		let bMinusA = vectorSubtract(b, a);

		if (orthoAtoC[0] * bMinusA[0] + orthoAtoC[1] * bMinusA[1] < 0) {
			dir = -dir;
			thetaRange = 2 * Math.PI - thetaRange;
		}

		let amountPoints = Math.max(25, 2 * r <= CIRCULAR_ARC_TOLERANCE ? 2 : Math.max(2, Math.ceil(thetaRange / (2 * Math.acos(1 - CIRCULAR_ARC_TOLERANCE / r)))));

		for (let i = 0; i < amountPoints; ++i) {
			let fract = i / (amountPoints - 1);
			let theta = thetaStart + dir * fract * thetaRange;

			let o = [
				Math.cos(theta),
				Math.sin(theta)
			];

			o = vectorMultiply(o, r);

			Slider.SliderDots.push(vectorAdd(center, o));
		}
	}

	// Pretty much copied from osu-lazer https://github.com/ppy/osu-framework/blob/master/osu.Framework/MathUtils/PathApproximator.cs#L89
	applyCatmull () {
		const { Slider } = this;

		for (let x = 0; x < Slider.points.length - 1; x++) {
			const v1 = x > 0 ? Slider.points[x - 1] : Slider.points[x];
			const v2 = Slider.points[x];
			const v3 = x < Slider.points.length - 1 ? Slider.points[x + 1] : vectorSubtract(vectorAdd(v2, v2), v1);
			const v4 = x < Slider.points.length - 2 ? Slider.points[x + 2] : vectorSubtract(vectorAdd(v3, v3), v2);

			for (let c = 0; c < CATMULL_DETAIL; c++) {
				Slider.SliderDots.push(
					catmullFindPoint(v1, v2, v3, v4, c / CATMULL_DETAIL),
					catmullFindPoint(v1, v2, v3, v4, (c + 1) / CATMULL_DETAIL)
				);
			}
		}
	}

	applyBezier () {
		const { Slider } = this;

		let sliderParts = [];
        let sliderPart = [];

		for (const [index, point] of Slider.points.entries()) {
			sliderPart.push(point);
			if(index < Slider.points.length - 1){
				if(point[0] == Slider.points[index + 1][0] && point[1] == Slider.points[index + 1][1]){
					sliderParts.push(sliderPart);
					sliderPart = [];
				}
			}else if(Slider.points.length - 1 == index){
				sliderPart.push(point);
				sliderParts.push(sliderPart);
			}
		}

		for (const part of sliderParts) {
			if (part.length == 2) {
				Slider.SliderDots.push(part[0], part[1]);
				continue;
			}
			
			for (let x = 0; x <= 1; x += 1 / BEZIER_DETAIL)
				Slider.SliderDots.push(coordsOnBezier(part, x));
		}
	}

	interpolateDots () {
		const { Slider } = this;

		const SliderDots = [];

		let pos_current = Slider.SliderDots[0];
        let next_index = 1;
        let pos_next = Slider.SliderDots[next_index];
        let length = 0;

        while (next_index < Slider.SliderDots.length - 1 && length < Slider.pixelLength) {
            while (vectorDistanceSquared(pos_current, pos_next) < 1 * 1 && next_index < Slider.SliderDots.length - 1) {
                next_index++;
                pos_next = Slider.SliderDots[next_index];
            }

            const distance = vectorDistance(pos_current, pos_next);

			if (distance < 1) continue;

			const pos_interpolated = [
				pos_current[0] + (1 / distance) * (pos_next[0] - pos_current[0]),
				pos_current[1] + (1 / distance) * (pos_next[1] - pos_current[1])
			];

			SliderDots.push(pos_interpolated);

			pos_current = pos_interpolated;
			length++;
        }

        const turnDuration = Slider.duration / Slider.repeatCount;

        if(turnDuration < 72){
            Slider.actualEndPosition = SliderDots[Math.floor(SliderDots.length / 2 - 1)];
            Slider.actualEndTime = Slider.startTime + (Slider.repeatCount - 1) * turnDuration + turnDuration / 2;
        }else{
            const sliderDotDuration = turnDuration / SliderDots.length;

            const turnSliderDots = Slider.repeatCount % 2 == 0 ? SliderDots.slice().reverse() : SliderDots;

            Slider.actualEndTime = Slider.endTime - 36;
            Slider.actualEndPosition = turnSliderDots[Math.floor(turnSliderDots.length - 1 - 36 / sliderDotDuration)];
        }

		if (SliderDots.length < 2) {
			Slider.SliderDots = [...Slider.points];
            return;
		}

        Slider.SliderDots = SliderDots;
	}

	generateTicks () {
		const { Beatmap, Slider } = this;

		Slider.endPosition = Slider.SliderDots[Slider.SliderDots.length - 1];
		
		// How far away you can stay away from the slider end without missing it
		let lazyEndOffset = Math.floor(Beatmap.ActualFollowpointRadius);

		if (Slider.SliderDots.length < lazyEndOffset) {
			Slider.lazyEndPosition = Slider.endPosition;
			Slider.lazyStay = true;
		} else if (Slider.repeatCount == 1) {
			Slider.lazyEndPosition = Slider.SliderDots[Slider.SliderDots.length - 1 - lazyEndOffset];
		} else if (Math.floor((Slider.SliderDots.length - 1) / 2) < lazyEndOffset) {
			Slider.lazyEndPosition = Slider.SliderDots[Math.floor((Slider.SliderDots.length - 1) / 2)];
			Slider.lazyStay = true;
		}

		const SliderTicks = [];

		let scoringDistance = 100 * Beatmap.SliderMultiplier * Slider.velocity;

		let tickDistance = scoringDistance / Beatmap.SliderTickRate;

		for(let x = tickDistance; x < Slider.pixelLength; x += tickDistance){
			let position = Slider.SliderDots[Math.floor(x)];

			if(!Array.isArray(position) || position.length != 2)
				continue;

			let turnDuration = Slider.duration / Slider.repeatCount;

			let offset = (x / Slider.pixelLength) * turnDuration;

			// Don't render slider tick on slider end
			if (Math.round(x) != Slider.pixelLength) {
				SliderTicks.push({
					offset: offset,
					reverseOffset: turnDuration - offset,
					position
				});
			}
		}

		Slider.SliderTicks = SliderTicks;
	}

	process (Slider) {
		this.Slider = Slider;

		Slider.SliderDots = [];

		if (Slider.curveType == 'pass-through' && Slider.points.length == 3) {
			this.apply3Point();
		} else if (Slider.curveType == 'catmull') {
			this.applyCatmull();
		} else {
			this.applyBezier();
		}

		this.interpolateDots();
		this.generateTicks();
	}
}

const applySliders = Beatmap => {
	const sliderProcessor = new SliderProcessor(Beatmap);
	const Sliders = Beatmap.hitObjects.filter(o => o.objectName == 'slider');

	for (const Slider of Sliders) {
		sliderProcessor.process(Slider);
	}
}

module.exports = applySliders;