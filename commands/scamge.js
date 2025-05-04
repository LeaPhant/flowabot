const osu = require('../osu.js');
const helper = require('../helper.js');

const MAX_BONUS = 416.6667 * (1 - Math.pow(0.995, 1000));

module.exports = {
    command: 'scamge',
    description: "See how much pp somebody or yourself is scammed out of.",
    usage: '[username]',
    configRequired: ['credentials.client_id', 'credentials.client_secret'],
    call: obj => {
        return new Promise((resolve, reject) => {
            const { argv, msg, user_ign } = obj;
            const top_user = helper.getUsername(argv, msg, user_ign);

            osu.get_tops({ user: top_user, count: 200 }, (err, response) => {
                if (err) {
                    reject(err);
                }

                const { tops, user } = response;

                let total = 0;

                for (const grade in user.statistics?.grade_counts || {}) {
                    total += user.statistics.grade_counts[grade] ?? 0;
                }

                if (total < 1000) {
                    reject("Player needs at least 1000 combined ranks to use this command.");
                }

                let pp = MAX_BONUS;

                for (const [index, top] of tops.entries()) {
                    pp += top.pp * Math.pow(0.95, index);
                }

                const diff = Math.max(0, pp - (user.statistics?.pp || 0));

                const threshold = MAX_BONUS - diff;
                let dupes = 0;

                for (let i = 1000; i > 0; i--) {
                    const bonus = MAX_BONUS * (1 - Math.pow(0.995, i));

                    if (bonus <= threshold) {
                        break;
                    }

                    dupes++;
                }

                resolve(`${user.username} is scammed out of ${diff == 0 ? '<1' : diff.toFixed(2)} bonus pp (${dupes < 50 ? '<50': '~' + dupes} duplicate scores in top 1000)`)
            });
        });
    }
};
