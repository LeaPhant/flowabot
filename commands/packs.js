const osu = require('../osu.js');
const helper = require('../helper.js');
const config = require('../config.json');
const axios = require('axios');
const path = require('path');
const os = require('os');
const URL = require('url');

module.exports = {
    command: ['packs', 'pack'],
    description: "Calculate maximum lazer classic score for a beatmap.",
    argsRequired: 1,
    usage: '<map link> [+mods]',
    example: [
        {
            run: "ls https://osu.ppy.sh/b/75",
            result: "Returns the maximum lazer classic score for Disco Prince with no mods."
        },
        {
            run: "classicscore https://osu.ppy.sh/b/75 +HDHRDT",
            result: "Returns the maximum lazer classic score for Disco Prince +HDHRDT."
        }
    ],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg, last_beatmap } = obj;

            let beatmap_url = argv[1];

            if(beatmap_url.includes("#osu/"))
            beatmap_id = parseInt(beatmap_url.split("#osu/").pop());
            else if(beatmap_url.includes("#fruits/"))
            beatmap_id = parseInt(beatmap_url.split("#fruits/").pop());
            else if(beatmap_url.includes("#taiko/"))
            beatmap_id = parseInt(beatmap_url.split("#taiko/").pop());
            else if(beatmap_url.includes("#mania/"))
            beatmap_id = parseInt(beatmap_url.split("#mania/").pop());
            else if(beatmap_url.includes("/b/"))
                beatmap_id = parseInt(beatmap_url.split("/b/").pop());
            else if(beatmap_url.includes("/osu/"))
                beatmap_id = parseInt(beatmap_url.split("/osu/").pop());
            else if(beatmap_url.includes("/beatmaps/"))
                beatmap_id = parseInt(beatmap_url.split("/beatmaps/").pop());
            else if(beatmap_url.includes("/discussion/"))
                beatmap_id = parseInt(beatmap_url.split("/discussion/").pop().split("/")[0]);
            else if(parseInt(beatmap_url) == beatmap_url && _id_only)
                beatmap_id = parseInt(beatmap_url);

            if(beatmap_id === NaN){
                reject('Invalid beatmap url');
            }

            axios.get(`https://osu.respektive.pw/b/${beatmap_id}`).then(response => {
                let beatmap = response.data.beatmap;

                let output = "";

                let packs = beatmap.packs.split(",");

                if(packs[0] != '') {
                    packs.forEach(pack => {
                        output += `<https://osu.ppy.sh/beatmaps/packs/${pack}>\n`
                    });
                } else {
                    output = "No packs found."
                }

                resolve(output);
                                            
                });
        });
    }
};
