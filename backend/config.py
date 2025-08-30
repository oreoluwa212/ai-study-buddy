import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base configuration class"""
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'
    HUGGING_FACE_TOKEN = os.environ.get('HUGGING_FACE_TOKEN')
    SUPABASE_URL = os.environ.get('SUPABASE_URL')
    SUPABASE_KEY = os.environ.get('SUPABASE_KEY')
    DATABASE_URL = os.environ.get('DATABASE_URL') or 'sqlite:///flashcards.db'
    
    # CORS settings
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',')
    
    # Hugging Face API URLs
    HF_API_URLS = [
        "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium",
        "https://api-inference.huggingface.co/models/facebook/bart-large-cnn",
        "https://api-inference.huggingface.co/models/google/flan-t5-large"
    ]

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'

# Configuration dictionary
config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}