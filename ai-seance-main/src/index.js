import indexHTML from "./index.html";
import setupHTML from "./setup.html";
import v2HTML from "./v2.html";
import * as fal from "@fal-ai/serverless-client";
import { Client } from "./claudette.js";

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === '/api/llm' && request.method === 'POST') {
			async function askClaude() {
				const { messages, system, secret, prefill, imageUrl } = await request.json();

				if (secret !== env.SECRET) {
					return new Response(JSON.stringify({ error: 'Invalid secret' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				const chat = new Client(env.ANTHROPIC_API_KEY);

				let images = [];
				if (imageUrl) {
					const imageResponse = await fetch(imageUrl);
					console.log(imageResponse)
					const imageBuffer = await imageResponse.arrayBuffer();
					const base64Image = arrayBufferToBase64(imageBuffer);
					images = [{
						media_type: imageResponse.headers.get('content-type'),
						data: base64Image
					}];
				}

				const response = await chat.call(messages, { prefill, sp: system, images });
				return response.content[0].text;
			}

			// with retry on failures only 4 times
			let content;
			for (let i = 0; i < 4; i++) {
				try {
					content = await askClaude();
					if (content) {
						break;
					}
				} catch (error) {
					console.log(error);
				}
			}

			return new Response(JSON.stringify({ content }), {
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (url.pathname === '/api/generate-image' && request.method === 'POST') {
			try {

				fal.config({
					credentials: env.FAL_KEY
				});

				let { prompt, seed, event, secret, meta, model } = await request.json();

				model = model || "fal-ai/fast-sdxl";

				const sdxl_fal = ({ seed, prompt }) =>
					fal.subscribe(model, {
						input: {
							prompt, seed, enable_safety_checker: false, image_size: "square_hd",
						},
						logs: false,
					}).then(result => result.images[0].url).catch(error => {
						console.log(error);
						return null;
					});

				if (!meta) {
					meta = {};
				}
				meta.model = model;

				if (secret !== env.SECRET) {
					return new Response(JSON.stringify({ error: 'Invalid secret' }), {
						status: 401,
						headers: { 'Content-Type': 'application/json' }
					});
				}

				let imageUrl = await sdxl_fal({ seed, prompt });

				let upload = true;
				if (upload) {
					let key = new URL(imageUrl).pathname.slice(1);
					await fetch(imageUrl).then(request => env.ASSETS.put(key, request.body))
					imageUrl = `${env.ASSETS_URL}/${key}`
				}

				await env.DB.prepare(
					"INSERT INTO Runs (Event, Prompt, URL, Seed, meta) VALUES (?, ?, ?, ?, ?)"
				)
					.bind(event || "unknown", prompt, imageUrl, seed, JSON.stringify(meta))
					.all();

				return new Response(JSON.stringify({ imageUrl }), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (error) {
				console.log({ error })
				return new Response(JSON.stringify({ error: 'Invalid request' }), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		if (url.pathname == '/log') {
			const { results } = await env.DB.prepare(
				"SELECT * FROM Runs"
			).all();
			return Response.json(results);
		}

		if (url.pathname == "/setup") {
			return new Response(setupHTML, {
				headers: { 'Content-Type': 'text/html' }
			})
		}

		if (url.pathname == "/v2") {
			return new Response(v2HTML, {
				headers: { 'Content-Type': 'text/html' }
			})
		}


		// Serve the HTML for any other request
		return new Response(indexHTML, {
			headers: { 'Content-Type': 'text/html' }
		});
	},
};

function arrayBufferToBase64(buffer) {
	let binary = '';
	const bytes = new Uint8Array(buffer);
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}