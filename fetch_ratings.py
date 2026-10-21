import os
import json
import requests

API_KEY = os.environ.get("API_KEY")

def fetch_ratings():
    if not API_KEY:
        print("Error: API_KEY is missing!")
        return

    # Endpoint Wall Street Upgrades / Downgrades FMP
    url = f"https://financialmodelingprep.com/api/v4/upgrades-downgrades-rss-feed?page=0&apikey={API_KEY}"
    
    try:
        response = requests.get(url, timeout=15)
        print(f"API Response Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"API Error response: {response.text[:200]}")
            return
            
        data = response.json()
        print(f"Total items fetched from API: {len(data) if isinstance(data, list) else 0}")

        if not isinstance(data, list) or len(data) == 0:
            # Fallback jika endpoint rss-feed kosong, coba endpoint alternatif
            alt_url = f"https://financialmodelingprep.com/api/v3/upgrades-downgrades?apikey={API_KEY}"
            alt_res = requests.get(alt_url, timeout=15)
            if alt_res.status_code == 200:
                data = alt_res.json()
                print(f"Fetched from alt endpoint: {len(data) if isinstance(data, list) else 0}")

        formatted_ratings = []
        if isinstance(data, list):
            for item in data[:50]:  # Ambil 50 data terbaru
                formatted_ratings.append({
                    "ticker": item.get("symbol") or item.get("ticker") or "-",
                    "company_name": item.get("companyName") or item.get("symbol") or "-",
                    "institution": item.get("gradingCompany") or item.get("institution") or "-",
                    "action": item.get("action") or item.get("actionType") or "-",
                    "new_rating": item.get("newGrade") or item.get("new_rating") or "-",
                    "previous_rating": item.get("previousGrade") or item.get("previous_rating") or "-",
                    "date_updated": (item.get("publishedDate") or item.get("date") or "-")[:10]
                })

        # Buka dan tulis ke data/ratings.json
        os.makedirs("data", exist_ok=True)
        with open("data/ratings.json", "w", encoding="utf-8") as f:
            json.dump(formatted_ratings, f, indent=2)
            
        print(f"Successfully saved {len(formatted_ratings)} items to data/ratings.json")

    except Exception as e:
        print(f"Exception during fetch: {e}")

if __name__ == "__main__":
    fetch_ratings()
