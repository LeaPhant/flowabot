const ud = require('@dmzoneill/urban-dictionary')

module.exports = {
    command: 'urban',
    description: "Shows the definition of a word on urbandictionary.",
    argsRequired: 1,
    usage: '<word>',
    example: {
        run: "urban help",
        result: "Returns the definition for the word 'help'."
    },
    call: obj => {
        return new Promise((resolve, reject) => {   
            let { argv } = obj;

            let word = argv.slice(1).join(" ");

            ud.define(word).then((results) => {
                var definition = results[0].definition;
                var example = results[0].example;

                resolve({
                    embeds: [{
                        description: definition.replace(/\[|\]/g, ''),
                        color: 12277111,
                        author: {
                            name: results[0].word,
                            url: results[0].permalink
                        },
                        fields: {name: 'Example', value: example.replace(/\[|\]/g, '')},
                        timestamp: new Date(results[0].written_on),
                        footer: {text: 'by ' + results[0].author}
                    }]
                });
              }).catch((error) => {
                reject(error.message);
              })
        });
    }
};
