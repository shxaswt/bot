// Install required packages first:
// npm install discord.js axios dotenv canvas

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const Canvas = require('canvas');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

// Store active games per channel
const activeGames = new Map();

// Server-wide cooldown tracking
const serverCooldowns = new Map();

// User streaks (per server)
const userStreaks = new Map();

// Leaderboard data
let leaderboard = {};
const LEADERBOARD_FILE = 'leaderboard.json';

// Load leaderboard
function loadLeaderboard() {
    try {
        if (fs.existsSync(LEADERBOARD_FILE)) {
            leaderboard = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error loading leaderboard:', error);
    }
}

// Save leaderboard
function saveLeaderboard() {
    try {
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
    } catch (error) {
        console.error('Error saving leaderboard:', error);
    }
}

// Update user score with streak multiplier
function updateScore(userId, username, timeTaken, basePoints, streakMultiplier = 1) {
    if (!leaderboard[userId]) {
        leaderboard[userId] = {
            username: username,
            wins: 0,
            totalPoints: 0,
            totalTime: 0,
            gamesPlayed: 0,
            maxStreak: 0
        };
    }
    
    const pointsEarned = Math.floor(basePoints * streakMultiplier);
    
    leaderboard[userId].wins += 1;
    leaderboard[userId].gamesPlayed += 1;
    leaderboard[userId].totalTime += timeTaken;
    leaderboard[userId].totalPoints += pointsEarned;
    
    const currentStreak = Math.floor(streakMultiplier);
    if (currentStreak > (leaderboard[userId].maxStreak || 0)) {
        leaderboard[userId].maxStreak = currentStreak;
    }
    
    saveLeaderboard();
    return pointsEarned;
}

// Riot Data Dragon
let DD_VERSION = '14.1.1';
let DD_BASE = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}`;

let championData = null;
let championList = [];
let championSkins = {};

// Fetch latest version
async function getLatestVersion() {
    try {
        const response = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
        return response.data[0];
    } catch (error) {
        console.error('Error fetching latest version:', error);
        return '14.1.1';
    }
}

// Load champion data
async function loadChampionData() {
    try {
        DD_VERSION = await getLatestVersion();
        DD_BASE = `https://ddragon.leagueoflegends.com/cdn/${DD_VERSION}`;
        console.log(`Using Data Dragon version: ${DD_VERSION}`);
        
        const response = await axios.get(`${DD_BASE}/data/en_US/champion.json`);
        championData = response.data.data;
        championList = Object.keys(championData);
        console.log(`✅ Loaded ${championList.length} champions`);
    } catch (error) {
        console.error('Error loading champion data:', error);
    }
}

// Get champion details
async function getChampionDetails(championKey) {
    try {
        const response = await axios.get(`${DD_BASE}/data/en_US/champion/${championKey}.json`);
        const details = response.data.data[championKey];
        
        if (!championSkins[championKey]) {
            championSkins[championKey] = details.skins;
        }
        
        return details;
    } catch (error) {
        console.error(`Error loading ${championKey}:`, error);
        return null;
    }
}

// Pixelate entire image
function pixelateImage(canvas, ctx, image, pixelSize) {
    const width = canvas.width;
    const height = canvas.height;
    
    const tempCanvas = Canvas.createCanvas(
        Math.ceil(width / pixelSize),
        Math.ceil(height / pixelSize)
    );
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
    
    tempCtx.drawImage(image, 0, 0, width, height, 0, 0, tempCanvas.width, tempCanvas.height);
    
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, width, height);
}

