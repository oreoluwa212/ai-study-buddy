# backend/app.py
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from backend.models.flashcard import FlashcardGenerator
import logging
import os
from datetime import datetime
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Updated Flask app initialization to serve frontend
app = Flask(__name__, static_folder="../frontend", static_url_path="")

# Configure CORS - more restrictive for production
if os.environ.get("FLASK_ENV") == "development":
    CORS(app)
else:
    # In production, we serve everything from same domain, so CORS not needed
    # But if you need it, configure it properly
    CORS(app, origins=["https://yourdomain.com"])

# Storage configuration - choose between Supabase and in-memory
USE_SUPABASE = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"))

if USE_SUPABASE:
    try:
        from supabase import create_client, Client

        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        supabase: Client = create_client(supabase_url, supabase_key)
        logger.info("✅ Supabase client initialized")
    except ImportError:
        logger.warning("⚠️  Supabase library not installed. Using in-memory storage.")
        logger.warning("   Install with: pip install supabase")
        USE_SUPABASE = False
        supabase = None
    except Exception as e:
        logger.error(f"❌ Failed to initialize Supabase: {e}")
        USE_SUPABASE = False
        supabase = None
else:
    logger.info("📝 Using in-memory storage")
    supabase = None

# In-memory storage fallback
flashcard_storage = {}
storage_counter = 1


