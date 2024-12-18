const inputCommand = document.getElementById('inp_command');
const elemProgress = document.getElementById('elem_progress');
const elemOutput = document.getElementById('elem_output');

const socket = new WebSocket("ws://localhost:7271");

socket.addEventListener("message", (payload) => {
	const { event, data } = JSON.parse(payload.data);

	console.log(event, data);

	if (event == 'progress') {
		elemProgress.innerHTML = data;
	}

	if (event == 'complete') {
		let outputElement;

		if (data.endsWith('.mp4')) {
			outputElement = document.createElement('video');
			outputElement.controls = true;
			outputElement.autoplay = true;
		}

		if (data.endsWith('.gif')) {
			outputElement = document.createElement('img');
		}

		if (!outputElement) return;

		outputElement.src = `${data}?${Date.now()}`;
		elemOutput.replaceChildren(outputElement);
	}
});

const render = () => {
	socket.send(inputCommand.value);
}

inputCommand.addEventListener('keydown', event => {
	if (event.code == 'Enter') {
		event.preventDefault();
		return render();
	}
});