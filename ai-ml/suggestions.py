from difflib import SequenceMatcher
import pandas as pd
from collections import Counter


def is_similar(a, b, threshold=0.6):
    """Check if two strings are similar enough"""
    return SequenceMatcher(None, a.lower(), b.lower()).ratio() >= threshold


def generate_suggestions(shops_df, location, query):
    nearby_shops = []
    trending_products = []
    answer = None

    if shops_df is None or shops_df.empty:
        return [], [], "No shop data available."

    location = location.lower().strip() if location else ""
    query = query.lower().strip() if query else ""

    product_counter = Counter()

    for _, row in shops_df.iterrows():
        address = str(row.get("Address", "")).lower()
        shop_name = str(row.get("Shop_Name", "")).lower()

        # ✅ fuzzy match location
        if location and (is_similar(location, address) or is_similar(location, shop_name)):
            shop_data = {
                "name": row.get("Shop_Name", "Unknown"),
                "address": row.get("Address", "N/A"),
                "distance_km": 1.5,  # placeholder
                "rating": row.get("Rating", "N/A")
            }
            nearby_shops.append(shop_data)

            # ✅ collect products (not limited by query)
            for i in [1, 2]:
                product = str(row.get(f"Product_{i}", "")).strip()
                if product:
                    product_counter[product] += 1

    # ✅ build trending product list ranked by frequency
    trending_products = [
        {"product": product, "count": count}
        for product, count in product_counter.most_common(10)
    ]

    # ✅ Answer logic
    if query:
        if "famous" in query and location:
            answer = f"{location.title()} is famous for its busy markets and local shops."
        elif "food" in query:
            answer = f"{location.title()} is known for its street food and restaurants."
        elif nearby_shops:
            answer = f"I found {len(nearby_shops)} shops near {location.title()}."
        else:
            answer = f"Sorry, I could not find shops in {location.title()}."

    return nearby_shops, trending_products, answer


# Example usage (for debugging):
if __name__ == "__main__":
    df = pd.read_csv("shops.csv")
    shops, products, ans = generate_suggestions(df, "Kidwai Nagar, Kanpur", "What is famous for kidwai market?")
    print("Nearby Shops:", shops[:3])  # preview
    print("Trending Products:", products)
    print("Answer:", ans)
