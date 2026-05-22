from flask import Flask, jsonify, request
from pathlib import Path
import json
import os

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / 'data.json'


# -----------------------------
# CORS
# -----------------------------
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    return response


# -----------------------------
# LOAD JSON DATA
# -----------------------------
def load_data():
    try:
        print(f"Loading data from: {DATA_PATH}")

        with DATA_PATH.open('r', encoding='utf-8') as f:
            data = json.load(f)

        print("Data loaded successfully")

        return data

    except FileNotFoundError:
        print("ERROR: data.json not found")
        return None

    except json.JSONDecodeError as e:
        print(f"JSON ERROR: {e}")
        return None


# -----------------------------
# CHATBOT RESPONSE ENGINE
# -----------------------------
def chatbot_response(query, data):

    query = query.lower()

    faq_list = data.get('faq', [])

    best_match = None
    highest_score = 0

    for item in faq_list:

        keywords = item.get('keywords', [])

        score = 0

        for keyword in keywords:
            if keyword.lower() in query:
                score += 1

        if score > highest_score:
            highest_score = score
            best_match = item

    if best_match:
        return best_match.get('answer')

    return """Sorry, I could not understand your question.

Try asking:
- What is Pikonik?
- Does Pikonik support UPI?
- How to create a bill?
- Cafe management features
"""


# -----------------------------
# GET ALL FAQ DATA
# -----------------------------
@app.route('/messages', methods=['GET'])
def get_messages():

    data = load_data()

    if not data:
        return jsonify({
            'error': 'data.json not found or invalid'
        }), 500

    return jsonify(data)


# -----------------------------
# CHAT API
# -----------------------------
@app.route('/chat', methods=['GET'])
def chat():

    query = request.args.get('query', '').strip()

    if not query:
        return jsonify({
            'error': 'Please provide a query parameter'
        }), 400

    data = load_data()

    if data is None:
        return jsonify({
            'error': 'Could not load data.json'
        }), 500

    answer = chatbot_response(query, data)

    return jsonify({
        'query': query,
        'answer': answer
    })


# -----------------------------
# ROOT
# -----------------------------
@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'message': 'Pikochat backend is running.',
        'status': 'online',
        'endpoints': {
            '/chat?query=your-question': 'Ask chatbot questions',
            '/messages': 'Get all FAQ data'
        }
    })


# -----------------------------
# RUN SERVER
# -----------------------------
if __name__ == '__main__':
    print("Starting Pikochat backend server...")

    app.run(
        debug=os.environ.get('FLASK_DEBUG') == '1',
        host='0.0.0.0',
        port=int(os.environ.get('PORT', 5000))
    )
