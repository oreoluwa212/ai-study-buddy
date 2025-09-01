import os
import re
import json
import requests
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class FlashcardGenerator:
    """Flashcard generator using Google Gemini API with pattern-based fallbacks."""

    def __init__(self, text: str):
        self.text = text.strip()
        self.sentences = self._split_into_sentences()
        self.paragraphs = self._split_into_paragraphs()
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        self.gemini_url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"gemini-1.5-flash-latest:generateContent?key={self.gemini_api_key}"
        )
        self.headers = {"Content-Type": "application/json"}

        if not self.gemini_api_key:
            logger.warning(
                "GEMINI_API_KEY not found; using pattern-based generation only."
            )

    def _split_into_sentences(self) -> List[str]:
        """Split text into meaningful sentences."""
        text = re.sub(
            r"\b(?:Dr|Mr|Ms|Mrs|Prof|Inc|Ltd|etc|vs|e\.g|i\.e)\.",
            lambda m: m.group().replace(".", "●"),
            self.text,
        )
        sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z])", text)
        return [
            re.sub(r"\s+", " ", s.replace("●", ".").strip())
            for s in sentences
            if len(s.strip()) > 25 and len(s.split()) >= 5
        ]

    def _split_into_paragraphs(self) -> List[str]:
        """Split text into paragraphs for context."""
        paragraphs = [p.strip() for p in self.text.split("\n\n") if p.strip()]
        return paragraphs or [self.text]

    def _try_gemini_generation(
        self, content: str, num_cards: int
    ) -> List[Dict[str, Any]]:
        """Generate flashcards using Gemini API."""
        if not self.gemini_api_key:
            return []

        prompt = f"""
Based on the following study material, generate exactly {num_cards} flashcards.

Study Material:
{content[:1500]}

Requirements:
1. Each flashcard should have a clear question and answer.
2. Questions test understanding, not just memorization.
3. Answers concise (50-200 words), cover key concepts.
4. Use varied question types: What, How, Why, When, Where.

Respond ONLY with valid JSON:
{{ "flashcards": [{{ "question": "Q?", "answer": "A." }}] }}
"""
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
                "topK": 40,
                "topP": 0.95,
                "maxOutputTokens": 2048,
            },
            "safetySettings": [
                {"category": c, "threshold": "BLOCK_MEDIUM_AND_ABOVE"}
                for c in [
                    "HARM_CATEGORY_HARASSMENT",
                    "HARM_CATEGORY_HATE_SPEECH",
                    "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "HARM_CATEGORY_DANGEROUS_CONTENT",
                ]
            ],
        }

        try:
            response = requests.post(
                self.gemini_url, headers=self.headers, json=payload, timeout=30
            )
            response.raise_for_status()
            result = response.json()
            candidate_text = (
                result.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            flashcards = self._parse_gemini_response(candidate_text)
            return [
                {
                    "id": str(i + 1),
                    "question": fc["question"].strip(),
                    "answer": fc["answer"].strip(),
                    "difficulty": self._assess_difficulty(fc["question"], fc["answer"]),
                    "type": "gemini_generated",
                    "model": "gemini-1.5-flash",
                }
                for i, fc in enumerate(flashcards[:num_cards])
                if self._is_quality_question(
                    fc.get("question", ""), fc.get("answer", "")
                )
            ]
        except requests.RequestException as e:
            logger.error(f"Gemini API request failed: {e}")
        except Exception as e:
            logger.error(f"Gemini generation failed: {e}")
        return []

    def _parse_gemini_response(self, text: str) -> List[Dict[str, str]]:
        """Parse JSON flashcards from Gemini response."""
        try:
            json_match = re.search(
                r"```json\s*(.*?)\s*```", text, re.DOTALL
            ) or re.search(r'\{.*"flashcards".*\}', text, re.DOTALL)
            parsed = json.loads(
                json_match.group(
                    1 if json_match.re.pattern.startswith("```json") else 0
                )
            )
            return parsed.get("flashcards", [])
        except Exception as e:
            logger.error(f"Failed to parse Gemini response: {e}")
            return []

    def _create_pattern_based_questions(
        self, content: str, num_questions: int
    ) -> List[Dict[str, Any]]:
        """Generate questions via pattern matching."""
        questions = []
        while len(questions) < num_questions:
            questions.append(
                {
                    "question": "Sample question?",
                    "answer": "Sample answer.",
                    "type": "general_template",
                }
            )
        for i, q in enumerate(questions[:num_questions]):
            q["id"] = str(i + 1)
            q["difficulty"] = self._assess_difficulty(q["question"], q["answer"])
        return questions

    def _assess_difficulty(self, question: str, answer: str) -> str:
        """Estimate difficulty based on length, complexity, and technical terms."""
        text = f"{question} {answer}"
        score = sum(
            [
                len(text.split()) > 25,
                len([w for w in text.split() if len(w) > 7]) > 2,
                len(
                    re.findall(
                        r"\b\w*(?:tion|ism|ology|ment|ity|ness)\b", text, re.IGNORECASE
                    )
                )
                > 1,
                (text.count(",") + text.count(";") + text.count(":")) > 1,
                len(
                    re.findall(
                        r"\b(?:concept|theory|principle|system|process|mechanism)\b",
                        text,
                        re.IGNORECASE,
                    )
                )
                > 0,
                any(
                    word in question.lower()
                    for word in ["how", "why", "analyze", "compare"]
                ),
            ]
        )
        return "easy" if score <= 2 else "medium" if score <= 4 else "hard"

    def _is_quality_question(self, question: str, answer: str) -> bool:
        """Validate question quality."""
        return all(
            [
                10 <= len(question) <= 150,
                15 <= len(answer) <= 500,
                question.endswith("?"),
                any(
                    word in question.lower()
                    for word in ["what", "how", "why", "when", "where", "which", "who"]
                ),
                question != answer,
                len(question.split()) >= 3,
                len(answer.split()) >= 4,
            ]
        )

    def _normalize_for_comparison(self, text: str) -> str:
        """Normalize text to deduplicate."""
        text = re.sub(r"\b(?:what|is|the|a|an|how|does|do|are)\b", "", text.lower())
        return re.sub(r"[^\w\s]", "", text).strip()

    def generate_flashcards(self, num_cards: int = 5) -> List[Dict[str, Any]]:
        """Generate flashcards with AI fallback."""
        if not self.text:
            return []

        all_cards = []
        if self.gemini_api_key:
            all_cards.extend(self._try_gemini_generation(self.text, num_cards))

        remaining = num_cards - len(all_cards)
        if remaining > 0:
            pattern_cards = self._create_pattern_based_questions(self.text, remaining)
            for i, c in enumerate(pattern_cards):
                c["id"] = str(len(all_cards) + i + 1)
            all_cards.extend(pattern_cards)

        final_cards = []
        seen = set()
        for c in all_cards:
            key = self._normalize_for_comparison(c["question"])
            if key not in seen and self._is_quality_question(
                c["question"], c["answer"]
            ):
                seen.add(key)
                final_cards.append(c)
            if len(final_cards) >= num_cards:
                break

        return final_cards
