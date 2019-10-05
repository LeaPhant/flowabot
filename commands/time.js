const tzlookup = require('tz-lookup');
const moment = require('moment-timezone');
const axios = require('axios');

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

            if(argv.length == 1){
                let timezones = moment.tz.names();
                let timezone = timezones[Math.floor(Math.random() * timezones.length)];

                resolve(`${moment().tz(timezone).format('HH:mm, MMM DD')} (${timezone})`);

                return;
            }

            let q = argv.slice(2).join(" ");

            Nominatim.get('search', { params: { q } }).then(response => {
                if(response.data.length > 0){
                    let place = response.data[0];
                    let timezone = tzlookup(Number(place.lat), Number(place.lon));

                    resolve(`${moment().tz(timezone).format('HH:mm, MMM DD')} (${timezone})`);
                }else{
                    reject("Couldn't find this place");
                }
            }).catch(err => {
                reject("An error occured fetching the place");
            });
        });
    }
};
