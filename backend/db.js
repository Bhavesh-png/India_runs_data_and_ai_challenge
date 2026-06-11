const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = 'smarthire';
let db = null;
let client = null;
let useFallback = false;

// Memory Cache for Fallback Mode
let fallbackCandidates = [];
let fallbackRanked = [];

async function connectDB() {
    try {
        console.log(`Attempting to connect to MongoDB at ${mongoUri}...`);
        client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 3000 });
        await client.connect();
        db = client.db(dbName);
        console.log('MongoDB connected successfully!');
        
        // Seed if empty
        await seedDatabase();
    } catch (err) {
        console.warn('MongoDB connection failed. Falling back to File-System Mode.');
        useFallback = true;
        loadFallbackData();
    }
}

async function seedDatabase(force = false) {
    const col = db.collection('candidates');
    if (force) {
        console.log('Force re-seeding requested. Clearing candidates collection...');
        await col.deleteMany({});
    } else {
        const count = await col.countDocuments();
        if (count > 0) {
            console.log(`Database already has ${count} candidates. Skipping seed.`);
            return;
        }
    }
    
    console.log('Seeding top candidates and sample candidate profiles...');
    const baseDir = path.dirname(__dirname);
    
    // Load Ranked Details (Top 100)
    let seededIds = new Set();
    const rankedPath = path.join(baseDir, 'data', 'ranked_candidates_details.json');
    const candidatesPath = path.join(baseDir, 'candidates.jsonl');
    const samplePath = path.join(baseDir, 'sample_candidates.json');
    
    let candidatesToInsert = [];
    
    // 1. Add ranked top 100 details if they exist
    if (fs.existsSync(rankedPath)) {
        try {
            const ranked = JSON.parse(fs.readFileSync(rankedPath, 'utf8'));
            const idsToFind = new Set(ranked.map(r => r.candidate_id));
            
            if (fs.existsSync(candidatesPath)) {
                console.log('Scanning candidates.jsonl line-by-line for ranked candidates...');
                const fileStream = fs.createReadStream(candidatesPath);
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });
                
                for await (const line of rl) {
                    if (!line.trim()) continue;
                    const cand = JSON.parse(line);
                    if (idsToFind.has(cand.candidate_id)) {
                        const rankInfo = ranked.find(r => r.candidate_id === cand.candidate_id);
                        cand.rank = rankInfo.rank;
                        cand.score = rankInfo.score;
                        cand.reasoning = rankInfo.reasoning;
                        cand.details = rankInfo.details;
                        candidatesToInsert.push(cand);
                        seededIds.add(cand.candidate_id);
                    }
                }
            }
        } catch (e) {
            console.error('Error seeding from ranked list:', e);
        }
    }
    
    // 2. Add sample candidates if they exist
    if (fs.existsSync(samplePath)) {
        try {
            const samples = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
            for (const cand of samples) {
                if (!seededIds.has(cand.candidate_id)) {
                    cand.rank = 999;
                    cand.score = 0.0;
                    candidatesToInsert.push(cand);
                    seededIds.add(cand.candidate_id);
                }
            }
        } catch (e) {
            console.error('Error seeding from sample_candidates:', e);
        }
    }
    
    // 3. Fallback to reading first 500 lines of candidates.jsonl if still small
    if (candidatesToInsert.length < 500 && fs.existsSync(candidatesPath)) {
        try {
            console.log('Reading first 500 lines of candidates.jsonl for database sample...');
            const fileStream = fs.createReadStream(candidatesPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            
            let count = 0;
            for await (const line of rl) {
                if (!line.trim()) continue;
                const cand = JSON.parse(line);
                if (!seededIds.has(cand.candidate_id)) {
                    cand.rank = 999;
                    cand.score = 0.0;
                    candidatesToInsert.push(cand);
                    seededIds.add(cand.candidate_id);
                    count++;
                }
                if (count >= 500) break;
            }
        } catch (e) {
            console.error('Error seeding from candidates.jsonl:', e);
        }
    }
    
    if (candidatesToInsert.length > 0) {
        console.log(`Inserting ${candidatesToInsert.length} documents into MongoDB...`);
        await col.insertMany(candidatesToInsert);
        // Create indexes
        await col.createIndex({ candidate_id: 1 }, { unique: true });
        await col.createIndex({ score: -1 });
        await col.createIndex({ rank: 1 });
        console.log('Database seeding completed!');
    }
}

function loadFallbackData() {
    console.log('Loading fallback data from file system...');
    const baseDir = path.dirname(__dirname);
    const samplePath = path.join(baseDir, 'sample_candidates.json');
    const rankedPath = path.join(baseDir, 'data', 'ranked_candidates_details.json');
    
    if (fs.existsSync(samplePath)) {
        fallbackCandidates = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
        console.log(`Loaded ${fallbackCandidates.length} fallback candidates from sample_candidates.json`);
    }
    
    if (fs.existsSync(rankedPath)) {
        fallbackRanked = JSON.parse(fs.readFileSync(rankedPath, 'utf8'));
        console.log(`Loaded ${fallbackRanked.length} ranked details from ranked_candidates_details.json`);
    }
}

async function getCandidates(filters = {}) {
    if (useFallback) {
        // Fallback filter/search logic
        let list = [...fallbackCandidates];
        
        // Merge with ranked details
        const rankedMap = {};
        fallbackRanked.forEach(r => {
            rankedMap[r.candidate_id] = r;
        });
        
        // Ensure candidates in top 100 are included even if not in sample
        const listIds = new Set(list.map(c => c.candidate_id));
        fallbackRanked.forEach(r => {
            if (!listIds.has(r.candidate_id)) {
                // We'll create a stub for display since we don't have their full career history in fallback mode,
                // but we can load it from the candidates.jsonl file on demand!
                list.push({
                    candidate_id: r.candidate_id,
                    profile: {
                        anonymized_name: `Candidate ${r.candidate_id.replace('CAND_', '')}`,
                        headline: "Senior AI Engineer",
                        years_of_experience: 7.0, // default placeholder for stub
                        location: "Pune/Noida"
                    },
                    rank: r.rank,
                    score: r.score,
                    reasoning: r.reasoning,
                    details: r.details
                });
            }
        });
        
        // Attach rank details to normal list candidates
        list.forEach(c => {
            if (rankedMap[c.candidate_id]) {
                c.rank = rankedMap[c.candidate_id].rank;
                c.score = rankedMap[c.candidate_id].score;
                c.reasoning = rankedMap[c.candidate_id].reasoning;
                c.details = rankedMap[c.candidate_id].details;
            } else {
                c.rank = 999;
                c.score = 0.0;
            }
        });
        
        // Sort: ranked first, then by score
        list.sort((a, b) => a.rank - b.rank);
        return list;
    }
    
    // MongoDB Query
    const col = db.collection('candidates');
    return await col.find().sort({ rank: 1, score: -1 }).toArray();
}

async function getCandidateById(candidateId) {
    if (useFallback) {
        // Try memory cache first
        let cand = fallbackCandidates.find(c => c.candidate_id === candidateId);
        if (cand) {
            const ranked = fallbackRanked.find(r => r.candidate_id === candidateId);
            if (ranked) {
                cand.rank = ranked.rank;
                cand.score = ranked.score;
                cand.reasoning = ranked.reasoning;
                cand.details = ranked.details;
            }
            return cand;
        }
        
        // Read directly from candidates.jsonl line-by-line (highly memory-efficient)
        const baseDir = path.dirname(__dirname);
        const candidatesPath = path.join(baseDir, 'candidates.jsonl');
        if (fs.existsSync(candidatesPath)) {
            try {
                const fileStream = fs.createReadStream(candidatesPath);
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });
                
                for await (const line of rl) {
                    if (!line.trim()) continue;
                    const c = JSON.parse(line);
                    if (c.candidate_id === candidateId) {
                        const ranked = fallbackRanked.find(r => r.candidate_id === candidateId);
                        if (ranked) {
                            c.rank = ranked.rank;
                            c.score = ranked.score;
                            c.reasoning = ranked.reasoning;
                            c.details = ranked.details;
                        }
                        return c;
                    }
                }
            } catch (err) {
                console.error("Error reading candidate from file stream:", err);
            }
        }
        return null;
    }
    
    const col = db.collection('candidates');
    let cand = await col.findOne({ candidate_id: candidateId });
    if (!cand) {
        // Try reading from jsonl and inserting on demand if someone requests it
        const baseDir = path.dirname(__dirname);
        const candidatesPath = path.join(baseDir, 'candidates.jsonl');
        if (fs.existsSync(candidatesPath)) {
            try {
                const fileStream = fs.createReadStream(candidatesPath);
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });
                
                for await (const line of rl) {
                    if (!line.trim()) continue;
                    const c = JSON.parse(line);
                    if (c.candidate_id === candidateId) {
                        const rankedPath = path.join(baseDir, 'data', 'ranked_candidates_details.json');
                        if (fs.existsSync(rankedPath)) {
                            const ranked = JSON.parse(fs.readFileSync(rankedPath, 'utf8'));
                            const rInfo = ranked.find(r => r.candidate_id === candidateId);
                            if (rInfo) {
                                c.rank = rInfo.rank;
                                c.score = rInfo.score;
                                c.reasoning = rInfo.reasoning;
                                c.details = rInfo.details;
                            } else {
                                c.rank = 999;
                                c.score = 0.0;
                            }
                        }
                        await col.insertOne(c);
                        return c;
                    }
                }
            } catch (err) {
                console.error("Error fetching candidate from stream:", err);
            }
        }
    }
    return cand;
}

module.exports = {
    connectDB,
    getCandidates,
    getCandidateById,
    seedDatabase,
    isFallback: () => useFallback
};
