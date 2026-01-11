require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const axios = require('axios');
const Canvas = require('canvas');
const http = require('http');

// --- WEB SERVER (Keep Alive) ---
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.write("I'm alive! LoL Bot is running.");
    res.end();
}).listen(port, () => {
    console.log(`✅ Web server listening on port ${port}`);
});

// --- DISCORD CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// --- MONGODB CONNECTION ---
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
        process.exit(1);
    });

// --- SCHEMA DEFINITION ---
const playerSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    totalPoints: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    totalTime: { type: Number, default: 0 },
    currentStreak: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    blueEssence: { type: Number, default: 0 },
    orangeEssence: { type: Number, default: 0 },
    chests: { type: Number, default: 0 },
    championShards: { type: Array, default: [] },
    skinShards: { type: Array, default: [] },
    ownedChampions: { type: Array, default: [] },
    ownedSkins: { type: Array, default: [] },
    lastDaily: { type: Number, default: 0 },
    // Hint Timestamps
    lastHint: { type: Number, default: 0 }, 
    lastMeow: { type: Number, default: 0 }, 
    lastUwu: { type: Number, default: 0 },  
    last7u7: { type: Number, default: 0 }   
});

const Player = mongoose.model('Player', playerSchema);

// --- GLOBAL STATE ---
const activeGames = new Map();
const serverCooldowns = new Map();
const pendingTrades = new Map();

// --- CONFIG & CONSTANTS ---
const RARITIES = {
    COMMON: { name: 'Common', color: '#95A5A6', disenchant: 104, craftCost: 220 },   
    EPIC: { name: 'Epic', color: '#00D9FF', disenchant: 270, craftCost: 1050 },      
    LEGENDARY: { name: 'Legendary', color: '#E67E22', disenchant: 364, craftCost: 1520 }, 
    ULTIMATE: { name: 'Ultimate', color: '#E74C3C', disenchant: 650, craftCost: 2950 }    
};

const BE_TIERS = [450, 1350, 3150, 4800, 6300];

const CHAMPION_COSTS = {
    450: { be: 450, disenchant: 90, upgrade: 270 },
    1350: { be: 1350, disenchant: 270, upgrade: 810 },
    3150: { be: 3150, disenchant: 630, upgrade: 1890 },
    4800: { be: 4800, disenchant: 960, upgrade: 2880 },
    6300: { be: 6300, disenchant: 1260, upgrade: 3780 }
};

const GAME_MODES = {
    ability: { name: 'Ability', emoji: '⚡' },
    splash: { name: 'Splash Art', emoji: '🎨' },
    skin: { name: 'Skin', emoji: '👗' }
};

const DIFFICULTIES = {
    easy: { time: 45000, basePoints: 2, pixelateBonus: 3, emoji: '🟢', name: 'Easy' },
    normal: { time: 30000, basePoints: 5, pixelateBonus: 5, emoji: '🟡', name: 'Normal' },
    hard: { time: 20000, basePoints: 8, pixelateBonus: 7, emoji: '🔴', name: 'Hard' },
    v2: { time: 30000, basePoints: 12, pixelateBonus: 8, emoji: '🔵', name: 'V2 (Key)', answerType: 'key' },
    v3: { time: 30000, basePoints: 15, pixelateBonus: 10, emoji: '🟣', name: 'V3 (Name)', answerType: 'name' }
};

// --- ROLES & META DATA (For Autofill) ---
const ROLES = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];
const ROLE_EMOJIS = {
    'Top': '🛡️',
    'Jungle': '🌲',
    'Mid': '🧙',
    'ADC': '🏹',
    'Support': '❤️'
};

const ROLE_ALIASES = {
    'top': 'Top', 't': 'Top',
    'jungle': 'Jungle', 'jg': 'Jungle', 'jng': 'Jungle', 'jung': 'Jungle',
    'mid': 'Mid', 'middle': 'Mid', 'm': 'Mid',
    'adc': 'ADC', 'bot': 'ADC', 'bottom': 'ADC', 'ad': 'ADC',
    'support': 'Support', 'sup': 'Support', 'supp': 'Support', 'sp': 'Support'
};

// Curated list to ensure "Respect the champs that have to play each role"
const ROLE_CHAMPIONS = {
    'Top': ['Ambessa','Aatrox', 'Camille', 'Darius', 'Fiora', 'Garen', 'Gnar', 'Illaoi', 'Irelia', 'Jax', 'Jayce', 'KSante', 'Kennen', 'Kled', 'Malphite', 'Mordekaiser', 'Nasus', 'Ornn', 'Pantheon', 'Poppy', 'Renekton', 'Riven', 'Rumble', 'Sett', 'Shen', 'Sion', 'Teemo', 'Tryndamere', 'Urgot', 'Volibear', 'Yone', 'Yorick','Zaahen'],
    'Jungle': ['Ambessa','Amumu', 'BelVeth', 'Briar', 'Diana', 'Ekko', 'Elise', 'Evelynn', 'Fiddlesticks', 'Gragas', 'Graves', 'Hecarim', 'JarvanIV', 'Karthus', 'Kayn', 'KhaZix', 'Kindred', 'LeeSin', 'Lillia', 'MasterYi', 'Nidalee', 'Nocturne', 'Nunu', 'Rammus', 'Rengar', 'Sejuani', 'Shaco', 'Viego', 'Vi', 'Warwick', 'XinZhao', 'Zac','Zaahen'],
    'Mid': ['Aurora','Mel','Ahri', 'Akali', 'Anivia', 'Annie', 'AurelionSol', 'Azir', 'Cassiopeia', 'Corki', 'Fizz', 'Galio', 'Hwei', 'Irelia', 'Kassadin', 'Katarina', 'LeBlanc', 'Lissandra', 'Lux', 'Malzahar', 'Naafiri', 'Neeko', 'Orianna', 'Qiyana', 'Ryze', 'Sylas', 'Syndra', 'Talon', 'TwistedFate', 'Veigar', 'Vex', 'Viktor', 'Vladimir', 'Xerath', 'Yasuo', 'Yone', 'Zed', 'Zoe'],
    'ADC': ['Mel','Aphelios', 'Ashe', 'Caitlyn', 'Draven', 'Ezreal', 'Jhin', 'Jinx', 'KaiSa', 'Kalista', 'KogMaw', 'Lucian', 'MissFortune', 'Nilah', 'Samira', 'Sivir', 'Smolder', 'Tristana', 'Twitch', 'Varus', 'Vayne', 'Xayah', 'Zeri', 'Ziggs','Yunara'],
    'Support': ['Mel','Alistar', 'Bard', 'Blitzcrank', 'Braum', 'Janna', 'Karma', 'Leona', 'Lulu', 'Lux', 'Maokai', 'Milio', 'Morgana', 'Nami', 'Nautilus', 'Pyke', 'Rakan', 'Rell', 'Renata', 'Senna', 'Seraphine', 'Sona', 'Soraka', 'Swain', 'TahmKench', 'Taric', 'Thresh', 'VelKoz', 'Xerath', 'Yuumi', 'Zilean', 'Zyra']
};

// --- RIOT DATA DRAGON ---
let DD_VERSION = '14.1.1';
let DD_BASE = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}`;
let championData = null;
let championList = [];
let championSkins = {};

async function getLatestVersion() {
    try {
        const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        return response.data[0];
    } catch (error) {
        return '14.1.1';
    }
}

async function loadChampionData() {
    try {
        DD_VERSION = await getLatestVersion();
        DD_BASE = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}`;
        console.log(`Using Data Dragon version: ${DD_VERSION}`);
        
        const response = await axios.get(`${DD_BASE}/data/en_US/champion.json`);
        championData = response.data.data;
        championList = Object.keys(championData);
        championList.sort(); 
        console.log(`✅ Loaded ${championList.length} champions`);
    } catch (error) {
        console.error('Error loading champion data:', error);
    }
}

async function getChampionDetails(championKey) {
    try {
        const response = await axios.get(`${DD_BASE}/data/en_US/champion/${championKey}.json`);
        const details = response.data.data[championKey];
        if (!championSkins[championKey]) {
            championSkins[championKey] = details.skins;
        }
        return details;
    } catch (error) {
        return null;
    }
}

function getChampionIconUrl(championKey) {
    return `${DD_BASE}/img/champion/${championKey}.png`;
}

function getSkinSplashUrl(championKey, skinNum) {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championKey}_${skinNum}.jpg`;
}

function getSkinCenteredUrl(championKey, skinNum) {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${championKey}_${skinNum}.jpg`;
}

function getChampionPrice(championId) {
    let hash = 0;
    for (let i = 0; i < championId.length; i++) {
        hash = championId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % BE_TIERS.length;
    return BE_TIERS[index];
}

// --- HELPERS ---
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function parseRoles(text) {
    const words = text.split(/[\s,]+/); // Split by space or comma
    const foundRoles = new Set();
    words.forEach(w => {
        const clean = w.toLowerCase().trim();
        if (ROLE_ALIASES[clean]) {
            foundRoles.add(ROLE_ALIASES[clean]);
        }
    });
    return Array.from(foundRoles);
}

// --- DATABASE HELPERS ---
async function initPlayer(userId, username) {
    let player = await Player.findOne({ userId });
    if (!player) {
        player = new Player({ userId, username });
        await player.save();
    } else {
        if (username && player.username !== username) {
            player.username = username;
            await player.save();
        }
    }
    return player;
}

async function updateScore(userId, username, timeTaken, basePoints, streakMultiplier = 1) {
    const player = await initPlayer(userId, username);
    
    const pointsEarned = Math.floor(basePoints * streakMultiplier);
    const previousPoints = player.totalPoints;
    
    player.wins += 1;
    player.gamesPlayed += 1;
    player.totalTime += timeTaken;
    player.totalPoints += pointsEarned;
    
    const BE_THRESHOLD = 50;
    const previousBEThresholds = Math.floor(previousPoints / BE_THRESHOLD);
    const currentBEThresholds = Math.floor(player.totalPoints / BE_THRESHOLD);
    const beEarned = (currentBEThresholds - previousBEThresholds) * 2500;
    player.blueEssence += beEarned;
    
    const CHEST_THRESHOLD = 20;
    const previousChestThresholds = Math.floor(previousPoints / CHEST_THRESHOLD);
    const currentChestThresholds = Math.floor(player.totalPoints / CHEST_THRESHOLD);
    const chestsEarned = currentChestThresholds - previousChestThresholds;
    player.chests += chestsEarned;
    
    await player.save();
    return { pointsEarned, beEarned, chestsEarned };
}

// --- IMAGE PROCESSING ---
function pixelateImage(canvas, ctx, image, pixelSize) {
    const width = canvas.width;
    const height = canvas.height;
    const tempCanvas = Canvas.createCanvas(Math.ceil(width / pixelSize), Math.ceil(height / pixelSize));
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
    tempCtx.drawImage(image, 0, 0, width, height, 0, 0, tempCanvas.width, tempCanvas.height);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, width, height);
}

