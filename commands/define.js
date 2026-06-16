    const axios = require('axios').default;


module.exports = {
    command: ['define', 'dictionary', 'dict'],
    description: "Shows the definition of a word.",
    argsRequired: 1,
    usage: '<word>',
    example: {
        run: "define help",
        result: "Returns the definition for the word 'help'."
    },
    call: obj => {
        return new Promise((resolve, reject) => {   
            let { argv } = obj;

            let word = argv.slice(1).join(" ");

            axios.get('https://api.dictionaryapi.dev/api/v2/entries/en/' + word)
                .then(function (result) {
                    let fields = [];


                        for (let val of result.data) {
                            for (let element of val.meanings) {
                                fields.push({name: element.partOfSpeech, value: element.definitions[0].definition });
                            }
                        }
                        resolve({
                            embeds: [{
                                description: result.data[0].phonetic,
                                color: 12277111,
                                author: {
                                    name: result.data[0].word
                                },
                                fields: fields
                            }]
                        });
                })
                .catch(function (error) {
                    reject(error.response.data.message);
                })
        });
    }
};
