require("./server.js");
const config = require("./config.json");
const { Client, GatewayIntentBits, Collection } = require("discord.js");
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const cooldowns = new Collection();

let ownerId = "";
client.on("ready", async () => {
	console.log(`Logged in as ${client.user.tag}`);

	await client.application.fetch();
	ownerId = client.application.owner.id;
});

let uniqueId = Date.now();

client.on("messageCreate", async (message) => {
	if (!message.guild) return;
	if (message.author.bot) return;

	if (message.content === "sq reset" && message.author.id === ownerId) {
		uniqueId = Date.now();
		return message.react("✅");
	}

	let msg = "";
	const prefixRegex = new RegExp(`^(<@!?${client.user.id}>)\\s*`, "i");
	if (!(prefixRegex.test(message.content) || message.mentions?.repliedUser?.id === client.user.id)) return;

	if (message.mentions?.repliedUser?.id === client.user.id) {
		msg = message.content;
	} else {
		const [, matchedPrefix] = message.content.match(prefixRegex);
		msg = message.content.slice(matchedPrefix.length).trim();
	}
	if (msg.length === 0) return message.react("❓");

	const now = Date.now();
	const cooldownAmount = 3000;

	if (cooldowns.has(message.author.id)) {
		const expirationTime = cooldowns.get(message.author.id) + cooldownAmount;

		if (now < expirationTime) {
			return message.react("🐢");
		}
	}

	cooldowns.set(message.author.id, now);
	setTimeout(() => cooldowns.delete(message.author.id), cooldownAmount);

	message.reply(`${config.emojis.loading}⠀`).then((reply) => {
		fetch(process.env.GPT_ENDPOINT, {
			headers: {
				accept: "text/plain",
				"accept-language": "en-US,en;q=0.9",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				prompt: `${message.author.username}: ${msg}`,
				channelId: `${message.channel.id}-${uniqueId}`,
			}),
			method: "POST",
		})
			.then((r) => r.json())
			.then((json) => {
				reply.edit(json.response);
			});
	});
});

client.login(process.env.TOKEN);

// dont crash
process.on("unhandledRejection", (reason, p) => {});
process.on("uncaughtException", (err, origin) => {});
process.on("uncaughtExceptionMonitor", (err, origin) => {});
process.on("multipleResolves", (type, promise, reason) => {});
