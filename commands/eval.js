const {VM} = require('vm2');
const fs = require('fs-extra');

const helper = require('../helper.js');

let VMs = {};

function initVM(user){
    if(!(user in VMs)){
        VMs[user] = new VM({
           timeout: 100
        });

        VMs[user].run(`const rand = function(max){
            return Math.floor(Math.random() * Math.floor(max + 1));
        }`);

        VMs[user].run(`const bonusPP = function(n){
            return 416.6667 * (1 - Math.pow(0.9994, n));
        }`);

        VMs[user].run(fs.readFileSync('underscore-min.js', 'utf8'));
    }
    return VMs[user];
}

module.exports = {
    command: ['eval'],
    description: "Runs JavaScript code and returns the result of the last evaluation. Underscore.js for array/object helpers and `bonusPP(n)` for bonus pp calculation are available.",
    usage: '[javascript code]',
    example: [
        {
            run: "eval 5+5",
            result: "Evaluates 5+5 and returns the result."
        },
        {
            run: "eval _max.([1, 2, 3])",
            result: "Uses Underscore.js to return the maximum value of an array."
        }
    ],
    call: obj => {
        return new Promise((resolve, reject) => {
            let { argv, msg } = obj;

            let eval_code = msg.content.split(" ").slice(1).join(" ");
            let user_id = msg.author.id;

            if(msg.content.includes('```')){
                let eval_split = msg.content.split('```');
                if(eval_split.length > 2){
                    eval_code = helper.replaceAll(eval_split[1], "\n", "");
                }
            }

            try{
                let vm = initVM(user_id);

                let _msg = {
                    content: msg.content,
                    author: {
                        id: msg.author.id,
                        username: msg.author.username,
                        discriminator: msg.author.discriminator,
                        presence: msg.author.presence
                    }
                };

                eval_code = `var msg = ${JSON.stringify(_msg)};` + eval_code;
                let output_msg = vm.run(eval_code);
                output_msg = JSON.stringify(output_msg);

                if(output_msg)
                    output_msg = helper.replaceAll(output_msg, "```", "`\u200B``");
                else
                    output_msg = "No output";

                resolve('```' + output_msg + '```');

            }catch(err){
                reject(err.toString().split("\n")[0]);
                helper.error(err);
            }
        });
    }
};
