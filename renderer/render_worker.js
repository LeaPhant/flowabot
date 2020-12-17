const { createCanvas, Image } = require('canvas');
const path = require('path');
const fs = require('fs-extra');
const helper = require('../helper.js');
const { isArray } = require('util');

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;

const KEY_OVERLAY_SIZE = 20;
const KEY_OVERLAY_PADDING = 5;

const resources = path.resolve(__dirname, "res");

let images = {
    "arrow": path.resolve(resources, "images", "arrow.svg")
};

process.on('uncaughtException', err => {
    helper.error(err);
    process.exit(1);
});

process.on('message', async obj => {
    let { beatmap, start_time, end_time, time_frame, file_path, options, threads, current_frame, size, ctx } = obj;

    function resize(){
        active_playfield_width = canvas.width * 0.7;
        active_playfield_height = active_playfield_width * (3/4);
        let position = playfieldPosition(0, 0);
        let size = playfieldPosition(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
        scale_multiplier = (size[0] - position[0]) / PLAYFIELD_WIDTH;
    }

    // Convert osu pixels position to canvas coordinates
    function playfieldPosition(x, y){
        let ratio_x = x / PLAYFIELD_WIDTH;
        let ratio_y = y / PLAYFIELD_HEIGHT;

        return [
            active_playfield_width * ratio_x + canvas.width * 0.15,
            active_playfield_height * ratio_y + canvas.height * 0.15
        ];
    }

    function prepareCanvas(size){
        canvas = createCanvas(...size);
        ctx = canvas.getContext("2d");
        resize();
    }

    function getCursorAtInterpolated(timestamp, replay){
        while(replay.lastCursor < replay.replay_data.length && replay.replay_data[replay.lastCursor].offset <= timestamp){
            replay.lastCursor++;
        }

        let current = {...replay.replay_data[replay.lastCursor - 1]};
        let next = {...replay.replay_data[replay.lastCursor]}

        if(current === undefined || next === undefined){
            if(replay.replay_data.length > 0){
                return {
                    current: replay.replay_data[replay.replay_data.length - 1],
                    next: replay.replay_data[replay.replay_data.length - 1]
                }
            }else{
                return {
                    current: {
                        x: 0,
                        y: 0
                    },
                    next: {
                        x: 0,
                        y: 0
                    }
                }
            }
        }

        // Interpolate cursor position between two points for smooth motion

        let current_start = current.offset;
        let next_start = next.offset;

        let pos_current = [current.x, current.y];
        let pos_next = [next.x, next.y];

        timestamp -= current_start;
        next_start -= current_start;

        let progress = timestamp / next_start;

        let distance = vectorDistance(pos_current, pos_next);

        let n = Math.max(1, progress * distance);

        if(distance > 0){
            current.x = pos_current[0] + (n / distance) * (pos_next[0] - pos_current[0]);
            current.y = pos_current[1] + (n / distance) * (pos_next[1] - pos_current[1]);
        }

        return {current: current, next: next};
    }

    function interpolateReplayData(replay){
        const interpolatedReplay = {lastCursor: 0, replay_data: []};

        const frametime = 4;

        for(let timestamp = 0; timestamp < end_time; timestamp += frametime){
            const replayPoint = getCursorAtInterpolated(timestamp, replay).current;
            replayPoint.offset = timestamp;
            interpolatedReplay.replay_data.push(replayPoint);
        }

        return interpolatedReplay;
    }

    function getScoringFrames(timestamp, scoringFrames){
        const output = [];

        let i = scoringFrames.findIndex(a => a.offset > timestamp - 2000);

        while(scoringFrames[i].offset <= timestamp){
            output.push(scoringFrames[i]);
            i++;
        }

        return output;
    }

    function getCursorAt(timestamp, replay){
        while(replay.lastCursor < replay.replay_data.length && replay.replay_data[replay.lastCursor].offset <= timestamp){
            replay.lastCursor++;
        }

        let current = replay.replay_data[replay.lastCursor - 1];
        let next = replay.replay_data[replay.lastCursor];
        let previous = [];

        for(let i = 0; i < Math.min(replay.lastCursor - 2, 20); i++)
            previous.push(replay.replay_data[replay.lastCursor - i]);

        if(current === undefined || next === undefined){
            if(replay.replay_data.length > 0){
                return {
                    current: replay.replay_data[replay.replay_data.length - 1],
                    next: replay.replay_data[replay.replay_data.length - 1]
                }
            }else{
                return {
                    current: {
                        x: 0,
                        y: 0
                    },
                    next: {
                        x: 0,
                        y: 0
                    }
                }
            }
        }

        return {previous, current, next};
    }

    function vectorDistance(hitObject1, hitObject2){
        return Math.sqrt((hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
            + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]));
    }

    function processFrame(time, options){
        let hitObjectsOnScreen = [];

        ctx.globalAlpha = 1;

        // Generate array with all hit objects currently visible
        beatmap.hitObjects.forEach(hitObject => {
            if(time >= hitObject.startTime - beatmap.TimePreempt && hitObject.endTime - time > -200)
                hitObjectsOnScreen.push(hitObject);
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if(options.black){
            ctx.fillStyle = 'black';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        hitObjectsOnScreen.sort(function(a, b){ return a.startTime - b.startTime; });

        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 3 * scale_multiplier;
        ctx.shadowColor = 'transparent';

        // Draw follow points
        hitObjectsOnScreen.forEach(function(hitObject, index){
            if(index < hitObjectsOnScreen.length - 1){
                let nextObject = hitObjectsOnScreen[index + 1];

                if(isNaN(hitObject.endPosition) && isNaN(nextObject.position))
                    return false;

                let distance = vectorDistance(hitObject.endPosition, nextObject.position);

                if(time >= (nextObject.startTime - beatmap.TimePreempt) && time < (nextObject.startTime + beatmap.HitWindow50) && distance > 80){
                    let start_position = playfieldPosition(...hitObject.endPosition);
                    let end_position = playfieldPosition(...nextObject.position);

                    let progress_0 = nextObject.startTime - beatmap.TimePreempt

                    let a = progress_0;

                    progress_0 += time - progress_0;
                    let progress_1 = nextObject.startTime - beatmap.TimeFadein;

                    progress_1 -= a
                    progress_0 -= a;

                    let progress = Math.min(1, progress_0 / progress_1 * 2);

                    let v = vectorSubtract(end_position, start_position);

                    v[0] *= progress;
                    v[1] *= progress;


                    ctx.beginPath();
                    ctx.moveTo(...start_position);
                    ctx.lineTo(vectorAdd(start_position, v[0]));
                    ctx.stroke();

                    //then shift x by cos(angle)*radius and y by sin(angle)*radius (TODO)
                }
            }
        });

        // Sort hit objects from latest to earliest so the earliest hit object is at the front
        hitObjectsOnScreen.reverse();

        hitObjectsOnScreen.forEach(function(hitObject, index){
            // Check if hit object could be visible at current timestamp
            if(time < hitObject.startTime || hitObject.objectName != "circle" && time < hitObject.endTime + 200){
                // Apply approach rate
                let opacity = (time - (hitObject.startTime - beatmap.TimePreempt)) / (beatmap.TimePreempt - beatmap.TimeFadein);

                if(hitObject.objectName != 'circle')
                    opacity = 1 - (time - hitObject.endTime) / 200;

                // Calculate relative approach circle size (number from 0 to 1)
                let approachCircle = 1 - (time - (hitObject.startTime - beatmap.TimeFadein)) / beatmap.TimeFadein;

                if(approachCircle < 0) approachCircle = 0;
                if(opacity > 1) opacity = 1;

                ctx.globalAlpha = opacity;
                ctx.shadowBlur = 4 * scale_multiplier;
                ctx.fillStyle = "rgba(40,40,40,0.2)";

                let followpoint_index;
                let followpoint_progress = 0;

                // Draw slider
                if(hitObject.objectName == "slider"){
                    ctx.lineWidth = 5 * scale_multiplier;
                    ctx.strokeStyle = "rgba(255,255,255,0.7)";

                    let snakingStart = hitObject.startTime - beatmap.TimePreempt;
                    let snakingFinish = hitObject.startTime - beatmap.TimeFadein;

                    let snakingProgress = Math.max(0, Math.min(1, (time - snakingStart) / (snakingFinish - snakingStart)));

                    let render_dots = [];

                    for(let x = 0; x < Math.floor(hitObject.SliderDots.length * snakingProgress); x++)
                        render_dots.push(hitObject.SliderDots[x]);

                    // Use stroke with rounded ends to "fake" a slider path
                    ctx.beginPath();
                    ctx.lineCap = "round";
                    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
                    ctx.shadowColor = 'transparent';
                    ctx.lineJoin = "round"

                    ctx.lineWidth = scale_multiplier * beatmap.Radius * 2

                    // Draw a path through all slider dots generated earlier
                    for(let x = 0; x < render_dots.length; x++){
                        let dot = render_dots[x];
                        let position = playfieldPosition(...dot);

                        if(x == 0){
                            ctx.moveTo(...position);
                        }else{
                            ctx.lineTo(...position);
                        }
                    }

                    ctx.stroke();

                    ctx.lineWidth = scale_multiplier * (beatmap.Radius * 2 - 10);
                    ctx.strokeStyle = 'rgba(0,0,0,0.6)';

                    ctx.stroke();

                    let currentTurn = 0, currentOffset, currentTurnStart;

                    // Get slider dot corresponding to the current follow point position
                    if(time >= hitObject.startTime && time <= hitObject.endTime){
                        currentTurn = Math.floor((time - hitObject.startTime) / (hitObject.duration / hitObject.repeatCount));
                        currentTurnStart = hitObject.startTime + hitObject.duration / hitObject.repeatCount * currentTurn;
                        currentOffset = (time - hitObject.startTime) / (hitObject.duration / hitObject.repeatCount) - currentTurn;

                        let dot_index = 0;

                        if(currentTurn % 2 == 0)
                            dot_index = currentOffset * hitObject.SliderDots.length;
                        else
                            dot_index = (1 - currentOffset) * hitObject.SliderDots.length;

                        followpoint_index = Math.floor(dot_index);

                        /* Progress number from 0 to 1 to check how much relative distance to the next slider dot is left,
                           used in interpolation later to always have smooth follow points */
                        followpoint_progress = dot_index - followpoint_index;
                    }else{
                        if(time < hitObject.startTime){
                            currentOffset = 0;
                            currentTurnStart = hitObject.startTime - beatmap.TimePreempt;
                        }else{
                            currentOffset = 1;
                            currentTurnStart = hitObject.endTime;
                        }
                    }

                    // Render slider ticks (WIP)
                    if(time <= hitObject.endTime){
                        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                        ctx.lineWidth = 5 * scale_multiplier;

                        let slider_ticks = hitObject.SliderTicks.slice();

                        // Reverse slider ticks depending on current slider direction
                        if(currentTurn > 0 && currentTurn % 2 != 0)
                            slider_ticks.reverse();

                        let max = Math.floor(slider_ticks.length * snakingProgress);

                        let offset = time - currentTurnStart;

                        for(let x = 0; x < max; x++){
                            if(currentTurn > 0)
                                ctx.globalAlpha = Math.min(1, Math.max(0, Math.min(1, (time - x * 40 - currentTurnStart) / 50)));
                            else if(time < hitObject.startTime)
                                ctx.globalAlpha = Math.min(1, Math.max(0, Math.min(1, (time - (max - x) * 40 - currentTurnStart) / 50)));

                            let tick = slider_ticks[x];

                            if(currentTurn > 0 && currentTurn % 2 != 0)
                                tick.offset = tick.reverseOffset;

                            if(followpoint_index && tick.offset < offset)
                                continue;

                            let position = playfieldPosition(...tick.position);
                            ctx.beginPath();
                            ctx.arc(...position, scale_multiplier * beatmap.Radius / 5, 0, 2 * Math.PI, false);
                            ctx.stroke();
                        }

                        ctx.globalAlpha = opacity;
                    }

                    // Render repeat arrow
                    for(let x = 1; x < hitObject.repeatCount; x++){
                        let repeatOffset = hitObject.startTime + x * (hitObject.duration / hitObject.repeatCount);
                        let fadeInStart = x == 1 ? snakingFinish : repeatOffset - (hitObject.duration / hitObject.repeatCount) * 2;
                        let repeatPosition = (x - 1) % 2 == 0 ? hitObject.endPosition : hitObject.position;

                        let timeSince = Math.max(0, Math.min(1, (time - repeatOffset) / 200));

                        if(time >= repeatOffset)
                            ctx.globalAlpha = (1 - timeSince);
                        else
                            ctx.globalAlpha = Math.min(1, Math.max(0, (time - fadeInStart) / 50));

                        let sizeFactor = 1 + timeSince * 0.3;

                        let comparePosition =
                            (x - 1) % 2 == 0 ? hitObject.SliderDots[hitObject.SliderDots.length - 2] : hitObject.SliderDots[1];

                        let repeatDirection = Math.atan2(comparePosition[1] - repeatPosition[1], comparePosition[0] - repeatPosition[0]);

                        let position = playfieldPosition(...repeatPosition);

                        let size = beatmap.Radius * 2 * scale_multiplier;

                        ctx.save();

                        ctx.translate(...position);
                        ctx.rotate(repeatDirection);

                        position = [0, 0];

                        ctx.lineWidth = 5 * scale_multiplier;
                        ctx.beginPath();
                        ctx.strokeStyle = "rgba(255,255,255,0.85)";

                        if(!options.noshadow)
                            ctx.shadowColor = "rgba(0,0,0,0.7)";

                        // Fill circle with combo color instead of leaving see-through circles
                        if(options.fill){
                            ctx.beginPath();
                            ctx.fillStyle = hitObject.Color;
                            ctx.arc(...position, sizeFactor * scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                            ctx.fill();
                        }

                        // Draw circle border
                        ctx.beginPath();
                        ctx.arc(...position, sizeFactor * scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                        ctx.stroke();

                        ctx.fillStyle = 'white';
                        ctx.textBaseline = "middle";
                        ctx.textAlign = "center";

                        let fontSize = 18;
                        fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                        fontSize *= scale_multiplier * sizeFactor;

                        // Draw combo number on circle
                        ctx.font = `${fontSize}px sans-serif`;

                        ctx.fillText("➤", ...position);

                        /* this doesn't render correctly for some reason???
                           using text for now I guess (TODO: FIX) */
                        //ctx.drawImage(images.arrow, ...position, size, size);

                        ctx.restore();
                    }

                    ctx.globalAlpha = opacity;
                }

                // Draw circles or slider heads
                if(hitObject.objectName != "spinner"){
                    ctx.lineWidth = 5 * scale_multiplier;
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(255,255,255,0.85)";

                    if(time < hitObject.startTime){
                        if(!options.noshadow)
                            ctx.shadowColor = "rgba(0,0,0,0.7)";

                        let position = playfieldPosition(...hitObject.position);

                        // Fill circle with combo color instead of leaving see-through circles
                        if(options.fill){
                            ctx.beginPath();
                            ctx.fillStyle = hitObject.Color;
                            ctx.arc(...position, scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                            ctx.fill();
                        }

                        // Draw circle border
                        ctx.beginPath();
                        ctx.arc(...position, scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                        ctx.stroke();

                        ctx.fillStyle = 'white';
                        ctx.textBaseline = "middle";
                        ctx.textAlign = "center";

                        let fontSize = 16;
                        fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                        fontSize *= scale_multiplier;

                        // Draw combo number on circle
                        ctx.font = `${fontSize}px sans-serif`;
                        ctx.fillText(hitObject.ComboNumber, position[0], position[1]);

                        // Draw approach circle
                        if(approachCircle > 0){
                            ctx.strokeStyle = 'white';
                            ctx.lineWidth = 2 * scale_multiplier;
                            ctx.beginPath();
                            let position = playfieldPosition(...hitObject.position);
                            ctx.arc(...position, scale_multiplier * (beatmap.Radius + approachCircle * (beatmap.Radius * 2)), 0, 2 * Math.PI, false);
                            ctx.stroke();
                        }
                    }

                    // Draw follow point if there's currently one visible
                    if(followpoint_index
                    && Array.isArray(hitObject.SliderDots[followpoint_index])
                    && hitObject.SliderDots[followpoint_index].length == 2
                    ){
                        let pos_current = hitObject.SliderDots[followpoint_index];

                        if(hitObject.SliderDots.length - 1 > followpoint_index){
                            // Interpolate follow point position

                            let pos_next = hitObject.SliderDots[followpoint_index + 1];

                            let distance = vectorDistance(pos_current, pos_next);

                            let n = Math.max(1, followpoint_progress * distance);

                            if(distance > 0){
                                pos_current = [
                                    pos_current[0] + (n / distance) * (pos_next[0] - pos_current[0]),
                                    pos_current[1] + (n / distance) * (pos_next[1] - pos_current[1])
                                ]
                            }
                        }

                        let position;

                        // Draw follow point in circle

                        ctx.fillStyle = "rgba(255,255,255,0.3)";
                        ctx.beginPath();

                        position = playfieldPosition(...pos_current);
                        ctx.arc(...position, scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                        ctx.fill();

                        // Draw follow circle visible around the follow point

                        ctx.fillStyle = "rgba(255,255,255,0.8)";
                        ctx.beginPath();

                        position = playfieldPosition(...pos_current);
                        ctx.arc(...position, scale_multiplier * (beatmap.FollowpointRadius), 0, 2 * Math.PI, false);
                        ctx.stroke();
                    }

                }else{
                    // Draw spinner
                    ctx.strokeStyle = "white";
                    ctx.globalAlpha = opacity;
                    ctx.lineWidth = 10 * scale_multiplier;

                    let position = playfieldPosition(PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2);

                    // Rotate spinner (WIP)
                    /*
                    if(beatmap.Replay && time >= hitObject.startTime){
                        let replay_point = getCursorAt(time, beatmap.Replay);

                        if(replay_point){
                            let { current } = replay_point;

                            let radians = Math.atan2(current.y - PLAYFIELD_WIDTH / 2, current.x - PLAYFIELD_HEIGHT / 2);

                            position = [
                                position[0] + 2.5 * Math.cos(radians),
                                position[1] + 2.5 * Math.sin(radians)
                            ];
                        }
                    }
                    */

                    // Outer spinner circle
                    ctx.beginPath();
                    ctx.arc(...position, scale_multiplier * 240, 0, 2 * Math.PI, false);
                    ctx.stroke();

                    // Inner spinner circle
                    ctx.beginPath();
                    ctx.arc(...position, scale_multiplier * 30, 0, 2 * Math.PI, false);
                    ctx.stroke();
                }
            }

            if(time >= hitObject.startTime && hitObject.startTime - time > -200){
                // Draw fading out circles
                if(hitObject.objectName != "spinner"){
                    // Increase circle size the further it's faded out
                    let timeSince = Math.min(1, Math.max(0, (time - (hitObject.startTime + (hitObject.hitOffset || beatmap.HitWindow50))) / 200));
                    let opacity = 1 - timeSince;
                    let sizeFactor = 1 + timeSince * 0.3;

                    ctx.globalAlpha = opacity;

                    if(!options.noshadow)
                        ctx.shadowColor = "rgba(0,0,0,0.7)";

                    ctx.lineWidth = 6 * scale_multiplier;
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(255,255,255,0.85)";

                    let position = playfieldPosition(...hitObject.position);

                    if(options.fill){
                        ctx.beginPath();
                        ctx.fillStyle = hitObject.Color;
                        ctx.arc(...position, sizeFactor * scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }

                    ctx.beginPath();
                    ctx.arc(...position, sizeFactor * scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                    ctx.stroke();

                    ctx.fillStyle = 'white';
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "center";

                    let fontSize = 16;
                    fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                    fontSize *= scale_multiplier * sizeFactor;

                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.fillText(hitObject.ComboNumber, ...position);
                }
            }
        });

        if(beatmap.ScoringFrames && beatmap.Replay.auto !== true){
            //const scoringFrames = getScoringFrames(time, beatmap.ScoringFrames);

            let previousFramesIndex = beatmap.ScoringFrames.findIndex(a => a.offset >= time - 750);

            let currentFrameIndex = beatmap.ScoringFrames.findIndex(a => a.offset >= time) - 1;

            let currentFrame = beatmap.ScoringFrames[currentFrameIndex];

            if(currentFrame == null)
                currentFrame = beatmap.ScoringFrames[beatmap.ScoringFrames.length - 1];

            const scoringFrames = [];

            do{
                const newFrame = beatmap.ScoringFrames[previousFramesIndex];

                if(newFrame == null)
                    break;

                if(newFrame.offset > time)
                    break;

                currentFrame = newFrame;

                scoringFrames.push(currentFrame);

                previousFramesIndex++;
            }while(currentFrame.offset < time)

            if(currentFrame != null){
                const comboPosition = [15, canvas.height - 35];
                const accuracyPosition = [canvas.width - 15, 40];

                ctx.fillStyle = "white";
                ctx.globalAlpha = 1;
                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                ctx.font = `${32 * scale_multiplier}px monospace`;
                ctx.fillText(`${currentFrame.combo}x`, ...comboPosition);
                
                let accuracy = 100;

                const totalHits = currentFrame.count50 * 300 + currentFrame.count100 * 300 + currentFrame.count300 * 300 + currentFrame.countMiss * 300;

                if(totalHits > 0)
                    accuracy = (currentFrame.count50 * 50 + currentFrame.count100 * 100 + currentFrame.count300 * 300)
                    / totalHits * 100;

                ctx.textAlign = "right";
                ctx.textBaseline = "top";
                ctx.font = `${26 * scale_multiplier}px monospace`;
                ctx.fillText(`${accuracy.toFixed(2)}%`, ...accuracyPosition);

                const hitCountPosition = [canvas.width - 15, 45 + 26 * scale_multiplier];

                ctx.font = `${21 * scale_multiplier}px monospace`;
                ctx.fillText(`${currentFrame.count100}x100 ${currentFrame.count50}x50`, ...hitCountPosition);

                hitCountPosition[1] += 2 + 21 * scale_multiplier;
                ctx.fillText(`${currentFrame.countMiss}xMiss`, ...hitCountPosition);

                const urPosition = [canvas.width - 15, canvas.height - 35];

                ctx.textBaseline = "bottom";
                ctx.font = `${26 * scale_multiplier}px monospace`;
                ctx.fillText(`${currentFrame.ur.toFixed(2)} UR`, ...urPosition);

                /*
                ctx.textAlign = "right";
                ctx.fillText(`${time}`, canvas.width - 15, canvas.height - 35);
                ctx.fillText(`${currentFrame.offset}`, canvas.width - 15, canvas.height - 65);*/

                ctx.textAlign = "left";
                ctx.textBaseline = "bottom";
                ctx.font = `${16 * scale_multiplier}px sans-serif`;

                ctx.fillStyle = 'rgb(255,255,255,0.8)';

                ctx.fillText('W.I.P. – scoring not accurate yet', 15, canvas.height - 10);
            }

            for(const scoringFrame of scoringFrames){
                if(!(['miss', 50, 100].includes(scoringFrame.result)))
                    continue;

                ctx.globalAlpha = Math.min(1, 1.5 - (time - scoringFrame.offset) / 750);
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.font = `${30 * scale_multiplier}px sans-serif`;



                const position = scoringFrame.position.slice();

                if(scoringFrame.result == 'miss'){
                    position[1] += (time - scoringFrame.offset) / 750 * 35;
                    
                    ctx.fillStyle = "#f56767";

                    ctx.fillText('X', ...playfieldPosition(...position));
                    continue;
                }

                if(scoringFrame.result == 50){
                    ctx.fillStyle = "#67b5f5";

                    ctx.fillText('50', ...playfieldPosition(...position));
                    continue;
                }

                if(scoringFrame.result == 100){
                    ctx.fillStyle = "#67f575";

                    ctx.fillText('100', ...playfieldPosition(...position));
                    continue;
                }
            }
        }

        // Draw replay cursor
        if(beatmap.Replay){
            let replay_point = getCursorAt(time, beatmap.ReplayInterpolated);

            if(replay_point){
                if(beatmap.Replay.auto !== true){
                    ctx.globalAlpha = 1;

                    const { K1, K2, M1, M2 } = replay_point.current;

                    const keyOverlayTop = canvas.height / 2 - (KEY_OVERLAY_SIZE * 4 + KEY_OVERLAY_PADDING * 4) / 2;

                    ctx.fillStyle = K1 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
                    ctx.fillRect(canvas.width - 30, keyOverlayTop, KEY_OVERLAY_SIZE, KEY_OVERLAY_SIZE);

                    ctx.fillStyle = K2 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
                    ctx.fillRect(canvas.width - 30, keyOverlayTop + KEY_OVERLAY_SIZE * 1 + KEY_OVERLAY_PADDING * 1, KEY_OVERLAY_SIZE, KEY_OVERLAY_SIZE);

                    ctx.fillStyle = M1 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
                    ctx.fillRect(canvas.width - 30, keyOverlayTop + KEY_OVERLAY_SIZE * 2 + KEY_OVERLAY_PADDING * 2, KEY_OVERLAY_SIZE, KEY_OVERLAY_SIZE);

                    ctx.fillStyle = M2 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)';
                    ctx.fillRect(canvas.width - 30, keyOverlayTop + KEY_OVERLAY_SIZE * 3 + KEY_OVERLAY_PADDING * 3, KEY_OVERLAY_SIZE, KEY_OVERLAY_SIZE);
                }
                
                if(Array.isArray(replay_point.previous)){
                    ctx.globalAlpha = .35;

                    ctx.beginPath();
                    
                    for(const [index, previousFrame] of replay_point.previous.entries()){
                        let position = playfieldPosition(previousFrame.x, previousFrame.y);

                        if(index == 0)
                            ctx.moveTo(...position);
                        else
                            ctx.lineTo(...position);
                    }

                    ctx.lineWidth = 13 * scale_multiplier;
                    ctx.lineCap = "round";

                    if(options.fill)
                        ctx.strokeStyle = '#fff4ab';
                    else
                        ctx.strokeStyle = 'white';

                    ctx.stroke();
                }

                if(options.fill)
                    ctx.fillStyle = '#fff460';
                else
                    ctx.fillStyle = 'white';

                let { current } = replay_point;

                let position = playfieldPosition(current.x, current.y);

                ctx.globalAlpha = 1;

                ctx.beginPath();
                ctx.arc(...position, scale_multiplier * 13, 0, 2 * Math.PI, false);
                ctx.fill();
            }
        }

        // Draw playfield border
        if(options.border){
            ctx.strokeStyle = "rgb(200,200,200)";
            ctx.lineWidth = 1;
            ctx.globalAlpha = 1;

            let position = playfieldPosition(0, 0);
            let size = playfieldPosition(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
            ctx.strokeRect(...position, size[0] - position[0], size[1] - position[1]);
        }
    }

    let time = start_time;

    prepareCanvas(size);
    //preprocessSliders();

    beatmap.ReplayInterpolated = interpolateReplayData(beatmap.Replay);

    for(i in images){
        let image_path = images[i];

        images[i] = await new Promise((resolve, reject) => {
            let img = new Image();
            img.onload = () => {
                resolve(img);
            };

            img.onerror = reject;
            img.src = image_path;
        });
    }

    if(end_time){
        while(time < end_time){
            processFrame(time, options);

            let image_data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

            // Convert rgb with alpha values to pure rgb as gif doesn't support alpha
            if(options.type == 'gif'){
                for(let i = 0; i < image_data.length; i += 4){
                    if(image_data[i + 3] > 0){
                        let scale = Math.round(image_data[i + 0] * image_data[i + 3] / 255);
                        image_data[i] = scale;
                        image_data[i + 1] = scale;
                        image_data[i + 2] = scale;
                        image_data[i + 3] = 255;
                    }
                }
            }

            fs.writeFileSync(path.resolve(file_path, `${current_frame}.rgba`), Buffer.from(image_data));

            process.send(current_frame);

            current_frame += threads;
            time += time_frame;
        }

        process.exit(0);
    }else{
        processFrame(time, options);

        process.send(canvas.toBuffer().toString('base64'));
        process.exit(0);
    }
});
