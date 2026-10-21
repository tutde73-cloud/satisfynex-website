import requests
import json
from datetime import datetime

# Masukkan API Key Financial Modeling Prep (FMP) Anda
API_KEY = "YOUR_FMP_API_KEY"

def fetch_global_latest_analyst_ratings(limit=50):
    """
    Menarik feed global terbaru untuk upgrades, downgrades, dan rating analis 
    dari seluruh pasar saham AS secara real-time (tanpa batasan ticker).
    """
    # Endpoint Feed Global Upgrades & Downgrades
    url = f"https://financialmodelingprep.com/api/v4/upgrades-downgrades-rss-feed?page=0&apikey={API_KEY}"
    
    try:
        response = requests.get(url)
        data = response.json()
        
        parsed_ratings = []
        for item in data[:limit]:
            # Menyusun struktur data sesuai kebutuhan tabel Satisfynex
            parsed_ratings.append({
                "ticker": f"${item.get('symbol')}",
                "company_name": item.get("company"),
                "institution": item.get("gradingCompany"),
                "action": item.get("action"),  # upgrade, downgrade, maintain, initiate
                "previous_rating": item.get("previousGrade"),
                "new_rating": item.get("newGrade"),
                "date_updated": item.get("publishedDate")
            })
            
        # Memastikan data terurut dari yang Paling Baru -> Terlama
        sorted_ratings = sorted(parsed_ratings, key=lambda x: x['date_updated'], reverse=True)
        return sorted_ratings

    except Exception as e:
        print(f"Error fetching data: {e}")
        return []

if __name__ == "__main__":
    latest_feed = fetch_global_latest_analyst_ratings(limit=20)
    print(json.dumps(latest_feed, indent=2))
