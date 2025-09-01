# backend/app.py
import os
import logging
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from models.flashcard import FlashcardGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Flask app
app = Flask(__name__, static_folder="../frontend", static_url_path="")

# CORS
if os.environ.get("FLASK_ENV") == "development":
    CORS(app)
else:
    CORS(
        app,
        origins=[
            "https://ai-study-buddy-kvkr.onrender.com",
            "https://studypal-fikn.onrender.com",
        ],
    )

# Supabase setup
USE_SUPABASE = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"))
supabase = None
if USE_SUPABASE:
    try:
        from supabase.client import create_client, Client

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        supabase = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized")
    except Exception as e:
        logger.error(f"Supabase init failed: {e}")
        USE_SUPABASE = False
        supabase = None
else:
    logger.info("Using in-memory storage")

# In-memory storage
flashcard_storage = {}
storage_counter = 1


class FlashcardStorage:
    """Flashcard storage operations"""

    @staticmethod
    def save_flashcard_set(title, flashcards, original_text, card_statuses=None):
        global storage_counter
        total_cards = len(flashcards) if flashcards else 0
        flashcard_set = {
            "title": title,
            "flashcards": flashcards,
            "original_text": original_text,
            "card_statuses": card_statuses or [],
            "created_at": datetime.now().isoformat(),
            "total_cards": total_cards,
        }

        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets").insert(flashcard_set).execute()
                )
                if result.data:
                    saved_set = result.data[0]
                    return saved_set
                return FlashcardStorage._save_to_memory(flashcard_set)
            except Exception as e:
                logger.error(f"Supabase save failed: {e}")
                return FlashcardStorage._save_to_memory(flashcard_set)
        else:
            return FlashcardStorage._save_to_memory(flashcard_set)

    @staticmethod
    def _save_to_memory(flashcard_set):
        global storage_counter
        flashcard_set["id"] = storage_counter
        flashcard_storage[storage_counter] = flashcard_set
        storage_counter += 1
        return flashcard_set

    @staticmethod
    def get_all_sets():
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets")
                    .select("id, title, total_cards, created_at")
                    .order("created_at", desc=True)
                    .execute()
                )
                return result.data if result.data else []
            except Exception as e:
                logger.error(f"Supabase fetch failed: {e}")
                return FlashcardStorage._get_memory_sets()
        return FlashcardStorage._get_memory_sets()

    @staticmethod
    def get_all_sets_with_cards(preview_count=0):
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets")
                    .select("*")
                    .order("created_at", desc=True)
                    .execute()
                )
                if result.data:
                    if preview_count > 0:
                        for set_data in result.data:
                            if set_data.get("flashcards"):
                                set_data["flashcard_preview"] = set_data["flashcards"][
                                    :preview_count
                                ]
                    return result.data
                return []
            except Exception as e:
                logger.error(f"Supabase fetch with cards failed: {e}")
                return FlashcardStorage._get_memory_sets_with_cards(preview_count)
        return FlashcardStorage._get_memory_sets_with_cards(preview_count)

    @staticmethod
    def _get_memory_sets():
        return sorted(
            [
                {
                    "id": sid,
                    "title": s["title"],
                    "total_cards": s["total_cards"],
                    "created_at": s["created_at"],
                }
                for sid, s in flashcard_storage.items()
            ],
            key=lambda x: x["created_at"],
            reverse=True,
        )

    @staticmethod
    def _get_memory_sets_with_cards(preview_count=0):
        sets_list = []
        for flashcard_set in flashcard_storage.values():
            set_copy = flashcard_set.copy()
            if preview_count > 0 and set_copy.get("flashcards"):
                set_copy["flashcard_preview"] = set_copy["flashcards"][:preview_count]
            sets_list.append(set_copy)
        return sorted(sets_list, key=lambda x: x["created_at"], reverse=True)

    @staticmethod
    def get_set(set_id):
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets")
                    .select("*")
                    .eq("id", set_id)
                    .execute()
                )
                if result.data and len(result.data) > 0:
                    return result.data[0]
                return flashcard_storage.get(int(set_id))
            except Exception as e:
                logger.error(f"Supabase get failed: {e}")
                return flashcard_storage.get(int(set_id))
        return flashcard_storage.get(int(set_id))

    @staticmethod
    def delete_set(set_id):
        if USE_SUPABASE and supabase:
            try:
                flashcard_set = FlashcardStorage.get_set(set_id)
                if not flashcard_set:
                    return None
                supabase.table("flashcard_sets").delete().eq("id", set_id).execute()
                return flashcard_set
            except Exception as e:
                logger.error(f"Supabase delete failed: {e}")
                return flashcard_storage.pop(int(set_id), None)
        return flashcard_storage.pop(int(set_id), None)


