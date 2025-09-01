# test_api.py - Run this to test your backend directly

import requests
import json

def test_backend_health():
    """Test if backend is running"""
    try:
        response = requests.get('http://localhost:5000/api/health')
        print(f"Health Check Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Backend not running: {e}")
        return False

def test_flashcard_generation():
    """Test flashcard generation"""
    test_text = """
    Machine learning is a subset of artificial intelligence that enables computers to learn 
    and make decisions from data without being explicitly programmed. It uses algorithms 
    to identify patterns in data and make predictions or decisions based on these patterns.
    Neural networks are inspired by biological neurons in the human brain.
    """
    
    payload = {
        "text": test_text,
        "num_cards": 3
    }
    
    try:
        response = requests.post(
            'http://localhost:5000/api/generate-flashcards',
            json=payload,
            headers={'Content-Type': 'application/json'}
        )
        
        print(f"Generation Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Generated {len(data['flashcards'])} flashcards:")
            for i, card in enumerate(data['flashcards'], 1):
                print(f"\nCard {i}:")
                print(f"  Question: {card['question']}")
                print(f"  Answer: {card['answer'][:100]}...")
                print(f"  Difficulty: {card['difficulty']}")
                print(f"  Type: {card['type']}")
        else:
            print(f"Error: {response.text}")
            
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    print("Testing StudyPal Backend...")
    print("=" * 40)
    
    if test_backend_health():
        print("\nTesting flashcard generation...")
        test_flashcard_generation()
    else:
        print("Backend is not running. Start it first with: python backend/app.py")