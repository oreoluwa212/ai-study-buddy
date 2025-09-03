import os
import logging
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from models.flashcard import FlashcardGenerator
import requests
import secrets
import uuid
import random

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder="../frontend", static_url_path="")

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

INTASEND_PUBLISHABLE_KEY = os.getenv("INTASEND_PUBLISHABLE_KEY")
INTASEND_SECRET_KEY = os.getenv("INTASEND_SECRET_KEY")
INTASEND_BASE_URL = os.getenv("INTASEND_BASE_URL", "https://sandbox.intasend.com")

USE_SUPABASE = bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"))
supabase = None
if USE_SUPABASE:
    try:
        from supabase.client import create_client, Client
        supabase_url = os.getenv("SUPABASE_URL")
        supabase_key = os.getenv("SUPABASE_KEY")
        if supabase_url is not None and supabase_key is not None:
            supabase = create_client(supabase_url, supabase_key)
            logger.info("Supabase client initialized")
        else:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set and not None")
    except Exception as e:
        logger.error(f"Supabase init failed: {e}")
        USE_SUPABASE = False
        supabase = None
else:
    logger.info("Using in-memory storage")

flashcard_storage = {}
storage_counter = 1
payment_storage = {}
payment_counter = 1


class TierManager:
    @staticmethod
    def check_user_tier(user_email):
        if not user_email:
            return "free"

        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("premium_users")
                    .select("*")
                    .eq("user_email", user_email)
                    .eq("is_active", True)
                    .execute()
                )

                if result.data and len(result.data) > 0:
                    subscription = result.data[0]
                    expires_at = datetime.fromisoformat(
                        subscription["expires_at"].replace("Z", "+00:00")
                    )
                    if expires_at > datetime.now():
                        return "premium"
                    else:
                        supabase.table("premium_users").update({"is_active": False}).eq(
                            "user_email", user_email
                        ).execute()

                return "free"
            except Exception as e:
                logger.error(f"Tier check failed: {e}")
                return "free"
        return "free"

    @staticmethod
    def can_access_flashcard_set(user_email, set_id):
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets")
                    .select("tier_required, user_email")
                    .eq("id", set_id)
                    .execute()
                )

                if not result.data:
                    return False

                flashcard_set = result.data[0]
                tier_required = flashcard_set.get("tier_required", "free")

                if tier_required == "free":
                    return True

                if tier_required == "premium":
                    user_tier = TierManager.check_user_tier(user_email)
                    return user_tier == "premium"

                return False
            except Exception as e:
                logger.error(f"Access check failed: {e}")
                return False
        return True

    @staticmethod
    def create_premium_subscription(user_email, plan_type, payment_id):
        if USE_SUPABASE and supabase:
            try:
                expires_at = datetime.now() + (
                    timedelta(days=365) if plan_type == "yearly" else timedelta(days=30)
                )

                subscription_data = {
                    "user_email": user_email,
                    "plan_type": plan_type,
                    "payment_id": payment_id,
                    "expires_at": expires_at.isoformat(),
                    "is_active": True,
                }

                result = (
                    supabase.table("premium_users")
                    .upsert(subscription_data, on_conflict="user_email")
                    .execute()
                )
                return result.data[0] if result.data else None
            except Exception as e:
                logger.error(f"Premium subscription creation failed: {e}")
                return None
        return None


