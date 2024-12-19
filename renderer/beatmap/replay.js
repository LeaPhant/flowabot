const osr = require('node-osr');

/*
REPLAY PARSING
*/
const KEYS_ENUM = {
    "M1": Math.pow(2,0),
    "M2": Math.pow(2,1),
    "K1": Math.pow(2,2),
    "K2": Math.pow(2,3),
    "S": Math.pow(2,4)
}

const parseKeysPressed = (num) => {
    const keys = Number(num);

    const output_keys = {
        K1: false,
        K2: false,
        M1: false,
        M2: false,
        S: false
    };

    for (const key in KEYS_ENUM) {
        output_keys[key] = false;
        if(KEYS_ENUM[key] & keys)
            output_keys[key] = true;
    }

    if (output_keys.K1 && output_keys.M1)
        output_keys.M1 = false;

    if (output_keys.K2 && output_keys.M2)
        output_keys.M2 = false;

    return output_keys;
}

const parseReplay = async (buf, decompress = true) => {
	const Replay = {};
    let replay_data = buf;

    if (decompress) {
		const data = await osr.read(buf);

		if (data.hasOwnProperty('score_info')) {
			Replay.isSetOnLazer = true;
			// @ts-ignore
			Replay.score_info = data.score_info;
		}
		
        replay_data = data.replay_data;
	}
        
    const replay_frames = replay_data.split(",");
    const output_frames = [];

    let offset = 0;

    for (let i = 0; i < replay_frames.length; i++) {
        let replay_frame = replay_frames[i].split("|");

        if (replay_frame.length < 4)
            continue;

        let output_frame = {
            offset: Number(replay_frame[0]) + offset,
            timeSinceLastAction: Number(replay_frame[0]),
            x: Number(replay_frame[1]),
            y: Number(replay_frame[2]),
            keys: parseKeysPressed(replay_frame[3])
        };

        let keys = parseKeysPressed(replay_frame[3]);

        output_frame = Object.assign(keys, output_frame);

        output_frames.push(output_frame);

        offset = output_frames[output_frames.length - 1].offset;
    }

	Replay.replay_data = output_frames;

    return Replay;
};

/*
REPLAY SCORING
*/
const withinCircle = (x, y, centerX,  centerY, radius) => {
    return Math.pow((x - centerX), 2) + Math.pow((y - centerY), 2) < Math.pow(radius, 2);
};

const variance = array => {
    let m = 0;
    let s = 0;
    let oldM;
    
    for (let k = 1; k <= array.length; k++) {
        let x = array[k - 1];
        oldM = m;
        m += (x - m) / k;
        s += (x - m) * (x - oldM);
    }

    const v = s / (array.length - 1);

    return Math.sqrt(s / array.length);
};

class Cursor {
    i = 0;
    replayData;

    constructor (replay) {
        this.replayData = replay.replay_data;
    }

    next () {
        return this.replayData[this.i++];
    }

    prev () {
        return this.replayData[--this.i];
    }

    at (time) {
        while (this.i + 1 < this.replayData.length 
            && this.replayData[this.i].offset < time) {
            this.i++;
        }

        return this.replayData[this.i];
    }

    reset () {
        this.i = 0;
    }
}

module.exports = { parseReplay };