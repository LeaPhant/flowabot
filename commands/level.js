const osu = require("../osu.js");
const helper = require("../helper.js");

function calculateLevel(user_stats) {
	const xp_values = {
		medal_count: 10000,
		ss_count: 100,
		s_count: 50,
		a_count: 25,
		ranked_score: 0.000002,
		total_score: 0.000002,
		pp: 250,
		playtime: 0.02778,
	};

	let xp = {
		medal_count: 0,
		ss_count: 0,
		s_count: 0,
		a_count: 0,
		ranked_score: 0,
		total_score: 0,
		pp: 0,
		playtime: 0,
	};

	let total_xp = 0;
	let level = 0;

	for (const [key, value] of Object.entries(user_stats)) {
		xp[key] = value * xp_values[key];
		total_xp += value * xp_values[key];
	}

	level =
		0.033333 *
		(4.6416 *
			(3 * Math.sqrt(81 * total_xp ** 2 - 775500 * total_xp - 22852800) +
				27 * total_xp -
				129250) **
				(1 / 3) +
			11914 /
				(3 *
					Math.sqrt(
						81 * total_xp ** 2 - 775500 * total_xp - 22852800
					) +
					27 * total_xp -
					129250) **
					(1 / 3) -
			220);

	return { level, total_xp, xp };
}

module.exports = {
	command: "level",
	description: "Calculate experimental level.",
	startsWith: true,
	usage: "[username]",
	example: [
		{
			run: "level",
			result: "Calculates your exerimental level.",
		},
		{
			run: "level mrekk",
			result: "Calculates mrekks experimental level",
		},
	],
	configRequired: ["credentials.osu_api_key"],
	call: (obj) => {
		return new Promise((resolve, reject) => {
			let { argv, msg, user_ign } = obj;

			let level_user = helper.getUsername(argv, msg, user_ign);

			let match = argv[0].match(/\d+/);

			if (match != null && !isNaN(match[0]))
				count = Math.max(1, Math.min(match[0], 25));

			if (!level_user) {
				if (user_ign[msg.author.id] == undefined) {
					reject(helper.commandHelp("ign-set"));
				} else {
					reject(helper.commandHelp("level"));
				}

				return false;
			} else {
				osu.get_users({ user: level_user }, (err, response) => {
					if (err) {
						helper.error(err);
						reject(err);
					} else {
						const { users, medal_count } = response;

						const user = users[0];

						let user_stats = {
							medal_count,
							ss_count: 0,
							s_count: 0,
							a_count: 0,
							ranked_score: 0,
							total_score: 0,
							pp: 0,
							playtime: 0,
						};

						for (const [key, value] of Object.entries(
							user.statistics_rulesets
						)) {
							user_stats.ss_count +=
								value.grade_counts.ss + value.grade_counts.ssh;
							user_stats.s_count +=
								value.grade_counts.s + value.grade_counts.sh;
							user_stats.a_count += value.grade_counts.a;
							user_stats.ranked_score += value.ranked_score;
							user_stats.total_score += value.total_score;
							user_stats.pp += value.pp;
							user_stats.playtime += value.play_time;
						}

						const level = calculateLevel(user_stats);

						let response_text = `${
							user.username
						}:\nLv${level.level.toFixed(3)} (${Math.floor(
							level.total_xp
						)} XP)\n`;

						response_text += "```json\n";
						response_text += JSON.stringify(level.xp, null, 2);
						response_text += "\n```";

						resolve(response_text);
					}
				});
			}
		});
	},
};
