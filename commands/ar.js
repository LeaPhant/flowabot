const osu = require('../osu.js');
const helper = require('../helper.js');

module.exports = {
    command: 'ar',
    description: "Calculate Approach Rate values and miliseconds with mods applied.",
    argsRequired: 1,
    usage: '<ar> [+mods]',
    example: {
        run: "ar 8 +DT",
        result: "Returns AR of AR8 with DT applied."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let ar = parseFloat(argv[1]);
            let mods = argv.length > 2 ? argv[2].toUpperCase() : "";
            resolve(osu.calculate_ar(ar, mods));
        });
    }
};
