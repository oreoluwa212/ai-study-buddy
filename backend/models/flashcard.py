import random
import requests
import os
import re
import json
import time
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class FlashcardGenerator:
    """
    Optimized flashcard generator using Google Gemini API and intelligent fallbacks
    """

    def __init__(self, text: str):
        self.text = text
        self.sentences = self._split_into_sentences()
        self.paragraphs = self._split_into_paragraphs()

        # Google Gemini API configuration
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        if not self.gemini_api_key:
            logger.warning(
                "GEMINI_API_KEY not found - using pattern-based generation only"
            )

        # Gemini API URL
        self.gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key={self.gemini_api_key}"

        self.headers = {"Content-Type": "application/json"}

    def _split_into_sentences(self) -> List[str]:
        """Split text into clean, meaningful sentences"""
        # Handle abbreviations properly
        text = re.sub(
            r"\b(?:Dr|Mr|Ms|Mrs|Prof|Inc|Ltd|etc|vs|e\.g|i\.e)\\.",
            lambda m: m.group().replace(".", "●"),
            self.text,
        )

        # Split on sentence boundaries
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)

        cleaned = []
        for sentence in sentences:
            sentence = sentence.replace("●", ".").strip()
            # Only keep substantial sentences
            if (
                len(sentence) > 25
                and not sentence.isspace()
                and not re.match(r"^[A-Z]\.$", sentence)
                and len(sentence.split()) >= 5
            ):
                sentence = re.sub(r"\s+", " ", sentence)
                cleaned.append(sentence)

        return cleaned

    def _split_into_paragraphs(self) -> List[str]:
        """Split text into paragraphs for context"""
        paragraphs = [p.strip() for p in self.text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [self.text]
        return paragraphs

    def _try_gemini_generation(
        self, content: str, num_cards: int
    ) -> List[Dict[str, str]]:
        """Use Google Gemini API to generate flashcards"""
        generated_cards = []

        if not self.gemini_api_key:
            return []

        try:
            # Create a focused prompt for flashcard generation
            prompt = f"""
Based on the following study material, generate exactly {num_cards} high-quality flashcards for learning and review. 

Study Material:
{content[:1500]}  

Requirements:
1. Each flashcard should have a clear, specific question and a comprehensive answer
2. Questions should test understanding, not just memorization
3. Answers should be informative but concise (50-200 words)
4. Cover the most important concepts from the material
5. Use different question types: What, How, Why, When, Where

Please respond ONLY with valid JSON in this exact format:
{{
    "flashcards": [
        {{
            "question": "Clear, specific question here?",
            "answer": "Comprehensive answer that explains the concept clearly."
        }}
    ]
}}
"""

            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.7,
                    "topK": 40,
                    "topP": 0.95,
                    "maxOutputTokens": 2048,
                    "stopSequences": [],
                },
                "safetySettings": [
                    {
                        "category": "HARM_CATEGORY_HARASSMENT",
                        "threshold": "BLOCK_MEDIUM_AND_ABOVE",
                    },
                    {
                        "category": "HARM_CATEGORY_HATE_SPEECH",
                        "threshold": "BLOCK_MEDIUM_AND_ABOVE",
                    },
                    {
                        "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                        "threshold": "BLOCK_MEDIUM_AND_ABOVE",
                    },
                    {
                        "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                        "threshold": "BLOCK_MEDIUM_AND_ABOVE",
                    },
                ],
            }

            logger.info("Sending request to Gemini API...")
            response = requests.post(
                self.gemini_url, headers=self.headers, json=payload, timeout=30
            )

            if response.status_code == 200:
                result = response.json()

                if "candidates" in result and result["candidates"]:
                    candidate = result["candidates"][0]
                    if "content" in candidate and "parts" in candidate["content"]:
                        generated_text = candidate["content"]["parts"][0]["text"]

                        # Parse the JSON response
                        flashcards_data = self._parse_gemini_response(generated_text)

                        if flashcards_data:
                            for i, card in enumerate(flashcards_data[:num_cards]):
                                question = card.get("question", "").strip()
                                answer = card.get("answer", "").strip()

                                if self._is_quality_question(question, answer):
                                    generated_cards.append(
                                        {
                                            "id": str(i + 1),
                                            "question": question,
                                            "answer": answer,
                                            "difficulty": self._assess_difficulty(
                                                question, answer
                                            ),
                                            "type": "gemini_generated",
                                            "model": "gemini-1.5-flash",
                                        }
                                    )
                                    logger.info(f"Gemini generated: {question[:50]}...")

                        logger.info(
                            f"✅ Gemini generated {len(generated_cards)} quality flashcards"
                        )
                else:
                    logger.warning("No candidates in Gemini response")
            else:
                logger.error(
                    f"Gemini API error: {response.status_code} - {response.text}"
                )

        except requests.exceptions.Timeout:
            logger.error("Gemini API request timed out")
        except requests.exceptions.RequestException as e:
            logger.error(f"Gemini API request failed: {str(e)}")
        except Exception as e:
            logger.error(f"Gemini generation failed: {str(e)}")

        return generated_cards

    def _parse_gemini_response(self, response_text: str) -> List[Dict[str, str]]:
        """Parse Gemini's JSON response and extract flashcards"""
        try:
            # Clean up the response text
            response_text = response_text.strip()

            # Find JSON content between ```json and ``` or just look for the JSON object
            json_match = re.search(r"```json\s*(.*?)\s*```", response_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Look for JSON object directly
                json_match = re.search(
                    r'\{.*"flashcards".*\}', response_text, re.DOTALL
                )
                if json_match:
                    json_str = json_match.group(0)
                else:
                    json_str = response_text

            # Parse JSON
            parsed_data = json.loads(json_str)

            if "flashcards" in parsed_data:
                return parsed_data["flashcards"]
            else:
                logger.warning("No 'flashcards' key found in Gemini response")
                return []

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini JSON response: {e}")
            logger.error(f"Raw response: {response_text[:500]}...")
            return []
        except Exception as e:
            logger.error(f"Error parsing Gemini response: {e}")
            return []

    def _create_pattern_based_questions(
        self, content: str, num_questions: int
    ) -> List[Dict[str, str]]:
        """Create high-quality questions using advanced pattern matching"""
        questions = []

        # Advanced concept extraction patterns
        concept_patterns = {
            "definitions": [
                (
                    r"([A-Z][^.!?]{3,50}) (?:is|are) (?:a|an|the) ([^.!?]{20,})[.!?]",
                    "What is {0}?",
                    "{0} is {1}.",
                ),
                (
                    r"([A-Z][^.!?]{5,50}) (?:refers to|means) ([^.!?]{15,})[.!?]",
                    "What does {0} refer to?",
                    "{0} refers to {1}.",
                ),
                (
                    r"The term ([^.!?]{5,40}) (?:describes|denotes) ([^.!?]{15,})[.!?]",
                    "What does the term {0} describe?",
                    "The term {0} describes {1}.",
                ),
            ],
            "processes": [
                (
                    r"([^.!?]{10,50}) (?:involves|consists of|includes) ([^.!?]{20,})[.!?]",
                    "What does {0} involve?",
                    "{0} involves {1}.",
                ),
                (
                    r"The process of ([^.!?]{10,40}) (?:requires|needs|uses) ([^.!?]{15,})[.!?]",
                    "What does the process of {0} require?",
                    "The process of {0} requires {1}.",
                ),
            ],
            "functions": [
                (
                    r"([^.!?]{10,50}) (?:serves to|functions to|helps to) ([^.!?]{15,})[.!?]",
                    "What does {0} serve to do?",
                    "{0} serves to {1}.",
                ),
                (
                    r"The (?:purpose|function|role) of ([^.!?]{10,40}) is (?:to )?([^.!?]{15,})[.!?]",
                    "What is the purpose of {0}?",
                    "The purpose of {0} is {1}.",
                ),
            ],
            "characteristics": [
                (
                    r"([^.!?]{10,50}) (?:is characterized by|features|exhibits) ([^.!?]{15,})[.!?]",
                    "What characterizes {0}?",
                    "{0} is characterized by {1}.",
                ),
                (
                    r"([^.!?]{10,50}) (?:has|contains|possesses) ([^.!?]{15,})[.!?]",
                    "What does {0} contain?",
                    "{0} contains {1}.",
                ),
            ],
        }

        # Extract concepts using patterns
        for category, patterns in concept_patterns.items():
            for pattern, question_template, answer_template in patterns:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    if len(questions) >= num_questions:
                        break

                    groups = [g.strip() for g in match.groups()]
                    if all(len(g) > 3 for g in groups):
                        question = question_template.format(*groups)
                        answer = answer_template.format(*groups)

                        questions.append(
                            {
                                "question": question,
                                "answer": answer,
                                "type": f"pattern_{category}",
                                "category": category,
                            }
                        )

        # Add general questions if we don't have enough
        if len(questions) < num_questions:
            general_questions = self._create_general_questions(
                content, num_questions - len(questions)
            )
            questions.extend(general_questions)

        # Add metadata and limit
        final_questions = []
        for i, q in enumerate(questions[:num_questions]):
            q["id"] = str(i + 1)
            q["difficulty"] = self._assess_difficulty(q["question"], q["answer"])
            if "type" not in q:
                q["type"] = "pattern_based"
            final_questions.append(q)

        return final_questions

    def _create_general_questions(
        self, content: str, num_needed: int
    ) -> List[Dict[str, str]]:
        """Create general questions when pattern matching doesn't find enough"""
        questions = []
        sentences = self.sentences

        if not sentences:
            return []

        # Intelligent question templates based on content analysis
        content_lower = content.lower()

        templates = []

        # Economics-specific templates
        if any(
            word in content_lower for word in ["economy", "economic", "market", "price"]
        ):
            templates.extend(
                [
                    ("What type of economic system is described?", sentences[0]),
                    (
                        "How do prices function in this system?",
                        self._find_sentence_with_words(
                            sentences, ["price", "signal", "guide"]
                        ),
                    ),
                    (
                        "What guides economic decisions?",
                        self._find_sentence_with_words(
                            sentences, ["decision", "guide", "determine"]
                        ),
                    ),
                ]
            )

        # Science/process templates
        if any(
            word in content_lower
            for word in ["process", "occurs", "involves", "produces"]
        ):
            templates.extend(
                [
                    ("What process is being described?", sentences[0]),
                    (
                        "How does this process work?",
                        self._find_sentence_with_words(
                            sentences, ["process", "involves", "occurs"]
                        ),
                    ),
                    (
                        "What are the results of this process?",
                        self._find_sentence_with_words(
                            sentences, ["result", "produce", "create"]
                        ),
                    ),
                ]
            )

        # General templates
        templates.extend(
            [
                ("What is the main concept discussed?", sentences[0]),
                (
                    "What are the key characteristics mentioned?",
                    sentences[1] if len(sentences) > 1 else sentences[0],
                ),
                (
                    "What examples are provided?",
                    sentences[-1] if len(sentences) > 1 else sentences[0],
                ),
            ]
        )

        # Create questions from templates
        for i, (question, answer) in enumerate(templates[:num_needed]):
            if answer:  # Only add if we have a good answer
                questions.append(
                    {"question": question, "answer": answer, "type": "general_template"}
                )

        return questions

    def _find_sentence_with_words(
        self, sentences: List[str], keywords: List[str]
    ) -> str:
        """Find the best sentence containing specific keywords"""
        for sentence in sentences:
            sentence_lower = sentence.lower()
            if any(keyword in sentence_lower for keyword in keywords):
                return sentence
        return sentences[0] if sentences else ""

    def _assess_difficulty(self, question: str, answer: str) -> str:
        """Smart difficulty assessment"""
        text = question + " " + answer

        complexity_indicators = {
            "word_count": len(text.split()),
            "long_words": len([w for w in text.split() if len(w) > 7]),
            "technical_terms": len(
                re.findall(
                    r"\b\w*(?:tion|ism|ology|ment|ity|ness)\b", text, re.IGNORECASE
                )
            ),
            "complex_punctuation": text.count(",") + text.count(";") + text.count(":"),
            "abstract_concepts": len(
                re.findall(
                    r"\b(?:concept|theory|principle|system|process|mechanism)\b",
                    text,
                    re.IGNORECASE,
                )
            ),
            "question_complexity": (
                1
                if any(
                    word in question.lower()
                    for word in ["how", "why", "analyze", "compare"]
                )
                else 0
            ),
        }

        # Weighted scoring
        score = 0
        if complexity_indicators["word_count"] > 25:
            score += 1
        if complexity_indicators["long_words"] > 2:
            score += 1
        if complexity_indicators["technical_terms"] > 1:
            score += 2
        if complexity_indicators["complex_punctuation"] > 1:
            score += 1
        if complexity_indicators["abstract_concepts"] > 0:
            score += 1
        if complexity_indicators["question_complexity"] > 0:
            score += 1

        if score <= 2:
            return "easy"
        elif score <= 4:
            return "medium"
        else:
            return "hard"

    def generate_flashcards(self, num_cards: int = 5) -> List[Dict[str, Any]]:
        """Generate flashcards using the best available methods"""

        if not self.text.strip():
            logger.warning("Empty text provided")
            return []

        logger.info(
            f"Generating {num_cards} flashcards from {len(self.text)} characters"
        )
        all_questions = []

        # Try Gemini API first if available
        if self.gemini_api_key and self.gemini_api_key != "your_gemini_api_key_here":
            logger.info("Attempting AI generation with Gemini...")

            gemini_cards = self._try_gemini_generation(self.text, num_cards)
            all_questions.extend(gemini_cards)

            if all_questions:
                logger.info(f"Gemini generated {len(all_questions)} questions")
            else:
                logger.info("Gemini generation failed, using pattern-based methods")
        else:
            logger.info("Gemini API key not configured, using pattern-based methods")

        # Generate remaining questions with advanced pattern matching if needed
        remaining = num_cards - len(all_questions)
        if remaining > 0:
            logger.info(f"Generating {remaining} questions using pattern matching")
            pattern_questions = self._create_pattern_based_questions(
                self.text, remaining
            )

            # Adjust IDs to avoid conflicts
            for i, q in enumerate(pattern_questions):
                q["id"] = str(len(all_questions) + i + 1)

            all_questions.extend(pattern_questions)

        # Final quality control and selection
        final_questions = self._ensure_question_quality(all_questions, num_cards)

        logger.info(f"Final output: {len(final_questions)} quality flashcards")
        for q in final_questions:
            logger.info(f"Q{q['id']}: {q['question'][:60]}...")
            logger.info(f"A{q['id']}: {q['answer'][:60]}...")

        return final_questions

    def _ensure_question_quality(
        self, questions: List[Dict], target_count: int
    ) -> List[Dict]:
        """Final quality control and deduplication"""
        quality_questions = []
        seen_questions = set()

        for q in questions:
            question = q.get("question", "").strip()
            answer = q.get("answer", "").strip()

            # Quality checks
            if not self._is_quality_question(question, answer):
                continue

            # Deduplication
            question_key = self._normalize_for_comparison(question)
            if question_key in seen_questions:
                continue

            seen_questions.add(question_key)
            quality_questions.append(q)

            if len(quality_questions) >= target_count:
                break

        return quality_questions

    def _is_quality_question(self, question: str, answer: str) -> bool:
        """Check if question meets quality standards"""
        return (
            len(question) >= 10
            and len(question) <= 150
            and len(answer) >= 15
            and len(answer) <= 500
            and question.endswith("?")
            and any(
                word in question.lower()
                for word in ["what", "how", "why", "when", "where", "which", "who"]
            )
            and not question.lower().startswith(("question:", "ask:", "generate:"))
            and not answer.lower().startswith(("answer:", "response:"))
            and question != answer
            and len(question.split()) >= 3
            and len(answer.split()) >= 4
        )

    def _normalize_for_comparison(self, text: str) -> str:
        """Normalize text for comparison to avoid duplicates"""
        # Remove common words and normalize
        normalized = re.sub(
            r"\b(?:what|is|the|a|an|how|does|do|are)\b", "", text.lower()
        )
        normalized = re.sub(r"[^\w\s]", "", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized
