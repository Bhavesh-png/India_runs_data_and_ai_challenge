const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('./db');

require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const baseDir = path.dirname(__dirname);

// Helper to extract Job Description to text if needed
function getJobDescriptionText() {
    const txtPath = path.join(baseDir, 'data', 'job_description.txt');
    if (fs.existsSync(txtPath)) {
        return fs.readFileSync(txtPath, 'utf8');
    }
    
    // Check if md exists in our brain folder
    const brainMd = 'C:\\Users\\bhave\\.gemini\\antigravity-ide\\brain\\9988c247-6ead-4aff-9f6e-38a908e422b2\\job_description.md';
    if (fs.existsSync(brainMd)) {
        const text = fs.readFileSync(brainMd, 'utf8');
        fs.writeFileSync(txtPath, text);
        return text;
    }
    
    return "Senior AI Engineer — Founding Team\nRedrob AI (Series A AI-native talent intelligence platform)\nLocation: Pune/Noida, India (Hybrid)\nExperience Required: 5–9 years";
}

// API Routes
app.get('/api/job-description', (req, res) => {
    try {
        const text = getJobDescriptionText();
        res.json({ text });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/candidates', async (req, res) => {
    try {
        const candidates = await db.getCandidates();
        
        // Add DB mode header/metadata
        res.json({
            isFallback: db.isFallback(),
            count: candidates.length,
            candidates
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/candidates/:id', async (req, res) => {
    try {
        const cand = await db.getCandidateById(req.params.id);
        if (!cand) {
            return res.status(404).json({ error: 'Candidate not found' });
        }
        res.json(cand);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const candidates = await db.getCandidates();
        const total = candidates.length;
        
        if (total === 0) {
            return res.json({ total: 0 });
        }
        
        let totalExp = 0;
        const locations = {};
        const noticePeriods = { '0-30 days': 0, '31-60 days': 0, '61-90 days': 0, '90+ days': 0 };
        const matchScores = { '90%+': 0, '80-89%': 0, '70-79%': 0, '50-69%': 0, '<50%': 0 };
        
        candidates.forEach(c => {
            totalExp += c.profile?.years_of_experience || 0;
            
            // Location
            const loc = c.profile?.location || 'Unknown';
            locations[loc] = (locations[loc] || 0) + 1;
            
            // Notice Period
            const np = c.redrob_signals?.notice_period_days || 0;
            if (np <= 30) noticePeriods['0-30 days']++;
            else if (np <= 60) noticePeriods['31-60 days']++;
            else if (np <= 90) noticePeriods['61-90 days']++;
            else noticePeriods['90+ days']++;
            
            // Match score (if ranked)
            const score = c.score || 0;
            const pct = score * 100;
            if (pct >= 90) matchScores['90%+']++;
            else if (pct >= 80) matchScores['80-89%']++;
            else if (pct >= 70) matchScores['70-79%']++;
            else if (pct >= 50) matchScores['50-69%']++;
            else matchScores['<50%']++;
        });
        
        // Sort locations
        const sortedLocations = Object.entries(locations)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(e => ({ name: e[0], count: e[1] }));
            
        res.json({
            total,
            averageExperience: (totalExp / total).toFixed(1),
            locations: sortedLocations,
            noticePeriods: Object.entries(noticePeriods).map(([k, v]) => ({ label: k, count: v })),
            matchScores: Object.entries(matchScores).map(([k, v]) => ({ label: k, count: v })),
            dbMode: db.isFallback() ? 'File System' : 'MongoDB'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/re-rank', (req, res) => {
    console.log('Triggering candidate re-ranking script...');
    
    const pythonPath = path.join(baseDir, '.venv', 'Scripts', 'python.exe');
    const rankScript = path.join(baseDir, 'rank.py');
    const candidatesFile = path.join(baseDir, 'candidates.jsonl');
    const outFile = path.join(baseDir, 'output', 'ranked_candidates.csv');
    
    const command = `"${pythonPath}" "${rankScript}" --candidates "${candidatesFile}" --out "${outFile}"`;
    
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Re-ranking execution error: ${error}`);
            console.error(stderr);
            return res.status(500).json({ error: 'Re-ranking failed', details: error.message });
        }
        
        console.log('Re-ranking successful!');
        console.log(stdout);
        
        // Re-read or re-seed data
        if (db.isFallback()) {
            db.connectDB(); // Reload fallback files
        } else {
            db.seedDatabase(true).catch(err => console.error("Error re-seeding MongoDB:", err));
        }
        
        res.json({ message: 'Re-ranking completed successfully!', output: stdout });
    });
});

// Initialize database connection
db.connectDB().then(() => {
    app.listen(port, () => {
        console.log(`SmartHire Backend running on port ${port}`);
        // Ensure JD text is cached
        getJobDescriptionText();
    });
});
