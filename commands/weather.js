const helper = require('../helper.js');
const config = require('../config.json');

module.exports = {
    command: 'weather',
    description: "Send the current weather for the given city.",
    argsRequired: 1,
    usage: '<City>',
    example: {
        run: "weather London",
        result: "Returns the current weather in London."
    },
    configRequired: ['credentials.open_weather_map_api'],
    call: obj => {
        return new Promise((resolve, reject) => {
            const weather = require('openweather-apis');

            weather.setLang('en');
            weather.setUnits('metric');
            weather.setAPPID(config.credentials.open_weather_map_api);

            let { argv, msg } = obj;
            const author = msg.author;
            const avatar_url = `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png?size=256`

            argv.shift()
            const city = argv.join(" ");

            if (isNaN(city)) {
                weather.setCity(city);
            } else {
                weather.setCityId(city);
            }
            weather.getAllWeather(function(err, JSONObj){
                if (err) {
                    helper.error(err);
                    reject("Either the OpenWeatherMap API is down or you provided an invalid location.");
                }

                let city_name = JSONObj.name
                let humidity = JSONObj.main.humidity
                let weather_description = JSONObj.weather[0].description
                
                let celsius = JSONObj.main.temp
                let fahrenheit = celsius * 9 / 5 + 32

                let date = new Date()
                date.setSeconds(date.getSeconds() + JSONObj.timezone)

                let date_string = `${date.toLocaleString('en-GB', { timeZone: 'UTC', timeStyle: 'short' })}, ${date.toLocaleString("en-US", { weekday: "long", timeZone: 'UTC'})}`
                let icon_url = `https://openweathermap.org/img/wn/${JSONObj.weather[0].icon}@2x.png`

                let direction_val = parseInt((JSONObj.wind.deg / 22.5) + .5)
                let directions = ["north", "north-northeast", "northeast", "east-northeast", "east", "east-southeast",
                "southeast", "south-southeast", "south", "south-southwest", "southwest", "west-southwest", "west", "west-northwest", "northwest", "north-northwest"]
                let wind_direction = directions[(direction_val % 16)]
                let wind_speed = JSONObj.wind.speed * 3.6

                let flag_emoji = `:flag_${JSONObj.sys.country.toLowerCase()}:`

                resolve({
                    embed: {
                        color: 12277111,
                        author: {
                            name: `${author.username}#${author.discriminator}`,
                            icon_url: avatar_url
                        },
                        thumbnail: {
                            url: icon_url
                        },
                        title: `Weather in **${city_name}** at **${date_string}** ${flag_emoji}`,
                        fields: [
                            {
                                name: "Current Conditions:",
                                value: `**${weather_description}** at **${celsius.toFixed(1)}°C** / **${fahrenheit.toFixed(1)}°F**`
                            },
                            {
                                name: "Humidity",
                                value: `${humidity}%`,
                                inline: true
                            },
                            {
                                name: "Wind",
                                value: `${wind_speed.toFixed(1)} km/h from the ${wind_direction}`,
                                inline: true
                            },
                            
                        ],
                        footer: {
                            text: "Data provided by OpenWeatherMap",
                            icon_url: "http://f.gendo.moe/KlhvQJoD.png"       
                        } 
                    }
                })
            });
        });
    }
};
