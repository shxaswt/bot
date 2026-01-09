require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const axios = require('axios');
const Canvas = require('canvas');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const playerSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    totalPoints: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    totalTime: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    blueEssence: { type: Number, default: 0 },
    orangeEssence: { type: Number, default: 0 },
    chests: { type: Number, default: 0 },
    ownedChampions: { type: Array, default: [] },
    ownedSkins: { type: Array, default: [] },
    championShards: { type: Array, default: [] },
    skinShards: { type: Array, default: [] },
    lastDaily: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 }
});

const Player = mongoose.model('Player', playerSchema);

// Memory storage for ephemeral data
const activeGames = new Map();
const serverCooldowns = new Map();
const pendingTrades = new Map();

// --- DATABASE HELPERS ---
async function getOrUpdatePlayer(userId, username, updates = {}) {
    let player = await Player.findOne({ userId });
    if (!player) {
        player = new Player({ userId, username, ...updates });
    } else {
        if (username) player.username = username;
        Object.assign(player, updates);
    }
    await player.save();
    return player;
}

// --- RIOT DATA DRAGON ---
let DD_VERSION = '14.1.1';
let DD_BASE = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}`;
let championData = null;
let championList = [];
let championSkins = {};

async function loadChampionData() {
    try {
        const res = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        DD_VERSION = res.data[0];
        DD_BASE = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}`;
        const champRes = await axios.get(`${DD_BASE}/data/en_US/champion.json`);
        championData = champRes.data.data;
        championList = Object.keys(championData);
        console.log(`✅ Loaded ${championList.length} champions`);
    } catch (e) { console.error("DataDragon Error:", e); }
}

async function getChampionDetails(championKey) {
    try {
        const response = await axios.get(`${DD_BASE}/data/en_US/champion/${championKey}.json`);
        const details = response.data.data[championKey];
        if (!championSkins[championKey]) championSkins[championKey] = details.skins;
        return details;
    } catch (e) { return null; }
}

