import os
import json
import requests

# Mengambil API Key dari Environment Variable (GitHub Secrets)
API_KEY = os.getenv("API_KEY")

def fetch_global_latest_analyst_ratings(limit=50):
    if not API_KEY:
        print("Error: API_KEY not found in environment variables.")
        return []

    url = f"https://financialmodelingprep.com/api/v4/upgrades-downgrades-rss-feed?page=0&apikey={API_KEY}"
    
    try:
        response = requests.get(url)
        data = response.json()
        
        parsed_ratings = []
        if isinstance(data, list):
            for item in data[:limit]:
                parsed_ratings.append({
                    "ticker": f"${item.get('symbol', '')}",
                    "company_name": item.get("company", ""),
                    "institution": item.get("gradingCompany", ""),
                    "action": item.get("action", ""),
                    "previous_rating": item.get("previousGrade", ""),
                    "new_rating": item.get("newGrade", ""),
                    "date_updated": item.get("publishedDate", "")
                })
            
        # Urutkan dari yang terbaru ke terlama (Newest to Oldest)
        sorted_ratings = sorted(parsed_ratings, key=lambda x: x['date_updated'], reverse=True)
        return sorted_ratings

    except Exception as e:
        print(f"Error fetching data: {e}")
        return []

if __name__ == "__main__":
    ratings = fetch_global_latest_analyst_ratings(limit=50)
    
    # Pastikan folder data/ ada
    os.makedirs("data", exist_ok=True)
    
    # Simpan hasil fetch ke data/ratings.json
    output_path = os.path.join("data", "ratings.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(ratings, f, indent=2)
        
    print(f"Successfully saved {len(ratings)} analyst ratings to {output_path}")
