const axios = require('axios');

const helper = require('./helper.js');

const fantasyNameGen = axios.create({
    baseURL: 'https://www.fantasynamegen.com',
    responseType: 'document'
})

const fantasy_types = ["human", "elf", "dwarf", "hobbit", "barbarian", "orc", "evil", "asian", "arabic",
"surname", "sci-fi", "lovecraft", "reptilian", "aztec", "ratman", "demon", "dragon", "wizard", "mixed",
"english", "place", "title", "military", "hero/villain", "rockband"];

const fantasy_types_raw = {"surname": "surnames", "sci-fi": "sf", "english": "enames", "place": "places",
"title": "titles", "military": "operation", "hero/villain": "super"};

const fantasy_length = ["short", "medium", "long"];

module.exports = {
    fantasyTypes: fantasy_types,
    fantasyLengths: fantasy_length,
    getFantasyName: (type, length, author) => {
        return new Promise((resolve, reject) => {
            if(!fantasy_types.includes(type)){
                reject('Unknown type');
                return false;
            }

            if(!fantasy_length.includes(length)){
                reject('Unknown length');
                return false;
            }

            if(type in fantasy_types_raw)
                type = fantasy_types_raw[type];

            fantasyNameGen.get(`/${type}/${length}/`).then(response => {
                try{
                    let names = response.data.split("<ul>").pop().split("</ul>")[0].split("\n");

                    names.splice(0, 1);
                    names.splice(names.length - 1, 1);

                    let name = names[Math.floor(Math.random() * names.length)].split("<li>").pop().split("</li>")[0];

                    if(name.includes("&lt;name&gt;&nbsp;"))
                        name = name.replace("&lt;name&gt;&nbsp;", author);

                    if(type == 'surnames')
                        name = author + " " + name;

                    resolve(name);
                }catch(err){
                    helper.error(err);
                    reject("Error parsing site");
                }
            }).catch(err => {
                helper.error(err);
                reject("Couldn't proccess request");

            });
        });
    }
}