// --- UTILS ---
function normalize(t) { return t.toLowerCase().replace(/['\s.-]/g, '').replace(/&/g, 'and'); }
function getMultiplier(s) { return s < 3 ? 1 : s < 5 ? 1.5 : s < 10 ? 2 : 2.5; }
const getChampionIconUrl = (key) => `${DD_BASE}/img/champion/${key}.png`;
const getSkinSplashUrl = (key, num) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${key}_${num}.jpg`;
const getSkinCenteredUrl = (key, num) => `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${key}_${num}.jpg`;

const RARITIES = {
    COMMON: { name: 'Common', color: '#95A5A6', disenchant: 195, craftCost: 520 },
    EPIC: { name: 'Epic', color: '#00D9FF', disenchant: 270, craftCost: 1050 },
    LEGENDARY: { name: 'Legendary', color: '#E67E22', disenchant: 364, craftCost: 1520 },
    ULTIMATE: { name: 'Ultimate', color: '#E74C3C', disenchant: 650, craftCost: 2950 }
};

const CHAMPION_COSTS = {
    450: { be: 270, disenchant: 90 },
    1350: { be: 810, disenchant: 270 },
    3150: { be: 1890, disenchant: 630 },
    4800: { be: 2880, disenchant: 960 },
    6300: { be: 3780, disenchant: 1260 },
    7800: { be: 4680, disenchant: 1560 }
};

// --- GAME LOGIC ---
async function startGame(interaction, mode, difficulty, pixelate) {
    const channelId = interaction.channel.id;
    if (activeGames.has(channelId)) return;

    const randomChamp = championList[Math.floor(Math.random() * championList.length)];
    const champDetails = await getChampionDetails(randomChamp);
    if (!champDetails) return;

    let imageUrl, answer, abilityKey, abilityName;

    if (mode === 'ability') {
        const idx = Math.floor(Math.random() * 5);
        const ability = idx === 0 ? champDetails.passive : champDetails.spells[idx - 1];
        abilityKey = idx === 0 ? 'Passive' : ['Q', 'W', 'E', 'R'][idx - 1];
        abilityName = ability.name;
        imageUrl = idx === 0 ? `${DD_BASE}/img/passive/${ability.image.full}` : `${DD_BASE}/img/spell/${ability.image.full}`;
        answer = champDetails.name;
    } else {
        const skins = champDetails.skins.filter(s => s.num !== 0);
        const randomSkin = (mode === 'skin' && skins.length) ? skins[Math.floor(Math.random() * skins.length)] : null;
        imageUrl = randomSkin ? getSkinSplashUrl(randomChamp, randomSkin.num) : getSkinSplashUrl(randomChamp, 0);
        answer = champDetails.name;
    }

    // Image Processing
    const canvas = Canvas.createCanvas(400, 400);
    const ctx = canvas.getContext('2d');
    const image = await Canvas.loadImage(imageUrl);
    
    // Original cropping logic
    const zoom = { easy: 2.5, normal: 4.0, hard: 6.0 }[difficulty] || 4.0;
    const cropSize = Math.min(image.width, image.height) / zoom;
    const cropX = Math.floor(Math.random() * (image.width - cropSize));
    const cropY = Math.floor(Math.random() * (image.height - cropSize));
    ctx.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, 400, 400);

    if (pixelate) {
        const pSize = { easy: 10, normal: 14, hard: 18 }[difficulty] || 14;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, 400, 400, 0, 0, 400/pSize, 400/pSize);
        ctx.drawImage(canvas, 0, 0, 400/pSize, 400/pSize, 0, 0, 400, 400);
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'guess.png' });
    const embed = new EmbedBuilder()
        .setTitle(`Guess the ${mode}! [${difficulty.toUpperCase()}]`)
        .setImage('attachment://guess.png')
        .setColor('#0099ff');

    await interaction.editReply({ embeds: [embed], files: [attachment] });

    activeGames.set(channelId, {
        answer,
        normalized: normalize(answer),
        points: pixelate ? 10 : 5,
        startTime: Date.now()
    });
}

async function checkGuess(message) {
    const game = activeGames.get(message.channel.id);
    if (!game) return;

    if (normalize(message.content) === game.normalized) {
        activeGames.delete(message.channel.id);
        const player = await getOrUpdatePlayer(message.author.id, message.author.username);
        
        const timeTaken = (Date.now() - game.startTime) / 1000;
        player.currentStreak += 1;
        player.wins += 1;
        player.gamesPlayed += 1;
        player.totalTime += timeTaken;
        
        const reward = Math.floor(game.points * getMultiplier(player.currentStreak));
        player.totalPoints += reward;
        
        // Reward Chests/BE logic
        if (player.totalPoints % 50 === 0) player.blueEssence += 2500;
        if (player.totalPoints % 20 === 0) player.chests += 1;
        if (player.currentStreak > player.maxStreak) player.maxStreak = player.currentStreak;

        await player.save();
        message.reply(`🎉 **${game.answer}**! +${reward} pts. Streak: ${player.currentStreak}`);
    }
}

// --- TRADE & INVENTORY SYSTEM ---
async function createInventoryEmbed(player, page, type) {
    const items = type === 'champions' ? player.championShards : 
                  type === 'skins' ? player.skinShards :
                  type === 'owned_champs' ? player.ownedChampions : player.ownedSkins;
    
    const totalPages = Math.max(1, items.length);
    const item = items[page - 1];
    
    const embed = new EmbedBuilder().setFooter({ text: `Page ${page}/${totalPages}` });
    if (!item) {
        embed.setDescription("This inventory is empty.");
        return { embed, totalPages: 1 };
    }

    if (type === 'champions' || type === 'owned_champs') {
        embed.setTitle(item.name).setThumbnail(getChampionIconUrl(item.id));
    } else {
        embed.setTitle(item.skinName).setImage(getSkinCenteredUrl(item.championId, item.skinNum));
    }
    return { embed, totalPages };
}

// --- MESSAGE COMMAND ROUTER ---
async function handleMessageCommand(message) {
    const content = message.content.toLowerCase();
    const args = content.split(' ');

    // Original Command Regex from your bot.js
    const gameMatch = content.match(/^lol (ga|gsp|gsk)(\s+(ez|mid|hard|v2|v3))?(\s+px)?$/);
    if (gameMatch) {
        const modeMap = { ga: 'ability', gsp: 'splash', gsk: 'skin' };
        const mode = modeMap[gameMatch[1]];
        const difficulty = gameMatch[3] || 'normal';
        const pixelate = !!gameMatch[4];
        
        const fakeInteraction = {
            channel: message.channel,
            editReply: async (data) => await message.reply(data)
        };
        await startGame(fakeInteraction, mode, difficulty, pixelate);
        return;
    }

    // Profile command
    if (args[1] === 'p' || args[1] === 'profile') {
        const target = message.mentions.users.first() || message.author;
        const player = await getOrUpdatePlayer(target.id, target.username);
        const embed = new EmbedBuilder()
            .setTitle(`${player.username}'s Stats`)
            .addFields(
                { name: 'Points', value: `${player.totalPoints}`, inline: true },
                { name: 'BE', value: `${player.blueEssence}`, inline: true },
                { name: 'Chests', value: `${player.chests}`, inline: true }
            );
        return message.reply({ embeds: [embed] });
    }

    // Inventory command
    if (args[1] === 'inv' || args[1] === 'inventory') {
        const player = await getOrUpdatePlayer(message.author.id, message.author.username);
        const { embed } = await createInventoryEmbed(player, 1, 'champions');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('inv_cat_champions').setLabel('Shards').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('inv_cat_owned_champs').setLabel('Owned').setStyle(ButtonStyle.Success)
        );
        return message.reply({ embeds: [embed], components: [row] });
    }
}

// --- EVENT HANDLERS ---
client.on('messageCreate', async (m) => {
    if (m.author.bot) return;
    if (m.content.toLowerCase().startsWith('lol ')) await handleMessageCommand(m);
    else await checkGuess(m);
});

client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const player = await getOrUpdatePlayer(i.user.id, i.user.username);
    
    if (i.customId.startsWith('inv_cat_')) {
        const type = i.customId.replace('inv_cat_', '');
        const { embed } = await createInventoryEmbed(player, 1, type);
        await i.update({ embeds: [embed] });
    }
});

client.once('ready', async () => {
    await loadChampionData();
    console.log(`🚀 Bot is live! Logged in as ${client.user.tag}`);
});

client.login(process.env.DISCORD_TOKEN);