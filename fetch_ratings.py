import os
import json
import requests

API_KEY = os.environ.get("API_KEY")

def fetch_ratings():
    if not API_KEY:
        print("Error: API_KEY environment variable is not set!")
        return

    # Endpoint resmi FMP untuk Wall Street upgrades & downgrades RSS feed
    url = f"https://financialmodelingprep.com/api/v4/upgrades-downgrades-rss-feed?page=0&apikey={API_KEY}"
    
    try:
        print("Fetching data from FMP API...")
        response = requests.get(url, timeout=15)
        print(f"FMP API Response Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"Failed to fetch from FMP. Response: {response.text[:300]}")
            return
            
        data = response.json()
        print(f"Total raw items fetched: {len(data) if isinstance(data, list) else 0}")

        if not isinstance(data, list) or len(data) == 0:
            print("Warning: FMP API returned an empty list.")
            return

        formatted_ratings = []
        for item in data[:60]: # Ambil 60 data terbaru
            # Ekstraksi field murni dari FMP
            symbol = item.get("symbol") or item.get("ticker") or "-"
            company = item.get("companyName") or symbol
            institution = item.get("gradingCompany") or item.get("institution") or "-"
            action = item.get("action") or item.get("actionType") or "-"
            new_grade = item.get("newGrade") or item.get("new_rating") or "-"
            prev_grade = item.get("previousGrade") or item.get("previous_rating") or "-"
            date_str = item.get("publishedDate") or item.get("date") or "-"
            if date_str != "-":
                date_str = date_str[:10]

            formatted_ratings.append({
                "ticker": symbol,
                "company_name": company,
                "institution": institution,
                "action": action,
                "new_rating": new_grade,
                "previous_rating": prev_grade,
                "date_updated": date_str
            })

        # Simpan ke data/ratings.json
        os.makedirs("data", exist_ok=True)
        with open("data/ratings.json", "w", encoding="utf-8") as f:
            json.dump(formatted_ratings, f, indent=2)
            
        print(f"Successfully saved {len(formatted_ratings)} real FMP items to data/ratings.json")

    except Exception as e:
        print(f"An exception occurred during FMP fetch: {e}")

if __name__ == "__main__":
    fetch_ratings()
