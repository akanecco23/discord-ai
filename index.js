require("./server.js");
const { Models, GoogleGenAI } = require("@google/genai");
const config = require("./config.json");
const { Client, GatewayIntentBits } = require("discord.js");
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT.replaceAll(
	"\\n",
	"\n",
).replaceAll('\\"', '"');

let lastMessageTime = Date.now();
const cooldownAmount = 2000;

const ai = new GoogleGenAI({
	apiKey: process.env.API_KEY,
});

let ownerId = "";
client.on("ready", async () => {
	console.log(`Logged in as ${client.user.tag}`);

	console.log("System prompt:\n", SYSTEM_PROMPT);

	await client.application.fetch();
	ownerId = client.application.owner.id;
});

let uniqueId = Date.now();
/** @type {Record<string, import("@google/genai").Content[]>} */
let conversations = {};

/** @type {import("@google/genai").SafetySetting[]} */
const safetySettings = [
	"HARM_CATEGORY_UNSPECIFIED",
	"HARM_CATEGORY_HATE_SPEECH",
	"HARM_CATEGORY_DANGEROUS_CONTENT",
	"HARM_CATEGORY_HARASSMENT",
	"HARM_CATEGORY_SEXUALLY_EXPLICIT",
	"HARM_CATEGORY_CIVIC_INTEGRITY",
].map((c) => ({
	category: c,
	threshold: "OFF",
}));

client.on("messageCreate", async (message) => {
	if (!message.guild) return;
	if (message.author.bot) return;

	if (message.content === "sq reset" && message.author.id === ownerId) {
		uniqueId = Date.now();
		conversations = {};
		return message.react("✅");
	}

	let msg = "";
	const prefixRegex = new RegExp(`^(<@!?${client.user.id}>)\\s*`, "i");
	if (
		!(
			prefixRegex.test(message.content) ||
			message.mentions?.repliedUser?.id === client.user.id
		)
	)
		return;

	if (message.mentions?.repliedUser?.id === client.user.id) {
		msg = message.content;
	} else {
		const [, matchedPrefix] = message.content.match(prefixRegex);
		msg = message.content.slice(matchedPrefix.length).trim();
	}
	if (msg.length === 0) return message.react("❓");

	const now = Date.now();
	const expirationTime = lastMessageTime + cooldownAmount;
	if (now < expirationTime) {
		return message.react("🐢");
	}

	lastMessageTime = now;

	const reply = await message.reply(`${config.emojis.loading}⠀`);
	try {
		const cId = `${message.channel.id}-${uniqueId}`;
		if (!conversations[cId]) {
			conversations[cId] = [];
			conversations[cId].push({
				role: "user",
				parts: [
					{
						text: SYSTEM_PROMPT,
					},
				],
			});
		}
		conversations[cId].push({
			role: "user",
			parts: [
				{
					text: `${message.author.username}: ${msg}`,
				},
			],
		});
		const res = await ai.models.generateContent({
			model: "gemma-3-27b-it",
			contents: conversations[cId],
			config: {
				safetySettings: safetySettings,
			},
		});
		let response = res.text;
		for (const r of ["<start_of_turn>", "<end_of_turn>"]) {
			response = response.replaceAll(r, "");
		}
		response = response.trim();
		conversations[cId].push({
			role: "model",
			parts: [
				{
					text: response,
				},
			],
		});

		if (conversations[cId].length > 100) {
			conversations[cId] = conversations[cId].slice(-100);
		}

		await reply.edit(response);
	} catch (e) {
		console.error(e);
		try {
			await reply.edit("❌ Something went wrong.");
		} catch {
			await message.reply("❌ Something went wrong.");
		}
	}
});

client.login(process.env.TOKEN);

// dont crash
process.on("unhandledRejection", (reason, p) => {});
process.on("uncaughtException", (err, origin) => {});
process.on("uncaughtExceptionMonitor", (err, origin) => {});
process.on("multipleResolves", (type, promise, reason) => {});
