import random
import requests
import os
import re
import json
import time
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class FlashcardGenerator:
    """
    Generates flashcards from a given text input using multiple strategies.
    """

    def __init__(self, text: str):
        self.text = text
        self.sentences = self._split_into_sentences()
        
        # Hugging Face API configuration
        self.api_token = os.getenv('HUGGING_FACE_TOKEN')
        if not self.api_token:
            logger.warning("HUGGING_FACE_TOKEN not found - using fallback generation")
        
        # Use a better model for question generation
        self.api_url = "https://api-inference.huggingface.co/models/google/flan-t5-large"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

    def _split_into_sentences(self):
        """Split text into meaningful sentences"""
        sentences = re.split(r'[.!?]+', self.text)
        cleaned = []
        for s in sentences:
            s = s.strip()
            if len(s) > 15 and not s.isspace():
                cleaned.append(s)
        return cleaned

    def _extract_key_facts(self, text: str) -> List[Dict[str, str]]:
        """Extract key facts that can be turned into Q&A pairs"""
        facts = []
        
        # Look for definition patterns
        definition_patterns = [
            r'([A-Z][^.!?]*) is ((?:a|an|the) [^.!?]+[.!?])',
            r'([A-Z][^.!?]*) refers to ([^.!?]+[.!?])',
            r'([A-Z][^.!?]*) means ([^.!?]+[.!?])'
        ]
        
        for pattern in definition_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                term = match.group(1).strip()
                definition = match.group(2).strip()
                facts.append({
                    'type': 'definition',
                    'question': f"What is {term}?",
                    'answer': f"{term} is {definition}"
                })
        
        # Look for process steps
        process_patterns = [
            r'involves? ((?:two|three|four|several) (?:main )?(?:stages?|steps?|phases?)): ([^.!?]+)',
            r'consists? of ((?:two|three|four|several) (?:main )?(?:stages?|steps?|parts?)): ([^.!?]+)',
            r'occurs? in ((?:two|three|four|several) (?:main )?(?:stages?|steps?|phases?)): ([^.!?]+)'
        ]
        
        for pattern in process_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                num_stages = match.group(1)
                stages = match.group(2).strip()
                facts.append({
                    'type': 'process',
                    'question': f"How many main stages are involved in this process?",
                    'answer': f"It involves {num_stages}: {stages}"
                })
        
        # Look for location information
        location_patterns = [
            r'occurs? (?:primarily )?in (?:the )?([^.!?,]+)',
            r'takes? place in (?:the )?([^.!?,]+)',
            r'happens? in (?:the )?([^.!?,]+)'
        ]
        
        for pattern in location_patterns:
            matches = re.finditer(pattern, text, re.IGNORECASE)
            for match in matches:
                location = match.group(1).strip()
                if len(location) < 50 and not any(word in location.lower() for word in ['when', 'where', 'how', 'what', 'why']):
                    facts.append({
                        'type': 'location',
                        'question': f"Where does this process occur?",
                        'answer': f"It occurs in {location}"
                    })
        
        # Look for equations or formulas
        equation_pattern = r'equation is:?\s*([^.!?]+[.!?])'
        matches = re.finditer(equation_pattern, text, re.IGNORECASE)
        for match in matches:
            equation = match.group(1).strip()
            facts.append({
                'type': 'equation',
                'question': "What is the overall equation for this process?",
                'answer': f"The equation is: {equation}"
            })
        
        return facts

    def _create_smart_fallback_questions(self, content: str, num_questions: int = 5) -> List[Dict[str, str]]:
        """Create intelligent fallback questions using pattern matching"""
        questions = []
        
        # First try to extract structured facts
        extracted_facts = self._extract_key_facts(content)
        questions.extend(extracted_facts)
        
        # Fill remaining slots with template-based questions
        remaining = max(0, num_questions - len(questions))
        if remaining > 0:
            template_questions = self._generate_template_questions(content, remaining)
            questions.extend(template_questions)
        
        # Ensure we have the right number of questions
        questions = questions[:num_questions]
        
        # Add IDs and ensure all required fields
        for i, q in enumerate(questions):
            q['id'] = str(i + 1)
            if 'difficulty' not in q:
                q['difficulty'] = self._assess_difficulty(q['question'], q['answer'])
            if 'type' not in q:
                q['type'] = q.get('type', 'general')
        
        return questions

    def _generate_template_questions(self, content: str, num_needed: int) -> List[Dict[str, str]]:
        """Generate questions using templates when pattern matching fails"""
        questions = []
        sentences = self.sentences if self.sentences else [content]
        
        # Template categories with better answer extraction
        templates = [
            {
                'question': "What is the main process described in the text?",
                'answer_strategy': 'first_sentence'
            },
            {
                'question': "What are the key components or stages mentioned?",
                'answer_strategy': 'list_items'
            },
            {
                'question': "What happens during this process?",
                'answer_strategy': 'process_description'
            },
            {
                'question': "What is produced or created by this process?",
                'answer_strategy': 'products'
            }
        ]
        
        for i in range(min(num_needed, len(templates))):
            template = templates[i]
            answer = self._extract_answer_by_strategy(content, sentences, template['answer_strategy'])
            
            questions.append({
                'question': template['question'],
                'answer': answer,
                'type': 'template'
            })
        
        return questions

    def _extract_answer_by_strategy(self, content: str, sentences: List[str], strategy: str) -> str:
        """Extract answers using different strategies"""
        if strategy == 'first_sentence' and sentences:
            return sentences[0]
        elif strategy == 'list_items':
            # Look for lists or enumerations
            lists = re.findall(r'(?:two|three|four|several|main) (?:stages?|steps?|types?|parts?): ([^.!?]+)', content, re.IGNORECASE)
            if lists:
                return f"The main components are: {lists[0]}"
            return sentences[0] if sentences else content[:100] + "..."
        elif strategy == 'process_description':
            # Find sentences that describe what happens
            for sentence in sentences:
                if any(word in sentence.lower() for word in ['produces', 'creates', 'converts', 'involves', 'occurs']):
                    return sentence
            return sentences[1] if len(sentences) > 1 else sentences[0] if sentences else content[:100] + "..."
        elif strategy == 'products':
            # Look for what's produced or created
            products = re.findall(r'(?:producing|creating|releasing|generating) ([^.!?,]+)', content, re.IGNORECASE)
            if products:
                return f"It produces {products[0]}"
            return sentences[-1] if sentences else content[:100] + "..."
        
        return content[:150] + "..." if len(content) > 150 else content

    def _try_huggingface_generation(self, content: str) -> List[Dict[str, str]]:
        """Try to generate questions using Hugging Face API with better prompting"""
        if not self.api_token:
            return []
            
        try:
            # Create structured prompts for better Q&A generation
            prompts = [
                f"Generate a question about the main concept in this text: {content[:200]}",
                f"What question would test understanding of this process: {content[:200]}",
                f"Create a question about the key facts in: {content[:200]}"
            ]
            
            generated_cards = []
            
            for i, prompt in enumerate(prompts):
                try:
                    payload = {
                        "inputs": prompt,
                        "parameters": {
                            "max_length": 100,
                            "temperature": 0.7,
                            "do_sample": True,
                            "return_full_text": False
                        }
                    }
                    
                    response = requests.post(
                        self.api_url, 
                        headers=self.headers, 
                        json=payload, 
                        timeout=15
                    )
                    
                    if response.status_code == 200:
                        result = response.json()
                        if isinstance(result, list) and len(result) > 0:
                            generated_text = result[0].get('generated_text', '').strip()
                            
                            if generated_text and '?' in generated_text:
                                # Extract question
                                question = generated_text.split('?')[0] + '?'
                                
                                # Generate a focused answer from the content
                                answer = self._generate_focused_answer(question, content)
                                
                                generated_cards.append({
                                    "id": str(i + 1),
                                    "question": question.strip(),
                                    "answer": answer,
                                    "difficulty": "medium",
                                    "type": "ai_generated"
                                })
                    
                    # Add delay between requests
                    if i < len(prompts) - 1:
                        time.sleep(1)
                        
                except Exception as e:
                    logger.warning(f"Failed to generate question {i+1}: {e}")
                    continue
            
            return generated_cards[:2]  # Return max 2 AI-generated cards
                
        except Exception as e:
            logger.error(f"HF API error: {e}")
            return []

    def _generate_focused_answer(self, question: str, content: str) -> str:
        """Generate a focused answer based on the question and content"""
        question_lower = question.lower()
        sentences = self.sentences
        
        # Different strategies based on question type
        if any(word in question_lower for word in ['what is', 'define', 'definition']):
            # For definition questions, look for sentences that define something
            for sentence in sentences:
                if any(word in sentence.lower() for word in [' is ', ' are ', ' refers to', ' means']):
                    return sentence
        
        elif any(word in question_lower for word in ['where', 'location']):
            # For location questions
            for sentence in sentences:
                if any(word in sentence.lower() for word in ['occurs', 'takes place', 'happens', 'in the']):
                    return sentence
        
        elif any(word in question_lower for word in ['how many', 'stages', 'steps']):
            # For process questions
            for sentence in sentences:
                if any(word in sentence.lower() for word in ['stages', 'steps', 'involves', 'consists']):
                    return sentence
        
        elif 'equation' in question_lower:
            # For equation questions
            for sentence in sentences:
                if 'equation' in sentence.lower() or '→' in sentence or '+' in sentence:
                    return sentence
        
        # Default: return most relevant sentence or first sentence
        return sentences[0] if sentences else content[:150] + "..."

    def _assess_difficulty(self, question: str, answer: str) -> str:
        """Assess difficulty based on content complexity"""
        factors = {
            'question_words': len(question.split()),
            'answer_words': len(answer.split()),
            'complex_words': len([w for w in (question + ' ' + answer).split() if len(w) > 7]),
            'technical_terms': len(re.findall(r'\b[A-Z]{2,}\b|\b\w+tion\b|\b\w+ism\b|\b\w+ology\b', answer))
        }
        
        score = 0
        if factors['question_words'] > 8: score += 1
        if factors['answer_words'] > 30: score += 1  
        if factors['complex_words'] > 3: score += 1
        if factors['technical_terms'] > 1: score += 1
        
        if score <= 1: return "easy"
        elif score <= 2: return "medium"
        else: return "hard"

    def generate_flashcards(self, num_cards: int = 5) -> List[Dict[str, Any]]:
        """Generate flashcards using best available method"""
        
        if not self.text.strip():
            return []
            
        logger.info(f"Generating {num_cards} flashcards from {len(self.text)} characters")
        
        all_questions = []
        
        # Try AI generation first for 1-2 questions
        if self.api_token:
            logger.info("Attempting AI generation...")
            ai_questions = self._try_huggingface_generation(self.text)
            if ai_questions:
                logger.info(f"AI generated {len(ai_questions)} questions")
                all_questions.extend(ai_questions)
            else:
                logger.info("AI generation failed, using fallback only")
        
        # Generate remaining questions with smart fallbacks
        remaining = num_cards - len(all_questions)
        if remaining > 0:
            logger.info(f"Generating {remaining} fallback questions")
            fallback_questions = self._create_smart_fallback_questions(self.text, remaining)
            
            # Adjust IDs to avoid conflicts
            for i, q in enumerate(fallback_questions):
                q['id'] = str(len(all_questions) + i + 1)
                
            all_questions.extend(fallback_questions)
        
        # Limit to requested number
        final_questions = all_questions[:num_cards]
        
        logger.info(f"Generated {len(final_questions)} total flashcards")
        for q in final_questions:
            logger.info(f"Q{q['id']}: {q['question'][:50]}...")
            logger.info(f"A{q['id']}: {q['answer'][:50]}...")
        
        return final_questions