// Process image with zoom and pixelation
async function processImage(imageUrl, mode, difficulty, pixelate = false) {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const image = await Canvas.loadImage(Buffer.from(response.data));
        
        if (mode === 'splash' || mode === 'skin') {
            const canvas = Canvas.createCanvas(400, 400);
            const ctx = canvas.getContext('2d');
            
            // AGGRESSIVE zoom levels - takes smaller crop from image
            const zoomLevels = {
                easy: 2.5,    // Shows 1/2.5 of image = 40% visible
                normal: 4.0,  // Shows 1/4 of image = 25% visible
                hard: 6.0     // Shows 1/6 of image = 16% visible (very zoomed)
            };
            
            const zoom = zoomLevels[difficulty] || 4.0;
            
            // Calculate crop size (smaller = more zoom)
            const cropSize = Math.min(image.width, image.height) / zoom;
            const maxX = Math.max(0, image.width - cropSize);
            const maxY = Math.max(0, image.height - cropSize);
            const cropX = Math.floor(Math.random() * maxX);
            const cropY = Math.floor(Math.random() * maxY);
            
            // Draw cropped/zoomed section to full 400x400 canvas
            ctx.drawImage(image, cropX, cropY, cropSize, cropSize, 0, 0, 400, 400);
            
            // Apply pixelation if enabled
            if (pixelate) {
                const pixelSizes = {
                    easy: 10,   // Moderate pixelation
                    normal: 14, // Heavy pixelation
                    hard: 18    // Very heavy pixelation
                };
                const pixelSize = pixelSizes[difficulty] || 14;
                pixelateImage(canvas, ctx, canvas, pixelSize);
            }
            
            return canvas.toBuffer();
        } else if (mode === 'ability' && pixelate) {
            // Pixelate ability icons
            const canvas = Canvas.createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            
            ctx.drawImage(image, 0, 0);
            
            const pixelSizes = {
                easy: 8,
                normal: 12,
                hard: 16,
                v2: 12,
                v3: 12
            };
            const pixelSize = pixelSizes[difficulty] || 12;
            
            pixelateImage(canvas, ctx, canvas, pixelSize);
            
            return canvas.toBuffer();
        }
        
        return null;
    } catch (error) {
        console.error('Error processing image:', error);
        return null;
    }
}

// Game modes
const GAME_MODES = {
    ability: { name: 'Ability', emoji: '⚡' },
    splash: { name: 'Splash Art', emoji: '🎨' },
    skin: { name: 'Skin', emoji: '👗' }
};

// FAIR POINT SYSTEM - Base points scale with difficulty
const DIFFICULTIES = {
    easy: { 
        time: 45000, 
        basePoints: 2,        // Base 2 points
        pixelateBonus: 3,     // 2 + 3 = 5 points pixelated
        emoji: '🟢', 
        name: 'Easy' 
    },
    normal: { 
        time: 30000, 
        basePoints: 5,        // Base 5 points
        pixelateBonus: 5,     // 5 + 5 = 10 points pixelated
        emoji: '🟡', 
        name: 'Normal' 
    },
    hard: { 
        time: 20000, 
        basePoints: 8,        // Base 8 points
        pixelateBonus: 7,     // 8 + 7 = 15 points pixelated
        emoji: '🔴', 
        name: 'Hard' 
    },
    v2: { 
        time: 30000, 
        basePoints: 12,       // Base 12 points
        pixelateBonus: 8,     // 12 + 8 = 20 points pixelated
        emoji: '🔵', 
        name: 'V2 (Key)', 
        answerType: 'key' 
    },
    v3: { 
        time: 30000, 
        basePoints: 15,       // Base 15 points
        pixelateBonus: 10,    // 15 + 10 = 25 points pixelated
        emoji: '🟣', 
        name: 'V3 (Name)', 
        answerType: 'name' 
    }
};

// Get random content
async function getRandomContent(mode, difficulty, pixelate = false) {
    const randomChamp = championList[Math.floor(Math.random() * championList.length)];
    const champDetails = await getChampionDetails(randomChamp);
    
    if (!champDetails) return null;
    
    let imageUrl, contentType, abilityKey, abilityName, processedImage = null;
    
    switch(mode) {
        case 'ability':
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
            
            imageUrl = abilityIndex === 0
                ? `${DD_BASE}/img/passive/${ability.image.full}`
                : `${DD_BASE}/img/spell/${ability.image.full}`;
            
            if (pixelate) {
                processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
            }
            
            contentType = abilityKey;
            break;
            
        case 'splash':
            imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${randomChamp}_0.jpg`;
            processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
            contentType = 'Default Splash';
            break;
            
        case 'skin':
            const skins = champDetails.skins.filter(s => s.num !== 0);
            if (skins.length === 0) {
                imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${randomChamp}_0.jpg`;
                processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
                contentType = 'Default Skin';
            } else {
                const randomSkin = skins[Math.floor(Math.random() * skins.length)];
                imageUrl = `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${randomChamp}_${randomSkin.num}.jpg`;
                processedImage = await processImage(imageUrl, mode, difficulty, pixelate);
                contentType = randomSkin.name;
            }
            break;
    }
    
    return {
        champion: champDetails.name,
        championKey: randomChamp,
        imageUrl: imageUrl,
        processedImage: processedImage,
        contentType: contentType,
        abilityKey: abilityKey,
        abilityName: abilityName,
        tags: champDetails.tags,
        title: champDetails.title
    };
}

