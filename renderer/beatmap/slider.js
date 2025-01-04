const { 
	vectorMultiply, vectorDivide, vectorAdd, vectorSubtract, 
	vectorDistance, vectorDistanceSquared, 
	vectorEquals,
	clamp
} = require('./util');

const CATMULL_DETAIL = 50;
const CIRCULAR_ARC_TOLERANCE = 0.1;
const BEZIER_DETAIL = 100;

const TAIL_LENIENCY = -36;

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

// interpolate points across an even distance d
const interpolatePoints = (points, d = 1) => {
	// first generate distance data
	let length = 0;

	points = points.map((point, i) => {
		if (i == 0)
			return { point, distance: 0 };

		const distance = vectorDistance(point, points[i - 1]);
		length += distance;

		return { point, distance };
	});

	// here our interpolated points will go, each exactly 1 d apart 
	const dots = [points[0].point];

	let distance = 0;
	let curr = points[0];
	let nextIndex = 1;
	let lastIndex = points.length - 1;
	let next = points[nextIndex];
	let currDistance = next.distance;

	while (distance < length) {
		// go across the curve until a point is at least 1 d away (or we're out of points)
		while (currDistance < d && nextIndex < lastIndex) {
			nextIndex++;
			next = points[nextIndex];
			currDistance += next.distance;
		}

		// we've reached the last point and there are no more points to satisfy distance d, abort
		if (currDistance < d) break;

		// go across distance in intervals of d until we reach the next point
		while (currDistance >= d) {
			// nudge the current point 1 pixel into the direction of the next point 
			const relVector = vectorSubtract(next.point, curr.point);
			const nudgeVector = vectorMultiply(relVector, d / currDistance);
			const nudgedPoint = vectorAdd(curr.point, nudgeVector)

			dots.push(nudgedPoint);

			currDistance -= d;
			distance += d;
			curr = { point: nudgedPoint, distance: d };
		}
	}

	return dots;
};

// Pretty much copied from osu-lazer https://github.com/ppy/osu-framework/blob/master/osu.Framework/MathUtils/PathApproximator.cs#L89
const getCatmullCurve = curve => {
	const points = [];

	for (let x = 0; x < curve.length - 1; x++) {
		const v1 = x > 0 ? curve[x - 1] : curve[x];
		const v2 = curve[x];
		const v3 = x < curve.length - 1 ? curve[x + 1] : vectorSubtract(vectorAdd(v2, v2), v1);
		const v4 = x < curve.length - 2 ? curve[x + 2] : vectorSubtract(vectorAdd(v3, v3), v2);

		for (let c = 0; c < CATMULL_DETAIL; c++) {
			points.push(
				catmullFindPoint(v1, v2, v3, v4, c / CATMULL_DETAIL),
				catmullFindPoint(v1, v2, v3, v4, (c + 1) / CATMULL_DETAIL)
			);
		}
	}

	return points;
};

const getBezierCurve = curve => {
	const points = [];

	// generate points on a bezier curve
	for (let x = 0; x <= 1; x += 1 / BEZIER_DETAIL)
		points.push(coordsOnBezier(curve, x));

	return points;
};

// Pretty much copied from osu-lazer https://github.com/ppy/osu-framework/blob/master/osu.Framework/MathUtils/PathApproximator.cs#L114
const get3PointCurve = curve => {
	const points = [];
	const [a, b, c] = curve;

	const aSq = vectorDistanceSquared(b, c);
	const bSq = vectorDistanceSquared(a, c);
	const cSq = vectorDistanceSquared(a, b);

	if (aSq == 0 || bSq == 0 || bSq == 0) {
		return curve;
	}

	const s = aSq * (bSq + cSq - aSq);
	const t = bSq * (aSq + cSq - bSq);
	const u = cSq * (aSq + bSq - cSq);

	const sum = s + t + u;

	if (sum == 0) {
		return curve;
	}

	let center = [
		s * a[0] + t * b[0] + u * c[0],
		s * a[1] + t * b[1] + u * c[1]
	];

	center = vectorDivide(center, sum);

	const dA = vectorSubtract(a, center);
	const dC = vectorSubtract(c, center);

	const r = vectorDistance(a, center);

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

	const amountPoints = Math.max(25, 2 * r <= CIRCULAR_ARC_TOLERANCE ? 2 : Math.max(2, Math.ceil(thetaRange / (2 * Math.acos(1 - CIRCULAR_ARC_TOLERANCE / r)))));

	for (let i = 0; i < amountPoints; ++i) {
		const fract = i / (amountPoints - 1);
		const theta = thetaStart + dir * fract * thetaRange;

		let o = [
			Math.cos(theta),
			Math.sin(theta)
		];

		o = vectorMultiply(o, r);

		points.push(vectorAdd(center, o))
	}

	return points;
}

class SliderProcessor {
	Beatmap;
	Slider;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	apply3Point () {
		const { Slider } = this;

		const points = get3PointCurve(Slider.points);
		Slider.SliderDots.push(...interpolatePoints(points));
	}

	applyCatmull () {
		const { Slider } = this;

		const catmullPoints = getCatmullCurve(Slider.points);
		Slider.SliderDots.push(...interpolatePoints(catmullPoints));
	}

	applyBezier () {
		const { Slider } = this;
		const { points } = Slider;

		// iterate through slider points and split them into separate parts
		// at duplicate red points
		const sliderParts = [];
        let sliderPart = [];

		for (const [i, point] of points.entries()) {
			sliderPart.push(point);

			if(i < points.length - 1){
				if (vectorEquals(point, points[i + 1])) {
					sliderParts.push(sliderPart);
					sliderPart = [];
				}

				continue;
			}

			sliderPart.push(point);
			sliderParts.push(sliderPart);
		}

		const dots = [];

		// iterate through slider parts and generate curves with equal distance
		for (const part of sliderParts) {
			// two red control points in a row, this is a line
			if (part.length == 2) {
				const linearPoints = [part[0], part[1]];

				dots.push(...interpolatePoints(linearPoints));
				continue;
			}

			const bezierPoints = getBezierCurve(part);
			dots.push(...interpolatePoints(bezierPoints));
		}

		Slider.SliderDots.push(...dots);
	}

	applyActualEnd () {
		const { Slider } = this;
		const { SliderDots } = Slider;

		const turnDuration = Slider.duration / Slider.repeatCount;

		const finalSpanIndex = Slider.repeatCount - 1;
        const finalSpanStartTime = Slider.startTime + finalSpanIndex * turnDuration;

		const legacyLastTickTime = Math.max(Slider.startTime + Slider.duration / 2, (finalSpanStartTime + turnDuration) + TAIL_LENIENCY);
        let legacyLastTickProgress = (legacyLastTickTime - finalSpanStartTime) / turnDuration;

        if (Slider.repeatCount % 2 == 0)
			legacyLastTickProgress = 1 - legacyLastTickProgress;

		legacyLastTickProgress = clamp(legacyLastTickProgress, 0, 1);

		Slider.actualEndTime = legacyLastTickTime;
		Slider.actualEndPosition = SliderDots[Math.floor(legacyLastTickProgress * (SliderDots.length - 1))];

		/*if (SliderDots.length < 2) {
			Slider.SliderDots = [...Slider.points];
		}*/
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

		// cap the slider length to the in-game value (dirty fix)
		// this is needed because slider paths don't always match the 
		// specified points exactly but rather approach them at a constant speed
		Slider.SliderDots = Slider.SliderDots.slice(0, Slider.pixelLength);

		this.applyActualEnd();
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