async function processImage(imageUrl, mode, difficulty, pixelate = false) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const image = await Canvas.loadImage(Buffer.from(response.data));
        
        if (mode === 'splash' || mode === 'skin') {
            const canvas = Canvas.createCanvas(400, 400);
            const ctx = canvas.getContext('2d');
            const zoomLevels = { easy: 2.5, normal: 4.0, hard: 6.0 };
            const zoom = zoomLevels[difficulty] || 4.0;
            const cropSize = Math.min(image.width, image.height) / zoom;
            const maxX = Math.max(0, image.width - cropSize);
            const maxY = Math.max(0, image.height - cropSize);
            const cropX = Math.floor(Math.random() * maxX);
            const cropY = Math.floor(Math.random() * maxY);
            ctx.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, 400, 400);
            if (pixelate) {
                const pixelSizes = { easy: 10, normal: 14, hard: 18 };
                pixelateImage(canvas, ctx, canvas, pixelSizes[difficulty] || 14);
            }
            return canvas.toBuffer();
        } else if (mode === 'ability' && pixelate) {
            const canvas = Canvas.createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const pixelSizes = { easy: 8, normal: 12, hard: 16, v2: 12, v3: 12 };
            pixelateImage(canvas, ctx, canvas, pixelSizes[difficulty] || 12);
            return canvas.toBuffer();
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function getRandomContent(mode, difficulty, pixelate = false) {
    const randomChamp = championList[Math.floor(Math.random() * championList.length)];
    const champDetails = await getChampionDetails(randomChamp);
    if (!champDetails) return null;
    
    let imageUrl, contentType, abilityKey, abilityName, processedImage = null;
    
    if (mode === 'ability') {
        const abilityIndex = Math.floor(Math.random() * 5);
        let ability;
        if (abilityIndex === 0) {
            ability = champDetails.passive;
            abilityKey = 'Passive';
            abilityName = ability.name;
        } else {
            ability = champDetails.spells[abilityIndex - 1];
            abilityKey = ['Q', 'W', 'E', 'R'][abilityIndex - 1];
            abilityName = ability.name;
        }
        imageUrl = abilityIndex === 0 ? `${DD_BASE}/img/passive/${ability.image.full}` : `${DD_BASE}/img/spell/${ability.image.full}`;
        if (pixelate) processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
        contentType = abilityKey;
    } else if (mode === 'splash') {
        imageUrl = getSkinSplashUrl(randomChamp, 0);
        processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
    } else if (mode === 'skin') {
        const skins = champDetails.skins.filter(s => s.num !== 0);
        if (skins.length === 0) {
            imageUrl = getSkinSplashUrl(randomChamp, 0);
        } else {
            const randomSkin = skins[Math.floor(Math.random() * skins.length)];
            imageUrl = getSkinSplashUrl(randomChamp, randomSkin.num);
        }
        processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
    }
    
    return {
        champion: champDetails.name,
        championKey: randomChamp,
        imageUrl, processedImage, contentType, abilityKey, abilityName,
        tags: champDetails.tags,
        title: champDetails.title
    };
}

// --- GAME LOGIC ---
function normalizeAnswer(text) {
    return text.toLowerCase().replace(/['\s.-]/g, '').replace(/&/g, 'and');
}

function getStreakMultiplier(streak) {
    if (streak < 3) return 1;
    if (streak < 5) return 1.5;
    if (streak < 10) return 2;
    return 2.5;
}

function cleanupGame(channelId, guildId) {
    const game = activeGames.get(channelId);
    if (game) {
        if (game.timeoutId) clearTimeout(game.timeoutId);
    }
    if (guildId) serverCooldowns.delete(guildId);
    activeGames.delete(channelId);
}

function getEliminationChances(difficulty, pixelate) {
    if (difficulty === 'v2' || difficulty === 'v3') return 3;
    if (pixelate) return 2;
    return 1;
}

async function startGame(interaction, mode, difficulty, pixelate, elimination = false) {
    const channelId = interaction.channel.id;
    const guildId = interaction.guild?.id;
    
    if (activeGames.has(channelId)) {
        return interaction.reply({ content: '❌ Game already active!', flags: MessageFlags.Ephemeral });
    }
    
    if (guildId && serverCooldowns.has(guildId)) {
        const timeLeft = Math.ceil((serverCooldowns.get(guildId) - Date.now()) / 1000);
        if (timeLeft > 0) {
            return interaction.reply({ content: `⏱️ Wait ${timeLeft}s!`, flags: MessageFlags.Ephemeral });
        }
    }
    
    if (!interaction.deferred) await interaction.deferReply();
    
    const difficultyData = DIFFICULTIES[difficulty];
    const modeData = GAME_MODES[mode];
    const content = await getRandomContent(mode, difficulty, pixelate);
    if (!content) return interaction.editReply('❌ Failed to load data');
    
    const points = pixelate ? (difficultyData.basePoints + difficultyData.pixelateBonus) : difficultyData.basePoints;
    
    let description = `Guess the champion!\n**Difficulty:** ${difficultyData.emoji} ${difficultyData.name}\n**Time:** ${difficultyData.time/1000}s\n**Points:** ${points} 🏆`;
    if (pixelate) description += '\n**Mode:** 🔲 Pixelated';
    if (elimination) {
        const chances = getEliminationChances(difficulty, pixelate);
        description += `\n**⚠️ Elimination:** On (${chances} chance${chances>1?'s':''})`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`${modeData.emoji} ${modeData.name} Guessing Game`)
        .setDescription(description)
        .setColor('#0099ff');
    
    let files = [];
    if (content.processedImage) {
        const attachment = new AttachmentBuilder(content.processedImage, { name: 'champion.png' });
        embed.setImage('attachment://champion.png');
        files.push(attachment);
    } else {
        embed.setImage(content.imageUrl);
    }
    
    if (mode === 'ability' && difficulty !== 'v2' && difficulty !== 'v3') {
        embed.setFooter({ text: `Ability: ${content.contentType}` });
    }
    
    await interaction.editReply({ embeds: [embed], files });
    
    let correctAnswer = content.champion;
    let normalizedAnswers = [normalizeAnswer(content.champion)];
    
    if (mode === 'ability') {
        if (difficulty === 'v2') {
            correctAnswer = `${content.champion} ${content.abilityKey}`;
            normalizedAnswers = [normalizeAnswer(correctAnswer)];
        } else if (difficulty === 'v3') {
            correctAnswer = `${content.champion} ${content.abilityName}`;
            normalizedAnswers = [normalizeAnswer(correctAnswer)];
        }
    }
    
    const gameData = {
        answer: correctAnswer, normalizedAnswers, champion: content.champion,
        startTime: Date.now(), timeLimit: difficultyData.time, participants: new Set(),
        mode, difficulty, points, hintGiven: false, tags: content.tags, title: content.title,
        imageUrl: content.imageUrl, answerType: difficultyData.answerType || 'champion',
        pixelate, 
        elimination,
        maxChances: elimination ? getEliminationChances(difficulty, pixelate) : 999,
        wrongGuesses: new Map(),
        eliminatedUsers: new Set(),
        timeoutId: null
    };
    
    activeGames.set(channelId, gameData);
    if (guildId) serverCooldowns.set(guildId, Date.now() + 5000);
    
    gameData.timeoutId = setTimeout(async () => {
        if (activeGames.has(channelId)) {
            cleanupGame(channelId, guildId);
            try {
                await interaction.followUp({ embeds: [new EmbedBuilder().setTitle('⏱️ Time\'s up!').setDescription(`Answer: **${correctAnswer}**`).setColor('#ff0000')] });
            } catch (e) {}
        }
    }, gameData.timeLimit);
}

async function checkGuess(message) {
    if (!activeGames.has(message.channel.id)) return;
    
    const game = activeGames.get(message.channel.id);
    const userGuess = normalizeAnswer(message.content);
    
    // Ignore if already answered correctly or eliminated
    if (game.participants.has(message.author.id)) return;
    if (game.eliminatedUsers.has(message.author.id)) return;
    
    const isCorrect = game.normalizedAnswers.some(answer => userGuess === answer);
    const player = await initPlayer(message.author.id, message.author.username);
    
    if (isCorrect) {
        game.participants.add(message.author.id);
        await message.react('✅');
        
        const timeTaken = parseFloat(((Date.now() - game.startTime) / 1000).toFixed(1));
        
        player.currentStreak = (player.currentStreak || 0) + 1;
        if (player.currentStreak > player.maxStreak) {
            player.maxStreak = player.currentStreak;
        }
        await player.save();
        
        const streakMultiplier = getStreakMultiplier(player.currentStreak);
        const rewards = await updateScore(message.author.id, message.author.username, timeTaken, game.points, streakMultiplier);
        
        const updatedPlayer = await Player.findOne({ userId: message.author.id });
        
        let rewardText = `**Points:** +${rewards.pointsEarned} 🏆`;
        if (rewards.beEarned > 0) rewardText += `\n**💎 Blue Essence:** +${rewards.beEarned}`;
        if (rewards.chestsEarned > 0) rewardText += `\n**🎁 Hextech Chest:** +${rewards.chestsEarned} (Total: ${updatedPlayer.chests})`;
        if (game.pixelate) rewardText += `\n🔲 **Pixelated Bonus!**`;
        if (updatedPlayer.currentStreak >= 3) rewardText += `\n🔥 **${updatedPlayer.currentStreak} win streak!** (${streakMultiplier}x)`;
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 Correct!')
            .setDescription(`<@${message.author.id}> guessed **${game.answer}** in ${timeTaken}s!\n${rewardText}\n**Total Points:** ${updatedPlayer.totalPoints} pts`)
            .setColor('#00ff00');
        
        await message.channel.send({ embeds: [embed] });
        cleanupGame(message.channel.id, message.guild?.id);
    } else {
        // Wrong Guess Logic
        const isChampName = championList.some(c => normalizeAnswer(championData[c].name) === userGuess);
        if (isChampName || (message.content.split(' ').length <= 3)) {
            await message.react('❌');
            
            // Streak reset logic
            player.currentStreak = 0;
            await player.save();

            // Elimination Logic
            if (game.elimination) {
                const currentWrongs = (game.wrongGuesses.get(message.author.id) || 0) + 1;
                game.wrongGuesses.set(message.author.id, currentWrongs);
                
                if (currentWrongs >= game.maxChances) {
                    game.eliminatedUsers.add(message.author.id);
                    // Public message instead of skull reaction
                    await message.channel.send(`Oopsie, <@${message.author.id}> just got eliminated :c`);
                }
            }
        }
    }
}

// --- STORE SYSTEM (New) ---
async function createStoreEmbed(player, page) {
    const unownedChamps = championList.filter(cId => 
        !player.ownedChampions.some(owned => owned.id === cId)
    );
    
    const ITEMS_PER_PAGE = 5;
    const totalPages = Math.ceil(unownedChamps.length / ITEMS_PER_PAGE) || 1;
    const currentPage = Math.max(1, Math.min(page, totalPages));
    
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = unownedChamps.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    
    const embed = new EmbedBuilder()
        .setTitle('🛍️ Blue Essence Store')
        .setColor('#0ACDFF')
        .setFooter({ text: `Page ${currentPage}/${totalPages} | You have 💎 ${player.blueEssence} BE` });
        
    if (pageItems.length === 0) {
        embed.setDescription('🎉 You own all champions!');
    } else {
        let desc = '';
        for (const cId of pageItems) {
            const name = championData[cId].name;
            const cost = getChampionPrice(cId);
            desc += `**${name}**\n💎 ${cost} BE\n\n`;
        }
        embed.setDescription(desc);
        if(pageItems[0]) embed.setThumbnail(getChampionIconUrl(pageItems[0]));
    }
    
    return { embed, totalPages, currentPage };
}

function createStoreButtons(currentPage, totalPages, userId) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`store_prev_${currentPage}_${userId}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`store_next_${currentPage}_${userId}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages)
    );
    return row;
}

