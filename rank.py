import os
import sys
import json
import argparse
import numpy as np
import docx
from sentence_transformers import SentenceTransformer

# Add the ai-engine folder to path to import scorer
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "ai-engine"))
from scorer import CandidateScorer

def get_jd_text(jd_path):
    print(f"Reading Job Description from {jd_path}...")
    doc = docx.Document(jd_path)
    return "\n".join([p.text for p in doc.paragraphs if p.text])

def main():
    parser = argparse.ArgumentParser(description="Rank candidates for the Redrob AI Engineer role.")
    parser.add_argument("--candidates", type=str, default="candidates.jsonl", help="Path to candidates.jsonl file.")
    parser.add_argument("--out", type=str, default="submission.csv", help="Path to output CSV file.")
    args = parser.parse_args()
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Resolve absolute paths
    candidates_path = os.path.abspath(args.candidates)
    output_csv_path = os.path.abspath(args.out)
    jd_path = os.path.join(base_dir, "job_description.docx")
    embeddings_path = os.path.join(base_dir, "data", "candidate_embeddings.npy")
    
    if not os.path.exists(candidates_path):
        print(f"Error: Candidates file not found at {candidates_path}")
        sys.exit(1)
        
    if not os.path.exists(jd_path):
        print(f"Error: Job Description not found at {jd_path}")
        sys.exit(1)
        
    # Read Job Description
    jd_text = get_jd_text(jd_path)
    
    # Load model
    print("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    
    # Compute JD embedding
    print("Embedding Job Description...")
    jd_embedding = model.encode(jd_text, show_progress_bar=False)
    
    # Load candidates
    print(f"Loading candidates from {candidates_path}...")
    candidates = []
    with open(candidates_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            candidates.append(json.loads(line))
            
    num_candidates = len(candidates)
    print(f"Loaded {num_candidates} candidates.")
    
    # Load or generate candidate embeddings
    if os.path.exists(embeddings_path):
        print(f"Loading precomputed candidate embeddings from {embeddings_path}...")
        cand_embeddings = np.load(embeddings_path)
        if len(cand_embeddings) != num_candidates:
            print(f"Warning: Embeddings count ({len(cand_embeddings)}) does not match candidates count ({num_candidates}). Regenerating...")
            os.system(f"python {os.path.join(base_dir, 'ai-engine', 'embeddings.py')}")
            cand_embeddings = np.load(embeddings_path)
    else:
        print("Precomputed candidate embeddings not found. Generating embeddings (this may take several minutes)...")
        # Run embeddings generation script
        import subprocess
        emb_script = os.path.join(base_dir, "ai-engine", "embeddings.py")
        subprocess.run([sys.executable, emb_script], check=True)
        cand_embeddings = np.load(embeddings_path)
        
    # Calculate Cosine Similarities
    print("Calculating semantic similarity scores...")
    # Normalize vectors for cosine similarity
    jd_norm = jd_embedding / np.linalg.norm(jd_embedding)
    cand_norms = np.linalg.norm(cand_embeddings, axis=1, keepdims=True)
    # Avoid division by zero
    cand_norms[cand_norms == 0] = 1.0
    cand_embeddings_normalized = cand_embeddings / cand_norms
    
    similarities = np.dot(cand_embeddings_normalized, jd_norm)
    
    # Run Scorer on all candidates
    print("Running scoring engine and filters...")
    scored_candidates = []
    honeypot_count = 0
    disqualified_count = 0
    
    for idx, cand in enumerate(candidates):
        cid = cand["candidate_id"]
        sim = float(similarities[idx])
        
        final_score, details = CandidateScorer.calculate_score(cand, sim)
        
        if details.get("honeypot"):
            honeypot_count += 1
            
        if details.get("disqualified"):
            disqualified_count += 1
            # Skip ranking disqualified candidates (they get score 0)
            
        scored_candidates.append({
            "candidate_id": cid,
            "score": final_score,
            "reasoning": details.get("reasoning", ""),
            "details": details
        })
        
    print(f"Scan summary: Flagged {honeypot_count} honeypots. Disqualified {disqualified_count} total candidates.")
    
    # Sort candidates: primary by score DESC, secondary by candidate_id ASC (to break ties deterministically)
    # In Python, we can sort using a tuple: (-score, candidate_id)
    print("Sorting candidates...")
    scored_candidates.sort(key=lambda x: (-round(x["score"], 4), x["candidate_id"]))
    
    # Extract top 100
    top_100 = scored_candidates[:100]
    
    # Verify no honeypots in top 100
    top_100_honeypots = [c for c in top_100 if c["details"].get("honeypot")]
    print(f"Verification: Honeypots in top 100: {len(top_100_honeypots)} (Rate: {len(top_100_honeypots)}%)")
    if len(top_100_honeypots) > 0:
        print("Warning: Found honeypots in the top 100! These should have been filtered.")
        
    # Write to CSV
    print(f"Writing ranked list to {output_csv_path}...")
    
    # Ensure directory exists
    out_dir = os.path.dirname(output_csv_path)
    if out_dir and not os.path.exists(out_dir):
        os.makedirs(out_dir)
        
    import csv
    with open(output_csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        # Header row
        writer.writerow(["candidate_id", "rank", "score", "reasoning"])
        for rank, cand in enumerate(top_100, 1):
            # Format reasoning: remove quotes and make sure it's valid CSV text
            reasoning = cand["reasoning"].replace('"', "'")
            writer.writerow([cand["candidate_id"], rank, round(cand["score"], 4), reasoning])
            
    print("CSV generated successfully!")
    
    # Write metadata helper for frontend / backend (top candidates info)
    meta_out = os.path.join(base_dir, "data", "ranked_candidates_details.json")
    with open(meta_out, "w", encoding="utf-8") as f:
        # Save top 100 with details
        json.dump([
            {
                "candidate_id": c["candidate_id"],
                "rank": idx + 1,
                "score": round(c["score"], 4),
                "reasoning": c["reasoning"],
                "details": c["details"]
            }
            for idx, c in enumerate(top_100)
        ], f, indent=2)
    print(f"Saved top 100 candidate details to {meta_out}")

if __name__ == "__main__":
    main()
