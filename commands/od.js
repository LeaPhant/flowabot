const osu = require('../osu.js');

module.exports = {
    command: 'od',
    description: "Calculate hit window values, optionally with mods.",
    argsRequired: 1,
    usage: '<OD> [+mods]',
    example: {
        run: "od 8 +DT",
        result: "Returns hit windows of OD8 with DT applied."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let ar = parseFloat(argv[1]);
            let mods = argv.length > 2 ? argv[2].toUpperCase() : "";
			resolve(osu.calculate_od(ar, mods));
        });
    }
};