class PaymentStorage:
    @staticmethod
    def create_payment_intent(
        amount, currency, description, user_email=None, plan_type="monthly"
    ):
        timestamp = int(datetime.now().timestamp() * 1000) + random.randint(0, 999)

        payment_intent = {
            "amount": amount,
            "currency": currency,
            "description": description,
            "user_email": user_email,
            "plan_type": plan_type,
            "status": "pending",
            "created_at": datetime.now().isoformat(),
            "expires_at": (datetime.now() + timedelta(hours=1)).isoformat(),
            "reference": f"studypal_{timestamp}_{secrets.token_urlsafe(8)}",
        }

        if USE_SUPABASE and supabase:
            try:
                existing = (
                    supabase.table("payment_intents")
                    .select("*")
                    .eq("user_email", user_email)
                    .eq("status", "pending")
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )

                if existing.data:
                    recent = existing.data[0]
                    try:
                        created_at = datetime.fromisoformat(
                            recent["created_at"].replace("Z", "+00:00")
                        )
                        if (
                            datetime.now(created_at.tzinfo) - created_at
                        ).total_seconds() < 300:
                            logger.info(
                                f"Returning existing payment intent for {user_email}"
                            )
                            return recent
                    except:
                        pass

                result = (
                    supabase.table("payment_intents").insert(payment_intent).execute()
                )
                if result.data:
                    logger.info(f"Created new payment intent for {user_email}")
                    return result.data[0]

            except Exception as e:
                logger.error(f"Supabase payment save failed: {e}")

                if "23505" in str(e):
                    try:
                        logger.info("Retrying with UUID due to duplicate key error")
                        payment_intent["id"] = str(uuid.uuid4())
                        payment_intent["reference"] = (
                            f"studypal_uuid_{uuid.uuid4().hex[:8]}_{secrets.token_urlsafe(4)}"
                        )

                        result = (
                            supabase.table("payment_intents")
                            .insert(payment_intent)
                            .execute()
                        )
                        if result.data:
                            return result.data[0]
                    except Exception as retry_error:
                        logger.error(f"UUID retry also failed: {retry_error}")

        global payment_counter
        payment_intent["id"] = payment_counter
        payment_storage[payment_counter] = payment_intent
        payment_counter += 1
        logger.info(
            f"Saved payment intent to memory storage with ID {payment_counter-1}"
        )
        return payment_intent

    @staticmethod
    def update_payment_status(payment_id, status, intasend_ref=None):
        update_data = {"status": status, "updated_at": datetime.now().isoformat()}
        if intasend_ref:
            update_data["intasend_reference"] = intasend_ref

        if USE_SUPABASE and supabase:
            try:
                supabase.table("payment_intents").update(update_data).eq(
                    "id", payment_id
                ).execute()

                if status == "completed":
                    payment = PaymentStorage.get_payment_intent(payment_id)
                    if payment and payment.get("user_email"):
                        TierManager.create_premium_subscription(
                            payment["user_email"],
                            payment.get("plan_type", "monthly"),
                            payment_id,
                        )

                return True
            except Exception as e:
                logger.error(f"Supabase payment update failed: {e}")

        if int(payment_id) in payment_storage:
            payment_storage[int(payment_id)].update(update_data)

            if status == "completed":
                payment = payment_storage[int(payment_id)]
                logger.info(
                    f"Payment {payment_id} completed for {payment.get('user_email')}"
                )

            return True
        return False

    @staticmethod
    def get_payment_intent(payment_id):
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("payment_intents")
                    .select("*")
                    .eq("id", payment_id)
                    .execute()
                )
                if result.data and len(result.data) > 0:
                    return result.data[0]
            except Exception as e:
                logger.error(f"Supabase payment fetch failed: {e}")
        return payment_storage.get(int(payment_id))


class FlashcardStorage:
    @staticmethod
    def save_flashcard_set(
        title,
        flashcards,
        original_text,
        card_statuses=None,
        user_email=None,
        tier_required="free",
    ):
        global storage_counter
        total_cards = len(flashcards) if flashcards else 0
        flashcard_set = {
            "title": title,
            "flashcards": flashcards,
            "original_text": original_text,
            "card_statuses": card_statuses or [],
            "created_at": datetime.now().isoformat(),
            "total_cards": total_cards,
            "tier_required": tier_required,
            "user_email": user_email,
        }

        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets").insert(flashcard_set).execute()
                )
                if result.data:
                    return result.data[0]
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
    def get_all_sets(user_email=None, include_locked=False):
        if USE_SUPABASE and supabase:
            try:
                result = (
                    supabase.table("flashcard_sets")
                    .select(
                        "id, title, total_cards, created_at, tier_required, user_email"
                    )
                    .order("created_at", desc=True)
                    .execute()
                )

                if result.data:
                    sets = result.data
                    user_tier = (
                        TierManager.check_user_tier(user_email)
                        if user_email
                        else "free"
                    )

                    for set_data in sets:
                        tier_required = set_data.get("tier_required", "free")

                        if user_email:
                            can_access = (tier_required == "free") or (
                                user_tier == "premium"
                            )
                        else:
                            can_access = tier_required == "free"

                        set_data["can_access"] = can_access
                        set_data["is_locked"] = not can_access
                        set_data["user_tier"] = user_tier

                    if not include_locked:
                        sets = [s for s in sets if s["can_access"]]

                    return sets

                return []
            except Exception as e:
                logger.error(f"Supabase fetch failed: {e}")
                return FlashcardStorage._get_memory_sets()
        return FlashcardStorage._get_memory_sets()

    @staticmethod
    def _get_memory_sets():
        return sorted(
            [
                {
                    "id": sid,
                    "title": s["title"],
                    "total_cards": s["total_cards"],
                    "created_at": s["created_at"],
                    "tier_required": s.get("tier_required", "free"),
                    "can_access": True,
                    "is_locked": False,
                }
                for sid, s in flashcard_storage.items()
            ],
            key=lambda x: x["created_at"],
            reverse=True,
        )

    @staticmethod
    def get_set(set_id, user_email=None):
        if USE_SUPABASE and supabase:
            try:
                if user_email and not TierManager.can_access_flashcard_set(
                    user_email, set_id
                ):
                    return {"error": "Access denied", "tier_required": "premium"}

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
                logger.error(f"Supabase get failed: {e}")
                return flashcard_storage.get(int(set_id))
        return flashcard_storage.get(int(set_id))

    @staticmethod
    def delete_set(set_id, user_email=None):
        if USE_SUPABASE and supabase:
            try:
                flashcard_set = (
                    supabase.table("flashcard_sets")
                    .select("*")
                    .eq("id", set_id)
                    .execute()
                )
                if not flashcard_set.data:
                    return None

                set_data = flashcard_set.data[0]
                if user_email and set_data.get("user_email") != user_email:
                    return {"error": "Access denied"}

                supabase.table("flashcard_sets").delete().eq("id", set_id).execute()
                return set_data
            except Exception as e:
                logger.error(f"Supabase delete failed: {e}")
                return flashcard_storage.pop(int(set_id), None)
        return flashcard_storage.pop(int(set_id), None)


