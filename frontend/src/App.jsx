import React, { useState, useEffect } from 'react';

// Inline SVG Icon components for bulletproof rendering without package dependencies
const SearchIcon = () => (
  <svg className="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
);
const MapPinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
);
const BriefcaseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
);
const ClockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
);
const AwardIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
);
const XIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
);
const RefreshIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
);

const API_BASE = 'http://localhost:5000/api';

function App() {
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reRanking, setReRanking] = useState(false);
  const [stats, setStats] = useState(null);
  const [dbMode, setDbMode] = useState("File System");
  
  // Filters State
  const [search, setSearch] = useState("");
  const [noticePeriod, setNoticePeriod] = useState("any");
  const [locationFilter, setLocationFilter] = useState("any");
  const [minExperience, setMinExperience] = useState(4.0);
  const [activityFilter, setActivityFilter] = useState("any");
  const [sidebarTab, setSidebarTab] = useState("shortlist");

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Candidates List
      const res = await fetch(`${API_BASE}/candidates`);
      const data = await res.json();
      setCandidates(data.candidates || []);
      setDbMode(data.isFallback ? "File System Fallback" : "MongoDB (Connected)");
      
      // Auto-select first candidate in shortlist
      if (data.candidates && data.candidates.length > 0) {
        // Fetch full profile details of the first candidate
        fetchCandidateDetails(data.candidates[0].candidate_id);
      } else {
        setSelectedCandidate(null);
      }
      
      // 2. Fetch Stats
      const statsRes = await fetch(`${API_BASE}/stats`);
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchCandidateDetails = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/candidates/${id}`);
      const data = await res.json();
      setSelectedCandidate(data);
    } catch (e) {
      console.error('Error fetching candidate details:', e);
    }
  };

  const handleReRank = async () => {
    if (reRanking) return;
    setReRanking(true);
    try {
      const res = await fetch(`${API_BASE}/re-rank`, { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Re-ranking completed!');
      await fetchData();
    } catch (e) {
      console.error('Re-ranking error:', e);
      alert('Re-ranking execution failed. Check backend console.');
    } finally {
      setReRanking(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter Logic
  const filteredCandidates = candidates.filter(c => {
    // 1. Search Query (Name, Title, Skills)
    if (search) {
      const term = search.toLowerCase();
      const name = (c.profile?.anonymized_name || "").toLowerCase();
      const title = (c.profile?.current_title || "").toLowerCase();
      const skills = (c.skills || []).map(s => s.name.toLowerCase()).join(" ");
      if (!name.includes(term) && !title.includes(term) && !skills.includes(term)) {
        return false;
      }
    }
    
    // 2. Notice Period
    if (noticePeriod !== "any") {
      const np = c.redrob_signals?.notice_period_days || 0;
      if (noticePeriod === "immediate" && np > 30) return false;
      if (noticePeriod === "60" && np > 60) return false;
      if (noticePeriod === "90" && np > 90) return false;
    }
    
    // 3. Location
    if (locationFilter !== "any") {
      const loc = (c.profile?.location || "").toLowerCase();
      const reloc = c.redrob_signals?.willing_to_relocate || false;
      const isLocal = loc.includes("pune") || loc.includes("noida") || loc.includes("delhi") || loc.includes("ncr") || loc.includes("gurgaon");
      
      if (locationFilter === "local" && !isLocal) return false;
      if (locationFilter === "reloc" && !isLocal && !reloc) return false;
    }
    
    // 4. Experience Slider
    const exp = c.profile?.years_of_experience || 0;
    if (exp < minExperience) return false;
    
    // 5. Activity
    if (activityFilter !== "any") {
      const lastAct = c.redrob_signals?.last_active_date || "";
      if (lastAct) {
        const actDate = new Date(lastAct);
        const refDate = new Date("2026-05-27");
        const diffDays = Math.ceil(Math.abs(refDate - actDate) / (1000 * 60 * 60 * 24));
        if (activityFilter === "30" && diffDays > 30) return false;
        if (activityFilter === "90" && diffDays > 90) return false;
      } else {
        return false;
      }
    }
    
    return true;
  });

  return (
    <div className="dashboard-container">
      {/* Sidebar Section */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">S</div>
          <span className="brand-text">SmartHire AI</span>
        </div>
        
        <nav className="nav-links">
          <li className={`nav-item ${sidebarTab === 'shortlist' ? 'active' : ''}`} onClick={() => setSidebarTab('shortlist')}>
            <BriefcaseIcon /> Shortlist Ranked List
          </li>
        </nav>
        
        <div className="filter-bar">
          <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-dark)', letterSpacing: '0.05em' }}>Recruiting Filters</h4>
          
          <div className="filter-group">
            <label>Experience (Min Years)</label>
            <input 
              type="range" 
              className="range-slider" 
              min="0" 
              max="15" 
              step="0.5"
              value={minExperience} 
              onChange={(e) => setMinExperience(parseFloat(e.target.value))}
            />
            <div className="range-labels">
              <span>0 yrs</span>
              <span style={{ color: 'var(--color-primary-light)', fontWeight: 'bold' }}>{minExperience} yrs</span>
              <span>15 yrs</span>
            </div>
          </div>
          
          <div className="filter-group">
            <label>Notice Period</label>
            <select className="filter-select" value={noticePeriod} onChange={(e) => setNoticePeriod(e.target.value)}>
              <option value="any">Any Notice Period</option>
              <option value="immediate">Immediate/Sub-30 Days</option>
              <option value="60">Max 60 Days</option>
              <option value="90">Max 90 Days</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Location Profile</label>
            <select className="filter-select" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="any">Any Location</option>
              <option value="local">Noida/Pune Local Only</option>
              <option value="reloc">Willing to Relocate</option>
            </select>
          </div>
          
          <div className="filter-group">
            <label>Candidate Activity</label>
            <select className="filter-select" value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)}>
              <option value="any">Any Activity</option>
              <option value="30">Active in Last 30 Days</option>
              <option value="90">Active in Last 90 Days</option>
            </select>
          </div>
        </div>
        
        <button 
          className={`btn btn-primary ${reRanking ? 'btn-disabled' : ''}`} 
          onClick={handleReRank}
          disabled={reRanking}
          style={{ marginTop: 'auto' }}
        >
          <RefreshIcon /> {reRanking ? 'Re-scoring Pool...' : 'Trigger AI Re-Rank'}
        </button>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="page-header">
          <div className="page-title">
            <h1>Talent Matching Dashboard</h1>
            <p>Senior AI Engineer — Founding Team search | Database Mode: <span style={{ color: 'var(--color-primary-light)', fontWeight: '600' }}>{dbMode}</span></p>
          </div>
        </header>

        {/* Stats Grid */}
        {stats && (
          <section className="stats-grid">
            <div className="glass-card stat-card">
              <div className="stat-icon"><BriefcaseIcon /></div>
              <div className="stat-info">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">Total Candidate Pool</span>
              </div>
            </div>
            
            <div className="glass-card stat-card">
              <div className="stat-icon"><AwardIcon /></div>
              <div className="stat-info">
                <span className="stat-value">100</span>
                <span className="stat-label">Recommended Shortlist</span>
              </div>
            </div>
            
            <div className="glass-card stat-card">
              <div className="stat-icon"><ClockIcon /></div>
              <div className="stat-info">
                <span className="stat-value">{stats.averageExperience} Yrs</span>
                <span className="stat-label">Avg Experience</span>
              </div>
            </div>
          </section>
        )}

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '1rem' }}>
            <div className="loading-spinner"></div>
            <p style={{ color: 'var(--text-muted)' }}>Analyzing candidate dataset and scores...</p>
          </div>
        ) : (
          <div className="candidates-view">
            {/* Left Panel - Shortlisted Candidates */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem' }}>Top Matches ({filteredCandidates.length})</h2>
                <div className="search-box" style={{ maxWidth: '220px' }}>
                  <SearchIcon />
                  <input 
                    type="text" 
                    className="search-input" 
                    placeholder="Search name, skills..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="candidate-list-container">
                {filteredCandidates.length === 0 ? (
                  <div className="empty-state">No candidates match active filter conditions.</div>
                ) : (
                  filteredCandidates.map((c) => {
                    const isSelected = selectedCandidate && selectedCandidate.candidate_id === c.candidate_id;
                    const isTop3 = c.rank <= 3;
                    const matchPct = Math.round((c.score || 0) * 100);
                    
                    return (
                      <div 
                        key={c.candidate_id} 
                        className={`candidate-row ${isSelected ? 'active' : ''}`}
                        onClick={() => fetchCandidateDetails(c.candidate_id)}
                      >
                        <div className="candidate-meta">
                          <div className={`rank-badge ${isTop3 ? 'top-3' : ''}`}>
                            {c.rank}
                          </div>
                          <div className="candidate-brief">
                            <h3>{c.profile?.anonymized_name}</h3>
                            <p>{c.profile?.current_title} at {c.profile?.current_company || 'Stealth Startup'}</p>
                            <div className="badges-row" style={{ marginTop: '0.35rem' }}>
                              <span className="badge badge-location"><MapPinIcon /> {c.profile?.location}</span>
                              <span className="badge badge-experience"><BriefcaseIcon /> {c.profile?.years_of_experience} yrs exp</span>
                              <span className="badge badge-notice"><ClockIcon /> {c.redrob_signals?.notice_period_days} days notice</span>
                            </div>
                          </div>
                        </div>
                        <div className="candidate-score-area">
                          <span className="score-badge">{matchPct}%</span>
                          <span className="match-pct">Match</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Panel - Profile & AI Details */}
            <div className="detail-panel">
              {selectedCandidate ? (
                <>
                  {/* Candidate Header & Score Details */}
                  <div className="glass-card">
                    <div className="detail-header">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <h2 className="detail-name">{selectedCandidate.profile?.anonymized_name}</h2>
                          <p className="detail-title">{selectedCandidate.profile?.current_title} at {selectedCandidate.profile?.current_company}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '2.5rem', fontWeight: '800', fontFamily: 'var(--font-display)', color: 'var(--color-primary-light)', lineHeight: '1' }}>
                            {Math.round((selectedCandidate.score || 0) * 100)}%
                          </div>
                          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 'bold' }}>AI Recommendation Score</span>
                        </div>
                      </div>
                      
                      <div className="badges-row">
                        <span className="badge badge-location"><MapPinIcon /> {selectedCandidate.profile?.location}, {selectedCandidate.profile?.country}</span>
                        <span className="badge badge-experience"><BriefcaseIcon /> {selectedCandidate.profile?.years_of_experience} Years Experience</span>
                        <span className="badge badge-notice"><ClockIcon /> {selectedCandidate.redrob_signals?.notice_period_days} Days Notice</span>
                      </div>
                    </div>
                    
                    {/* Score Breakdown (Sub-scores) */}
                    {selectedCandidate.details && (
                      <div style={{ marginTop: '1.25rem' }}>
                        <h3 className="section-title">Score Breakdown</h3>
                        <div className="signals-list">
                          <div className="signal-item">
                            <span className="signal-lbl">Semantic JD Fit</span>
                            <span className="signal-val" style={{ color: 'var(--color-success)' }}>{Math.round(selectedCandidate.details.semantic_similarity * 100)}%</span>
                          </div>
                          <div className="signal-item">
                            <span className="signal-lbl">Skills Match</span>
                            <span className="signal-val" style={{ color: 'var(--color-primary-light)' }}>{Math.round(selectedCandidate.details.skill_score * 100)}%</span>
                          </div>
                          <div className="signal-item">
                            <span className="signal-lbl">Experience Multiplier</span>
                            <span className="signal-val">{Math.round(selectedCandidate.details.experience_multiplier * 100)}%</span>
                          </div>
                          <div className="signal-item">
                            <span className="signal-lbl">Engagement Multiplier</span>
                            <span className="signal-val">{Math.round(selectedCandidate.details.behavioral_multiplier * 100)}%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Explainable AI Details */}
                  <div className="glass-card explain-section">
                    <div>
                      <h3 className="section-title">AI Recruiter Summary</h3>
                      <div className="reasoning-text">
                        "{selectedCandidate.reasoning}"
                      </div>
                    </div>

                    {selectedCandidate.details && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
                        <div>
                          <h4 style={{ color: 'var(--color-success)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Key Strengths</h4>
                          <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-main)' }}>
                            {selectedCandidate.details.strengths && selectedCandidate.details.strengths.map((str, idx) => (
                              <li key={idx} style={{ color: '#a7f3d0' }}>{str}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <h4 style={{ color: 'var(--color-warning)', fontSize: '0.85rem', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Areas of Concern</h4>
                          <ul style={{ paddingLeft: '1rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-main)' }}>
                            {selectedCandidate.details.weaknesses && selectedCandidate.details.weaknesses.map((w, idx) => (
                              <li key={idx} style={{ color: '#fde68a' }}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Skill Gap Analysis */}
                  <div className="glass-card">
                    <h3 className="section-title">JD Skill Gap Analysis</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Embeddings & Semantic Retrieval</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SentenceTransformers, DPR, RAG</span>
                        </div>
                        <div>
                          {(selectedCandidate.skills || []).some(s => ['embedding', 'sentence-transformer', 'semantic search', 'retrieval'].some(kw => s.name.toLowerCase().includes(kw))) ? <CheckIcon /> : <XIcon />}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Vector Databases / Indexing</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pinecone, Qdrant, Milvus, FAISS</span>
                        </div>
                        <div>
                          {(selectedCandidate.skills || []).some(s => ['pinecone', 'weaviate', 'qdrant', 'milvus', 'elasticsearch', 'faiss'].some(kw => s.name.toLowerCase().includes(kw))) ? <CheckIcon /> : <XIcon />}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Core Machine Learning & Python</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Python, PyTorch, Scikit-Learn</span>
                        </div>
                        <div>
                          {(selectedCandidate.skills || []).some(s => ['python', 'pytorch', 'tensorflow', 'scikit-learn'].some(kw => s.name.toLowerCase().includes(kw))) ? <CheckIcon /> : <XIcon />}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Ranking Eval Frameworks</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>NDCG, MAP, MRR Metrics</span>
                        </div>
                        <div>
                          {(selectedCandidate.skills || []).some(s => ['ndcg', 'mrr', 'map', 'eval'].some(kw => s.name.toLowerCase().includes(kw))) ? <CheckIcon /> : <XIcon />}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Career Timeline */}
                  <div className="glass-card">
                    <h3 className="section-title">Career Timeline</h3>
                    <div className="timeline" style={{ marginTop: '1rem' }}>
                      {selectedCandidate.career_history && selectedCandidate.career_history.map((job, idx) => (
                        <div key={idx} className="timeline-item">
                          <div className="timeline-dot"></div>
                          <div className="timeline-content">
                            <h4>{job.title}</h4>
                            <div className="timeline-company">{job.company} • {job.duration_months} Months ({job.start_date} to {job.end_date || 'Present'})</div>
                            <p className="timeline-desc">{job.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card empty-state">Select a candidate to view detailed scoring profile, AI reasoning, and career history.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
