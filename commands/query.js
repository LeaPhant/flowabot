const osu = require('../osu.js');
const helper = require('../helper.js');
const mysql = require('mysql');
const { promisify } = require('util');
const { table } = require('table');

const databaseConfig = {
  connectionLimit : 10,
  host: 'localhost',
  user: 'flowabot',
  database: 'osu',
  timezone: 'utc',
  dateStrings : true
};

const tableConfig = {
  border: {
    topBody: `─`,
    topJoin: `┬`,
    topLeft: `┌`,
    topRight: `┐`,

    bottomBody: `─`,
    bottomJoin: `┴`,
    bottomLeft: `└`,
    bottomRight: `┘`,

    bodyLeft: `│`,
    bodyRight: `│`,
    bodyJoin: `│`,

    joinBody: `─`,
    joinLeft: `├`,
    joinRight: `┤`,
    joinJoin: `┼`
  }
};

const pool = mysql.createPool(databaseConfig)

const query = promisify(pool.query).bind(pool);

module.exports = {
    command: 'query',
    description: "Run SQL query.",
    argsRequired: 1,
    usage: '<query>',
    call: obj => {
        return new Promise(async (resolve, reject) => {
            const { argv, msg } = obj;
            
            let sql = argv.slice(1).join(" ");
            let response;

            try{
                response = await query(sql);
            }catch(e){
                if(e.sqlMessage)
                    reject(e.sqlMessage);
                else
                    reject("Error executing query");
                return;
            }

            if(response[0] == null){
                reject("No matching entries found");
                return;
            }
            
            const output = [];
            
            output.push(Object.keys(response[0]));
            
            for(const row of response)
                output.push(Object.values(row));

            const result = table(output, tableConfig);

            if(result.length > 2000){
                const csvPath = `/opt/flowabot-csv/query-${new Date().toISOString().split('.')[0]}.csv`;

                sql += ` INTO OUTFILE '${csvPath}'
                    FIELDS TERMINATED BY ','
                    ENCLOSED BY '"'
                    LINES TERMINATED BY '\\n'`;

                    console.log(sql);

                console.log(await query(sql));

                console.log(csvPath);

                resolve({
                    files: [ csvPath ]
                });
            }else{
                resolve('```\n' + result + '```');
            }
        });
    }
};