# Routes
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    """Serve frontend files"""
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/status")
def api_status():
    return jsonify(
        {
            "message": "StudyPal Backend is running!",
            "version": "1.0.0",
            "storage": "Supabase" if USE_SUPABASE else "Memory",
            "ai_enabled": bool(os.getenv("GEMINI_API_KEY")),
            "endpoints": {
                "generate": "/api/generate-flashcards",
                "save": "/api/flashcards",
                "get": "/api/flashcards",
                "delete": "/api/flashcards/<id>",
            },
        }
    )


@app.route("/api/generate-flashcards", methods=["POST"])
def generate_flashcards():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    text = data.get("text", "").strip()
    num_cards = data.get("num_cards", 5)

    if not text or len(text) < 20:
        return jsonify({"error": "Text too short, provide at least 20 characters"}), 400
    if num_cards < 1 or num_cards > 10:
        return jsonify({"error": "Number of cards must be between 1 and 10"}), 400

    generator = FlashcardGenerator(text)
    flashcards = generator.generate_flashcards(num_cards)
    if not flashcards:
        return jsonify({"error": "Unable to generate flashcards"}), 400

    return jsonify(
        {
            "flashcards": flashcards,
            "total_generated": len(flashcards),
            "source_text_length": len(text),
            "generated_at": datetime.now().isoformat(),
        }
    )


@app.route("/api/flashcards", methods=["POST"])
def save_flashcards():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    title = data.get("title", "").strip()
    flashcards = data.get("flashcards", [])
    original_text = data.get("original_text", "")
    card_statuses = data.get("card_statuses", [])

    if not title or not flashcards:
        return jsonify({"error": "Title and flashcards are required"}), 400

    flashcard_set = FlashcardStorage.save_flashcard_set(
        title, flashcards, original_text, card_statuses
    )
    return jsonify(
        {
            "message": "Flashcard set saved successfully",
            "id": flashcard_set["id"],
            "title": title,
            "total_cards": len(flashcards),
            "storage_type": "Supabase" if USE_SUPABASE else "Memory",
        }
    )


@app.route("/api/flashcards", methods=["GET"])
def get_flashcard_sets():
    include_cards = request.args.get("include_cards", "false").lower() == "true"
    preview_count = int(request.args.get("preview", 0))
    if include_cards or preview_count > 0:
        sets_list = FlashcardStorage.get_all_sets_with_cards(preview_count)
    else:
        sets_list = FlashcardStorage.get_all_sets()
    return jsonify(
        {
            "flashcard_sets": sets_list,
            "total_sets": len(sets_list),
            "storage_type": "Supabase" if USE_SUPABASE else "Memory",
            "include_cards": include_cards,
            "preview_count": preview_count,
        }
    )


@app.route("/api/flashcards/<int:set_id>", methods=["GET"])
def get_flashcard_set(set_id):
    flashcard_set = FlashcardStorage.get_set(set_id)
    if not flashcard_set:
        return jsonify({"error": "Flashcard set not found"}), 404
    return jsonify(flashcard_set)


@app.route("/api/flashcards/<int:set_id>", methods=["DELETE"])
def delete_flashcard_set(set_id):
    deleted_set = FlashcardStorage.delete_set(set_id)
    if not deleted_set:
        return jsonify({"error": "Flashcard set not found"}), 404
    return jsonify(
        {
            "message": "Flashcard set deleted successfully",
            "deleted_title": deleted_set["title"],
        }
    )


@app.route("/api/health")
def health_check():
    return jsonify(
        {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "storage": "Supabase" if USE_SUPABASE else "Memory",
            "ai_enabled": bool(os.getenv("GEMINI_API_KEY")),
        }
    )


# Error handlers
@app.errorhandler(404)
def handle_404(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def handle_405(error):
    return jsonify({"error": "Method not allowed"}), 405
