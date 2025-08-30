#!/usr/bin/env python3
"""
AI Study Buddy - Project Runner
This script helps you run the entire application easily
"""

import os
import sys
import subprocess
import webbrowser
import time
from pathlib import Path
import threading

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 7):
        print("❌ Python 3.7+ is required. You're using:", sys.version)
        return False
    print(f"✅ Python version: {sys.version.split()[0]}")
    return True

def check_dependencies():
    """Check if required dependencies are installed"""
    try:
        import flask
        import flask_cors
        import requests
        print("✅ Core dependencies are installed")
        
        # Check optional dependencies
        try:
            import supabase
            print("✅ Supabase support available")
        except ImportError:
            print("ℹ️  Supabase not installed (optional) - will use in-memory storage")
        
        return True
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("📦 Installing dependencies...")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', 'requirements.txt'])
            print("✅ Dependencies installed successfully")
            return True
        except subprocess.CalledProcessError:
            print("❌ Failed to install dependencies")
            return False

def check_environment():
    """Check environment configuration"""
    env_path = Path('.env')
    if not env_path.exists():
        print("⚠️  .env file not found. Creating a template...")
        # Create a basic .env template
        with open('.env', 'w') as f:
            f.write("""# Flask Configuration
FLASK_ENV=development
FLASK_DEBUG=True
SECRET_KEY=dev-secret-key-change-in-production

# Hugging Face API - Add your token here
HUGGING_FACE_TOKEN=your_token_here

# Supabase Configuration (optional)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# CORS Settings
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000
""")
        print("📝 Created .env template. Please add your API tokens.")
        return False
    
    # Load and check environment variables
    from dotenv import load_dotenv
    load_dotenv(env_path)
    
    hf_token = os.getenv('HUGGING_FACE_TOKEN')
    if hf_token and hf_token != 'your_token_here':
        print("✅ Hugging Face token found")
    else:
        print("⚠️  Hugging Face token not found - AI features will be limited")
    
    supabase_url = os.getenv('SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_KEY')
    if supabase_url and supabase_key and supabase_url != 'your_supabase_url':
        print("✅ Supabase configuration found")
    else:
        print("ℹ️  Supabase not configured - using in-memory storage")
    
    return True

def run_backend():
    """Run the Flask backend"""
    print("\n🚀 Starting AI Study Buddy Backend...")
    print("📍 Backend will run on: http://localhost:5000")

    try:
        # Load environment variables
        from dotenv import load_dotenv
        load_dotenv()
        
        # Import and run the Flask app
        from app import app
        app.run(
            debug=True,
            host='0.0.0.0',
            port=5000,
            use_reloader=False  # Disable reloader to prevent issues with threading
        )
    except KeyboardInterrupt:
        print("\n👋 Shutting down AI Study Buddy...")
        print("Thanks for using the app!")
    except Exception as e:
        print(f"❌ Error running backend: {e}")
        print("Make sure you're in the backend directory and all dependencies are installed.")
        return False

def serve_frontend():
    """Serve frontend files using Python's built-in server"""
    frontend_dir = Path('../frontend')  # Go up one level to find frontend
    if not frontend_dir.exists():
        frontend_dir = Path('frontend')  # Try current directory
        if not frontend_dir.exists():
            print("⚠️  Frontend directory not found")
            return
    
    print("📱 Starting frontend server on http://localhost:8000")
    os.chdir(frontend_dir)
    
    try:
        # Use Python's built-in HTTP server
        subprocess.run([
            sys.executable, '-m', 'http.server', '8000'
        ], check=True)
    except KeyboardInterrupt:
        pass
    except subprocess.CalledProcessError as e:
        print(f"❌ Error serving frontend: {e}")

def open_browser_delayed():
    """Open browser after a short delay"""
    time.sleep(3)
    try:
        webbrowser.open('http://localhost:8000')  # Frontend
        time.sleep(1)
        webbrowser.open('http://localhost:5000/api/health')  # Backend health check
    except Exception as e:
        print(f"Could not open browser automatically: {e}")

def main():
    """Main function"""
    print("🧠 AI Study Buddy - Project Setup & Runner")
    print("=" * 50)

    # Check Python version
    if not check_python_version():
        sys.exit(1)

    # Make sure we're in the backend directory
    if not Path('app.py').exists():
        backend_dir = Path('backend')
        if backend_dir.exists() and (backend_dir / 'app.py').exists():
            os.chdir(backend_dir)
            print("📂 Switched to backend directory")
        else:
            print("❌ Cannot find app.py. Make sure you're running this from the project root or backend directory.")
            sys.exit(1)

    # Check dependencies
    if not check_dependencies():
        sys.exit(1)

    # Check environment
    env_ready = check_environment()
    
    print("\n" + "=" * 50)
    if not env_ready:
        print("⚠️  Please configure your .env file before continuing.")
        input("Press Enter after you've added your API tokens to continue...")

    print("🎯 System Ready! Choose how to run:")
    print("1. Backend only (Flask API)")
    print("2. Frontend only (Static server)")
    print("3. Both (Backend + Frontend)")
    print("4. Exit")
    
    choice = input("\nEnter your choice (1-4): ").strip()
    
    if choice == '1':
        run_backend()
    elif choice == '2':
        serve_frontend()
    elif choice == '3':
        print("\n🚀 Starting both Backend and Frontend...")
        
        # Start browser opener in background
        browser_thread = threading.Thread(target=open_browser_delayed)
        browser_thread.daemon = True
        browser_thread.start()
        
        # Start frontend server in background
        frontend_thread = threading.Thread(target=serve_frontend)
        frontend_thread.daemon = True
        frontend_thread.start()
        
        # Run backend in main thread
        run_backend()
    elif choice == '4':
        print("👋 Goodbye!")
        sys.exit(0)
    else:
        print("❌ Invalid choice. Please run the script again.")
        sys.exit(1)

if __name__ == '__main__':
    main()