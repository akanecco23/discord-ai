require("./server.js");
const config = require("./config.json");
const { Client, GatewayIntentBits, Events } = require("discord.js");

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
const REINFORCEMENT_PROMPT = process.env.REINFORCEMENT_PROMPT.replaceAll(
	"\\n",
	"\n",
).replaceAll('\\"', '"');

let lastMessageTime = Date.now();
const cooldownAmount = 2000;

let ownerId = "";
client.on(Events.ClientReady, async () => {
	console.log(`Logged in as ${client.user.tag}`);

	console.log("System prompt:\n", SYSTEM_PROMPT);

	await client.application.fetch();
	ownerId = process.env.OWNER_ID || client.application.owner.id;
});

let uniqueId = Date.now();
let conversations = {};
let counter = {};

const appendConversation = (cId, role, msg) => {
	if (conversations[cId]?.at(-1)?.role === role) {
		conversations[cId].at(-1).content += `\n\n${msg}`;
	} else {
		conversations[cId].push({
			role,
			content: msg,
		});
	}
};

client.on(Events.MessageCreate, async (message) => {
	if (!message.guild) return;
	if (message.author.bot) return;

	if (message.content === "sq reset" && message.author.id === ownerId) {
		uniqueId = Date.now();
		conversations = {};
		counter = {};
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
		const cId = `${message.channel.id}`;
		if (!conversations[cId]) {
			conversations[cId] = [];
			appendConversation(cId, "user", SYSTEM_PROMPT);
			counter[cId] = 0;
		}
		appendConversation(cId, "user", `${message.author.username}: ${msg}`);
		counter[cId]++;
		if (counter[cId] % 5 === 0) {
			appendConversation(
				cId,
				"user",
				`A message from the SYSTEM\nRemember: ${REINFORCEMENT_PROMPT}`,
			);
		}
		const res = await fetch(process.env.GPT_ENDPOINT, {
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				Authorization: `Bearer ${process.env.API_KEY}`,
			},
			body: JSON.stringify({
				model: "google/gemma-3n-e4b-it",
				messages: conversations[cId],
				max_tokens: 256,
				temperature: 0.6,
				top_p: 0.9,
				frequency_penalty: 0.0,
				presence_penalty: 0.0,
				stream: false,
			}),
			method: "POST",
		}).then((r) => r.json());
		let response = res.choices[0].message.content;
		response = response.trim();
		appendConversation(cId, "model", response);

		if (conversations[cId].length > 100) {
			conversations[cId] = conversations[cId].slice(-100);
		}

		await reply.edit(response);
	} catch (e) {
		console.error(e);
		try {
			await reply.edit("❌ Something went wrong.");
		} catch {}
	}
});

client.login(process.env.TOKEN);

// dont crash
process.on("unhandledRejection", (reason, p) => {
	console.log("Unhandled Rejection at: Promise", p, "reason:", reason);
});
process.on("uncaughtException", (err, origin) => {
	console.log("Uncaught Exception:", err, "origin:", origin);
});
process.on("uncaughtExceptionMonitor", (err, origin) => {});
process.on("multipleResolves", (type, promise, reason) => {});
