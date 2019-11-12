const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: 'tap',
    description: "Calculate BPM values for different beat snap divisors",
    usage: '<BPM> <Beat Snap Divisor>',
    example: [
        {
            run: "tap 200 1/4",
            result: "Return equivalent tapping values for 200 BPM at 1/4"
        },
        {
            run: "tap 150 1/3",
            result: "Return equivalent tapping values for 150 BPM at 1/3"
        }
    ],
    argsRequired: 2,
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let bpm = Number(argv[1]);
            let divisors = ["1/2", "1/3", "1/4", "1/6", "1/8"];

            let divisor = argv[2].trim();

            if(isNaN(bpm))
                reject("BPM is not a number");

            if(!divisors.includes(divisor))
                reject("Not a valid beat snap divisor");

            let divisor_parts = divisor.split("/");

            console.log(bpm, '/', 1, '/', divisor_parts[1]);

            let bpm_raw = bpm / (1 / Number(divisor_parts[1]));

            let embed = {
                title: "BPM Calculator",
                description: "Usually: 1/2 = Jumps, 1/3 = Alt, 1/4 = Streams",
                fields: []
            };

            const multipliers = [1, 1.5, 0.75];

            for(let i = 0; i <= 2; i++){
                let name = "";
                let value = "";

                divisors.forEach((div, index) => {
                    let bpm_calculated = bpm_raw * (1 / Number(div.split("/")[1])) * multipliers[i];

                    if(div == divisor){
                        value += '**';
                        name += '**';
                    }

                    value += Math.round(bpm_calculated);
                    name += div;

                    if(div == divisor){
                        value += '**';
                        name += '**';
                    }

                    if(index < divisors.length){
                        name += '   ';

                        if(bpm_calculated < 100)
                            value += '    ';
                        else if(bpm_calculated < 1000)
                            value += '  ';
                        else
                            value += ' ';
                    }
                });

                if(i == 0)
                    name += 'NOMOD';

                if(i == 1)
                    name += '+DT';

                if(i == 2)
                    name += '+HT';

                embed.fields.push({
                    name, value
                });
            }

            resolve({embed});
        });
    }
};
