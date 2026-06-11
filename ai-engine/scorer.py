import datetime

# Reference date for the dataset (maximum last_active_date is 2026-05-27)
REF_DATE = datetime.datetime(2026, 5, 27)

CONSULTING_COMPANIES = {
    "infosys", "wipro", "tcs", "tata consultancy services", "capgemini", "hcl", "accenture", 
    "cognizant", "tech mahindra", "mphasis", "genpact", "genpact ai"
}

# Real foundation years of companies in the dataset
FOUNDATION_YEARS = {
    "Swiggy": 2014,
    "Razorpay": 2014,
    "CRED": 2018,
    "Zomato": 2008,
    "Flipkart": 2007,
    "Meesho": 2015,
    "Nykaa": 2012,
    "Ola": 2010,
    "Paytm": 2010,
    "PhonePe": 2015,
    "Dream11": 2008,
    "Zoho": 1996,
    "Freshworks": 2010,
    "InMobi": 2007,
    "BYJU'S": 2011,
    "PolicyBazaar": 2008,
    "Vedantu": 2011,
    "Unacademy": 2015,
    "PharmEasy": 2015,
    "upGrad": 2015,
    "Sarvam AI": 2023,
    "Krutrim": 2023,
    "Rephrase.ai": 2019,
    "Wysa": 2015,
    "Haptik": 2013,
    "Saarthi.ai": 2017,
    "Observe.AI": 2017,
    "Niramai": 2016,
    "Aganitha": 2017,
    "Mad Street Den": 2013
}

# Tier-1 Indian Cities
TIER_1_CITIES = [
    "pune", "noida", "delhi", "ncr", "gurgaon", "gurugram", "faridabad", "ghaziabad",
    "bangalore", "bengaluru", "hyderabad", "mumbai", "chennai", "kolkata"
]