// Normalize answer
function normalizeAnswer(text) {
    return text.toLowerCase()
        .replace(/['\s.-]/g, '')
        .replace(/&/g, 'and');
}

// Streak functions
function getUserStreak(guildId, userId) {
    const key = `${guildId}-${userId}`;
    return userStreaks.get(key) || 0;
}

function updateUserStreak(guildId, userId, correct) {
    const key = `${guildId}-${userId}`;
    if (correct) {
        const currentStreak = getUserStreak(guildId, userId);
        userStreaks.set(key, currentStreak + 1);
        return currentStreak + 1;
    } else {
        userStreaks.set(key, 0);
        return 0;
    }
}

function getStreakMultiplier(streak) {
    if (streak < 3) return 1;
    if (streak < 5) return 1.5;
    if (streak < 10) return 2;
    return 2.5;
}

// Cleanup game
function cleanupGame(channelId, guildId) {
    const game = activeGames.get(channelId);
    if (game) {
        if (game.timeoutId) clearTimeout(game.timeoutId);
        if (game.hintTimeoutId) clearTimeout(game.hintTimeoutId);
        activeGames.delete(channelId);
    }
    if (guildId) {
        serverCooldowns.delete(guildId);
    }
}

// Start game
async function startGame(interaction, mode = 'ability', difficulty = 'normal', pixelate = false) {
    const channelId = interaction.channel.id;
    const guildId = interaction.guild.id;
    
    if (activeGames.has(channelId)) {
        return interaction.reply({ content: '❌ A game is already active in this channel!', flags: MessageFlags.Ephemeral });
    }
    
    if (serverCooldowns.has(guildId)) {
        const cooldownEnd = serverCooldowns.get(guildId);
        const timeLeft = Math.ceil((cooldownEnd - Date.now()) / 1000);
        if (timeLeft > 0) {
            return interaction.reply({ 
                content: `⏱️ Please wait ${timeLeft}s before starting a new game!`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
    
    await interaction.deferReply();
    
    const difficultyData = DIFFICULTIES[difficulty];
    const modeData = GAME_MODES[mode];
    
    const content = await getRandomContent(mode, difficulty, pixelate);
    if (!content) {
        return interaction.editReply('❌ Failed to load game data. Please try again.');
    }
    
    // Calculate points
    const points = pixelate ? (difficultyData.basePoints + difficultyData.pixelateBonus) : difficultyData.basePoints;
    
    let description = `Guess the champion!\n**Difficulty:** ${difficultyData.emoji} ${difficultyData.name}\n**Time:** ${difficultyData.time/1000}s\n**Points:** ${points} 🏆`;
    
    if (pixelate) {
        description += '\n**Mode:** 🔲 Pixelated';
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
    
    await interaction.editReply({ embeds: [embed], files: files });
    
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
        answer: correctAnswer,
        normalizedAnswers: normalizedAnswers,
        champion: content.champion,
        startTime: Date.now(),
        timeLimit: difficultyData.time,
        participants: new Set(),
        mode: mode,
        difficulty: difficulty,
        points: points,
        hintGiven: false,
        tags: content.tags,
        title: content.title,
        imageUrl: content.imageUrl,
        answerType: difficultyData.answerType || 'champion',
        pixelate: pixelate,
        timeoutId: null,
        hintTimeoutId: null
    };
    
    activeGames.set(channelId, gameData);
    serverCooldowns.set(guildId, Date.now() + 5000);
    
    if (difficulty !== 'v2' && difficulty !== 'v3') {
        gameData.hintTimeoutId = setTimeout(async () => {
            if (activeGames.has(channelId) && !activeGames.get(channelId).hintGiven) {
                const game = activeGames.get(channelId);
                game.hintGiven = true;
                
                const hint = `💡 **Hint:** ${game.tags.join(', ')} - "${game.title}"`;
                try {
                    await interaction.followUp(hint);
                } catch (error) {
                    console.error('Error sending hint:', error);
                }
            }
        }, 15000);
    }
    
    gameData.timeoutId = setTimeout(async () => {
        if (activeGames.has(channelId)) {
            cleanupGame(channelId, guildId);
            
            const endEmbed = new EmbedBuilder()
                .setTitle('⏱️ Time\'s up!')
                .setDescription(`No one guessed correctly. The answer was **${correctAnswer}**`)
                .setColor('#ff0000');
            
            try {
                await interaction.followUp({ embeds: [endEmbed] });
            } catch (error) {
                console.error('Error sending timeout message:', error);
            }
        }
    }, gameData.timeLimit);
}

// Check guess
async function checkGuess(message) {
    if (!activeGames.has(message.channel.id)) return;
    
    const game = activeGames.get(message.channel.id);
    const userGuess = normalizeAnswer(message.content);
    
    if (game.participants.has(message.author.id)) return;
    
    const isCorrect = game.normalizedAnswers.some(answer => userGuess === answer);
    
    if (isCorrect) {
        game.participants.add(message.author.id);
        await message.react('✅');
        
        const timeTaken = ((Date.now() - game.startTime) / 1000).toFixed(1);
        
        const streak = updateUserStreak(message.guild.id, message.author.id, true);
        const streakMultiplier = getStreakMultiplier(streak);
        
        const pointsEarned = updateScore(message.author.id, message.author.username, parseFloat(timeTaken), game.points, streakMultiplier);
        
        const userStats = leaderboard[message.author.id];
        const totalPoints = userStats ? userStats.totalPoints : pointsEarned;
        
        let bonusText = '';
        if (game.pixelate) {
            bonusText = `\n🔲 **Pixelated Bonus!**`;
        }
        
        let streakText = '';
        if (streak >= 3) {
            streakText = `\n🔥 **${streak} win streak!** (${streakMultiplier}x multiplier)`;
        }
        
        const winEmbed = new EmbedBuilder()
            .setTitle('🎉 Correct!')
            .setDescription(`<@${message.author.id}> guessed **${game.answer}** correctly in ${timeTaken}s!\n**Points earned:** +${pointsEarned} 🏆${bonusText}${streakText}\n**Total points:** ${totalPoints} pts`)
            .setColor('#00ff00');
        
        await message.channel.send({ embeds: [winEmbed] });
        
        cleanupGame(message.channel.id, message.guild.id);
        
    } else {
        const isChampionName = championList.some(champ => 
            normalizeAnswer(championData[champ].name) === userGuess
        );
        
        if (isChampionName || (message.content.split(' ').length >= 1 && message.content.split(' ').length <= 3)) {
            await message.react('❌');
            updateUserStreak(message.guild.id, message.author.id, false);
        }
    }
}

// Show leaderboard
async function showLeaderboard(interaction) {
    const sorted = Object.entries(leaderboard)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 10);
    
    if (sorted.length === 0) {
        return interaction.reply({ content: '📊 No games played yet!', flags: MessageFlags.Ephemeral });
    }
    
    const leaderboardText = sorted.map((user, index) => {
        const avgTime = (user.totalTime / user.wins).toFixed(1);
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const maxStreak = user.maxStreak ? ` | 🔥${user.maxStreak}` : '';
        return `${medal} **${user.username}** - ${user.totalPoints} pts | ${user.wins}W (${avgTime}s)${maxStreak}`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle('🏆 Leaderboard - Top 10')
        .setDescription(leaderboardText)
        .setColor('#FFD700')
        .setFooter({ text: 'Ranked by total points! 🔥 = max streak' });
    
    await interaction.reply({ embeds: [embed] });
}

// Reset leaderboard
async function resetLeaderboard(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ 
            content: '❌ You need Administrator permission!', 
            flags: MessageFlags.Ephemeral 
        });
    }
    
    leaderboard = {};
    userStreaks.clear();
    saveLeaderboard();
    
    const embed = new EmbedBuilder()
        .setTitle('🔄 Leaderboard Reset')
        .setDescription('All stats and streaks cleared!')
        .setColor('#FFA500');
    
    await interaction.reply({ embeds: [embed] });
}

// Register commands
async function registerCommands() {
    if (!process.env.CLIENT_ID) {
        console.error('❌ CLIENT_ID not set in .env!');
        return;
    }

    const commands = [
        new SlashCommandBuilder()
            .setName('guess-ability')
            .setDescription('Guess champion from ability icon')
            .addStringOption(option =>
                option.setName('difficulty')
                    .setDescription('Choose difficulty')
                    .setRequired(false)
                    .addChoices(
                        { name: '🟢 Easy (2pts | +3 pixelated = 5pts)', value: 'easy' },
                        { name: '🟡 Normal (5pts | +5 pixelated = 10pts)', value: 'normal' },
                        { name: '🔴 Hard (8pts | +7 pixelated = 15pts)', value: 'hard' },
                        { name: '🔵 V2 - Key (12pts | +8 pixelated = 20pts)', value: 'v2' },
                        { name: '🟣 V3 - Name (15pts | +10 pixelated = 25pts)', value: 'v3' }
                    ))
            .addBooleanOption(option =>
                option.setName('pixelated')
                    .setDescription('Enable pixelated mode for bonus points')
                    .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('guess-splash')
            .setDescription('Guess from cropped splash art')
            .addStringOption(option =>
                option.setName('difficulty')
                    .setDescription('Choose difficulty')
                    .setRequired(false)
                    .addChoices(
                        { name: '🟢 Easy (2pts | +3 pixelated = 5pts)', value: 'easy' },
                        { name: '🟡 Normal (5pts | +5 pixelated = 10pts)', value: 'normal' },
                        { name: '🔴 Hard (8pts | +7 pixelated = 15pts)', value: 'hard' }
                    ))
            .addBooleanOption(option =>
                option.setName('pixelated')
                    .setDescription('Enable pixelated mode for bonus points')
                    .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('guess-skin')
            .setDescription('Guess from cropped skin splash')
            .addStringOption(option =>
                option.setName('difficulty')
                    .setDescription('Choose difficulty')
                    .setRequired(false)
                    .addChoices(
                        { name: '🟢 Easy (2pts | +3 pixelated = 5pts)', value: 'easy' },
                        { name: '🟡 Normal (5pts | +5 pixelated = 10pts)', value: 'normal' },
                        { name: '🔴 Hard (8pts | +7 pixelated = 15pts)', value: 'hard' }
                    ))
            .addBooleanOption(option =>
                option.setName('pixelated')
                    .setDescription('Enable pixelated mode for bonus points')
                    .setRequired(false)),
        
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('View top players'),
        
        new SlashCommandBuilder()
            .setName('reset-leaderboard')
            .setDescription('Reset leaderboard (Admin only)'),
        
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Show commands and info')
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('✅ Commands registered!');
    } catch (error) {
        console.error('❌ Error registering commands:', error);
    }
}

client.on('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    await loadChampionData();
    loadLeaderboard();
    await registerCommands();
    console.log('🎮 Bot is ready!');
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, options } = interaction;

    try {
        if (commandName === 'guess-ability') {
            const difficulty = options.getString('difficulty') || 'normal';
            const pixelated = options.getBoolean('pixelated') || false;
            await startGame(interaction, 'ability', difficulty, pixelated);
        } else if (commandName === 'guess-splash') {
            const difficulty = options.getString('difficulty') || 'normal';
            const pixelated = options.getBoolean('pixelated') || false;
            await startGame(interaction, 'splash', difficulty, pixelated);
        } else if (commandName === 'guess-skin') {
            const difficulty = options.getString('difficulty') || 'normal';
            const pixelated = options.getBoolean('pixelated') || false;
            await startGame(interaction, 'skin', difficulty, pixelated);
        } else if (commandName === 'leaderboard') {
            await showLeaderboard(interaction);
        } else if (commandName === 'reset-leaderboard') {
            await resetLeaderboard(interaction);
        } else if (commandName === 'help') {
            const helpEmbed = new EmbedBuilder()
                .setTitle('🎮 LoL Guessing Bot')
                .setDescription('Test your League knowledge!')
                .addFields(
                    { name: '⚡ Ability Modes', value: '`/guess-ability` - Guess from ability\n🔵 **V2**: Guess "Champ Key" (e.g., Lux R)\n🟣 **V3**: Guess "Champ Ability" (e.g., Lux Final Spark)' },
                    { name: '🎨 Visual Modes', value: '`/guess-splash` - Cropped splash art\n`/guess-skin` - Cropped skin splash\n🔲 Add `pixelated:True` for bonus!' },
                    { name: '🎯 Point System', value: '**Base:** Easy(2) Normal(5) Hard(8) V2(12) V3(15)\n**Pixelate Bonus:** +3/+5/+7/+8/+10 respectively\n**Streak:** 3+(1.5x) 5+(2x) 10+(2.5x)' },
                    { name: '🔍 Zoom Levels', value: 'Easy: 40% visible | Normal: 25% | Hard: 16%\nSmaller view = harder!' },
                    { name: '🏆 Leaderboard', value: '`/leaderboard` - See top 10' }
                )
                .setColor('#0099ff');
            
            await interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
        }
    } catch (error) {
        console.error(error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Error occurred!', flags: MessageFlags.Ephemeral });
        }
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    await checkGuess(message);
});

client.on('error', console.error);
process.on('unhandledRejection', console.error);

// Graceful shutdown for Render.com
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully...');
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);