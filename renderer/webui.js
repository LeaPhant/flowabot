const WebSocket = require('ws');
const http = require('http');
const os = require('node:os');
const serveStatic = require('serve-static');
const finalHandler = require('finalhandler');
const path = require('path');
const renderCommand = require('../commands/render');
const { promises: fs } = require('fs');

const HTTP_PORT = 7270;
const WS_PORT = 7271;

const wss = new WebSocket.WebSocketServer({ port: WS_PORT });

const serve = serveStatic(path.join(__dirname, 'webui'));

const server = http.createServer(function onRequest (req, res) {
	serve(req, res, finalHandler(req, res))
});
  
server.listen(HTTP_PORT);

console.log(`Listening on http://localhost:${HTTP_PORT}`);

let currentProgress;

process.on('SIGINT', () => {
	try {require('fs').rmSync(path.resolve(__dirname, 'webui', 'output'), { recursive: true }); } catch (e) {}
	process.exit(0);
});

const msg = {
	edit: async content => {
		return progressEvent(content);
	},
	delete: async () => {
		return msg;
	},
	channel: {
		id: 0,
		send: async content => {
			if (content?.embed === undefined && content?.files === undefined)
				return errorEvent(content);

			if (content?.files === undefined)
				return progressEvent(content);

			return (await completeEvent(content));
		}
	}
};

const broadcast = (event, data) => {
	for (const client of wss.clients) {
		if (client.readyState !== WebSocket.OPEN) continue;
		client.send(JSON.stringify({ event, data }));
	}
}

const progressEvent = content => {
	broadcast('progress', content?.embed?.description);
	return msg;
};

const completeEvent = async content => {
	try {
		const name = content?.files?.[0].name ?? 'video.mp4';
		const videoPath = path.resolve(__dirname, 'webui', 'output');
		try { await fs.mkdir(videoPath); } catch(e) {}
		await fs.copyFile(content?.files?.[0].attachment, path.resolve(videoPath, name));
		broadcast('complete', `output/${name}`);
		return msg;
	} catch(err) {
		console.error(err);
		return errorEvent(err);
	}
};

const errorEvent = content => {
	broadcast('error', content);
	return msg;
};

const render = (command) => {
	const argv = command.split(' ');

	renderCommand.call({
		argv,
		msg,
		last_beatmap: { 0: {} },
		webui: true
	});
};

wss.on('connection', ws => {
	ws.on('error', console.error);
  
	ws.on('message', command => {
		render(command.toString());
	});
});