function findChampionByName(input) {
    const search = normalizeAnswer(input);
    const exact = championList.find(c => normalizeAnswer(championData[c].name) === search);
    if (exact) return exact;
    return championList.find(c => normalizeAnswer(championData[c].name).startsWith(search));
}

// --- INVENTORY & OTHER UI ---
async function createInventoryEmbed(player, page, type) {
    const items = type === 'champions' ? player.championShards : 
                  type === 'skins' ? player.skinShards :
                  type === 'owned_champs' ? player.ownedChampions :
                  player.ownedSkins;
    
    const totalPages = Math.max(1, items.length);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const itemIndex = currentPage - 1;
    const item = items[itemIndex];
    
    const embed = new EmbedBuilder()
        .setFooter({ text: `💎 ${player.blueEssence} BE | 🔶 ${player.orangeEssence} OE | 🎁 ${player.chests} Chests | Card ${currentPage}/${totalPages}` });
    
    if (!item) {
        embed.setTitle(type.includes('skins') ? '✨ Skin Inventory' : '🔹 Champion Inventory');
        embed.setDescription('*Inventory is empty*');
        embed.setColor('#2C2F33');
        return { embed, totalPages, currentPage };
    }

    if (type === 'champions') {
        embed.setTitle(`🔹 Champion Shard #${currentPage}`);
        embed.setDescription(`## ${item.name}\n\n**Unlock Cost:** 💎 ${item.beCost} BE\n**Disenchant:** 💎 ${CHAMPION_COSTS[item.storePrice]?.disenchant || 90} BE`);
        embed.setThumbnail(getChampionIconUrl(item.id));
        embed.setColor('#0099ff');
    } 
    else if (type === 'skins') {
        const rarity = RARITIES[item.rarity];
        embed.setTitle(`✨ Skin Shard #${currentPage}`);
        embed.setDescription(`## ${item.championName} - ${item.skinName}\n\n**Rarity:** ${rarity.name}\n**Unlock Cost:** 🔶 ${rarity.craftCost} OE\n**Disenchant:** 🔶 ${rarity.disenchant} OE`);
        embed.setImage(getSkinCenteredUrl(item.championId, item.skinNum));
        embed.setColor(rarity.color);
    } 
    else if (type === 'owned_champs') {
        embed.setTitle(`🔹 Owned Champion #${currentPage}`);
        embed.setDescription(`## ${item.name}\n✅ Unlocked`);
        embed.setImage(getSkinSplashUrl(item.id, 0)); 
        embed.setThumbnail(getChampionIconUrl(item.id));
        embed.setColor('#2ecc71');
    } 
    else if (type === 'owned_skins') {
        embed.setTitle(`✨ Owned Skin #${currentPage}`);
        embed.setDescription(`## ${item.championName} - ${item.skinName}\n✅ Unlocked`);
        embed.setImage(getSkinCenteredUrl(item.championId, item.skinNum));
        embed.setColor('#9B59B6');
    }
    
    return { embed, totalPages, currentPage };
}


function createNavigationButtons(currentPage, totalPages, type, userId) {
    const row = new ActionRowBuilder();
    row.addComponents(
        new ButtonBuilder()
            .setCustomId(`inv_prev_${type}_${currentPage}_${userId}`)
            .setLabel('◀️ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage <= 1),
        new ButtonBuilder()
            .setCustomId(`inv_next_${type}_${currentPage}_${userId}`)
            .setLabel('Next ▶️')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages)
    );
    return row;
}

function createCategoryButtons(userId) {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`inv_cat_champions_${userId}`)
            .setLabel('🔹 Champion Shards')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`inv_cat_skins_${userId}`)
            .setLabel('✨ Skin Shards')
            .setStyle(ButtonStyle.Secondary)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`inv_cat_owned_champs_${userId}`)
            .setLabel('🔹 Owned Champions')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`inv_cat_owned_skins_${userId}`)
            .setLabel('✨ Owned Skins')
            .setStyle(ButtonStyle.Success)
    );
    return [row1, row2];
}

// --- TRADE SYSTEM ---
function createTradeButtons(tradeId) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`trade_accept_${tradeId}`)
            .setLabel('✅ Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`trade_decline_${tradeId}`)
            .setLabel('❌ Decline')
            .setStyle(ButtonStyle.Danger)
    );
    return row;
}

async function initiateTrade(message, targetUser, offererItemIndex, targetItemIndex, tradeType) {
    const offerer = await Player.findOne({ userId: message.author.id });
    const target = await Player.findOne({ userId: targetUser.id });
    
    if (!offerer) return message.reply('❌ You have no data!');
    if (!target) return message.reply('❌ Target player has no data!');
    
    const offererItems = tradeType === 'skin' ? offerer.ownedSkins : offerer.ownedChampions;
    const targetItems = tradeType === 'skin' ? target.ownedSkins : target.ownedChampions;
    
    if (offererItemIndex < 1 || offererItemIndex > offererItems.length) {
        return message.reply(`❌ Invalid ${tradeType} index! You have ${offererItems.length} owned ${tradeType}s.`);
    }
    if (targetItemIndex < 1 || targetItemIndex > targetItems.length) {
        return message.reply(`❌ Invalid target ${tradeType} index! They have ${targetItems.length} owned ${tradeType}s.`);
    }
    
    const offererItem = offererItems[offererItemIndex - 1];
    const targetItem = targetItems[targetItemIndex - 1];
    
    const existingTrade = Array.from(pendingTrades.values()).find(
        t => (t.offererId === message.author.id && t.targetId === targetUser.id) ||
             (t.offererId === targetUser.id && t.targetId === message.author.id)
    );
    
    if (existingTrade) {
        return message.reply('❌ You already have a pending trade with this player!');
    }
    
    const tradeId = `${message.author.id}_${targetUser.id}_${Date.now()}`;
    const trade = {
        id: tradeId,
        offererId: message.author.id,
        offererName: message.author.username,
        targetId: targetUser.id,
        targetName: targetUser.username,
        offererItem: offererItem,
        offererItemId: offererItem.id, 
        offererItemIndex: offererItemIndex - 1,
        targetItem: targetItem,
        targetItemId: targetItem.id, 
        targetItemIndex: targetItemIndex - 1,
        tradeType: tradeType,
        timestamp: Date.now(),
        guildId: message.guild.id
    };
    
    pendingTrades.set(tradeId, trade);
    
    const embed = new EmbedBuilder()
        .setTitle(`🔄 ${tradeType === 'skin' ? 'Skin' : 'Champion'} Trade Offer`)
        .setDescription(`**${message.author.username}** wants to trade with **${targetUser.username}**!`)
        .setColor('#FFD700')
        .setFooter({ text: `Trade expires in 5 minutes | Only ${targetUser.username} can accept/decline` });
    
    if (tradeType === 'skin') {
        const offererSkinUrl = getSkinCenteredUrl(offererItem.championId, offererItem.skinNum);
        embed.addFields(
            { 
                name: `📤 ${message.author.username} offers:`, 
                value: `${offererItem.championName} - ${offererItem.skinName}`,
                inline: true 
            },
            { 
                name: `📥 ${targetUser.username} gives:`, 
                value: `${targetItem.championName} - ${targetItem.skinName}`,
                inline: true 
            }
        );
        embed.setThumbnail(offererSkinUrl);
    } else {
        const offererChampIcon = getChampionIconUrl(offererItem.id);
        embed.addFields(
            { 
                name: `📤 ${message.author.username} offers:`, 
                value: offererItem.name,
                inline: true 
            },
            { 
                name: `📥 ${targetUser.username} gives:`, 
                value: targetItem.name,
                inline: true 
            }
        );
        embed.setThumbnail(offererChampIcon);
    }
    
    const buttons = createTradeButtons(tradeId);
    await message.reply({ content: `<@${targetUser.id}>`, embeds: [embed], components: [buttons] });
    
    setTimeout(() => {
        if (pendingTrades.has(tradeId)) {
            pendingTrades.delete(tradeId);
        }
    }, 5 * 60 * 1000);
}

