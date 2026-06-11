import json
import os
import sys
import numpy as np
from sentence_transformers import SentenceTransformer

# Define paths
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
candidates_file = os.path.join(base_dir, "candidates.jsonl")
output_dir = os.path.join(base_dir, "data")
output_file = os.path.join(output_dir, "candidate_embeddings.npy")

def get_candidate_text(cand):
    # Construct a descriptive text profile of the candidate
    profile = cand.get("profile", {})
    headline = profile.get("headline", "")
    summary = profile.get("summary", "")
    years_exp = profile.get("years_of_experience", 0)
    current_title = profile.get("current_title", "")
    current_company = profile.get("current_company", "")
    
    # Skills list
    skills = [s.get("name", "") for s in cand.get("skills", [])]
    skills_str = ", ".join(skills)
    
    # Career history summaries
    history_list = []
    for job in cand.get("career_history", []):
        title = job.get("title", "")
        company = job.get("company", "")
        desc = job.get("description", "")
        history_list.append(f"Role: {title} at {company}. Description: {desc}")
    history_str = " | ".join(history_list)
    
    # Education
    edu_list = []
    for edu in cand.get("education", []):
        deg = edu.get("degree", "")
        field = edu.get("field_of_study", "")
        inst = edu.get("institution", "")
        edu_list.append(f"{deg} in {field} from {inst}")
    edu_str = ", ".join(edu_list)
    
    text = (
        f"Title: {current_title} at {current_company}. "
        f"Headline: {headline}. "
        f"Experience: {years_exp} years. "
        f"Summary: {summary}. "
        f"Skills: {skills_str}. "
        f"History: {history_str}. "
        f"Education: {edu_str}."
    )
    return text

def main():
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    print(f"Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
    model = SentenceTransformer("all-MiniLM-L6-v2")
    
    print(f"Reading candidates from {candidates_file}...")
    texts = []
    ids = []
    
    # Read the file and build text inputs
    with open(candidates_file, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            cand = json.loads(line)
            ids.append(cand["candidate_id"])
            texts.append(get_candidate_text(cand))
            
    total_candidates = len(texts)
    print(f"Total candidates to embed: {total_candidates}")
    
    # Encode in batches to keep memory usage low and show progress
    batch_size = 1024
    embeddings = []
    
    for i in range(0, total_candidates, batch_size):
        batch_texts = texts[i:i+batch_size]
        print(f"Embedding batch {i // batch_size + 1}/{(total_candidates - 1) // batch_size + 1} ({i} to {min(i + batch_size, total_candidates)})...")
        batch_embeddings = model.encode(batch_texts, show_progress_bar=False, batch_size=64)
        embeddings.append(batch_embeddings)
        
    print("Concatenating embeddings...")
    embeddings = np.vstack(embeddings)
    
    print(f"Saving embeddings to {output_file}...")
    np.save(output_file, embeddings)
    print("Precomputation finished successfully!")

if __name__ == "__main__":
    main()