@app.route("/api/flashcards", methods=["POST"])
def save_flashcards():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    title = data.get("title", "").strip()
    flashcards = data.get("flashcards", [])
    original_text = data.get("original_text", "")
    card_statuses = data.get("card_statuses", [])
    user_email = data.get("user_email")
    tier_required = data.get("tier_required", "free")

    if not title or not flashcards:
        return jsonify({"error": "Title and flashcards are required"}), 400

    if tier_required == "premium" and user_email:
        user_tier = TierManager.check_user_tier(user_email)
        if user_tier != "premium":
            return jsonify({"error": "Premium subscription required"}), 403

    flashcard_set = FlashcardStorage.save_flashcard_set(
        title, flashcards, original_text, card_statuses, user_email, tier_required
    )

    return jsonify(
        {
            "message": "Flashcard set saved successfully",
            "id": flashcard_set["id"],
            "title": title,
            "total_cards": len(flashcards),
            "tier_required": tier_required,
            "storage_type": "Supabase" if USE_SUPABASE else "Memory",
        }
    )


@app.route("/api/flashcards", methods=["GET"])
def get_flashcard_sets():
    user_email = request.args.get("user_email")
    include_locked = request.args.get("include_locked", "false").lower() == "true"
    include_cards = request.args.get("include_cards", "false").lower() == "true"

    if include_cards:
        sets_list = FlashcardStorage.get_all_sets(user_email, include_locked=True)

        for set_data in sets_list:
            if not set_data.get("can_access", True):
                flashcards = set_data.get("flashcards")
                if isinstance(flashcards, list) and flashcards:
                    set_data["flashcards"] = flashcards[:1]
                    set_data["preview_only"] = True
    else:
        sets_list = FlashcardStorage.get_all_sets(user_email, include_locked)

    user_tier = TierManager.check_user_tier(user_email) if user_email else "free"

    return jsonify(
        {
            "flashcard_sets": sets_list,
            "total_sets": len(sets_list),
            "user_tier": user_tier,
            "user_email": user_email,
            "storage_type": "Supabase" if USE_SUPABASE else "Memory",
        }
    )


@app.route("/api/flashcards/<int:set_id>", methods=["GET"])
def get_flashcard_set(set_id):
    user_email = request.args.get("user_email")

    flashcard_set = FlashcardStorage.get_set(set_id, user_email)
    if not flashcard_set:
        return jsonify({"error": "Flashcard set not found"}), 404

    if isinstance(flashcard_set, dict) and flashcard_set.get("error"):
        return jsonify(flashcard_set), 403

    return jsonify(flashcard_set)