class CandidateScorer:
    @staticmethod
    def is_honeypot(cand):
        # 1. Startup date check
        for job in cand.get("career_history", []):
            company = job.get("company", "").strip()
            start_date_str = job.get("start_date", "")
            if company and start_date_str:
                for cname, fyear in FOUNDATION_YEARS.items():
                    if company.lower() == cname.lower():
                        try:
                            start_year = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").year
                            if start_year < fyear:
                                return True, f"Worked at {company} in {start_year} before founded in {fyear}"
                        except Exception:
                            pass
                            
        # 2. Stated years of experience vs timeline span check
        years_exp = cand.get("profile", {}).get("years_of_experience", 0)
        earliest_year = 2026
        has_jobs = False
        for job in cand.get("career_history", []):
            start_date_str = job.get("start_date", "")
            if start_date_str:
                has_jobs = True
                try:
                    year = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").year
                    if year < earliest_year:
                        earliest_year = year
                except Exception:
                    pass
        if has_jobs:
            max_possible_years = 2026 - earliest_year
            if years_exp > max_possible_years + 1.5:
                return True, f"Stated {years_exp} years of exp, but career history span is only {max_possible_years} years"

        # 3. Skill duration anomalies (multiple expert/advanced skills with 0 duration)
        zero_dur_skills = 0
        for skill in cand.get("skills", []):
            dur = skill.get("duration_months", 0)
            prof = skill.get("proficiency", "")
            if dur == 0 and prof in ["expert", "advanced"]:
                zero_dur_skills += 1
        if zero_dur_skills >= 3:
            return True, f"Has {zero_dur_skills} expert/advanced skills with 0 duration"

        return False, ""

    @staticmethod
    def calculate_score(cand, semantic_similarity):
        cid = cand["candidate_id"]
        
        # 1. Honeypot Filter
        is_hp, hp_reason = CandidateScorer.is_honeypot(cand)
        if is_hp:
            return 0.0, {
                "score": 0.0,
                "semantic_similarity": semantic_similarity,
                "experience_multiplier": 0.0,
                "behavioral_multiplier": 0.0,
                "skill_score": 0.0,
                "honeypot": True,
                "honeypot_reason": hp_reason,
                "disqualified": True,
                "disqualification_reason": "Failed logical profile checks (Honeypot candidate)",
                "strengths": [],
                "weaknesses": ["Impossible profile information detected."],
                "missing_skills": []
            }
            
        profile = cand.get("profile", {})
        career_history = cand.get("career_history", [])
        skills = cand.get("skills", [])
        signals = cand.get("redrob_signals", {})
        
        # 2. Consulting-only check
        companies = [job.get("company", "").strip().lower() for job in career_history]
        is_consulting_only = len(companies) > 0 and all(any(c in comp for c in CONSULTING_COMPANIES) for comp in companies)
        if is_consulting_only:
            return 0.01 * semantic_similarity, {
                "score": 0.01 * semantic_similarity,
                "semantic_similarity": semantic_similarity,
                "experience_multiplier": 0.0,
                "behavioral_multiplier": 0.0,
                "skill_score": 0.0,
                "honeypot": False,
                "disqualified": True,
                "disqualification_reason": "Entire career history spent in IT consulting/services firms",
                "strengths": [],
                "weaknesses": ["Career history limited to consulting/service companies only."],
                "missing_skills": []
            }

        strengths = []
        weaknesses = []
        
        # 3. Experience Score Modifier
        years_exp = profile.get("years_of_experience", 0)
        # Target range: 5 to 9 years
        if 5.0 <= years_exp <= 9.0:
            exp_mult = 1.0
            strengths.append(f"Ideal experience level ({years_exp} years)")
        elif 4.0 <= years_exp < 5.0:
            exp_mult = 0.8 + 0.2 * (years_exp - 4.0)
            weaknesses.append(f"Slightly junior for a founding team role ({years_exp} years of exp)")
        elif years_exp < 4.0:
            exp_mult = 0.4 + 0.1 * years_exp  # Max 0.8 at 4, lower for very junior
            weaknesses.append(f"Junior candidate ({years_exp} years of exp)")
        elif 9.0 < years_exp <= 12.0:
            exp_mult = 1.0 - 0.05 * (years_exp - 9.0)  # Slow decay
            strengths.append(f"Strong experienced background ({years_exp} years)")
        else:
            exp_mult = max(0.5, 0.85 - 0.05 * (years_exp - 12.0))
            weaknesses.append(f"Highly overqualified or senior ({years_exp} years of exp)")
            
        # Management/Architecture check
        current_job = next((job for job in career_history if job.get("is_current")), None)
        if current_job:
            current_title = current_job.get("title", "").lower()
            current_desc = current_job.get("description", "").lower()
            
            mgmt_keywords = ["manager", "architect", "director", "vp", "scrum", "lead"]
            dev_keywords = ["engineer", "developer", "programmer", "scientist", "coder", "hands-on", "coding", "developed", "built", "implemented", "shipped"]
            
            is_mgmt_title = any(kw in current_title for kw in mgmt_keywords)
            is_dev_title = any(kw in current_title for kw in ["engineer", "developer", "scientist", "programmer"])
            
            if is_mgmt_title and not is_dev_title:
                # Check if description mentions coding or shipping
                has_coding_in_desc = any(kw in current_desc for kw in dev_keywords)
                if not has_coding_in_desc:
                    duration = current_job.get("duration_months", 0)
                    if duration >= 18:
                        exp_mult *= 0.6
                        weaknesses.append(f"Moved into management/architecture for {duration} months without hands-on coding")

        # 4. Skills Match Scoring
        # Required skills keywords
        required_defs = {
            "embeddings": {
                "keywords": ["embedding", "sentence-transformer", "sentence transformer", "semantic search", "bge", "e5", "retrieval-augmented generation", "rag"],
                "weight": 2.0,
                "found": False,
                "prof": 0.0
            },
            "vector_db": {
                "keywords": ["pinecone", "weaviate", "qdrant", "milvus", "opensearch", "elasticsearch", "faiss", "vector database", "vector search"],
                "weight": 2.0,
                "found": False,
                "prof": 0.0
            },
            "python": {
                "keywords": ["python", "pyspark", "numpy", "pandas", "pytorch", "tensorflow", "scikit-learn", "sklearn"],
                "weight": 1.5,
                "found": False,
                "prof": 0.0
            },
            "evaluation": {
                "keywords": ["ndcg", "mrr", "map", "evaluation framework", "eval", "metrics", "offline evaluation"],
                "weight": 1.5,
                "found": False,
                "found_name": "",
                "prof": 0.0
            }
        }
        
        # Preferred skills keywords
        preferred_defs = {
            "fine_tuning": {
                "keywords": ["fine-tuning", "fine tuning", "lora", "qlora", "peft", "deepspeed", "sft"],
                "weight": 1.0,
                "found": False,
                "prof": 0.0
            },
            "ltr": {
                "keywords": ["learning to rank", "learning-to-rank", "xgboost", "lightgbm", "gbdt", "ranker"],
                "weight": 1.0,
                "found": False,
                "prof": 0.0
            }
        }
        
        prof_mapping = {"expert": 1.0, "advanced": 0.8, "intermediate": 0.5, "beginner": 0.2}
        
        # Scan skills
        for s in skills:
            sname = s.get("name", "").lower()
            sprof = s.get("proficiency", "intermediate")
            sdur = s.get("duration_months", 12)
            
            prof_val = prof_mapping.get(sprof, 0.5)
            # Duration factor: reward experience with the skill
            dur_factor = min(sdur / 24.0, 1.0)
            dur_factor = max(0.5, dur_factor)
            skill_score_component = prof_val * dur_factor
            
            # Check required
            for cat, definition in required_defs.items():
                if any(kw in sname for kw in definition["keywords"]):
                    definition["found"] = True
                    if skill_score_component > definition["prof"]:
                        definition["prof"] = skill_score_component
                        
            # Check preferred
            for cat, definition in preferred_defs.items():
                if any(kw in sname for kw in definition["keywords"]):
                    definition["found"] = True
                    if skill_score_component > definition["prof"]:
                        definition["prof"] = skill_score_component

        # Compute Skill score
        total_weight = 0.0
        weighted_score = 0.0
        missing_skills = []
        
        for cat, definition in required_defs.items():
            total_weight += definition["weight"]
            if definition["found"]:
                weighted_score += definition["weight"] * definition["prof"]
                if definition["prof"] >= 0.7:
                    strengths.append(f"Strong expertise in {cat.replace('_', ' ').title()}")
            else:
                missing_skills.append(cat.replace('_', ' ').title())
                weaknesses.append(f"Missing experience with {cat.replace('_', ' ').title()}")
                
        for cat, definition in preferred_defs.items():
            # Add preferred skills to score but they are not penalizing if missing
            if definition["found"]:
                total_weight += definition["weight"]
                weighted_score += definition["weight"] * definition["prof"]
                strengths.append(f"Preferred skill: {cat.replace('_', ' ').title()}")

        skill_match_score = (weighted_score / total_weight) if total_weight > 0 else 0.5

        # 5. Behavioral Multipliers
        # Inactivity Check
        last_act_str = signals.get("last_active_date", "")
        if last_act_str:
            try:
                last_act_date = datetime.datetime.strptime(last_act_str, "%Y-%m-%d")
                days_inactive = (REF_DATE - last_act_date).days
                if days_inactive <= 30:
                    act_mult = 1.0
                elif days_inactive <= 90:
                    act_mult = 0.90
                    weaknesses.append(f"Inactive for {days_inactive} days")
                elif days_inactive <= 180:
                    act_mult = 0.75
                    weaknesses.append(f"Inactive for {days_inactive} days (potential passive candidate)")
                else:
                    act_mult = 0.50
                    weaknesses.append(f"Highly inactive ({days_inactive} days since last login)")
            except Exception:
                act_mult = 0.8
        else:
            act_mult = 0.8

        # Recruiter Response Rate Check
        resp_rate = signals.get("recruiter_response_rate", 1.0)
        if resp_rate >= 0.75:
            resp_mult = 1.05
            strengths.append("Highly responsive to recruiter messages")
        elif resp_rate >= 0.40:
            resp_mult = 1.0
        elif resp_rate >= 0.10:
            resp_mult = 0.85
            weaknesses.append(f"Moderate recruiter response rate ({int(resp_rate*100)}%)")
        else:
            resp_mult = 0.55
            weaknesses.append(f"Very low recruiter response rate ({int(resp_rate*100)}%)")

        # Notice Period Check
        notice_days = signals.get("notice_period_days", 0)
        if notice_days <= 30:
            notice_mult = 1.05
            strengths.append(f"Quick joiner ({notice_days} days notice)")
        elif notice_days <= 60:
            notice_mult = 1.0
        elif notice_days <= 90:
            notice_mult = 0.85
            weaknesses.append(f"Long notice period ({notice_days} days)")
        else:
            notice_mult = 0.65
            weaknesses.append(f"Very long notice period ({notice_days} days)")

        # Location Check
        loc = profile.get("location", "").lower()
        reloc = signals.get("willing_to_relocate", False)
        
        is_local = any(city in loc for city in ["pune", "noida", "delhi", "ncr", "gurgaon", "faridabad", "ghaziabad"])
        is_tier_1 = any(city in loc for city in TIER_1_CITIES)
        
        if is_local:
            loc_mult = 1.10
            strengths.append("Based in target location (Noida/Pune/Delhi NCR)")
        elif is_tier_1:
            if reloc:
                loc_mult = 1.0
                strengths.append("Tier-1 India candidate willing to relocate")
            else:
                loc_mult = 0.70
                weaknesses.append("Tier-1 India candidate unwilling to relocate")
        else:
            # Outside Tier-1 India
            if reloc:
                loc_mult = 0.80
                weaknesses.append("Outside Tier-1 India, willing to relocate")
            else:
                loc_mult = 0.50
                weaknesses.append("Located outside target cities, unwilling to relocate")

        # Platform activity bonuses
        activity_bonus = 0.0
        if signals.get("saved_by_recruiters_30d", 0) > 5:
            activity_bonus += 0.02
        if signals.get("profile_views_received_30d", 0) > 10:
            activity_bonus += 0.02
        if signals.get("github_activity_score", 0) > 50:
            activity_bonus += 0.03
            strengths.append("High GitHub contribution activity")

        # Combine Multipliers
        behavioral_mult = act_mult * resp_mult * notice_mult * loc_mult
        
        # 6. Hybrid Score Calculation
        # Raw score is hybrid of semantic match and explicit skills match
        hybrid_match = 0.6 * semantic_similarity + 0.4 * skill_match_score
        
        # Final score applies multipliers and bonuses
        final_score = (hybrid_match * exp_mult * behavioral_mult) + activity_bonus
        final_score = min(max(final_score, 0.0), 1.0)  # Bound between 0 and 1
        
        # Format reasoning
        # Format the top 3 strengths and top 2 weaknesses into 1-2 sentence explanation
        s_text = "; ".join(strengths[:3])
        w_text = "; ".join(weaknesses[:2])
        reasoning = ""
        if strengths:
            reasoning += f"Candidate has {s_text}."
        if weaknesses:
            reasoning += f" Concerns: {w_text}."
        if not reasoning:
            reasoning = "Solid skills alignment with standard experience and engagement signals."

        return final_score, {
            "score": final_score,
            "semantic_similarity": semantic_similarity,
            "skill_score": skill_match_score,
            "experience_multiplier": exp_mult,
            "behavioral_multiplier": behavioral_mult,
            "honeypot": False,
            "disqualified": False,
            "strengths": strengths[:4],
            "weaknesses": weaknesses[:3],
            "missing_skills": missing_skills,
            "reasoning": reasoning
        }
