const osr = require('node-osr');

const KEYS_ENUM = {
    "M1": Math.pow(2,0),
    "M2": Math.pow(2,1),
    "K1": Math.pow(2,2),
    "K2": Math.pow(2,3),
    "S": Math.pow(2,4)
}

function parseKeysPressed(num){
    let keys = Number(num);
    let output_keys = {
        K1: false,
        K2: false,
        M1: false,
        M2: false,
        S: false
    };

    for(key in KEYS_ENUM){
        output_keys[key] = false;
        if(KEYS_ENUM[key] & keys)
            output_keys[key] = true;
    }

    if(output_keys.K1 && output_keys.M1)
        output_keys.M1 = false;

    if(output_keys.K2 && output_keys.M2)
        output_keys.M2 = false;

    return output_keys;
}

async function parseReplay(buf, decompress = true){
    let replay_data = buf;

    if(decompress) {
		let data = await osr.read(buf);
		if (data.hasOwnProperty("score_info")) {
			isSetOnLazer = true;
			score_info = data.score_info;
            console.log(JSON.stringify(score_info, undefined, 2))
		}
        replay_data = data.replay_data;
	}

        
    let replay_frames = replay_data.split(",");

    let output_frames = [];

    let offset = 0;

    for(let i = 0; i < replay_frames.length; i++){
        let replay_frame = replay_frames[i].split("|");

        if(replay_frame.length < 4)
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

    return output_frames;
}

module.exports = { parseReplay };