@app.route("/api/flashcards/<int:set_id>", methods=["DELETE"])
def delete_flashcard_set(set_id):
    user_email = request.args.get("user_email")

    deleted_set = FlashcardStorage.delete_set(set_id, user_email)
    if not deleted_set:
        return jsonify({"error": "Flashcard set not found"}), 404

    if isinstance(deleted_set, dict) and deleted_set.get("error"):
        return jsonify(deleted_set), 403

    return jsonify(
        {
            "message": "Flashcard set deleted successfully",
            "deleted_title": deleted_set["title"],
        }
    )


@app.route("/api/payments/create-intent", methods=["POST"])
def create_payment_intent():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    amount = data.get("amount")
    currency = data.get("currency", "KES")
    description = data.get("description", "StudyPal Premium")
    user_email = data.get("user_email")
    plan_type = data.get("plan_type", "monthly")
    redirect_url = data.get("redirect_url", request.url_root)
    cancel_url = data.get("cancel_url", request.url_root)

    if not amount or amount <= 0:
        return jsonify({"error": "Valid amount is required"}), 400

    if not user_email:
        return jsonify({"error": "User email is required"}), 400

    try:
        payment_intent = PaymentStorage.create_payment_intent(
            amount=amount,
            currency=currency,
            description=description,
            user_email=user_email,
            plan_type=plan_type,
        )

        checkout_url = f"{INTASEND_BASE_URL}/checkout/{payment_intent['reference']}/"

        collection_data = create_intasend_collection(
            payment_intent, user_email, redirect_url, cancel_url
        )

        if collection_data and collection_data.get("checkout_url"):
            checkout_url = collection_data["checkout_url"]

        return jsonify(
            {
                "payment_intent": payment_intent,
                "checkout_url": checkout_url,
                "publishable_key": INTASEND_PUBLISHABLE_KEY,
                "intasend_config": {
                    "base_url": INTASEND_BASE_URL,
                    "currency": currency,
                },
            }
        )

    except Exception as e:
        logger.error(f"Payment intent creation failed: {e}")
        return jsonify({"error": "Failed to create payment intent"}), 500


def create_intasend_collection(payment_intent, user_email, redirect_url, cancel_url):
    try:
        if not INTASEND_SECRET_KEY:
            logger.warning("INTASEND_SECRET_KEY not set, using basic checkout URL")
            return None

        headers = {
            "Authorization": f"Bearer {INTASEND_SECRET_KEY}",
            "Content-Type": "application/json",
        }

        name_parts = (
            user_email.split("@")[0].replace(".", " ").replace("_", " ").split()
        )
        first_name = name_parts[0].capitalize() if name_parts else "User"
        last_name = name_parts[1].capitalize() if len(name_parts) > 1 else "StudyPal"

        collection_payload = {
            "first_name": first_name,
            "last_name": last_name,
            "email": user_email,
            "host": request.url_root.rstrip("/"),
            "amount": payment_intent["amount"],
            "currency": payment_intent["currency"],
            "api_ref": payment_intent["reference"],
            "narrative": payment_intent["description"],
            "redirect_url": redirect_url,
            "webhook_url": f"{request.url_root}api/payments/webhook",
            "extra": {
                "plan_type": payment_intent.get("plan_type", "monthly"),
                "user_email": user_email,
            },
        }

        response = requests.post(
            f"{INTASEND_BASE_URL}/api/v1/collections/",
            headers=headers,
            json=collection_payload,
            timeout=10,
        )

        if response.status_code == 201:
            collection_data = response.json()
            logger.info(f"IntaSend collection created: {collection_data.get('id')}")
            return collection_data
        else:
            logger.warning(
                f"IntaSend collection creation failed: {response.status_code} - {response.text}"
            )
            return None

    except requests.RequestException as e:
        logger.error(f"IntaSend API request failed: {e}")
        return None
    except Exception as e:
        logger.error(f"Collection creation failed: {e}")
        return None


@app.route("/payment-success")
def payment_success():
    return send_from_directory(app.static_folder or "", "index.html")


@app.route("/payment-cancel")
def payment_cancel():
    return send_from_directory(app.static_folder or "", "index.html")