async function acceptTrade(interaction, tradeId) {
    const trade = pendingTrades.get(tradeId);
    
    if (!trade) {
        return interaction.reply({ content: '❌ Trade expired or no longer exists!', flags: MessageFlags.Ephemeral });
    }
    
    if (interaction.user.id !== trade.targetId) {
        return interaction.reply({ content: '❌ Only the trade recipient can accept this trade!', flags: MessageFlags.Ephemeral });
    }
    
    const offerer = await Player.findOne({ userId: trade.offererId });
    const target = await Player.findOne({ userId: trade.targetId });
    
    if (!offerer || !target) {
        pendingTrades.delete(tradeId);
        return interaction.reply({ content: '❌ Player data not found!', flags: MessageFlags.Ephemeral });
    }
    
    const offererItems = trade.tradeType === 'skin' ? offerer.ownedSkins : offerer.ownedChampions;
    const targetItems = trade.tradeType === 'skin' ? target.ownedSkins : target.ownedChampions;
    
    if (!offererItems[trade.offererItemIndex] || !targetItems[trade.targetItemIndex]) {
        pendingTrades.delete(tradeId);
        return interaction.reply({ content: '❌ One of the items is no longer available!', flags: MessageFlags.Ephemeral });
    }

    const currentOffererItem = offererItems[trade.offererItemIndex];
    const currentTargetItem = targetItems[trade.targetItemIndex];

    if (currentOffererItem.id !== trade.offererItemId || currentTargetItem.id !== trade.targetItemId) {
        pendingTrades.delete(tradeId);
        return interaction.reply({ content: '❌ Inventory has changed since the trade was proposed!', flags: MessageFlags.Ephemeral });
    }
    
    const tradedOffererItem = offererItems.splice(trade.offererItemIndex, 1)[0];
    const tradedTargetItem = targetItems.splice(trade.targetItemIndex, 1)[0];
    
    offererItems.push(tradedTargetItem);
    targetItems.push(tradedOffererItem);
    
    await offerer.save();
    await target.save();
    pendingTrades.delete(tradeId);
    
    const getNiceName = (item, type) => type === 'skin' ? `${item.championName} - ${item.skinName}` : item.name;
    const offererItemName = getNiceName(tradedOffererItem, trade.tradeType);
    const targetItemName = getNiceName(tradedTargetItem, trade.tradeType);

    const cuteMessage = `<@${trade.offererId}> The trade was accepted by <@${trade.targetId}>! ✨\nHope you enjoy the **${targetItemName}** ${trade.tradeType}! (And <@${trade.targetId}>, enjoy your **${offererItemName}**! 🤝)`;

    const embed = new EmbedBuilder()
        .setTitle('🤝 Trade Completed!')
        .setDescription(`Successfully swapped **${offererItemName}** for **${targetItemName}**.`)
        .setColor('#00ff00')
        .setFooter({ text: 'Enjoy your new loot, Summoners!' });

    if (trade.tradeType === 'skin') {
        const newSkinUrl = getSkinCenteredUrl(tradedTargetItem.championId, tradedTargetItem.skinNum);
        embed.setThumbnail(newSkinUrl);
    }
    
    await interaction.update({ content: cuteMessage, embeds: [embed], components: [] });
}

async function declineTrade(interaction, tradeId) {
    const trade = pendingTrades.get(tradeId);
    if (!trade) return interaction.reply({ content: '❌ Trade expired!', flags: MessageFlags.Ephemeral });
    
    if (interaction.user.id !== trade.targetId) {
        return interaction.reply({ content: '❌ Not your trade!', flags: MessageFlags.Ephemeral });
    }
    
    pendingTrades.delete(tradeId);
    const sadMessage = `<@${trade.offererId}> Sorry, it seems like <@${trade.targetId}> didn't want to trade :c`;
    const embed = new EmbedBuilder().setTitle('💔 Trade Declined').setDescription(`**${trade.targetName}** turned down the offer.`).setColor('#ff0000');
    await interaction.update({ content: sadMessage, embeds: [embed], components: [] });
}

// --- CHESTS & DAILY ---
async function openChest(userId) {
    const player = await Player.findOne({ userId });
    if (!player || player.chests < 1) {
        return null;
    }
    
    player.chests -= 1;
    
    const isChampion = Math.random() < 0.4;
    
    if (isChampion) {
        const randomChamp = championList[Math.floor(Math.random() * championList.length)];
        const champInfo = championData[randomChamp];
        
        const beValues = [450, 1350, 3150, 4800, 6300];
        const beCost = beValues[Math.floor(Math.random() * beValues.length)];
        const upgradeCost = CHAMPION_COSTS[beCost].upgrade;
        
        player.championShards.push({
            id: randomChamp,
            name: champInfo.name,
            beCost: upgradeCost,
            storePrice: beCost
        });
        
        await player.save();
        return { type: 'champion', data: player.championShards[player.championShards.length - 1] };
    } else {
        const randomChamp = championList[Math.floor(Math.random() * championList.length)];
        const champDetails = await getChampionDetails(randomChamp);
        
        if (champDetails && champDetails.skins.length > 0) {
            const skins = champDetails.skins.filter(s => s.num !== 0);
            if (skins.length === 0) return openChest(userId);
            
            const randomSkin = skins[Math.floor(Math.random() * skins.length)];
            
            const rarityRoll = Math.random();
            let rarity;
            if (rarityRoll < 0.60) rarity = 'COMMON';
            else if (rarityRoll < 0.85) rarity = 'EPIC';
            else if (rarityRoll < 0.97) rarity = 'LEGENDARY';
            else rarity = 'ULTIMATE';
            
            const skinShard = {
                id: `${randomChamp}_${randomSkin.num}`,
                championId: randomChamp,
                championName: champDetails.name,
                skinName: randomSkin.name,
                skinNum: randomSkin.num,
                rarity: rarity
            };
            
            player.skinShards.push(skinShard);
            await player.save();
            return { type: 'skin', data: skinShard };
        }
    }
    return null;
}

async function claimDaily(userId, username) {
    const player = await initPlayer(userId, username);
    const now = Date.now();
    
    const today = new Date();
    today.setHours(8, 0, 0, 0);
    
    const lastClaim = player.lastDaily ? new Date(player.lastDaily) : null;
    const lastClaimDate = lastClaim ? new Date(lastClaim) : null;
    if (lastClaimDate) {
        lastClaimDate.setHours(8, 0, 0, 0);
    }
    
    if (lastClaimDate && lastClaimDate.getTime() === today.getTime() && now >= today.getTime()) {
        const nextReset = new Date(today);
        if (now >= today.getTime()) nextReset.setDate(nextReset.getDate() + 1);
        const timeLeft = nextReset.getTime() - now;
        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
        const minsLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
        return { success: false, timeLeft: `${hoursLeft}h ${minsLeft}m` };
    }
    
    player.lastDaily = now;
    
    const rewards = [];
    const roll = Math.random();
    
    if (roll < 0.30) {
        player.chests += 1;
        rewards.push('🎁 1 Hextech Chest');
    } else if (roll < 0.60) {
        const be = Math.floor(Math.random() * 500) + 200;
        player.blueEssence += be;
        rewards.push(`💎 ${be} Blue Essence`);
    } else if (roll < 0.85) {
        const oe = Math.floor(Math.random() * 300) + 100;
        player.orangeEssence += oe;
        rewards.push(`🔶 ${oe} Orange Essence`);
    } else {
        const be = Math.floor(Math.random() * 300) + 150;
        const oe = Math.floor(Math.random() * 200) + 50;
        player.blueEssence += be;
        player.orangeEssence += oe;
        rewards.push(`💎 ${be} BE + 🔶 ${oe} OE`);
    }
    
    await player.save();
    return { success: true, rewards };
}

