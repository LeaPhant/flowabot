const helper = require('../helper.js');

module.exports = {
    command: 'bmi',
    description: "Calculate your BMI.",
    usage: '<height in m or cm> <weight in kg>',
    argsRequired: 2,
    example: [
        {
            run: "bmi 185cm 70kg",
            example: "Returns BMI for 185cm height and 70kg weight."
        },
        {
            run: "bmi 1.56m 56kg",
            example: "Returns BMI for 1.56m height and 56kg weight."
        }
    ],
    call: obj => {
        let { argv } = obj;
        let weight, height;

        argv.forEach(arg => {
            if(arg.endsWith("cm"))
                height = parseFloat(arg);
            else if(arg.endsWith("m"))
                height = parseFloat(arg) * 100;
            else if(arg.endsWith("kg"))
                weight = parseFloat(arg);
        });

        if(!weight || !height)
            return helper.commandHelp('bmi');

        let bmi = (weight / Math.pow(height, 2) * 10000).toFixed(1);
        let description;

        if(bmi < 19.5)
            description = "Underweight (<19.5)";
        else if(bmi < 24.5)
            description = "Healthy Weight (19.5 - 24.4)";
        else if(bmi < 30)
            description = "Overweight (24.5 - 29.9)";
        else if(bmi < 40)
            description = "Obesity (30 - 39.9)";
        else
            description = "Heavy Obesity (>40)";

        return `Your BMI is ${bmi} (${description})`;
    }
};
