# AI Study Buddy - Flashcard Generator

**StudyPal** - An intelligent flashcard generator that transforms your study notes into interactive learning experiences using AI.

![Flask](https://img.shields.io/badge/Flask-000000?style=for-the-badge&logo=flask&logoColor=white) ![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)

## Overview

StudyPal revolutionizes how students approach learning by converting their study notes into personalized, interactive flashcards. Built with a focus on simplicity and effectiveness, this application addresses the critical need for quality education tools that make learning more engaging and accessible.

### Key Features

- **AI-Powered Question Generation**: Uses Hugging Face's advanced question-answering API to automatically generate intelligent quiz questions from your study materials
- **Interactive Flashcard Experience**: Smooth flip animations and intuitive navigation create an engaging study environment
- **Persistent Storage System**: Comprehensive database integration with Supabase ensures your flashcard sets are saved and accessible for future study sessions
- **Beginner-Friendly Design**: Clean, distraction-free interface focuses on learning rather than complex navigation
- **Cross-Platform Compatibility**: Fully responsive design works seamlessly across all devices

## Why StudyPal Solves Real Educational Challenges

Traditional studying methods often fail because they're passive and one-dimensional. StudyPal transforms passive note-reading into active recall practice, which research shows is significantly more effective for long-term retention. By automatically generating questions from study materials, it eliminates the time-consuming process of manual flashcard creation while ensuring comprehensive coverage of the material.

## Architecture

### Technology Stack

**Frontend Technologies:**

- **HTML5**: Semantic structure for flashcard components and form elements
- **CSS3**: Advanced animations for card flipping effects and responsive layouts
- **JavaScript**: Dynamic DOM manipulation, state management, and interactive functionality

**Backend Infrastructure:**

- **Python Flask**: Lightweight web framework handling routing, API integration, and business logic
- **Supabase**: PostgreSQL-based database for reliable flashcard storage and user data management

**AI Integration:**

- **Hugging Face Transformers API**: Advanced natural language processing for intelligent question generation

### System Workflow

1. **Content Input**: User pastes study notes through a clean HTML textarea interface
2. **AI Processing**: Flask backend processes the text and sends structured prompts to Hugging Face API requesting "Generate 5 quiz questions"
3. **Dynamic Rendering**: JavaScript creates interactive flashcards with CSS3 flip animations and smooth transitions
4. **Data Persistence**: Supabase stores generated flashcards with metadata for future access and reuse

## Technical Implementation Highlights

**State Management**: JavaScript efficiently manages flashcard states, flip animations, and navigation without requiring complex frameworks

**Database Design**: Optimized Supabase schema ensures fast retrieval and scalable storage of flashcard collections

**API Integration**: Robust error handling and response parsing for reliable AI question generation

**Responsive Architecture**: Mobile-first CSS approach ensures consistent experience across all device sizes

## Getting Started

### Prerequisites

- Python 3.8+
- Flask
- Supabase account
- Hugging Face API key

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/oreoluwa212/ai-study-buddy.git
   cd ai-study-buddy
   ```

2. **Navigate to backend directory**

   ```bash
   cd backend
   ```

3. **Install dependencies**

   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Setup**

   Create a `.env` file in the current `backend` directory:

   ```env
   # Flask Configuration
   FLASK_ENV=development
   FLASK_DEBUG=True
   SECRET_KEY=your_secret_key_here

   # Hugging Face API
   HUGGING_FACE_TOKEN=your_huggingface_token_here

   # Supabase Configuration
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_KEY=your_supabase_anon_key_here

   # Database Configuration (if using local database)
   DATABASE_URL=sqlite:///flashcards.db

   # CORS Settings
   CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:8000
   ```

5. **Database Setup**

   Create the following table in your Supabase database:

   ```sql
   CREATE TABLE flashcard_sets (
       id SERIAL PRIMARY KEY,
       title VARCHAR(255) NOT NULL,
       flashcards JSONB NOT NULL,
       original_text TEXT,
       card_statuses JSONB DEFAULT '[]'::jsonb,
       total_cards INTEGER NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   CREATE INDEX idx_flashcard_sets_created_at ON flashcard_sets(created_at DESC);
   CREATE INDEX idx_flashcard_sets_title ON flashcard_sets(title);

   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.updated_at = NOW();
       RETURN NEW;
   END;
   $$ language 'plpgsql';

   CREATE TRIGGER update_flashcard_sets_updated_at
       BEFORE UPDATE ON flashcard_sets
       FOR EACH ROW
       EXECUTE FUNCTION update_updated_at_column();

   INSERT INTO flashcard_sets (title, flashcards, original_text, total_cards) VALUES (
       'Sample Machine Learning Cards',
       '[
           {
               "id": 1,
               "question": "What is machine learning?",
               "answer": "Machine learning is a subset of artificial intelligence that enables computers to learn and make decisions from data without being explicitly programmed.",
               "difficulty": "medium",
               "type": "definition"
           },
           {
               "id": 2,
               "question": "What are neural networks?",
               "answer": "Neural networks are computing systems inspired by biological neural networks that constitute animal brains.",
               "difficulty": "hard",
               "type": "explanation"
           }
       ]'::jsonb,
       'Machine learning is a subset of artificial intelligence. Neural networks are inspired by biological brains.',
       2
   );
   ```

6. **Run the application**

   ```bash
   python run.py
   ```

   Navigate to `http://localhost:8000` to start using StudyPal!

## Usage Guide

**Creating Your First Flashcard Set:**

1. Navigate to the main interface and locate the study notes input area
2. Paste or type your study material into the textarea
3. Click "Generate Flashcards" and allow the AI to process your content
4. Review the generated questions and answers for accuracy

**Interactive Study Session:**

1. Click on any flashcard to reveal the flip animation between questions and answers
2. Use the navigation controls to move seamlessly between different cards
3. Track your understanding and progress as you work through the material
4. Access your saved flashcard collections anytime from the main dashboard

**Data Management:**

1. All generated flashcard sets are automatically saved to your Supabase database
2. Retrieve and review previously created collections for continued study
3. Organize your flashcards by subject or topic for efficient learning

## Educational Value and Learning Outcomes

**Perfect Foundation for Aspiring Developers:**

- **No Complex UI Framework Dependencies**: Learn core web development principles without the overhead of heavy frameworks
- **Comprehensive State Management**: Master JavaScript state handling and DOM manipulation techniques essential for modern web development
- **Database Relationship Understanding**: Gain practical experience with PostgreSQL database design and relationship management through Supabase
- **API Integration Mastery**: Develop skills in working with external APIs, handling asynchronous operations, and managing API responses
- **Full-Stack Development Experience**: Complete the entire development lifecycle from frontend interaction to backend processing and database storage

**Real-World Development Skills:**
This project teaches fundamental concepts that transfer directly to professional development environments, making it an ideal learning platform for students beginning their coding journey.

## Hackathon Entry

StudyPal is my entry for the **PLP July Cohort Vibe Coding Hackathon** focusing on **UN Sustainable Development Goal 4: Quality Education**. The project demonstrates excellence across multiple evaluation criteria:

**Problem Clarity and Impact**: Successfully identifies and addresses the widespread issue of ineffective traditional study methods that fail to promote active learning and long-term retention.

**Solution Quality and Innovation**: Delivers a robust, production-ready application that seamlessly integrates cutting-edge AI technology with intuitive user experience design.

**Market Understanding**: Demonstrates deep insight into student learning preferences and educational technology needs, creating a solution that bridges the gap between passive content consumption and active knowledge retention.

**Technical Excellence**: Showcases innovative use of AI for educational enhancement while maintaining clean, maintainable code architecture suitable for both learning and production environments.

This project represents my commitment to leveraging technology for educational impact while serving as an excellent learning platform for aspiring developers.

## Contributing

Contributions are welcome and appreciated! To contribute to StudyPal:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## Acknowledgments

- [Hugging Face](https://huggingface.co/) for providing powerful AI models and accessible API infrastructure
- [Supabase](https://supabase.com/) for seamless database integration and developer-friendly backend services
- [Flask](https://flask.palletsprojects.com/) community for excellent documentation and framework support
- PLP July Cohort Vibe Coding Hackathon organizers for promoting educational innovation and providing a platform for meaningful solutions

## Contact

**Developer**: Oreoluwa Ruth Ajayi

**Project Repository**: [https://github.com/oreoluwa212/ai-study-buddy](https://github.com/oreoluwa212/ai-study-buddy)

---

**Built to transform education through technology**  
_Making quality learning accessible, one flashcard at a time_