// --- SLASH COMMAND REGISTRATION ---
async function registerCommands() {
    if (!process.env.CLIENT_ID) return;

    const commands = [
        new SlashCommandBuilder().setName('guess-ability').setDescription('Guess from ability').addStringOption(o => o.setName('difficulty').setDescription('Difficulty').addChoices({ name: '🟢 Easy (2pts | +3 pix = 5pts)', value: 'easy' }, { name: '🟡 Normal (5pts | +5 pix = 10pts)', value: 'normal' }, { name: '🔴 Hard (8pts | +7 pix = 15pts)', value: 'hard' }, { name: '🔵 V2 (12pts | +8 pix = 20pts)', value: 'v2' }, { name: '🟣 V3 (15pts | +10 pix = 25pts)', value: 'v3' })).addBooleanOption(o => o.setName('pixelated').setDescription('Pixelated mode')).addBooleanOption(o => o.setName('elimination').setDescription('Enable Elimination Mode (Limited guesses)')),
        new SlashCommandBuilder().setName('guess-splash').setDescription('Guess from splash').addStringOption(o => o.setName('difficulty').setDescription('Difficulty').addChoices({ name: '🟢 Easy', value: 'easy' }, { name: '🟡 Normal', value: 'normal' }, { name: '🔴 Hard', value: 'hard' })).addBooleanOption(o => o.setName('pixelated').setDescription('Pixelated mode')).addBooleanOption(o => o.setName('elimination').setDescription('Enable Elimination Mode')),
        new SlashCommandBuilder().setName('guess-skin').setDescription('Guess from skin').addStringOption(o => o.setName('difficulty').setDescription('Difficulty').addChoices({ name: '🟢 Easy', value: 'easy' }, { name: '🟡 Normal', value: 'normal' }, { name: '🔴 Hard', value: 'hard' })).addBooleanOption(o => o.setName('pixelated').setDescription('Pixelated mode')).addBooleanOption(o => o.setName('elimination').setDescription('Enable Elimination Mode')),
        
        new SlashCommandBuilder().setName('profile').setDescription('View your profile').addUserOption(o => o.setName('user').setDescription('User to view')),
        new SlashCommandBuilder().setName('inventory').setDescription('View your inventory'),
        new SlashCommandBuilder().setName('store').setDescription('View champion store'),
        new SlashCommandBuilder().setName('buy').setDescription('Buy a champion').addStringOption(o => o.setName('champion').setDescription('Champion Name').setRequired(true)),
        new SlashCommandBuilder().setName('open-chest').setDescription('Open a Hextech Chest'),
        new SlashCommandBuilder().setName('craft-skin').setDescription('Craft a skin shard').addIntegerOption(o => o.setName('index').setDescription('Skin shard # (from inventory)').setRequired(true)),
        new SlashCommandBuilder().setName('craft-champion').setDescription('Unlock a champion').addIntegerOption(o => o.setName('index').setDescription('Champion shard # (from inventory)').setRequired(true)),
        new SlashCommandBuilder().setName('disenchant').setDescription('Disenchant skin for OE').addIntegerOption(o => o.setName('index').setDescription('Skin shard #').setRequired(true)),
        new SlashCommandBuilder().setName('reroll-skins').setDescription('Reroll 3 skin shards').addIntegerOption(o => o.setName('shard1').setDescription('Shard 1').setRequired(true)).addIntegerOption(o => o.setName('shard2').setDescription('Shard 2').setRequired(true)).addIntegerOption(o => o.setName('shard3').setDescription('Shard 3').setRequired(true)),
        new SlashCommandBuilder().setName('lol-daily').setDescription('Claim daily reward'),
        new SlashCommandBuilder().setName('leaderboard').setDescription('View rankings'),
        new SlashCommandBuilder().setName('help').setDescription('Show help'),
        // NEW HINT COMMANDS
        new SlashCommandBuilder().setName('meow').setDescription('Get a hint (Meow style) - Only visible to you'),
        new SlashCommandBuilder().setName('uwu').setDescription('Get a hint (UwU style) - Only visible to you'),
        new SlashCommandBuilder().setName('7u7').setDescription('Get a hint (7u7 style) - Only visible to you')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error(error);
    }
}

