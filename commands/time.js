const tzlookup = require('tz-lookup');
const axios = require('axios');

const { DateTime, IANAZone } = require('luxon');
const helper = require('../helper');

const Nominatim = axios.create({
    baseURL: 'https://nominatim.openstreetmap.org/',
    params: {
        format: 'json'
    }
});

module.exports = {
    command: 'time',
    description: "Get the current time at a place.",
    usage: '[name of place, e.g. city]',
    example: [
        {
            run: "time london",
            result: "Returns the current time in London."
        }
    ],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;
            let zoneName = 'utc';

            if(argv.length == 1)
                resolve(`${DateTime.now().toUTC().toFormat('HH:mm, MMM dd')} (UTC)`);

            let q = argv.slice(1).join(" ");

            Nominatim.get('search', { params: { q } }).then(response => {
                if(response.data.length > 0){
                    let place = response.data.sort((a, b) => b.importance - a.importance)[0];
                    let timezone = tzlookup(Number(place.lat), Number(place.lon));

                    const zone = IANAZone.create(timezone);

                    if(zone.isValid)
                        zoneName = timezone;

                    resolve(`${DateTime.now().setZone(zoneName).toFormat('HH:mm, MMM dd')} (${timezone})`);
                }else{
                    reject("Couldn't find this place");
                }
            }).catch(err => {
                reject("An error occured fetching the place");
            });
        });
    }
};
