const { createCanvas } = require('canvas');
const path = require('path');
const fs = require('fs-extra');

const PLAYFIELD_WIDTH = 512;
const PLAYFIELD_HEIGHT = 384;

process.on('message', obj => {
    let { beatmap, start_time, end_time, time_frame, file_path, options, threads, current_frame, size, ctx } = obj;

    function resize(){
        active_playfield_width = canvas.width * 0.7;
        active_playfield_height = active_playfield_width * (3/4);
        var position = playfieldPosition(0, 0);
        var size = playfieldPosition(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
        scale_multiplier = (size[0] - position[0]) / PLAYFIELD_WIDTH;
    }

    function playfieldPosition(x, y){
        var ratio_x = x / PLAYFIELD_WIDTH;
        var ratio_y = y / PLAYFIELD_HEIGHT;

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

    function getCursorAt(timestamp, replay){
        while(replay.lastCursor < replay.replay_data.length && replay.replay_data[replay.lastCursor].offset <= timestamp){
            replay.lastCursor++;
        }

        let current = replay.replay_data[replay.lastCursor - 1];
        let next = replay.replay_data[replay.lastCursor];
        return {current: current, next: next};
    }

    function vectorDistance(hitObject1, hitObject2){
        return Math.sqrt((hitObject2[0] - hitObject1[0]) * (hitObject2[0] - hitObject1[0])
            + (hitObject2[1] - hitObject1[1]) * (hitObject2[1] - hitObject1[1]));
    }

    function processFrame(time, options){
        let hitObjectsOnScreen = [];

        ctx.globalAlpha = 1;

        beatmap.hitObjects.forEach(hitObject => {
            if(time >= hitObject.startTime - beatmap.TimeFadein && hitObject.endTime - time > -200)
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

        hitObjectsOnScreen.forEach(function(hitObject, index){
            if(index < hitObjectsOnScreen.length - 1){
                let nextObject = hitObjectsOnScreen[index + 1];

                if(isNaN(hitObject.endPosition) && isNaN(nextObject.position))
                    return false;

                let distance = vectorDistance(hitObject.endPosition, nextObject.position);

                if(time >= (nextObject.startTime - beatmap.TimeFadein) && time < (nextObject.startTime + beatmap.HitWindow50) && distance > 80){
                    let start_position = playfieldPosition(...hitObject.endPosition);
                    let end_position = playfieldPosition(...nextObject.position);

                    let progress_0 = nextObject.startTime - beatmap.TimeFadein

                    let a = progress_0;

                    progress_0 += time - progress_0;
                    let progress_1 = nextObject.startTime - beatmap.TimePreempt;

                    progress_1 -= a
                    progress_0 -= a;

                    let progress = Math.min(1, progress_0 / progress_1 * 2);

                    let v = [
                        end_position[0] - start_position[0],
                        end_position[1] - start_position[1]
                    ];

                    v[0] *= progress;
                    v[1] *= progress;


                    ctx.beginPath();
                    ctx.moveTo(...start_position);
                    ctx.lineTo(start_position[0] + v[0], start_position[1] + v[1]);
                    ctx.stroke();

                    //then shift x by cos(angle)*radius and y by sin(angle)*radius
                }
            }
        });

        hitObjectsOnScreen.reverse();

        hitObjectsOnScreen.forEach(function(hitObject, index){
            if(time < hitObject.startTime || hitObject.objectName != "circle" && time < hitObject.endTime){
                let opacity = (time - (hitObject.startTime - beatmap.TimeFadein)) / (beatmap.TimeFadein - beatmap.TimePreempt);
                let approachCircle = 1 - (time - (hitObject.startTime - beatmap.TimePreempt)) / beatmap.TimePreempt;
                if(approachCircle < 0) approachCircle = 0;
                if(opacity > 1) opacity = 1;
                ctx.globalAlpha = opacity;
                ctx.shadowBlur = 4 * scale_multiplier;
                ctx.fillStyle = "rgba(40,40,40,0.2)";
                let followpoint_dot;

                if(hitObject.objectName == "slider"){

                    let render_dots = [];

                    for(let x = 0; x < hitObject.SliderDots.length; x += 20){
                        render_dots.push(hitObject.SliderDots[x]);
                    }


                    ctx.lineWidth = 6 * scale_multiplier;
                    ctx.strokeStyle = "white";

                    ctx.beginPath();
                    ctx.lineCap = "round";
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.shadowColor = 'transparent';
                    ctx.lineJoin = "round"

                    ctx.lineWidth = scale_multiplier * beatmap.Radius * 2;

                    render_dots.forEach(function(dot, index){
                        var position = playfieldPosition(dot[0], dot[1]);
                        if(index == 0){
                            ctx.moveTo(position[0], position[1]);
                        }else{
                            ctx.lineTo(position[0], position[1]);
                        }
                    });

                    ctx.stroke();

                    if(time >= hitObject.startTime && time <= hitObject.endTime){
                        var currentTurn = Math.floor((time - hitObject.startTime) / (hitObject.duration / hitObject.repeatCount));
                        var currentOffset = (time - hitObject.startTime) / (hitObject.duration / hitObject.repeatCount) - currentTurn;

                        if(currentTurn % 2 == 0)
                            followpoint_dot = hitObject.SliderDots[Math.floor(currentOffset * hitObject.SliderDots.length)];
                        else
                            followpoint_dot = hitObject.SliderDots[Math.floor((1 - currentOffset) * hitObject.SliderDots.length)];
                    }
                }

                if(hitObject.objectName != "spinner"){

                    if(!options.noshadow)
                        ctx.shadowColor = "rgba(0,0,0,0.7)";

                    ctx.lineWidth = 6 * scale_multiplier;
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(255,255,255,0.85)";

                    var position = playfieldPosition(hitObject.position[0], hitObject.position[1]);

                    if(options.fill){
                        ctx.beginPath();
                        ctx.fillStyle = hitObject.Color;
                        ctx.arc(position[0], position[1], scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }

                    ctx.beginPath();
                    ctx.arc(position[0], position[1], scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                    ctx.stroke();

                    ctx.fillStyle = 'white';
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "center";

                    let fontSize = 16;
                    fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                    fontSize *= scale_multiplier;

                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.fillText(hitObject.ComboNumber, position[0], position[1]);

                    if(approachCircle > 0){
                        ctx.strokeStyle = 'white';
                        ctx.lineWidth = 2 * scale_multiplier;
                        ctx.beginPath();
                        var position = playfieldPosition(hitObject.position[0], hitObject.position[1]);
                        ctx.arc(position[0], position[1], scale_multiplier * (beatmap.Radius + approachCircle * (beatmap.Radius * 2)), 0, 2 * Math.PI, false);
                        ctx.stroke();
                    }

                    if(followpoint_dot){
                        ctx.fillStyle = "rgba(255,255,255,0.3)";
                        ctx.beginPath();
                        var position = playfieldPosition(followpoint_dot[0], followpoint_dot[1]);
                        ctx.arc(position[0], position[1], scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                        ctx.fill();
                        ctx.fillStyle = "rgba(255,255,255,0.8)";
                        ctx.beginPath();
                        var position = playfieldPosition(followpoint_dot[0], followpoint_dot[1]);
                        ctx.arc(position[0], position[1], scale_multiplier * (beatmap.Radius * 3), 0, 2 * Math.PI, false);
                        ctx.stroke();
                    }

                }else{
                    ctx.strokeStyle = "white";
                    ctx.globalAlpha = opacity;

                    ctx.lineWidth = 10 * scale_multiplier;
                    ctx.beginPath();
                    var position = playfieldPosition(PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2);
                    ctx.arc(position[0], position[1], scale_multiplier * 240, 0, 2 * Math.PI, false);
                    ctx.stroke();

                    ctx.lineWidth = 10 * scale_multiplier;
                    ctx.beginPath();
                    var position = playfieldPosition(PLAYFIELD_WIDTH / 2, PLAYFIELD_HEIGHT / 2);
                    ctx.arc(position[0], position[1], scale_multiplier * 30, 0, 2 * Math.PI, false);
                    ctx.stroke();
                }
            }else if(hitObject.startTime - time > -200){
                if(hitObject.objectName != "spinner"){
                    let timeSince = Math.abs(hitObject.endTime - time) / 200;
                    let opacity = 1 - timeSince;
                    let sizeFactor = 1 + timeSince * 0.3;

                    ctx.globalAlpha = opacity;

                    if(!options.noshadow)
                        ctx.shadowColor = "rgba(0,0,0,0.7)";

                    ctx.lineWidth = 6 * scale_multiplier;
                    ctx.beginPath();
                    ctx.strokeStyle = "rgba(255,255,255,0.85)";

                    var position = playfieldPosition(hitObject.position[0], hitObject.position[1]);

                    if(options.fill){
                        ctx.beginPath();
                        ctx.fillStyle = hitObject.Color;
                        ctx.arc(position[0], position[1], sizeFactor * scale_multiplier * beatmap.Radius, 0, 2 * Math.PI, false);
                        ctx.fill();
                    }

                    ctx.beginPath();
                    ctx.arc(position[0], position[1], sizeFactor * scale_multiplier * beatmap.Radius - ctx.lineWidth / 2, 0, 2 * Math.PI, false);
                    ctx.stroke();

                    ctx.fillStyle = 'white';
                    ctx.textBaseline = "middle";
                    ctx.textAlign = "center";

                    let fontSize = 16;
                    fontSize += 16 * (1 - (beatmap.CircleSize / 10));

                    fontSize *= scale_multiplier * sizeFactor;

                    ctx.font = `${fontSize}px sans-serif`;
                    ctx.fillText(hitObject.ComboNumber, position[0], position[1]);
                }
            }
        });

        if(beatmap.Replay){
            let replay_point = getCursorAt(time, beatmap.Replay);

            if(replay_point){
                let { current } = replay_point;

                let position = playfieldPosition(current.x, current.y);

                ctx.globalAlpha = 1;

                if(options.fill)
                    ctx.fillStyle = '#ed6161';
                else
                    ctx.fillStyle = 'white';

                ctx.beginPath();
                ctx.arc(position[0], position[1], scale_multiplier * 13, 0, 2 * Math.PI, false);
                ctx.fill();
            }
        }

        if(options.border){
            ctx.strokeStyle = "rgb(200,200,200)";
            ctx.lineWidth = 1;
            ctx.globalAlpha = 1;

            var position = playfieldPosition(0, 0);
            var size = playfieldPosition(PLAYFIELD_WIDTH, PLAYFIELD_HEIGHT);
            ctx.strokeRect(position[0], position[1], size[0] - position[0], size[1] - position[1]);
        }
    }

    let time = start_time;

    prepareCanvas(size);

    if(end_time){
        while(time < end_time){
            processFrame(time, options);

            let image_data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

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
