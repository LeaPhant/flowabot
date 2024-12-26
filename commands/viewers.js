const config = require('../config.json');

const { Duration } = require('luxon');
const { AppTokenAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');

const authProvider = new AppTokenAuthProvider(
	config.credentials.twitch_client_id, 
	config.credentials.twitch_client_secret
);

const apiClient = new ApiClient({ authProvider });

module.exports = {
    command: ['uptime', 'downtime', 'viewers'],
    description: "See how many people are watching a Twitch channel.",
    argsRequired: 1,
    usage: '<twitch username>',
    example: {
        run: "viewers distortion2",
        result: "Returns how many viewers distortion2 currently has (if they're live)."
    },
    configRequired: ['credentials.twitch_client_id', 'credentials.twitch_client_secret'],
    call: async obj => {
		let { argv } = obj;

		let channel_name = argv[1];

		const user = await apiClient.users.getUserByName(channel_name);

		if (!user) {
			throw "Twitch User not found.";
		}

		const { displayName: name } = user;
		const channelUrl = `https://twitch.tv/${user.name}`;

		const embed = {
			color: 6570404,
			author: {
				icon_url: user.profilePictureUrl,
				url: channelUrl,
				name
			},
			url: channelUrl
		};

		const stream = await apiClient.streams.getStreamByUserName(user);

		if (!stream) {
			const { data: videos } = await apiClient.videos.getVideosByUser(user, { type: 'archive' });

			if (videos.length == 0) {
				embed.description = "Currently offline.";
				return { embed };
			}

			const [lastStream] = videos;
			const { creationDate } = lastStream;

			const lastStreamed = Math.floor(creationDate.getTime() / 1000);

			embed.description = `Last streamed <t:${lastStreamed}:R>`;
			return { embed };
		}

		embed.title = stream.title;

		embed.fields = [];

		if (stream.gameName) {
			embed.fields.push({
				name: 'Game',
				value: stream.gameName,
				inline: true
			});
		}

		embed.fields.push({
			name: 'Viewers',
			value: stream.viewers.toLocaleString(),
			inline: true
		});

		const uptime = Date.now() - stream.startDate.getTime();
		const duration = Duration.fromMillis(uptime);

		const uptimeText = 
			  uptime > 60 * 60 * 1000 
			? duration.toFormat("h'h' m'm'") 
			: duration.toFormat("m'm'");

		console.log(JSON.stringify(stream));

		embed.fields.push({
			name: 'Uptime',
			value: uptimeText,
			inline: true
		});

		return { embed };
    }
};
