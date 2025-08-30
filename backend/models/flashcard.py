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
        
        # Use multiple models for better reliability
        self.models = [
            "google/flan-t5-base",  # Faster, more reliable
            "google/flan-t5-small", # Even faster fallback
            "microsoft/DialoGPT-medium"  # Alternative approach
        ]
        
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

    def _test_hf_api_connection(self):
        """Test if Hugging Face API is accessible"""
        if not self.api_token:
            return False, "No API token"
            
        try:
            # Test with whoami endpoint first
            response = requests.get(
                "https://huggingface.co/api/whoami-v2",
                headers={"Authorization": f"Bearer {self.api_token}"},
                timeout=10
            )
            
            if response.status_code == 200:
                return True, "API accessible"
            elif response.status_code == 401:
                return False, "Invalid token"
            else:
                return False, f"API error: {response.status_code}"
                
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    def _try_huggingface_generation(self, content: str, num_cards: int = 3) -> List[Dict[str, str]]:
        """Try to generate questions using Hugging Face API with improved error handling"""
        if not self.api_token:
            logger.info("No Hugging Face token available")
            return []
        
        # Test API connection first
        is_accessible, message = self._test_hf_api_connection()
        if not is_accessible:
            logger.warning(f"HF API not accessible: {message}")
            return []
            
        logger.info("Attempting AI generation with Hugging Face...")
        
        # Try multiple models
        for model_name in self.models:
            try:
                api_url = f"https://api-inference.huggingface.co/models/{model_name}"
                generated_cards = self._generate_with_model(api_url, content, model_name, num_cards)
                
                if generated_cards:
                    logger.info(f"Successfully generated {len(generated_cards)} cards with {model_name}")
                    return generated_cards
                    
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {str(e)}")
                continue
        
        logger.info("All AI models failed, using fallback generation")
        return []

    def _generate_with_model(self, api_url: str, content: str, model_name: str, num_cards: int) -> List[Dict[str, str]]:
        """Generate cards with a specific model"""
        generated_cards = []
        
        # Create better prompts for question generation
        if "flan-t5" in model_name:
            prompts = [
                f"Question: What is the main concept explained in this text?\nContext: {content[:300]}",
                f"Question: Create a study question about this process.\nContext: {content[:300]}",
                f"Question: What would a teacher ask about this topic?\nContext: {content[:300]}"
            ]
        else:
            prompts = [
                f"Generate a study question based on: {content[:200]}",
                f"What question tests understanding of: {content[:200]}",
                f"Create a quiz question for: {content[:200]}"
            ]
        
        for i, prompt in enumerate(prompts[:num_cards]):
            try:
                payload = {
                    "inputs": prompt,
                    "parameters": {
                        "max_new_tokens": 50,
                        "temperature": 0.7,
                        "do_sample": True,
                        "return_full_text": False,
                        "repetition_penalty": 1.1
                    },
                    "options": {
                        "wait_for_model": True,
                        "use_cache": False
                    }
                }
                
                # Retry logic with exponential backoff
                for attempt in range(3):
                    try:
                        response = requests.post(
                            api_url,
                            headers=self.headers,
                            json=payload,
                            timeout=60  # Increased timeout for model loading
                        )
                        
                        if response.status_code == 200:
                            result = response.json()
                            question = self._extract_question_from_response(result, content)
                            
                            if question:
                                answer = self._generate_focused_answer(question, content)
                                generated_cards.append({
                                    "id": str(len(generated_cards) + 1),
                                    "question": question,
                                    "answer": answer,
                                    "difficulty": self._assess_difficulty(question, answer),
                                    "type": "ai_generated",
                                    "model": model_name
                                })
                                break
                                
                        elif response.status_code == 429:
                            wait_time = 2 ** attempt
                            logger.info(f"Rate limited, waiting {wait_time} seconds...")
                            time.sleep(wait_time)
                        elif response.status_code == 503:
                            wait_time = 10 + (attempt * 5)
                            logger.info(f"Model loading, waiting {wait_time} seconds...")
                            time.sleep(wait_time)
                        else:
                            logger.warning(f"API error {response.status_code}: {response.text}")
                            break
                            
                    except requests.exceptions.Timeout:
                        logger.warning(f"Timeout on attempt {attempt + 1}")
                        if attempt < 2:
                            time.sleep(2 ** attempt)
                        else:
                            break
                    except Exception as e:
                        logger.warning(f"Request failed on attempt {attempt + 1}: {str(e)}")
                        break
                
                # Small delay between questions
                time.sleep(1)
                
            except Exception as e:
                logger.warning(f"Failed to generate question {i+1}: {str(e)}")
                continue
        
        return generated_cards

    def _extract_question_from_response(self, result: Any, content: str) -> str:
        """Extract a valid question from API response"""
        try:
            if isinstance(result, list) and len(result) > 0:
                generated_text = result[0].get('generated_text', '').strip()
            elif isinstance(result, dict):
                generated_text = result.get('generated_text', '').strip()
            else:
                return ''
            
            if not generated_text:
                return ''
            
            # Clean up the generated text
            generated_text = generated_text.replace(content[:50], '').strip()
            
            # Look for question patterns
            if '?' in generated_text:
                question = generated_text.split('?')[0] + '?'
                question = question.strip()
                
                # Validate question quality
                if (len(question) > 10 and 
                    len(question) < 200 and 
                    not question.lower().startswith('context:') and
                    any(word in question.lower() for word in ['what', 'how', 'why', 'where', 'when', 'which', 'who'])):
                    return question
            
            return ''
            
        except Exception as e:
            logger.warning(f"Error extracting question: {str(e)}")
            return ''

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
            ai_questions = self._try_huggingface_generation(self.text, min(2, num_cards))
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