const osr = require('node-osr');
const { PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT, MathF, vectorDistance, radToDeg } = require('./util');

const MAX_RADIAN = 360 * (Math.PI / 180);
const RPM_SPAN = 595; // time span for average rpm in ms
 
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

        Object.assign(Replay, data);
	}
        
    const replay_frames = Replay.replay_data.split(",");
    const output_frames = [];
    let prev_frame;

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
            keys: parseKeysPressed(replay_frame[3]),
            presses: 0
        };

        let keys = parseKeysPressed(replay_frame[3]);

        output_frame = Object.assign(keys, output_frame);

        if (output_frame.M1 || output_frame.M2 || output_frame.K1 || output_frame.K2) {
            output_frame.holding = true;
        }

        if (prev_frame) {
            if (
                (output_frame.M1 || output_frame.K1) &&
                 !(prev_frame.M1 || prev_frame.K1)
            ) {
                output_frame.presses++;
            }

            if (
                (output_frame.M2 || output_frame.K2) &&
                 !(prev_frame.M2 || prev_frame.K2)
            ) {
                output_frame.presses++;
            }
        }

        prev_frame = output_frame;
        output_frames.push(output_frame);

        offset = output_frames[output_frames.length - 1].offset;
    }

	Replay.lastCursor= 0;
	Replay.replay_data = output_frames;

    return Replay;
};

/*
REPLAY SCORING
*/
const newScoringFrame = scoringFrames => {
    let scoringFrame = {
        ur: 0, offset: 0, 
        count300: 0, count100: 0, count50: 0, countMiss: 0, 
        largeTickHits: 0, smallTickHits: 0, sliderEndHits: 0,
        largeTickMisses: 0, smallTickMisses: 0, sliderEndMisses: 0,
        combo: 0, previousCombo: 0, maxCombo: 0, accuracy: 100, rotation: 0, rpm: 0
    };

    if(scoringFrames.length > 0)
        scoringFrame = Object.assign(scoringFrame, scoringFrames[scoringFrames.length - 1]);

    scoringFrame.previousCombo = scoringFrame.combo;

    return scoringFrame;
}

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

class ReplayProcessor {
	Beatmap;
	Cursor;

	constructor (Beatmap) {
		this.Beatmap = Beatmap;
	}

