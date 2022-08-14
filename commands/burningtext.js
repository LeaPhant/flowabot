const axios = require('axios');
const https = require('https');
const helper = require('../helper.js');
const FormData = require('form-data')


module.exports = {
    command: ['burningtext', 'flametext', 'cooltext'],
    description: "Generate a burning text gif.",
    argsRequired: 1,
    usage: '<text>',
    example: {
        run: 'Burning Text',
        result: "It burns."
    },
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv } = obj;

            let args = argv
            args.shift()

            const text = args.join(" ")

            const formData = new FormData()

            formData.append("LogoID", 4)
            formData.append("Text", text)
            formData.append("FontSize", 70)
            formData.append("Color1_color", "#FF0000")
            formData.append("Integer1", 15)
            formData.append("Boolean1", "on")
            formData.append("Integer9", 0)
            formData.append("Integer13", "on")
            formData.append("Integer12", "on")
            formData.append("BackgroundColor_color", "#FFFFFF")

            axios.post("https://cooltext.com/PostChange", formData, {
                headers: formData.getHeaders()
              }).then(response => {
                const agent = new https.Agent({  
                    rejectUnauthorized: false
                  });

                axios.get(response.data.renderLocation, {httpsAgent: agent, method: "GET", responseType: "stream"}).then(response => {
                    let attachment = [{
                        attachment: response.data,
                        name: text.substring(0,1024) + '.gif'
                    }]

                    resolve({files: attachment});
                }).catch(err => {
                    helper.error(err);
                    reject("Couldn't generate gif")
                });
            }).catch(err => {
                helper.error(err);
                reject("Couldn't generate gif")
            });
        });
    }
};