// --- MESSAGE HANDLER (CHAT COMMANDS) ---
async function handleMessageCommand(message) {
    const content = message.content.toLowerCase().trim();
    
    // VIEW STORE
    if (content === 'lol store') {
        const player = await initPlayer(message.author.id, message.author.username);
        const { embed, totalPages, currentPage } = await createStoreEmbed(player, 1);
        const row = createStoreButtons(currentPage, totalPages, message.author.id);
        await message.reply({ embeds: [embed], components: [row] });
        return;
    }

    // AUTOFILL SYSTEM WITH PREFERENCES
    if (content.startsWith('lol autofill')) {
        const isChampsMode = content.includes('champs');
        
        // Regex to match users and their following text
        // Looks for <@123> or <@!123> (Discord mentions)
        const mentionRegex = /<@!?(\d+)>/g;
        let match;
        const usersWithPrefs = [];
        const foundUserIds = new Set();
        
        // Iterate through all mentions in the message
        while ((match = mentionRegex.exec(message.content)) !== null) {
            const userId = match[1];
            if (foundUserIds.has(userId)) continue; // avoid duplicates
            
            foundUserIds.add(userId);
            
            // Get text from end of this mention to start of next mention (or end of string)
            const startIndex = match.index + match[0].length;
            const nextMatch = message.content.substring(startIndex).match(/<@!?(\d+)>/);
            const endIndex = nextMatch ? startIndex + nextMatch.index : message.content.length;
            
            const rawText = message.content.substring(startIndex, endIndex);
            const prefs = parseRoles(rawText); // Extract roles like 'jungle', 'supp'
            
            usersWithPrefs.push({ userId: userId, prefs: prefs });
        }

        if (usersWithPrefs.length === 0) {
            return message.reply('❌ Please mention at least one user! (e.g., `lol autofill @user jungle`)');
        }
        if (usersWithPrefs.length > 5) {
            return message.reply('❌ Max 5 players allowed for autofill!');
        }

        // Assignment Logic
        const assignedRoles = new Map();
        const takenRoles = new Set();
        const allRoles = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'];

        // Shuffle users to keep fairness in priority
        const shuffledUsers = shuffleArray(usersWithPrefs);

        // First pass: Try to assign preferences
        for (const user of shuffledUsers) {
            // Filter preferences that are not taken yet
            // Note: If < 5 players, "taken" only matters if we want unique roles. 
            // Standard autofill implies unique roles for the team being built.
            const validPrefs = user.prefs.filter(r => !takenRoles.has(r));
            
            if (validPrefs.length > 0) {
                // Pick random valid preference
                const picked = validPrefs[Math.floor(Math.random() * validPrefs.length)];
                assignedRoles.set(user.userId, picked);
                takenRoles.add(picked);
            }
        }

        // Second pass: Assign remaining users (Autofill)
        for (const user of shuffledUsers) {
            if (!assignedRoles.has(user.userId)) {
                // Find roles that are NOT taken
                const available = allRoles.filter(r => !takenRoles.has(r));
                
                // If we have 5 players, we must fill all roles unique.
                // If < 5 players, we just pick from what's left to maintain uniqueness for the group.
                if (available.length > 0) {
                    const picked = available[Math.floor(Math.random() * available.length)];
                    assignedRoles.set(user.userId, picked);
                    takenRoles.add(picked);
                } else {
                    // Fallback (Shouldn't happen if max 5 users and 5 roles)
                    assignedRoles.set(user.userId, 'Fill'); 
                }
            }
        }

        // Build Response
        let desc = '';
        assignedRoles.forEach((role, userId) => {
            const roleEmoji = ROLE_EMOJIS[role] || '🎲';
            let entry = `${roleEmoji} **${role}:** <@${userId}>`;

            if (isChampsMode && role !== 'Fill') {
                const possibleChamps = ROLE_CHAMPIONS[role];
                const champName = possibleChamps ? possibleChamps[Math.floor(Math.random() * possibleChamps.length)] : 'Random';
                entry = `${roleEmoji} **${role}:** <@${userId}> playing **${champName}**`;
            }
            desc += `${entry}\n`;
        });

        // Add note if < 5 players about uniqueness
        const footer = usersWithPrefs.length < 5 ? 'assigned unique roles from available pool' : 'Full team assigned!';

        const embed = new EmbedBuilder()
            .setTitle(isChampsMode ? '🎲 Autofill with Champions' : '🎲 Autofill Roles')
            .setDescription(desc)
            .setColor('#E91E63')
            .setFooter({ text: footer })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        return;
    }

    // BUY CHAMPION
    const buyMatch = content.match(/^lol store buy (.+)$/);
    if (buyMatch) {
        const nameInput = buyMatch[1].trim();
        const player = await initPlayer(message.author.id, message.author.username);
        
        const champId = findChampionByName(nameInput);
        if (!champId) return message.reply('❌ Champion not found!');
        
        const champName = championData[champId].name;
        
        if (player.ownedChampions.some(c => c.id === champId)) {
            return message.reply(`❌ You already own **${champName}**!`);
        }
        
        const price = getChampionPrice(champId);
        
        if (player.blueEssence < price) {
            return message.reply(`❌ Not enough Blue Essence!\nCost: 💎 ${price}\nYou have: 💎 ${player.blueEssence}`);
        }
        
        player.blueEssence -= price;
        player.ownedChampions.push({ id: champId, name: champName });
        await player.save();
        
        const embed = new EmbedBuilder()
            .setTitle('🛒 Purchase Successful!')
            .setDescription(`You unlocked **${champName}**!`)
            .setThumbnail(getChampionIconUrl(champId))
            .setColor('#2ecc71')
            .setFooter({ text: `Remaining: 💎 ${player.blueEssence} BE` });
        
        await message.reply({ embeds: [embed] });
        return;
    }

    // INVENTORY
    if (content === 'lol inv' || content === 'lol inventory') {
        const player = await initPlayer(message.author.id, message.author.username);
        const { embed, totalPages, currentPage } = await createInventoryEmbed(player, 1, 'champions');
        const navButtons = createNavigationButtons(currentPage, totalPages, 'champions', message.author.id);
        const catButtons = createCategoryButtons(message.author.id);
        await message.reply({ embeds: [embed], components: [navButtons, ...catButtons] });
        return;
    }
    
    // DAILY
    if (content === 'lol daily') {
        const result = await claimDaily(message.author.id, message.author.username);
        if (!result.success) {
            return message.reply(`⏰ Daily reward available in ${result.timeLeft}`);
        }
        await message.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Daily Reward!').setDescription(result.rewards.join('\n')).setColor('#FFD700')] });
        return;
    }
    
    // OPEN CHEST
    if (content === 'lol oc' || content === 'lol open chest') {
        const player = await initPlayer(message.author.id, message.author.username);
        if (player.chests < 1) return message.reply('❌ No chests!');
        
        const loot = await openChest(message.author.id);
        if (!loot) return message.reply('❌ Error opening chest!');
        
        const embed = new EmbedBuilder()
            .setTitle('🎁 Hextech Chest Opened!')
            .setColor('#C89B3C');
        
        if (loot.type === 'champion') {
            const iconUrl = getChampionIconUrl(loot.data.id);
            embed.setDescription(`**Champion Shard**\n${loot.data.name}\n💎 ${loot.data.beCost} BE to unlock`);
            embed.setThumbnail(iconUrl);
        } else {
            const rarity = RARITIES[loot.data.rarity];
            const skinUrl = getSkinCenteredUrl(loot.data.championId, loot.data.skinNum);
            embed.setDescription(`**Skin Shard** (${rarity.name})\n${loot.data.championName} - ${loot.data.skinName}\n🔶 ${rarity.craftCost} OE to unlock`);
            embed.setColor(rarity.color);
            embed.setImage(skinUrl);
        }
        const updatedPlayer = await Player.findOne({ userId: message.author.id });
        embed.setFooter({ text: `🎁 Chests remaining: ${updatedPlayer.chests}` });
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // PROFILE
    if (content === 'lol profile' || content === 'lol prof') {
        const player = await Player.findOne({ userId: message.author.id });
        if (!player) return message.reply('❌ No data found!');
        
        const embed = new EmbedBuilder()
            .setTitle(`${message.author.username}'s Profile`)
            .setThumbnail(message.author.displayAvatarURL())
            .addFields(
                { name: '🏆 Stats', value: `**Points:** ${player.totalPoints}\n**Wins:** ${player.wins}\n**Best Streak:** 🔥${player.maxStreak}\n**Current Streak:** 🔥${player.currentStreak || 0}`, inline: true },
                { name: '💰 Currency', value: `**Blue Essence:** 💎 ${player.blueEssence}\n**Orange Essence:** 🔶 ${player.orangeEssence}\n**Chests:** 🎁 ${player.chests}`, inline: true },
                { name: '📦 Collection', value: `**Champions:** ${player.ownedChampions.length}/${championList.length}\n**Skins:** ${player.ownedSkins.length}\n**Shards:** ${player.championShards.length + player.skinShards.length}`, inline: true }
            )
            .setColor('#00D9FF');
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // LEADERBOARD
    if (content === 'lol lb' || content === 'lol leaderboard') {
        const players = await Player.find().sort({ totalPoints: -1 }).limit(10);
        if (players.length === 0) return message.reply('📊 No data!');
        
        const text = players.map((p, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `${medal} **${p.username}** - ${p.totalPoints} pts | ${p.wins}W`;
        }).join('\n');
        await message.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Leaderboard').setDescription(text).setColor('#FFD700')] });
        return;
    }
    
    
    if (content === 'lol help' || content === 'lol h') {
        const embed = new EmbedBuilder()
            .setTitle('🎮 LoL Guessing Bot - Quick Commands')
            .setDescription('**All commands work in chat!**')
            .addFields(
                { name: '🎯 Games', value: '`lol ga [diff] [px]` - Guess ability\n`lol gsp [diff] [px]` - Guess splash\n`lol gsk [diff] [px]` - Guess skin\n\n**Difficulties:** `ez`, `mid`, `hard`, `v2`, `v3`\n**Pixelated:** Add `px` at end\n**Examples:** `lol ga v2`, `lol gsp hard px`' },
                { name: '🎲 Autofill', value: '`lol autofill @u1 top @u2 mid support` - Assign roles with preference\n`lol autofill champs @u1...` - Assign roles & champs' },
                { name: '💰 Economy', value: '`lol daily` - Daily reward\n`lol oc` - Open chest\n`lol inv` - View inventory' },
                { name: '🛍️ Store', value: '`lol store` - Browse champions\n`lol store buy <name>` - Buy champ' },
                { name: '🔨 Crafting', value: '`lol craft skin <#>` - Unlock skin\n`lol craft champ <#>` - Unlock champion\n`lol de <#>` - Disenchant skin\n`lol reroll <#> <#> <#>` - Reroll 3 skins' },
                { name: '🔄 Trading', value: '`lol trade @user <your#> <their#>` - Trade skins\n`lol trade champ @user <your#> <their#>` - Trade champs\nExample: `lol trade @momo 1 4`\nTrades expire in 5 minutes' },
                { name: '📊 Info', value: '`lol profile` / `lol prof` - Your stats\n`lol lb` - Leaderboard' },
                { name: '🤫 Hints', value: 'Use `/meow`, `/uwu`, or `/7u7` during a game to get a secret hint!' }
            )
            .setColor('#0099ff');
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // CRAFT SKIN
    const craftSkinMatch = content.match(/^lol craft skin (\d+)$/);
    if (craftSkinMatch) {
        const player = await Player.findOne({ userId: message.author.id });
        if (!player) return message.reply('❌ No data!');
        
        const idx = parseInt(craftSkinMatch[1]) - 1;
        if (idx < 0 || idx >= player.skinShards.length) return message.reply('❌ Invalid index!');
        
        const shard = player.skinShards[idx];
        const cost = RARITIES[shard.rarity].craftCost;
        
        const ownsChampion = player.ownedChampions.some(c => c.id === shard.championId);
        if (!ownsChampion) {
            return message.reply(`❌ You must own **${shard.championName}** before unlocking this skin!\nUse \`lol craft champ <#>\` to unlock the champion first.`);
        }
        
        if (player.orangeEssence < cost) {
            return message.reply(`❌ Need ${cost} 🔶 OE! You have ${player.orangeEssence} 🔶 OE`);
        }
        
        player.orangeEssence -= cost;
        player.ownedSkins.push(shard);
        player.skinShards.splice(idx, 1);
        await player.save();
        
        const skinUrl = getSkinCenteredUrl(shard.championId, shard.skinNum);
        const embed = new EmbedBuilder()
            .setTitle('✨ Skin Unlocked!')
            .setDescription(`${shard.championName} - ${shard.skinName}\nCost: 🔶 ${cost} Orange Essence`)
            .setColor('#00ff00')
            .setImage(skinUrl)
            .setFooter({ text: `Orange Essence remaining: ${player.orangeEssence}` });
        await message.reply({ embeds: [embed] });
        return;
    }
    
    // CRAFT CHAMPION (FROM SHARD)
    const craftChampMatch = content.match(/^lol craft champ (\d+)$/);
    if (craftChampMatch) {
        const player = await Player.findOne({ userId: message.author.id });
        if (!player) return message.reply('❌ No data!');
        
        const idx = parseInt(craftChampMatch[1]) - 1;
        if (idx < 0 || idx >= player.championShards.length) return message.reply('❌ Invalid!');
        
        const shard = player.championShards[idx];
        const cost = shard.beCost; 
        
        if (player.blueEssence < cost) {
            return message.reply(`❌ Need 💎 ${cost} BE! You have 💎 ${player.blueEssence} BE`);
        }
        
        player.blueEssence -= cost;
        player.ownedChampions.push(shard);
        player.championShards.splice(idx, 1);
        await player.save();
        
        const iconUrl = getChampionIconUrl(shard.id);
        await message.reply({ embeds: [new EmbedBuilder().setTitle('🔹 Champion Unlocked!').setDescription(`${shard.name}\nCost: 💎 ${cost} BE`).setThumbnail(iconUrl).setColor('#00ff00').setFooter({ text: `Blue Essence remaining: ${player.blueEssence}` })] });
        return;
    }
    
    // DISENCHANT
    const disenchantMatch = content.match(/^lol de (\d+)$/);
    if (disenchantMatch) {
        const player = await Player.findOne({ userId: message.author.id });
        if (!player) return message.reply('❌ No data!');
        
        const idx = parseInt(disenchantMatch[1]) - 1;
        if (idx < 0 || idx >= player.skinShards.length) return message.reply('❌ Invalid!');
        
        const shard = player.skinShards[idx];
        const oe = RARITIES[shard.rarity].disenchant;
        
        player.orangeEssence += oe;
        player.skinShards.splice(idx, 1);
        await player.save();
        
        await message.reply({ embeds: [new EmbedBuilder().setTitle('🔶 Disenchanted!').setDescription(`${shard.championName} - ${shard.skinName}\n+${oe} Orange Essence`).setColor('#FFA500').setFooter({ text: `Orange Essence: ${player.orangeEssence}` })] });
        return;
    }
    
    // REROLL
    const rerollMatch = content.match(/^lol reroll (\d+) (\d+) (\d+)$/);
    if (rerollMatch) {
        const player = await Player.findOne({ userId: message.author.id });
        if (!player) return message.reply('❌ No data!');
        
        const indices = [parseInt(rerollMatch[1]) - 1, parseInt(rerollMatch[2]) - 1, parseInt(rerollMatch[3]) - 1];
        if (indices.some(i => i < 0 || i >= player.skinShards.length)) return message.reply('❌ Invalid indices!');
        if (new Set(indices).size !== 3) return message.reply('❌ Must be different shards!');
        
        indices.sort((a, b) => b - a).forEach(i => player.skinShards.splice(i, 1));
        
        const randomChamp = championList[Math.floor(Math.random() * championList.length)];
        const champDetails = await getChampionDetails(randomChamp);
        const skins = champDetails.skins.filter(s => s.num !== 0);
        const randomSkin = skins.length > 0 ? skins[Math.floor(Math.random() * skins.length)] : champDetails.skins[0];
        
        const newSkin = {
            id: `${randomChamp}_${randomSkin.num}`,
            championId: randomChamp,
            championName: champDetails.name,
            skinName: randomSkin.name,
            skinNum: randomSkin.num,
            rarity: 'EPIC'
        };
        
        player.ownedSkins.push(newSkin);
        await player.save();
        
        const skinUrl = getSkinCenteredUrl(newSkin.championId, newSkin.skinNum);
        await message.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Reroll Success!').setDescription(`Unlocked: ${newSkin.championName} - ${newSkin.skinName}`).setImage(skinUrl).setColor('#9B59B6')] });
        return;
    }
    
    // TRADE
    const tradeMatch = content.match(/^lol trade (skin|champ)? ?<@!?(\d+)> (\d+) (\d+)$/);
    if (tradeMatch) {
        const tradeType = tradeMatch[1] || 'skin';
        const targetUserId = tradeMatch[2];
        const offererIndex = parseInt(tradeMatch[3]);
        const targetIndex = parseInt(tradeMatch[4]);
        
        const targetUser = await message.guild.members.fetch(targetUserId).then(m => m.user).catch(() => null);
        if (!targetUser) return message.reply('❌ User not found!');
        if (targetUser.bot) return message.reply('❌ Cannot trade with bots!');
        if (targetUser.id === message.author.id) return message.reply('❌ Cannot trade with yourself!');
        
        await initiateTrade(message, targetUser, offererIndex, targetIndex, tradeType);
        return;
    }
    
    // GAME COMMANDS (Chat Based)
    const gameMatch = content.match(/^lol (ga|gsp|gsk)(.*)$/);
    if (gameMatch) {
        const modeMap = { ga: 'ability', gsp: 'splash', gsk: 'skin' };
        const diffMap = { ez: 'easy', mid: 'normal', v2: 'v2', v3: 'v3' };
        
        const args = gameMatch[2].trim().split(/\s+/);
        
        const mode = modeMap[gameMatch[1]];
        let difficulty = 'normal';
        let pixelate = false;
        let elimination = false;

        args.forEach(arg => {
            if (diffMap[arg] || arg === 'easy' || arg === 'hard') difficulty = diffMap[arg] || arg;
            if (arg === 'px') pixelate = true;
            if (arg === 'elm') elimination = true;
        });
        
        const fakeInteraction = {
            channel: message.channel,
            guild: message.guild,
            user: message.author,
            deferred: false,
            replied: false,
            deferReply: async () => {},
            editReply: async (data) => { await message.reply(data); },
            followUp: async (data) => { await message.channel.send(data); }
        };
        
        await startGame(fakeInteraction, mode, difficulty, pixelate, elimination);
        return;
    }
}

// --- EVENTS ---
client.on('ready', async () => {
    console.log(`✅ ${client.user.tag}`);
    await loadChampionData();
    await registerCommands();
    console.log('🎮 Ready!');
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;

            // HINT COMMANDS
            if (['meow', 'uwu', '7u7'].includes(commandName)) {
                const game = activeGames.get(interaction.channel.id);
                if (!game) {
                    return interaction.reply({ content: '❌ No game active!', flags: MessageFlags.Ephemeral });
                }

                const player = await initPlayer(interaction.user.id, interaction.user.username);
                const hintTypes = { 'meow': 'lastMeow', 'uwu': 'lastUwu', '7u7': 'last7u7' };
                const dbField = hintTypes[commandName];
                
                const now = Date.now();
                const todayReset = new Date();
                todayReset.setHours(8, 0, 0, 0);
                if (now < todayReset.getTime()) todayReset.setDate(todayReset.getDate() - 1);
                
                const lastUsed = player[dbField] || 0;
                if (lastUsed > todayReset.getTime()) {
                    const nextReset = new Date(todayReset);
                    nextReset.setDate(nextReset.getDate() + 1);
                    const timeLeft = nextReset.getTime() - now;
                    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                    const minsLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
                    return interaction.reply({ content: `⏳ You already used your **${commandName}** hint today! Resets in ${hoursLeft}h ${minsLeft}m.`, flags: MessageFlags.Ephemeral });
                }

                const hint = game.champion.substring(0, 2);
                player[dbField] = now;
                await player.save();

                return interaction.reply({ content: `🤫 **${commandName} Hint:** The champion starts with **${hint}...**`, flags: MessageFlags.Ephemeral });
            }

            // GAME COMMANDS
            if (['guess-ability', 'guess-splash', 'guess-skin'].includes(commandName)) {
                const modeMap = { 'guess-ability': 'ability', 'guess-splash': 'splash', 'guess-skin': 'skin' };
                await startGame(
                    interaction, 
                    modeMap[commandName], 
                    options.getString('difficulty') || 'normal', 
                    options.getBoolean('pixelated') || false,
                    options.getBoolean('elimination') || false
                );
            } 
            // STORE
            else if (commandName === 'store') {
                const player = await initPlayer(interaction.user.id, interaction.user.username);
                const { embed, totalPages, currentPage } = await createStoreEmbed(player, 1);
                const row = createStoreButtons(currentPage, totalPages, interaction.user.id);
                await interaction.reply({ embeds: [embed], components: [row] });
            }
            else if (commandName === 'buy') {
                const nameInput = options.getString('champion');
                const player = await initPlayer(interaction.user.id, interaction.user.username);
                
                const champId = findChampionByName(nameInput);
                if (!champId) return interaction.reply({ content: '❌ Champion not found!', flags: MessageFlags.Ephemeral });
                
                const champName = championData[champId].name;
                
                if (player.ownedChampions.some(c => c.id === champId)) {
                    return interaction.reply({ content: `❌ You already own **${champName}**!`, flags: MessageFlags.Ephemeral });
                }
                
                const price = getChampionPrice(champId);
                
                if (player.blueEssence < price) {
                    return interaction.reply({ content: `❌ Not enough Blue Essence!\nCost: 💎 ${price}\nYou have: 💎 ${player.blueEssence}`, flags: MessageFlags.Ephemeral });
                }
                
                player.blueEssence -= price;
                player.ownedChampions.push({ id: champId, name: champName });
                await player.save();
                
                const embed = new EmbedBuilder()
                    .setTitle('🛒 Purchase Successful!')
                    .setDescription(`You unlocked **${champName}**!`)
                    .setThumbnail(getChampionIconUrl(champId))
                    .setColor('#2ecc71')
                    .setFooter({ text: `Remaining: 💎 ${player.blueEssence} BE` });
                
                await interaction.reply({ embeds: [embed] });
            }
            // OTHER COMMANDS
            else if (commandName === 'profile') {
                const target = options.getUser('user') || interaction.user;
                const player = await Player.findOne({ userId: target.id });
                if (!player) return interaction.reply({ content: '❌ No data found!', flags: MessageFlags.Ephemeral });
                
                const embed = new EmbedBuilder()
                    .setTitle(`${target.username}'s Profile`)
                    .setThumbnail(target.displayAvatarURL())
                    .addFields(
                        { name: '🏆 Stats', value: `**Points:** ${player.totalPoints}\n**Wins:** ${player.wins}\n**Best Streak:** 🔥${player.maxStreak}\n**Current Streak:** 🔥${player.currentStreak || 0}`, inline: true },
                        { name: '💰 Currency', value: `**Blue Essence:** 💎 ${player.blueEssence}\n**Orange Essence:** 🔶 ${player.orangeEssence}\n**Chests:** 🎁 ${player.chests}`, inline: true },
                        { name: '📦 Collection', value: `**Champions:** ${player.ownedChampions.length}/${championList.length}\n**Skins:** ${player.ownedSkins.length}\n**Shards:** ${player.championShards.length + player.skinShards.length}`, inline: true }
                    )
                    .setColor('#00D9FF');
                
                await interaction.reply({ embeds: [embed] });
            } else if (commandName === 'inventory') {
                const player = await initPlayer(interaction.user.id, interaction.user.username);
                const { embed, totalPages, currentPage } = await createInventoryEmbed(player, 1, 'champions');
                const navButtons = createNavigationButtons(currentPage, totalPages, 'champions', interaction.user.id);
                const catButtons = createCategoryButtons(interaction.user.id);
                await interaction.reply({ embeds: [embed], components: [navButtons, ...catButtons] });
            } else if (commandName === 'open-chest') {
                const player = await initPlayer(interaction.user.id, interaction.user.username);
                if (player.chests < 1) return interaction.reply({ content: '❌ No chests!', flags: MessageFlags.Ephemeral });
                
                const loot = await openChest(interaction.user.id);
                if (!loot) return interaction.reply({ content: '❌ Error opening chest!', flags: MessageFlags.Ephemeral });
                
                const embed = new EmbedBuilder()
                    .setTitle('🎁 Hextech Chest Opened!')
                    .setColor('#C89B3C');
                
                if (loot.type === 'champion') {
                    const iconUrl = getChampionIconUrl(loot.data.id);
                    embed.setDescription(`**Champion Shard**\n${loot.data.name}\n💎 ${loot.data.beCost} BE to unlock`);
                    embed.setThumbnail(iconUrl);
                } else {
                    const rarity = RARITIES[loot.data.rarity];
                    const skinUrl = getSkinCenteredUrl(loot.data.championId, loot.data.skinNum);
                    embed.setDescription(`**Skin Shard** (${rarity.name})\n${loot.data.championName} - ${loot.data.skinName}\n🔶 ${rarity.craftCost} OE to unlock`);
                    embed.setColor(rarity.color);
                    embed.setImage(skinUrl);
                }
                const updatedPlayer = await Player.findOne({ userId: interaction.user.id });
                embed.setFooter({ text: `🎁 Chests remaining: ${updatedPlayer.chests}` });
                await interaction.reply({ embeds: [embed] });
            } else if (commandName === 'craft-skin') {
                const player = await Player.findOne({ userId: interaction.user.id });
                if (!player) return interaction.reply({ content: '❌ No data!', flags: MessageFlags.Ephemeral });
                
                const idx = options.getInteger('index') - 1;
                if (idx < 0 || idx >= player.skinShards.length) return interaction.reply({ content: '❌ Invalid index!', flags: MessageFlags.Ephemeral });
                
                const shard = player.skinShards[idx];
                const cost = RARITIES[shard.rarity].craftCost;
                
                const ownsChampion = player.ownedChampions.some(c => c.id === shard.championId);
                if (!ownsChampion) {
                    return interaction.reply({ 
                        content: `❌ You must own **${shard.championName}** before unlocking this skin!\nUse \`/craft-champion\` to unlock the champion first.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
                
                if (player.orangeEssence < cost) {
                    return interaction.reply({ content: `❌ Need ${cost} 🔶 OE! You have ${player.orangeEssence} 🔶 OE`, flags: MessageFlags.Ephemeral });
                }
                
                player.orangeEssence -= cost;
                player.ownedSkins.push(shard);
                player.skinShards.splice(idx, 1);
                await player.save();
                
                const skinUrl = getSkinCenteredUrl(shard.championId, shard.skinNum);
                const embed = new EmbedBuilder()
                    .setTitle('✨ Skin Unlocked!')
                    .setDescription(`${shard.championName} - ${shard.skinName}\nCost: 🔶 ${cost} Orange Essence`)
                    .setColor('#00ff00')
                    .setImage(skinUrl)
                    .setFooter({ text: `Orange Essence remaining: ${player.orangeEssence}` });
                
                await interaction.reply({ embeds: [embed] });

            } else if (commandName === 'craft-champion') {
                 const player = await Player.findOne({ userId: interaction.user.id });
                 if (!player) return interaction.reply({ content: '❌ No data!', flags: MessageFlags.Ephemeral });
                 
                 const idx = options.getInteger('index') - 1;
                 if (idx < 0 || idx >= player.championShards.length) return interaction.reply({ content: '❌ Invalid!', flags: MessageFlags.Ephemeral });
                 
                 const shard = player.championShards[idx];
                 const cost = shard.beCost;
                 
                 if (player.blueEssence < cost) {
                     return interaction.reply({ content: `❌ Need 💎 ${cost} BE! You have 💎 ${player.blueEssence} BE`, flags: MessageFlags.Ephemeral });
                 }
                 
                 player.blueEssence -= cost;
                 player.ownedChampions.push(shard);
                 player.championShards.splice(idx, 1);
                 await player.save();
                 
                 const iconUrl = getChampionIconUrl(shard.id);
                 await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔹 Champion Unlocked!').setDescription(`${shard.name}\nCost: 💎 ${cost} BE`).setThumbnail(iconUrl).setColor('#00ff00').setFooter({ text: `Blue Essence remaining: ${player.blueEssence}` })] });
            } else if (commandName === 'disenchant') {
                 const player = await Player.findOne({ userId: interaction.user.id });
                 if (!player) return interaction.reply({ content: '❌ No data!', flags: MessageFlags.Ephemeral });
                 
                 const idx = options.getInteger('index') - 1;
                 if (idx < 0 || idx >= player.skinShards.length) return interaction.reply({ content: '❌ Invalid!', flags: MessageFlags.Ephemeral });
                 
                 const shard = player.skinShards[idx];
                 const oe = RARITIES[shard.rarity].disenchant;
                 
                 player.orangeEssence += oe;
                 player.skinShards.splice(idx, 1);
                 await player.save();
                 
                 await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔶 Disenchanted!').setDescription(`${shard.championName} - ${shard.skinName}\n+${oe} Orange Essence`).setColor('#FFA500').setFooter({ text: `Orange Essence: ${player.orangeEssence}` })] });
            } else if (commandName === 'reroll-skins') {
                const player = await Player.findOne({ userId: interaction.user.id });
                if (!player) return interaction.reply({ content: '❌ No data!', flags: MessageFlags.Ephemeral });
                
                const indices = [options.getInteger('shard1') - 1, options.getInteger('shard2') - 1, options.getInteger('shard3') - 1];
                if (indices.some(i => i < 0 || i >= player.skinShards.length)) return interaction.reply({ content: '❌ Invalid indices!', flags: MessageFlags.Ephemeral });
                if (new Set(indices).size !== 3) return interaction.reply({ content: '❌ Must be different shards!', flags: MessageFlags.Ephemeral });
                
                indices.sort((a, b) => b - a).forEach(i => player.skinShards.splice(i, 1));
                
                const randomChamp = championList[Math.floor(Math.random() * championList.length)];
                const champDetails = await getChampionDetails(randomChamp);
                const skins = champDetails.skins.filter(s => s.num !== 0);
                const randomSkin = skins.length > 0 ? skins[Math.floor(Math.random() * skins.length)] : champDetails.skins[0];
                
                const newSkin = {
                    id: `${randomChamp}_${randomSkin.num}`,
                    championId: randomChamp,
                    championName: champDetails.name,
                    skinName: randomSkin.name,
                    skinNum: randomSkin.num,
                    rarity: 'EPIC'
                };
                
                player.ownedSkins.push(newSkin);
                await player.save();
                
                const skinUrl = getSkinCenteredUrl(newSkin.championId, newSkin.skinNum);
                await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Reroll Success!').setDescription(`Unlocked: ${newSkin.championName} - ${newSkin.skinName}`).setImage(skinUrl).setColor('#9B59B6')] });
            } else if (commandName === 'lol-daily') {
                const result = await claimDaily(interaction.user.id, interaction.user.username);
                if (!result.success) {
                    return interaction.reply({ content: `⏰ Daily reward available in ${result.timeLeft}`, flags: MessageFlags.Ephemeral });
                }
                
                await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Daily Reward!').setDescription(result.rewards.join('\n')).setColor('#FFD700')] });
            } else if (commandName === 'leaderboard') {
                 const players = await Player.find().sort({ totalPoints: -1 }).limit(10);
                if (players.length === 0) return interaction.reply({ content: '📊 No data!', flags: MessageFlags.Ephemeral });
                
                const text = players.map((p, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                    return `${medal} **${p.username}** - ${p.totalPoints} pts | ${p.wins}W`;
                }).join('\n');
                
                await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Leaderboard').setDescription(text).setColor('#FFD700')] });
            } else if (commandName === 'help') {
                const embed = new EmbedBuilder()
                    .setTitle('🎮 LoL Guessing Bot')
                    .addFields(
                        { name: '🎯 Games', value: '`/guess-ability` `/guess-splash` `/guess-skin`\nUse `elimination` option for challenge mode!' },
                        { name: '💰 Economy', value: '**Earn:** 💎 2500 BE per 50 pts\n**Chests:** 🎁 1 per 20 pts\n`/lol-daily` - Daily rewards' },
                        { name: '🛍️ Store', value: '`/store` - Browse champions\n`/buy` - Buy champion' },
                        { name: '🔨 Crafting', value: '`/craft-skin` - Unlock skin (🔶 OE)\n`/craft-champion` - Unlock champ (💎 BE)\n`/disenchant` - Get 🔶 OE' },
                        { name: '🤫 Hints', value: '`/meow`, `/uwu`, `/7u7` - Only visible to you!' }
                    )
                    .setColor('#0099ff');
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }
        } 
        else if (interaction.isButton()) {
            const customId = interaction.customId;

            if (customId.startsWith('trade_')) {
                const parts = customId.split('_');
                const action = parts[1]; 
                const tradeId = parts.slice(2).join('_'); 
                
                if (action === 'accept') {
                    await acceptTrade(interaction, tradeId);
                } else if (action === 'decline') {
                    await declineTrade(interaction, tradeId);
                }
                return;
            }

            const parts = customId.split('_');
            const ownerId = parts[parts.length - 1]; 

            if (ownerId && ownerId !== interaction.user.id) {
                return interaction.reply({ 
                    content: '❌ Not your menu! Type the command yourself.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            const player = await Player.findOne({ userId: interaction.user.id });
            if (!player) return interaction.reply({ content: '❌ No data!', flags: MessageFlags.Ephemeral });
            
            if (customId.startsWith('store_')) {
                const direction = parts[1];
                const currentPage = parseInt(parts[2]);
                const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;
                
                const { embed, totalPages, currentPage: actualPage } = await createStoreEmbed(player, newPage);
                const row = createStoreButtons(actualPage, totalPages, interaction.user.id);
                
                await interaction.update({ embeds: [embed], components: [row] });
                return;
            }

            if (customId.startsWith('inv_cat_')) {
                const type = parts.slice(2, parts.length - 1).join('_');
                const { embed, totalPages, currentPage } = await createInventoryEmbed(player, 1, type);
                const navButtons = createNavigationButtons(currentPage, totalPages, type, interaction.user.id);
                const catButtons = createCategoryButtons(interaction.user.id);
                await interaction.update({ embeds: [embed], components: [navButtons, ...catButtons] });
            } 
            else if (customId.startsWith('inv_prev_') || customId.startsWith('inv_next_')) {
                const direction = parts[1]; 
                const currentBtnPage = parseInt(parts[parts.length - 2]); 
                const type = parts.slice(2, parts.length - 2).join('_');
                const newPage = direction === 'next' ? currentBtnPage + 1 : currentBtnPage - 1;
                
                const { embed, totalPages, currentPage: actualPage } = await createInventoryEmbed(player, newPage, type);
                const navButtons = createNavigationButtons(actualPage, totalPages, type, interaction.user.id);
                const catButtons = createCategoryButtons(interaction.user.id);
                await interaction.update({ embeds: [embed], components: [navButtons, ...catButtons] });
            }
        }
    } catch (error) {
        console.error("Interaction Error:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ An error occurred.', flags: MessageFlags.Ephemeral });
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().trim();
    
    // COMMANDS
    if (content.startsWith('lol ')) {
        await handleMessageCommand(message);
        return;
    }
    
    // GUESSING
    await checkGuess(message);
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);
process.on('SIGTERM', () => {
    console.log('Shutting down...');
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);