@app.route("/api/payments/webhook", methods=["POST"])
def intasend_webhook():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        logger.info(f"Webhook received: {data}")

        invoice_id = data.get("invoice_id") or data.get("id")
        state = data.get("state") or data.get("status")
        reference = data.get("account") or data.get("api_ref") or data.get("reference")

        if reference and reference.startswith("studypal_"):
            reference_parts = reference.split("_")
            if len(reference_parts) >= 2:
                payment_id = reference_parts[1]

                status_mapping = {
                    "COMPLETE": "completed",
                    "COMPLETED": "completed",
                    "SUCCESS": "completed",
                    "PROCESSING": "processing",
                    "PENDING": "pending",
                    "FAILED": "failed",
                    "CANCELLED": "cancelled",
                    "CANCELED": "cancelled",
                }

                status = status_mapping.get(state.upper() if state else "", "unknown")

                if status != "unknown":
                    PaymentStorage.update_payment_status(payment_id, status, invoice_id)
                    logger.info(f"Payment {payment_id} updated to {status} via webhook")
                else:
                    logger.warning(f"Unknown payment status: {state}")

        return jsonify(
            {"status": "received", "message": "Webhook processed successfully"}
        )

    except Exception as e:
        logger.error(f"Webhook processing failed: {e}")
        return jsonify({"error": "Webhook processing failed"}), 500


@app.route("/api/user/tier", methods=["GET"])
def get_user_tier():
    user_email = request.args.get("user_email")
    if not user_email:
        return jsonify({"tier": "free", "error": "No email provided"}), 400

    user_tier = TierManager.check_user_tier(user_email)

    return jsonify(
        {
            "tier": user_tier,
            "user_email": user_email,
            "is_premium": user_tier == "premium",
        }
    )


@app.route("/api/premium/validate", methods=["POST"])
def validate_premium_access():
    data = request.get_json()
    payment_id = data.get("payment_id")
    user_email = data.get("user_email")

    if not payment_id or not user_email:
        return jsonify({"error": "Payment ID and email required"}), 400

    payment = PaymentStorage.get_payment_intent(payment_id)
    if not payment:
        return jsonify({"error": "Payment not found"}), 404

    is_premium = payment["status"] == "completed"
    user_tier = TierManager.check_user_tier(user_email) if is_premium else "free"

    return jsonify(
        {
            "is_premium": is_premium,
            "tier": user_tier,
            "status": payment["status"],
            "expires_at": payment.get("expires_at"),
        }
    )


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path):
    static_folder = app.static_folder or ""
    if path != "" and os.path.exists(os.path.join(static_folder, path)):
        return send_from_directory(static_folder, path)
    return send_from_directory(static_folder, "index.html")


@app.route("/api/status")
def api_status():
    return jsonify(
        {
            "message": "StudyPal Backend is running!",
            "version": "2.0.0",
            "storage": "Supabase" if USE_SUPABASE else "Memory",
            "ai_enabled": bool(os.getenv("GEMINI_API_KEY")),
            "tier_system": True,
            "endpoints": {
                "generate": "/api/generate-flashcards",
                "save": "/api/flashcards",
                "get": "/api/flashcards",
                "delete": "/api/flashcards/<id>",
                "tier": "/api/user/tier",
                "payment": "/api/payments/create-intent",
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
    user_email = data.get("user_email")

    if not text or len(text) < 20:
        return jsonify({"error": "Text too short, provide at least 20 characters"}), 400

    user_tier = TierManager.check_user_tier(user_email) if user_email else "free"
    max_cards = 10 if user_tier == "premium" else 5

    if num_cards < 1 or num_cards > max_cards:
        return (
            jsonify({"error": f"Number of cards must be between 1 and {max_cards}"}),
            400,
        )

    generator = FlashcardGenerator(text)
    flashcards = generator.generate_flashcards(num_cards)
    if not flashcards:
        return jsonify({"error": "Unable to generate flashcards"}), 400

    return jsonify(
        {
            "flashcards": flashcards,
            "total_generated": len(flashcards),
            "source_text_length": len(text),
            "user_tier": user_tier,
            "max_cards_allowed": max_cards,
            "generated_at": datetime.now().isoformat(),
        }
    )


@app.route("/api/payments/<int:payment_id>/status", methods=["GET"])
def get_payment_status(payment_id):
    payment = PaymentStorage.get_payment_intent(payment_id)
    if not payment:
        return jsonify({"error": "Payment not found"}), 404

    return jsonify(
        {
            "payment_id": payment["id"],
            "status": payment["status"],
            "amount": payment["amount"],
            "currency": payment["currency"],
            "plan_type": payment.get("plan_type", "monthly"),
            "created_at": payment["created_at"],
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
            "tier_system": True,
        }
    )


@app.errorhandler(404)
def handle_404(error):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def handle_405(error):
    return jsonify({"error": "Method not allowed"}), 405


if __name__ == "__main__":
    app.run(debug=True)