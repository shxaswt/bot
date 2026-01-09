require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');

// 1. Define the Schema (Same as your bot)
const playerSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    username: String,
    totalPoints: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    maxStreak: { type: Number, default: 0 },
    blueEssence: { type: Number, default: 0 },
    orangeEssence: { type: Number, default: 0 },
    chests: { type: Number, default: 0 },
    ownedChampions: { type: Array, default: [] },
    ownedSkins: { type: Array, default: [] },
    championShards: { type: Array, default: [] },
    skinShards: { type: Array, default: [] },
    lastDaily: { type: Number, default: 0 }
});

const Player = mongoose.model('Player', playerSchema);

const PLAYER_DATA_FILE = 'playerData.json';

// ... (keep the top part of migrate.js the same)

async function migrate() {
    await mongoose.connect(process.env.MONGODB_URI);
    const rawData = fs.readFileSync(PLAYER_DATA_FILE, 'utf8');
    const jsonData = JSON.parse(rawData);

    // This version handles cases where the ID is the KEY of the object
    for (const [id, userData] of Object.entries(jsonData)) {
        const finalId = userData.userId || id; // Use the key if userId property is missing
        
        await Player.findOneAndUpdate(
            { userId: finalId },
            { ...userData, userId: finalId },
            { upsert: true }
        );
        console.log(`✅ Migrated: ${userData.username} (ID: ${finalId})`);
    }
    console.log("🎉 Migration Complete and Verified!");
    process.exit(0);
}
migrate();

