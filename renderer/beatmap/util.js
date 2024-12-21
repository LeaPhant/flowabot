/*
MATH AND PRECISION
*/
const { fround: float } = Math;
const int = x => Math.imul(x, 1);

const MathF = {
	PI: float(Math.PI),
	atan2: (y, x) => float(Math.atan2(y, x)),
	sin: (x) => float(Math.sin(x)),
	cos: (x) => float(Math.cos(x))
};

const FLOAT_EPSILON = 1e-3;

const AlmostEquals = (value1, value2, acceptableDifference = FLOAT_EPSILON) => Math.abs(value1 - value2) <= acceptableDifference;
const clamp = (number, min, max) => Math.max(Math.min(number, max), min);

/*
VECTOR OPERATIONS
*/
const vectorF = (v) => {
	return [
		float(v[0]),
		float(v[1])
	];
};

const vectorLength = (v) => {
    return Math.sqrt(v[0] ** 2 + v[1] ** 2);
};

const vectorFLength = (v) => {
	return float(vectorLength(v));
};

const vectorDistance = (a, b) => {
    return Math.sqrt((b[0] - a[0]) * (b[0] - a[0])
        + (b[1] - a[1]) * (b[1] - a[1]));
};

const vectorFDistance = (a, b) => {
	return float(vectorDistance(a, b));
};

const vectorEquals = (a, b) => {
    return a[0] == b[0] && a[1] == b[1];
};

const vectorSubtract = (a, b) => {
    return [
        a[0] - b[0],
        a[1] - b[1]
    ];
};

const vectorFSubtract = (a, b) => {
	return vectorF(vectorSubtract(a, b));
};

const vectorAdd = (a, b) => {
    return [
        a[0] + b[0],
        a[1] + b[1]
    ];
};

const vectorFAdd = (a, b) => {
	return vectorF(vectorAdd(a, b));
};

const vectorMultiply = (a, m) => {
    return [
        a[0] * m,
        a[1] * m
    ];
};

const vectorFMultiply = (a, b) => {
	return vectorF(vectorMultiply(a, b));
};

const vectorDivide = (a, d) => {
    return [
        a[0] / d,
        a[1] / d
    ];
};

const vectorFDivide = (a, b) => {
	return vectorF(vectorDivide(a, b));
};

const vectorRotate = (v, rotation) => {
    const angle = Math.atan2(v[1], v[0]) + rotation;
    const length = vectorLength(v);
    return [
        length * Math.cos(angle),
        length * Math.sin(angle)
    ];
};

const vectorFRotate = (v, rotation) => {
    const angle = MathF.atan2(v[1], v[0]) + rotation;
    const length = vectorFLength(v);
    return [
        length * MathF.cos(angle),
        length * MathF.sin(angle)
    ];
};

const vectorDistanceSquared = (a, b) => {
    return (b[0] - a[0]) * (b[0] - a[0])
        + (b[1] - a[1]) * (b[1] - a[1]);
};

const vectorFDistanceSquared = (a, b) => {
	return float(vectorDistanceSquared(a, b));
};

/*
CONSTANTS
*/
const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;
const PLAYFIELD_DIAGONAL_REAL = vectorLength([PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT]);
const PLAYFIELD_DIAGONAL = 640.995056;
const PLAYFIELD_CENTER = [PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2];

const PLAYFIELD_EDGE_RATIO = 0.375;
const BORDER_DISTANCE_X = PLAYFIELD_WIDTH * PLAYFIELD_EDGE_RATIO;
const BORDER_DISTANCE_Y = PLAYFIELD_HEIGHT * PLAYFIELD_EDGE_RATIO;

/*
BEATMAP UTILITIES
*/
const difficultyRange = (difficulty, min, mid, max) => {
	if (min === undefined)
		return (difficulty - 5) / 5;

    let result;

    if(difficulty > 5)
        result = mid + (max - mid) * (difficulty - 5) / 5;
    else if(difficulty < 5)
        result = mid + (mid - min) * (difficulty - 5) / 5;
    else
        result = mid

    return float(result);
};

