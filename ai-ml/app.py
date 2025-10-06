from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import os
from suggestions import generate_suggestions  

app = Flask(__name__)
CORS(app)

# === Load shop data once ===
CSV_PATH = os.path.join(os.path.dirname(__file__), "shops.csv")
shops_df = None

if os.path.exists(CSV_PATH):
    shops_df = pd.read_csv(CSV_PATH)
    print(f"✅ Loaded {len(shops_df)} shops from {CSV_PATH}")
    print("CSV Headers Detected:", list(shops_df.columns))
else:
    print("⚠️ shops.csv not found. Place it inside ai-ml/ folder.")


@app.route("/assistant/customer", methods=["POST"])
def assistant_customer():
    try:
        data = request.get_json(force=True)
        location = data.get("location", "")
        query = data.get("query", "")

        nearby_shops, trending_products, answer = generate_suggestions(shops_df, location, query)

        return jsonify({
            "nearby_shops": nearby_shops,
            "trending_products": trending_products,
            "answer": answer
        })
    except Exception as e:
        print("❌ Error in /assistant/customer:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(port=5001, debug=True)
