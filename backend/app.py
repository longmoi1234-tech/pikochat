from flask import Flask, jsonify, request
from pathlib import Path
import json
import os
import re

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = os.environ.get('PIKOCHAT_DATA_FILE', 'pikonik_refined_faq.json')
DATA_PATH = BASE_DIR / DATA_FILE
STOP_WORDS = {
    'a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in',
    'is', 'it', 'my', 'of', 'on', 'or', 'should', 'the', 'to', 'what',
    'when', 'where', 'which', 'who', 'why', 'with',
}


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
        print(f"ERROR: {DATA_FILE} not found")
        return None

    except json.JSONDecodeError as e:
        print(f"JSON ERROR: {e}")
        return None


# -----------------------------
# CHATBOT RESPONSE ENGINE
# -----------------------------
def normalize_text(text):
    return re.sub(r'[^a-z0-9]+', ' ', str(text).lower()).strip()


def tokenize(text):
    return set(normalize_text(text).split())


def stem_token(token):
    if len(token) > 4 and token.endswith('ies'):
        return f'{token[:-3]}y'
    if len(token) > 3 and token.endswith('es'):
        return token[:-2]
    if len(token) > 3 and token.endswith('s'):
        return token[:-1]
    return token


def get_search_terms(text):
    return {stem_token(token) for token in tokenize(text) if token not in STOP_WORDS}


def score_faq_item(query, item):
    normalized_query = normalize_text(query)
    query_terms = get_search_terms(query)
    score = 0

    searchable_fields = [
        (item.get('question', ''), 6),
        (' '.join(item.get('keywords', [])), 2),
        (item.get('category', ''), 1),
    ]
    question_terms = get_search_terms(item.get('question', ''))
    item_terms = set()

    for text, weight in searchable_fields:
        terms = get_search_terms(text)
        item_terms.update(terms)
        score += len(query_terms.intersection(terms)) * weight

    if query_terms and query_terms.issubset(item_terms):
        score += 20

    if query_terms and query_terms.issubset(question_terms):
        score += 12

    for keyword in item.get('keywords', []):
        normalized_keyword = normalize_text(keyword)
        if not normalized_keyword:
            continue

        keyword_terms = get_search_terms(keyword)
        if normalized_keyword in normalized_query:
            score += (6 if len(keyword_terms) <= 1 else 15) + len(keyword_terms)
        elif keyword_terms and keyword_terms.issubset(query_terms):
            score += 10 + len(keyword_terms)

    normalized_question = normalize_text(item.get('question', ''))
    if normalized_question and normalized_question in normalized_query:
        score += 25

    return score


def chatbot_response(query, data):
    faq_list = data.get('faq', [])

    best_match = None
    highest_score = 0

    for item in faq_list:
        score = score_faq_item(query, item)

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
            'error': f'{DATA_FILE} not found or invalid'
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
            'error': f'Could not load {DATA_FILE}'
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
