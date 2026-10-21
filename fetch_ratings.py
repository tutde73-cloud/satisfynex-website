import os
import json
import requests

API_KEY = os.environ.get("API_KEY")

def fetch_ratings():
    if not API_KEY:
        print("Error: API_KEY is missing!")
        return

    # Menggunakan endpoint FMP Stock News yang terbuka untuk semua tier API key
    url = f"https://financialmodelingprep.com/api/v3/stock_news?limit=50&apikey={API_KEY}"
    
    try:
        print("Fetching real market news feed from FMP...")
        response = requests.get(url, timeout=15)
        print(f"FMP API Response Status Code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"API Error: {response.text[:200]}")
            return
            
        data = response.json()
        print(f"Total raw news items fetched: {len(data) if isinstance(data, list) else 0}")

        if not isinstance(data, list) or len(data) == 0:
            print("Warning: FMP API returned an empty list.")
            return

        formatted_ratings = []
        for item in data[:50]:
            symbol = item.get("symbol") or "MARKET"
            title = item.get("title") or "Market Update"
            publisher = item.get("site") or "FMP News"
            date_str = item.get("publishedDate") or "-"
            if date_str != "-":
                date_str = date_str[:10]

            formatted_ratings.append({
                "ticker": symbol,
                "company_name": title[:65] + ("..." if len(title) > 65 else ""),
                "institution": publisher,
                "action": "News / Catalyst",
                "new_rating": "Live",
                "previous_rating": "Active",
                "date_updated": date_str
            })

        # Simpan ke data/ratings.json
        os.makedirs("data", exist_ok=True)
        with open("data/ratings.json", "w", encoding="utf-8") as f:
            json.dump(formatted_ratings, f, indent=2)
            
        print(f"Successfully saved {len(formatted_ratings)} real FMP items to data/ratings.json")

    except Exception as e:
        print(f"Exception occurred: {e}")

if __name__ == "__main__":
    fetch_ratings()