	generateAuto () {
		const { Beatmap } = this;

		const Replay = {
            lastCursor: 0,
            auto: true,
            replay_data: [{offset: 0, x: 0, y: 0}]
        };

		for (const [i, hitObject] of Beatmap.hitObjects.entries()) {
            if(hitObject.objectName != "spinner"){
                if(i > 0){
                    Replay.replay_data.push({
                        offset: Math.max(Beatmap.hitObjects[i - 1].endTime, hitObject.startTime - 20),
                        x: hitObject.position[0],
                        y: hitObject.position[1]
                    });
                }

                Replay.replay_data.push({
                    offset: hitObject.startTime,
                    x: hitObject.position[0],
                    y: hitObject.position[1]
                });

                Replay.replay_data.push({
                    offset: hitObject.startTime + 1,
                    x: hitObject.position[0],
                    y: hitObject.position[1]
                });
            }else{
                // 7 rotations per second
                let rps = 7;
                let radius = 60;

                let rotations = hitObject.duration / 1000 * rps;

                for(let x = 0; x < rotations; x++){
                    let rotationLength = Math.min(1, rotations - x);

                    for(let a = 0; a < rotationLength * MAX_RADIAN; a += MAX_RADIAN / (rotationLength * 100)){
                        let offset = hitObject.startTime + x * (1000 / rps) + a / MAX_RADIAN * (1000 / rps);

                        let point = {
                            offset,
                            x: PLAYFIELD_WIDTH / 2 + radius * Math.cos(a),
                            y: PLAYFIELD_HEIGHT / 2 + radius * Math.sin(a)
                        };

                        Replay.replay_data.push(point);
                    }
                }
            }

            if(hitObject.objectName == "slider"){
                let endPosition = hitObject.endPosition;

                let nextObject;

                if(Beatmap.hitObjects.length > i + 1)
                    nextObject = Beatmap.hitObjects[i + 1];

                if(nextObject){
                    let pos_current = hitObject.endPosition;
                    let pos_next = nextObject.position;

                    let distance = vectorDistance(pos_current, pos_next);

                    let n = Math.max(1, Math.min(Beatmap.ActualFollowpointRadius, distance));

                    if(distance > 0){
                        endPosition = [
                            pos_current[0] + (n / distance) * (pos_next[0] - pos_current[0]),
                            pos_current[1] + (n / distance) * (pos_next[1] - pos_current[1])
                        ];
                    }
                }

                if(hitObject.duration < 100 && hitObject.repeatCount == 1){
                    Replay.replay_data.push({
                        offset: hitObject.startTime,
                        x: hitObject.position[0],
                        y: hitObject.position[1]
                    });
                    Replay.replay_data.push({
                        offset: hitObject.endTime,
                        x: endPosition[0],
                        y: endPosition[1]
                    });
                }else if(hitObject.repeatCount > 1 && hitObject.lazyStay && (hitObject.duration / hitObject.repeatCount) < 200){
                    Replay.replay_data.push({
                        offset: hitObject.startTime,
                        x: hitObject.position[0],
                        y: hitObject.position[1]
                    }, {
                        offset: hitObject.startTime + hitObject.duration / hitObject.repeatCount,
                        x: hitObject.lazyEndPosition[0],
                        y: hitObject.lazyEndPosition[1]
                    }, {
                        offset: hitObject.endTime - Math.min(75, hitObject.duration),
                        x: hitObject.lazyEndPosition[0],
                        y: hitObject.lazyEndPosition[1]
                    }, {
                        offset: hitObject.endTime,
                        x: endPosition[0],
                        y: endPosition[1]
                    });
                }else{
                    let length = hitObject.duration / hitObject.repeatCount;

                    for(let i = 0; i < hitObject.repeatCount; i++){
                        let slider_dots = hitObject.SliderDots.slice();

                        if(i % 2 != 0)
                            slider_dots.reverse();

                        slider_dots.forEach((dot, index) => {
                            Replay.replay_data.push({
                                offset: hitObject.startTime + i * length + index / slider_dots.length * length,
                                x: dot[0],
                                y: dot[1]
                            });
                        });
                    }
                }
            }
		}

        Beatmap.Replay = Replay;
	}

	applyJudgements () {
		const { Beatmap, cursor } = this;

		let classicNotelock = Beatmap.Mods.get('CL')?.classic_note_lock ?? false;
        if (Beatmap.options.stable) classicNotelock = true;
        if (Beatmap.options.lazer) classicNotelock = false;

		cursor.reset();

		for (const [i, hitObject] of Beatmap.hitObjects.entries()) {
			const nextEarliestHit = (Beatmap.hitObjects[i+1]?.startTime ?? hitObject.startTime) - Beatmap.HitWindowMiss;
	
			if(hitObject.objectName == 'spinner')
				continue; // process spinners later
	
			let current;
			let earliestCursor = cursor.i ?? 0;
	
			do {
				current = cursor.next();
	
				if (current != null && current.offset < nextEarliestHit)
					earliestCursor++;
	
				if (current != null && current.offset > hitObject.latestHit) {
					if (classicNotelock) {
						cursor.prev();
					} else {
						cursor.i = earliestCursor;
					}
	
					break;
				}
	
				if (current == null || current.offset < hitObject.startTime - Beatmap.HitWindowMiss)
					continue;
	
				if (current.presses > 0) {
                    if (classicNotelock) current.presses--;

                    let offsetRaw = current.offset - hitObject.startTime;
					let offset = Math.abs(offsetRaw);

					if (withinCircle(current.x, current.y, ...hitObject.position, Beatmap.Radius)) {
						let hitResult = 0;
						if(offset <= Beatmap.HitWindow300)
							hitResult = 300;
						else if(offset <= Beatmap.HitWindow100)
							hitResult = 100;
						else if(offset <= Beatmap.HitWindow50)
							hitResult = 50;
						else
							hitResult = 0;

						hitObject.hitOffset = offsetRaw;
						hitObject.hitResult = hitResult;
					}
				}

                if (classicNotelock && current.presses > 0) {
                    cursor.prev();
                    break;
                }

                if (classicNotelock && hitObject.objectName == 'slider' && current.offset < Math.min(hitObject.endTime, hitObject.startTime + Beatmap.HitWindow50)) {
                    continue;
                } else if (hitObject.hitResult != null) {
					break;
                }
			} while (current != null && current.offset < hitObject.latestHit);
		}
	}