class FlashcardStorage:
    """Handle flashcard storage operations"""

    @staticmethod
    def save_flashcard_set(title, flashcards, original_text, card_statuses=None):
        """Save flashcard set to storage"""
        global storage_counter

        # Ensure total_cards is calculated correctly
        total_cards = len(flashcards) if flashcards else 0

        flashcard_set = {
            "title": title,
            "flashcards": flashcards,
            "original_text": original_text,
            "card_statuses": card_statuses or [],
            "created_at": datetime.now().isoformat(),
            "total_cards": total_cards,  # Explicitly set this
        }

        logger.info(f"Preparing to save set '{title}' with {total_cards} cards")

        if USE_SUPABASE and supabase:
            try:
                # Insert into Supabase
                result = (
                    supabase.table("flashcard_sets").insert(flashcard_set).execute()
                )
                if result.data:
                    saved_set = result.data[0]
                    logger.info(
                        f"💾 Saved to Supabase: '{title}' with {total_cards} cards"
                    )
                    logger.info(
                        f"Supabase returned: id={saved_set.get('id')}, total_cards={saved_set.get('total_cards')}"
                    )
                    return saved_set
                else:
                    raise Exception("No data returned from Supabase")
            except Exception as e:
                logger.error(f"❌ Supabase save failed: {e}")
                # Fallback to in-memory storage
                return FlashcardStorage._save_to_memory(flashcard_set)
        else:
            return FlashcardStorage._save_to_memory(flashcard_set)

    @staticmethod
    def _save_to_memory(flashcard_set):
        """Save to in-memory storage"""
        global storage_counter
        flashcard_set["id"] = storage_counter
        flashcard_storage[storage_counter] = flashcard_set
        storage_counter += 1
        logger.info(
            f"💾 Saved to memory: '{flashcard_set['title']}' with {flashcard_set['total_cards']} cards"
        )
        return flashcard_set

    @staticmethod
    def get_all_sets():
        """Get all flashcard sets"""
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets")
                    .select("id, title, total_cards, created_at")
                    .order("created_at", desc=True)
                    .execute()
                )
                if result.data:
                    logger.info(f"Retrieved {len(result.data)} sets from Supabase")
                    # Debug each set
                    for i, set_data in enumerate(result.data):
                        logger.info(
                            f"Set {i}: title='{set_data.get('title')}', total_cards={set_data.get('total_cards')}, id={set_data.get('id')}"
                        )
                    return result.data
                return []
            except Exception as e:
                logger.error(f"❌ Supabase fetch failed: {e}")
                return FlashcardStorage._get_memory_sets()
        else:
            return FlashcardStorage._get_memory_sets()

    @staticmethod
    def get_all_sets_with_cards(preview_count=0):
        """Get all flashcard sets with their cards (or preview)"""
        if USE_SUPABASE and supabase:
            try:
                # Get full data from Supabase
                result = (
                    supabase.table("flashcard_sets")
                    .select("*")  # Get all fields including flashcards
                    .order("created_at", desc=True)
                    .execute()
                )

                if result.data:
                    logger.info(f"Retrieved {len(result.data)} full sets from Supabase")

                    # Add preview logic if requested
                    if preview_count > 0:
                        for set_data in result.data:
                            if set_data.get("flashcards"):
                                set_data["flashcard_preview"] = set_data["flashcards"][
                                    :preview_count
                                ]

                    return result.data
                return []
            except Exception as e:
                logger.error(f"❌ Supabase fetch with cards failed: {e}")
                return FlashcardStorage._get_memory_sets_with_cards(preview_count)
        else:
            return FlashcardStorage._get_memory_sets_with_cards(preview_count)

    @staticmethod
    def _get_memory_sets_with_cards(preview_count=0):
        """Get sets with cards from memory"""
        sets_list = []
        for set_id, flashcard_set in flashcard_storage.items():
            set_copy = flashcard_set.copy()

            # Add preview if requested
            if preview_count > 0 and set_copy.get("flashcards"):
                set_copy["flashcard_preview"] = set_copy["flashcards"][:preview_count]

            sets_list.append(set_copy)
            logger.info(
                f"Memory set with cards: {set_copy['title']} - {len(set_copy.get('flashcards', []))} cards"
            )

        return sorted(sets_list, key=lambda x: x["created_at"], reverse=True)

    @staticmethod
    def _get_memory_sets():
        """Get sets from memory"""
        sets_list = []
        for set_id, flashcard_set in flashcard_storage.items():
            set_summary = {
                "id": set_id,
                "title": flashcard_set["title"],
                "total_cards": flashcard_set["total_cards"],
                "created_at": flashcard_set["created_at"],
            }
            sets_list.append(set_summary)
            logger.info(f"Memory set: {set_summary}")
        return sorted(sets_list, key=lambda x: x["created_at"], reverse=True)

    @staticmethod
    def get_set(set_id):
        """Get a specific flashcard set"""
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
                return None
            except Exception as e:
                logger.error(f"❌ Supabase get failed: {e}")
                return (
                    flashcard_storage.get(int(set_id))
                    if str(set_id).isdigit()
                    else None
                )
        else:
            return flashcard_storage.get(int(set_id)) if str(set_id).isdigit() else None

    @staticmethod
    def delete_set(set_id):
        """Delete a flashcard set"""
        if USE_SUPABASE and supabase:
            try:
                # First get the set to return its title
                flashcard_set = FlashcardStorage.get_set(set_id)
                if not flashcard_set:
                    return None

                # Delete from Supabase
                result = (
                    supabase.table("flashcard_sets").delete().eq("id", set_id).execute()
                )
                logger.info(f"🗑️  Deleted from Supabase: '{flashcard_set['title']}'")
                return flashcard_set
            except Exception as e:
                logger.error(f"❌ Supabase delete failed: {e}")
                return (
                    flashcard_storage.pop(int(set_id), None)
                    if str(set_id).isdigit()
                    else None
                )
        else:
            return (
                flashcard_storage.pop(int(set_id), None)
                if str(set_id).isdigit()
                else None
            )


# Frontend serving routes (NEW)
@app.route("/")
def index():
    """Serve the main frontend page"""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    """Serve static files (CSS, JS, images)"""
    try:
        return send_from_directory(app.static_folder, filename)
    except FileNotFoundError:
        # If file not found, serve index.html (for SPA routing)
        return send_from_directory(app.static_folder, "index.html")