const getTimingPoint = (timingPoints, offset, redLines = false) => {
    let timingPoint = timingPoints[0];

    for(let x = timingPoints.length - 1; x >= 0; x--){
		if(redLines && !timingPoints[x].timingChange) continue;

        if(timingPoints[x].offset <= offset){
            timingPoint = timingPoints[x];
            break;
        }
    }

    return timingPoint;
};

/*
C# PRNG
*/
const INT32_MIN_VALUE = -0x80000000;
const INT32_MAX_VALUE = 0x7fffffff;

// https://source.dot.net/#System.Private.CoreLib/src/libraries/System.Private.CoreLib/src/System/Random.CompatImpl.cs,241
class Random {
    _seedArray;
    _inext;
    _inextp;

    constructor(seed) {
        this.seed = int(seed);

        let seedArray = new Array(56);
 
        let subtraction = int((seed == INT32_MIN_VALUE) ? INT32_MAX_VALUE : Math.abs(seed));
        let mj = int(161803398 - subtraction); // magic number based on Phi (golden ratio)
        seedArray[55] = mj;
        let mk = 1;

        let ii = 0;
        for (let i = 1; i < 55; i++)
        {
            // The range [1..55] is special (Knuth) and so we're wasting the 0'th position.
            if ((ii += 21) >= 55)
            {
                ii = ii - 55;
            }

            seedArray[ii] = mk;
            mk = int(mj - mk);
            if (mk < 0)
            {
                mk = int(mk + INT32_MAX_VALUE);
            }

            mj = int(seedArray[ii]);
        }

        for (let k = 1; k < 5; k++)
        {
            for (let i = 1; i < 56; i++)
            {
                let n = i + 30;
                if (n >= 55)
                {
                    n -= 55;
                }

                seedArray[i] = int(seedArray[i] - seedArray[1 + n]);
                if (seedArray[i] < 0)
                {
                    seedArray[i] = int(seedArray[i] + INT32_MAX_VALUE);
                }
            }
        }

        this._seedArray = seedArray;
        this._inext = 0;
        this._inextp = 21;
    }

    sample () {
		let sample = this.InternalSample() * (1.0 / INT32_MAX_VALUE);
        return sample;
    }

    InternalSample () {
        let locINext = this._inext;

        if (++locINext >= 56)
        {
            locINext = 1;
        }

        let locINextp = this._inextp;
        if (++locINextp >= 56)
        {
            locINextp = 1;
        }

        let seedArray = this._seedArray;
        let retVal = int(seedArray[locINext] - seedArray[locINextp]);

        if (retVal == INT32_MAX_VALUE)
        {
            retVal = int(retVal - 1);
        }
        if (retVal < 0)
        {
            retVal = int(retVal + INT32_MAX_VALUE);
        }

        seedArray[locINext] = retVal;
        this._inext = locINext;
        this._inextp = locINextp;

        return retVal;
    }
}

module.exports = {
	MathF, float, int,
	INT32_MAX_VALUE, INT32_MIN_VALUE,
	AlmostEquals, clamp,
	vectorF,
	vectorLength, vectorFLength,
	vectorDistance, vectorFDistance,
	vectorEquals,
	vectorSubtract, vectorFSubtract,
	vectorAdd, vectorFAdd,
	vectorMultiply, vectorFMultiply,
	vectorDivide, vectorFDivide,
	vectorRotate, vectorFRotate,
	vectorDistanceSquared, vectorFDistanceSquared,
	PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT, PLAYFIELD_CENTER,
	PLAYFIELD_DIAGONAL, PLAYFIELD_DIAGONAL_REAL, BORDER_DISTANCE_X, BORDER_DISTANCE_Y,
	difficultyRange, getTimingPoint,
	Random
};