var tcpp = require('tcp-ping');

module.exports = {
    command: 'ping2',
    description: "ping a website.",
    argsRequired: 1,
    usage: '<url>',
    example: [
        {
            run: "ping google.com",
            result: "Returns the time it took to ping google.com"
        },
    ],
    call: obj => {
        return new Promise(async (resolve, reject) => {
            let { argv } = obj;
            let url = argv[1];
            let ping = 0;

            tcpp.probe(url, 80, function(err, available) {
                if(available){
                    tcpp.ping({ address: url }, function(err, data) {
                        ping = Math.round(data.avg);
                        console.log(ping);
                        resolve(url + ": " + ping + "ms");
                    });
                } else {
                    reject("Couldn't reach this URL");
                }
            });

        });
    }
};