# API Routes (existing - no changes needed)
@app.route("/api/status")
def home():
    storage_type = "Supabase" if USE_SUPABASE else "In-Memory"
    return jsonify(
        {
            "message": "AI Study Buddy Backend is running!",
            "version": "1.0.0",
            "storage": storage_type,
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
    """Generate flashcards from study text using AI"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        text = data.get("text", "").strip()
        num_cards = data.get("num_cards", 5)

        # Validation
        if not text:
            return jsonify({"error": "Text is required"}), 400

        if len(text) < 20:
            return (
                jsonify(
                    {
                        "error": "Text is too short. Please provide at least 20 characters."
                    }
                ),
                400,
            )

        if num_cards < 1 or num_cards > 10:
            return jsonify({"error": "Number of cards must be between 1 and 10"}), 400

        logger.info(
            f"Generating {num_cards} flashcards from text of length {len(text)}"
        )

        # Generate flashcards
        generator = FlashcardGenerator(text)
        flashcards = generator.generate_flashcards(num_cards)

        if not flashcards:
            return (
                jsonify(
                    {"error": "Unable to generate flashcards from the provided text"}
                ),
                400,
            )

        logger.info(f"✅ Successfully generated {len(flashcards)} flashcards")

        return jsonify(
            {
                "flashcards": flashcards,
                "total_generated": len(flashcards),
                "source_text_length": len(text),
                "generated_at": datetime.now().isoformat(),
            }
        )

    except Exception as e:
        logger.error(f"❌ Error generating flashcards: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route("/api/flashcards", methods=["POST"])
def save_flashcards():
    """Save flashcard set"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({"error": "No data provided"}), 400

        title = data.get("title", "").strip()
        flashcards = data.get("flashcards", [])
        original_text = data.get("original_text", "")
        card_statuses = data.get("card_statuses", [])

        if not title:
            return jsonify({"error": "Title is required"}), 400

        if not flashcards:
            return jsonify({"error": "Flashcards are required"}), 400

        # Save flashcard set
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

    except Exception as e:
        logger.error(f"❌ Error saving flashcards: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route("/api/flashcards", methods=["GET"])
def get_all_flashcard_sets():
    """Get all saved flashcard sets with optional preview"""
    try:
        # Check if user wants full data or just summaries
        include_cards = request.args.get("include_cards", "false").lower() == "true"
        preview_count = int(
            request.args.get("preview", 0)
        )  # Number of cards to preview

        if include_cards or preview_count > 0:
            # Get full data including flashcards
            sets_list = FlashcardStorage.get_all_sets_with_cards(preview_count)
        else:
            # Get just summaries (existing behavior)
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

    except Exception as e:
        logger.error(f"❌ Error getting flashcard sets: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route("/api/flashcards/<int:set_id>", methods=["GET"])
def get_flashcard_set(set_id):
    """Get a specific flashcard set by ID"""
    try:
        flashcard_set = FlashcardStorage.get_set(set_id)

        if not flashcard_set:
            return jsonify({"error": "Flashcard set not found"}), 404

        return jsonify(flashcard_set)

    except Exception as e:
        logger.error(f"❌ Error getting flashcard set {set_id}: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


@app.route("/api/flashcards/<int:set_id>", methods=["DELETE"])
def delete_flashcard_set(set_id):
    """Delete a specific flashcard set by ID"""
    try:
        deleted_set = FlashcardStorage.delete_set(set_id)

        if not deleted_set:
            return jsonify({"error": "Flashcard set not found"}), 404

        return jsonify(
            {
                "message": "Flashcard set deleted successfully",
                "deleted_title": deleted_set["title"],
            }
        )

    except Exception as e:
        logger.error(f"❌ Error deleting flashcard set {set_id}: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


# Health check endpoint
@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
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
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({"error": "Method not allowed"}), 405


@app.errorhandler(500)
def internal_error(error):
    logger.error(f"Internal server error: {str(error)}")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    # Load environment variables
    from dotenv import load_dotenv

    load_dotenv()

    # System status check
    print("AI Study Buddy Backend - System Status")
    print("=" * 40)

    # Check Gemini API key
    if os.getenv("GEMINI_API_KEY"):
        print("✅ Gemini API key: Found")
    else:
        print("⚠️  Gemini API key: Not found - AI features will be limited")

    # Check storage
    if USE_SUPABASE:
        print("✅ Storage: Supabase (persistent)")
    else:
        print("📝 Storage: In-memory (temporary)")

    print("\nStarting server...")
    print("📍 Backend running on: http://localhost:5000")
    print("📚 API health check: http://localhost:5000/api/health")

    # Updated for deployment
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_ENV") == "development"

    app.run(debug=debug_mode, host="0.0.0.0", port=port, use_reloader=debug_mode)