	generateScoringFrames () {
		const { Beatmap, cursor } = this;

		let sliderHeadAccuracy = Beatmap.Mods.get('CL')?.no_slider_head_accuracy ?? true;
        if (Beatmap.options.stable) sliderHeadAccuracy = false;
        if (Beatmap.options.lazer) sliderHeadAccuracy = true;

		const ScoringFrames = [];
		const allhits = [];

		cursor.reset();

		for (const hitObject of Beatmap.hitObjects){
			if (hitObject.objectName == 'circle' || sliderHeadAccuracy && hitObject.objectName == 'slider') {
				const scoringFrame = newScoringFrame(ScoringFrames);

				if (hitObject.hitResult == null)
					hitObject.hitResult = 0;

				scoringFrame.offset = hitObject.startTime + (hitObject.hitOffset != null ? hitObject.hitOffset : Beatmap.HitWindow50);
				scoringFrame.position = hitObject.position;

				scoringFrame.result = hitObject.hitResult;

				if (hitObject.hitResult == 0) {
					scoringFrame.result = 'miss';
					scoringFrame.combo = 0;
				}

				if (hitObject.hitResult > 0) {
					scoringFrame.hitOffset = hitObject.hitOffset;
					scoringFrame.combo++;

					allhits.push(hitObject.hitOffset);
					scoringFrame.ur = variance(allhits) * 10;
				}

				if (scoringFrame.combo > scoringFrame.maxCombo)
					scoringFrame.maxCombo = scoringFrame.combo;

				switch (scoringFrame.result) {
					case 300:
						scoringFrame.count300++;
						break;
					case 100:
						scoringFrame.count100++;
						break;
					case 50:
						scoringFrame.count50++;
						break;
					case 'miss':
						scoringFrame.countMiss++;
						break;
				}

				ScoringFrames.push(scoringFrame);
				
				if (hitObject.objectName != 'slider')
					continue;
			}

			if (hitObject.objectName == 'spinner') {
                let prev = cursor.at(hitObject.startTime);
                let current = cursor.next();
                let prevAngle;

                // reset current rotation to 0
                const resetFrame = newScoringFrame(ScoringFrames);
                resetFrame.rotation = 0;
                resetFrame.rpm = 0;
                resetFrame.result = undefined;
                ScoringFrames.push(resetFrame);

                const rotationRecords = [];

                while (current?.offset < hitObject.endTime) {
                    const scoringFrame = newScoringFrame(ScoringFrames);
                    scoringFrame.offset = current.offset;

                    const angle = radToDeg(MathF.atan2(current.x - PLAYFIELD_WIDTH / 2, current.y - PLAYFIELD_HEIGHT / 2));
                    let delta = prevAngle && current.holding ? angle - prevAngle : 0;

                    if (delta > 180) delta -= 360;
                    if (delta < -180) delta += 360;
                    
                    scoringFrame.rotation += delta;

                    rotationRecords.push({
                        offset: current.offset,
                        rotation: scoringFrame.rotation
                    });

                    while (rotationRecords.length > 0 && (current.offset - rotationRecords[0].offset) > RPM_SPAN) {
                        rotationRecords.splice(0, 1);
                    }

                    const rotationInSpan = Math.abs(rotationRecords[rotationRecords.length - 1].rotation) - Math.abs(rotationRecords[0].rotation);
                    scoringFrame.rpm = rotationInSpan / (current.offset - rotationRecords[0].offset) * 1000 * 60 / 360;
                    scoringFrame.rpm *= Beatmap.SpeedMultiplier;

                    ScoringFrames.push(scoringFrame);

                    prevAngle = angle;

                    prev = current;
                    current = cursor.next();
                }

				const scoringFrame = newScoringFrame(ScoringFrames);

				scoringFrame.result = 300;
				scoringFrame.combo++;

				scoringFrame.count300++;

				if(scoringFrame.combo > scoringFrame.maxCombo)
					scoringFrame.maxCombo = scoringFrame.combo;

				scoringFrame.offset = hitObject.endTime;

				scoringFrame.position = [PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2];

				ScoringFrames.push(scoringFrame);
			}

			if (hitObject.objectName == 'slider') {
				hitObject.hitResults = [];

				hitObject.MissedSliderStart = 0;
				hitObject.MissedSliderTick = 0;
				hitObject.MissedSliderEnd = 0;

				if (!sliderHeadAccuracy) {
					const scoringFrame = newScoringFrame(ScoringFrames);
					
					scoringFrame.offset = hitObject.startTime + Math.min(
						hitObject.hitOffset != null ? hitObject.hitOffset : Beatmap.HitWindow50,
						hitObject.endTime
						);

					if(hitObject.hitResult > 0){
						scoringFrame.result = 30;
						
						scoringFrame.combo++;

						scoringFrame.hitOffset = hitObject.hitOffset;
			
						allhits.push(hitObject.hitOffset);
						scoringFrame.ur = variance(allhits) * 10;

						if(scoringFrame.combo > scoringFrame.maxCombo)
							scoringFrame.maxCombo = scoringFrame.combo;

					}else{
						hitObject.MissedSliderStart = 1;
						scoringFrame.result = 'sliderbreak';
						
						scoringFrame.combo = 0;
					}

					ScoringFrames.push(scoringFrame);
				}

				for(let i = 0; i < hitObject.repeatCount; i++) {
					const repeatOffset = hitObject.startTime + i * (hitObject.duration / hitObject.repeatCount);
					const sliderTicks = hitObject.SliderTicks.slice();

					if (i % 2 == 1)
						sliderTicks.reverse();

					if (i > 0) {
						const scoringFrame = newScoringFrame(ScoringFrames);
						const replayFrame = cursor.at(repeatOffset);

						scoringFrame.offset = repeatOffset;

						const repeatPosition = i % 2 == 1 ? hitObject.endPosition : hitObject.position;

						scoringFrame.position = repeatPosition;

						const isLateStart = sliderHeadAccuracy && hitObject.hitOffset <= Beatmap.HitWindow50 && hitObject.hitOffset > repeatOffset;

						if (isLateStart || replayFrame.holding && withinCircle(replayFrame.x, replayFrame.y, ...repeatPosition, Beatmap.ActualFollowpointRadius)) {
							scoringFrame.result = 30;
							scoringFrame.combo++;
							scoringFrame.largeTickHits++;

							if(scoringFrame.combo > scoringFrame.maxCombo)
								scoringFrame.maxCombo = scoringFrame.combo;

							ScoringFrames.push(scoringFrame);
						} else {
							// missed a slider repeat
							if (sliderHeadAccuracy) {
								scoringFrame.result = 'sliderbreak';
							} else {
								scoringFrame.result = 'large_tick_miss';
								scoringFrame.largeTickMisses++;
							}
							scoringFrame.combo = 0;
							hitObject.MissedSliderTick = true;

							ScoringFrames.push(scoringFrame);
						}
					}

					for (const tick of sliderTicks) {
						const scoringFrame = newScoringFrame(ScoringFrames);
						const tickOffset = i % 2 == 1 ? tick.reverseOffset : tick.offset;

						const offset = repeatOffset + tickOffset;

						scoringFrame.offset = offset;
						scoringFrame.position = tick.position;

						const replayFrame = cursor.at(offset);

						const isLateStart = sliderHeadAccuracy && hitObject.hitOffset <= Beatmap.HitWindow50 && hitObject.hitOffset > repeatOffset;

						if (isLateStart || replayFrame.holding && withinCircle(replayFrame.x, replayFrame.y, ...tick.position, Beatmap.ActualFollowpointRadius)) {
							scoringFrame.result = 10;
							scoringFrame.combo++;
							scoringFrame.largeTickHits++;

							if(scoringFrame.combo > scoringFrame.maxCombo)
								scoringFrame.maxCombo = scoringFrame.combo;

							ScoringFrames.push(scoringFrame);

							continue;
						}

						// missed a slider tick
						hitObject.MissedSliderTick = 1;
						if (sliderHeadAccuracy) {
							scoringFrame.result = 'sliderbreak';
						} else {
							scoringFrame.result = 'large_tick_miss';
							scoringFrame.largeTickMisses++;
						}
						scoringFrame.combo = 0;

						ScoringFrames.push(scoringFrame);
					}

					if (i + 1 == hitObject.repeatCount) {
						const replayFrame = cursor.at(hitObject.actualEndTime);

						const endPosition = i % 2 == 1 ? hitObject.position : hitObject.actualEndPosition;

						const isLateStart = sliderHeadAccuracy 
						&& hitObject.hitOffset <= Beatmap.HitWindow50 
						&& hitObject.hitOffset > (hitObject.actualEndTime - hitObject.startTime);

						if (isLateStart || replayFrame.holding && withinCircle(replayFrame.x, replayFrame.y, ...endPosition, Beatmap.ActualFollowpointRadius)) {
							const scoringFrame = newScoringFrame(ScoringFrames);
							scoringFrame.offset = hitObject.endTime;
							scoringFrame.position = endPosition;

							scoringFrame.result = 30;
							scoringFrame.combo++;

							if(scoringFrame.combo > scoringFrame.maxCombo)
								scoringFrame.maxCombo = scoringFrame.combo;

							ScoringFrames.push(scoringFrame);
						}else{
							
							/*console.log('missed slider end at', scoringFrame.offset, currentHolding);

							console.log('fake   end position', ...hitObject.endPosition, 'fake   end time', hitObject.endTime);
							console.log('missed slider end at', scoringFrame.offset);
							console.log(`cursor:${replayFrame.x}+${replayFrame.y},${currentHolding}`);
							console.log(`position:${endPosition[0]}+${endPosition[1]}`);
							console.log(`startPosition:${hitObject.position[0]}+${hitObject.position[1]}`);
							console.log(`endPosition:${hitObject.endPosition[0]}+${hitObject.endPosition[1]}`);*/

							hitObject.MissedSliderEnd = 1;
						}

						const scoringFrameEnd = newScoringFrame(ScoringFrames);

						scoringFrameEnd.offset = repeatOffset + hitObject.duration / hitObject.repeatCount;

						const totalPartsMissed = 
						hitObject.MissedSliderStart
						+ hitObject.MissedSliderTick
						+ hitObject.MissedSliderEnd;

						scoringFrameEnd.position = hitObject.repeatCount % 2 == 0 ? hitObject.position : hitObject.endPosition;

						if (sliderHeadAccuracy) {
							if (hitObject.MissedSliderEnd) {
								scoringFrameEnd.result = 'slider_end_miss';
								scoringFrameEnd.smallTickMisses++;
								scoringFrameEnd.sliderEndMisses++;
							} else {
								scoringFrameEnd.result = 30;
								scoringFrameEnd.smallTickHits++;
								scoringFrameEnd.sliderEndHits++;
							}
							ScoringFrames.push(scoringFrameEnd);
							continue;
						}

						/*if(totalPartsMissed > 0){
							console.log('---');
							console.log('slider start missed', hitObject.MissedSliderStart);
							console.log('slider tick missed', hitObject.MissedSliderTick);
							console.log('slider end missed', hitObject.MissedSliderEnd);
						}*/

						switch(totalPartsMissed){
							case 0:
								scoringFrameEnd.result = 300;
								scoringFrameEnd.count300++;
								break;
							case 1:
								scoringFrameEnd.result = 100;
								scoringFrameEnd.count100++;
								break;
							case 2:
								scoringFrameEnd.result = 50;
								scoringFrameEnd.count50++;
								break;
							default:
								scoringFrameEnd.result = 'miss';
								scoringFrameEnd.countMiss++;
						}

						ScoringFrames.push(scoringFrameEnd);
					}
				}
			}
		}

		Beatmap.ScoringFrames = ScoringFrames.sort((a, b) => a.offset - b.offset);
	}

	process () {
		const { Beatmap } = this;

		if (!Beatmap.Replay)
			this.generateAuto();

		this.cursor = new Cursor(this.Beatmap.Replay);

		this.applyJudgements();
		this.generateScoringFrames();
	}
}

const applyReplay = Beatmap => {
	new ReplayProcessor(Beatmap).process();
}

module.exports = { applyReplay, parseReplay };
