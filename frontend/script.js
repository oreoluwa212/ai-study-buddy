// Application State Management
const AppState = {
    flashcards: [],
    currentIndex: 0,
    totalGenerated: 0,
    sessions: 1,
    savedSets: 0,
    isGenerating: false,
    cardStatuses: new Map(), // Track which cards user knows/needs to study
    sidebarOpen: false
};

// API Configuration - Backend endpoints
const API_CONFIG = {
    baseUrl: 'http://127.0.0.1:5000', // Flask backend URL
    endpoints: {
        generateFlashcards: 'http://127.0.0.1:5000/api/generate-flashcards',
        saveFlashcards: 'http://127.0.0.1:5000/api/flashcards',
        getFlashcards: 'http://127.0.0.1:5000/api/flashcards',
        deleteFlashcards: 'http://127.0.0.1:5000/api/flashcards'
    }
};


// DOM Elements Cache
const DOMElements = {
    studyNotes: null,
    generateBtn: null,
    saveBtn: null,
    loading: null,
    messageArea: null,
    flashcardsContainer: null,
    controls: null,
    cardActions: null,
    wordCount: null,
    cardsGenerated: null,
    studySessions: null,
    savedSets: null,
    currentCard: null,
    totalCards: null,
    prevBtn: null,
    nextBtn: null,
    sidebar: null,
    sidebarContent: null,
    sidebarToggle: null,
    loadingSaved: null
};

// Initialize DOM elements
function initializeDOMElements() {
    DOMElements.studyNotes = document.getElementById('studyNotes');
    DOMElements.generateBtn = document.getElementById('generateBtn');
    DOMElements.saveBtn = document.getElementById('saveBtn');
    DOMElements.loading = document.getElementById('loading');
    DOMElements.messageArea = document.getElementById('messageArea');
    DOMElements.flashcardsContainer = document.getElementById('flashcardsContainer');
    DOMElements.controls = document.getElementById('controls');
    DOMElements.cardActions = document.getElementById('cardActions');
    DOMElements.wordCount = document.getElementById('wordCount');
    DOMElements.cardsGenerated = document.getElementById('cardsGenerated');
    DOMElements.studySessions = document.getElementById('studySessions');
    DOMElements.savedSets = document.getElementById('savedSets');
    DOMElements.currentCard = document.getElementById('currentCard');
    DOMElements.totalCards = document.getElementById('totalCards');
    DOMElements.prevBtn = document.getElementById('prevBtn');
    DOMElements.nextBtn = document.getElementById('nextBtn');
    DOMElements.sidebar = document.getElementById('sidebar');
    DOMElements.sidebarContent = document.getElementById('sidebarContent');
    DOMElements.sidebarToggle = document.getElementById('sidebarToggle');
    DOMElements.loadingSaved = document.getElementById('loadingSaved');
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    console.log('AI Study Buddy initializing...');

    initializeDOMElements();
    setupEventListeners();
    updateStats();
    updateWordCount();
    loadSavedCardSets();

    console.log('AI Study Buddy ready!');
});

// Setup event listeners
function setupEventListeners() {
    // Text area input listener
    DOMElements.studyNotes.addEventListener('input', updateWordCount);

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Sidebar close when clicking outside
    document.addEventListener('click', function (event) {
        if (AppState.sidebarOpen &&
            !DOMElements.sidebar.contains(event.target) &&
            !DOMElements.sidebarToggle.contains(event.target)) {
            toggleSidebar();
        }
    });
}

// Word count functionality
function updateWordCount() {
    const text = DOMElements.studyNotes.value.trim();
    const wordCount = text ? text.split(/\s+/).length : 0;
    DOMElements.wordCount.textContent = wordCount;

    // Color coding for word count
    if (wordCount < 20) {
        DOMElements.wordCount.style.color = '#d32f2f';
    } else if (wordCount < 50) {
        DOMElements.wordCount.style.color = '#f57f17';
    } else {
        DOMElements.wordCount.style.color = '#2e7d32';
    }
}

// Update statistics display
function updateStats() {
    DOMElements.cardsGenerated.textContent = AppState.totalGenerated;
    DOMElements.studySessions.textContent = AppState.sessions;
    DOMElements.savedSets.textContent = AppState.savedSets;
}

// Toggle sidebar
function toggleSidebar() {
    AppState.sidebarOpen = !AppState.sidebarOpen;

    if (AppState.sidebarOpen) {
        DOMElements.sidebar.classList.add('open');
        loadSavedCardSets(); // Refresh saved sets when opened
    } else {
        DOMElements.sidebar.classList.remove('open');
    }
}

// Show message to user
function showMessage(text, type = 'success') {
    DOMElements.messageArea.innerHTML = `<div class="message ${type}">${text}</div>`;
    setTimeout(() => {
        DOMElements.messageArea.innerHTML = '';
    }, 5000);
}

// Call backend API to generate flashcards
async function callBackendAPI(text) {
    try {
        const response = await fetch(API_CONFIG.endpoints.generateFlashcards, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                num_cards: 5
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Backend Error: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Backend API Error:', error);
        throw error;
    }
}

// Parse backend response into flashcards
function parseBackendResponse(backendResponse) {
    const cards = [];

    if (backendResponse.flashcards && Array.isArray(backendResponse.flashcards)) {
        backendResponse.flashcards.forEach((card, index) => {
            if (card.question && card.answer) {
                cards.push({
                    id: index + 1,
                    question: card.question.trim(),
                    answer: card.answer.trim(),
                    difficulty: card.difficulty || getDifficultyLevel(card.question, card.answer),
                    type: card.type || getQuestionType(card.question),
                    isFlipped: false
                });
            }
        });
    }

    return cards.length > 0 ? cards : createFallbackCards();
}

// Determine difficulty level based on question complexity
function getDifficultyLevel(question, answer) {
    const questionLength = question.length;
    const answerLength = answer.length;
    const complexWords = (question + ' ' + answer).split(' ').filter(word => word.length > 6).length;

    if (questionLength < 50 && answerLength < 100 && complexWords < 3) {
        return 'easy';
    } else if (questionLength > 100 || answerLength > 200 || complexWords > 8) {
        return 'hard';
    }
    return 'medium';
}

// Determine question type
function getQuestionType(question) {
    const q = question.toLowerCase();
    if (q.includes('what is') || q.includes('define')) return 'definition';
    if (q.includes('explain') || q.includes('describe')) return 'explanation';
    if (q.includes('how') || q.includes('why')) return 'analysis';
    if (q.includes('compare') || q.includes('contrast')) return 'comparison';
    return 'general';
}

// Create fallback cards when backend fails
function createFallbackCards() {
    const studyText = DOMElements.studyNotes.value.trim();
    const sentences = studyText.split(/[.!?]+/).filter(s => s.trim().length > 10);

    const fallbackCards = [];

    // Generate different types of questions from the text
    const questionTemplates = [
        {
            question: "What is the main topic discussed in your notes?",
            answer: "The main topic relates to the key concepts and ideas presented in the study material."
        },
        {
            question: "Summarize the key points from your study material.",
            answer: sentences.slice(0, 2).join('. ') || "Key points from your study notes."
        },
        {
            question: "What are the important concepts mentioned?",
            answer: "The important concepts include the main ideas and terminology from your notes."
        }
    ];

    // Add text-specific questions if we have enough content
    if (sentences.length > 0) {
        const firstSentence = sentences[0].trim();
        if (firstSentence.length > 20) {
            questionTemplates.push({
                question: `Explain: "${firstSentence.substring(0, 100)}${firstSentence.length > 100 ? '...' : ''}"`,
                answer: firstSentence
            });
        }
    }

    questionTemplates.forEach((template, index) => {
        fallbackCards.push({
            id: index + 1,
            question: template.question,
            answer: template.answer,
            difficulty: ['easy', 'medium', 'hard'][index % 3],
            type: 'general',
            isFlipped: false
        });
    });

    return fallbackCards.slice(0, 4); // Return max 4 cards
}

// Main function to generate flashcards
async function generateFlashcards() {
    const studyText = DOMElements.studyNotes.value.trim();

    // Validation
    if (!studyText) {
        showMessage('Please enter some study notes first!', 'error');
        return;
    }

    if (studyText.length < 30) {
        showMessage('Please provide more detailed notes (at least 30 characters)', 'error');
        return;
    }

    // Update UI state
    AppState.isGenerating = true;
    DOMElements.generateBtn.disabled = true;
    DOMElements.generateBtn.textContent = '🤖 Generating...';
    DOMElements.loading.style.display = 'block';
    DOMElements.messageArea.innerHTML = '';

    try {
        let flashcards = [];

        // Try backend API first
        try {
            showMessage('AI is generating your flashcards...', 'success');
            const backendResponse = await callBackendAPI(studyText);
            flashcards = parseBackendResponse(backendResponse);

            if (flashcards.length === 0) {
                throw new Error('Backend returned no valid questions');
            }

        } catch (apiError) {
            console.warn('Backend generation failed:', apiError);
            showMessage('Backend unavailable, creating fallback questions...', 'error');
            flashcards = createFallbackCards();
        }

        // Update application state
        if (flashcards.length > 0) {
            AppState.flashcards = flashcards;
            AppState.currentIndex = 0;
            AppState.totalGenerated += flashcards.length;

            // Update UI
            displayFlashcards();
            DOMElements.saveBtn.disabled = false;
            updateStats();

            showMessage(`Successfully generated ${flashcards.length} flashcards!`, 'success');
        } else {
            throw new Error('No flashcards could be generated');
        }

    } catch (error) {
        console.error('Error generating flashcards:', error);
        showMessage('Failed to generate flashcards. Please try again or check your input.', 'error');

    } finally {
        // Reset UI state
        AppState.isGenerating = false;
        DOMElements.generateBtn.disabled = false;
        DOMElements.generateBtn.innerHTML = '🚀 Generate Flashcards';
        DOMElements.loading.style.display = 'none';
    }
}

// Display flashcards in the UI
function displayFlashcards() {
    if (AppState.flashcards.length === 0) {
        DOMElements.flashcardsContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">📚</span>
                <h3>Ready to Learn?</h3>
                <p>Your AI-generated flashcards will appear here</p>
            </div>
        `;
        DOMElements.controls.style.display = 'none';
        DOMElements.cardActions.style.display = 'none';
        return;
    }

    const currentCard = AppState.flashcards[AppState.currentIndex];
    const difficultyClass = `difficulty-${currentCard.difficulty}`;

    DOMElements.flashcardsContainer.innerHTML = `
        <div class="flashcard ${currentCard.isFlipped ? 'flipped' : ''}" onclick="flipCard()">
            <div class="flashcard-header">
                <span>${currentCard.isFlipped ? '💡' : '❓'}</span>
                <span class="difficulty-badge ${difficultyClass}">${currentCard.difficulty}</span>
            </div>
            <div class="flashcard-content">
                <h3>${currentCard.isFlipped ? 'Answer' : 'Question'}</h3>
                <p>${currentCard.isFlipped ? currentCard.answer : currentCard.question}</p>
            </div>
            <div class="flashcard-footer">
                Click to ${currentCard.isFlipped ? 'see question' : 'reveal answer'}
            </div>
        </div>
    `;

    // Update controls visibility and state
    DOMElements.controls.style.display = 'flex';
    DOMElements.cardActions.style.display = 'flex';
    updateNavigationControls();
}

// Update navigation controls
function updateNavigationControls() {
    DOMElements.currentCard.textContent = AppState.currentIndex + 1;
    DOMElements.totalCards.textContent = AppState.flashcards.length;

    // Update button states
    DOMElements.prevBtn.disabled = AppState.currentIndex === 0;
    DOMElements.nextBtn.disabled = AppState.currentIndex === AppState.flashcards.length - 1;
}

// Flip current card
function flipCard() {
    if (AppState.flashcards.length === 0) return;

    AppState.flashcards[AppState.currentIndex].isFlipped =
        !AppState.flashcards[AppState.currentIndex].isFlipped;
    displayFlashcards();
}

// Navigate to previous card
function previousCard() {
    if (AppState.currentIndex > 0) {
        AppState.currentIndex--;
        displayFlashcards();
    }
}

// Navigate to next card
function nextCard() {
    if (AppState.currentIndex < AppState.flashcards.length - 1) {
        AppState.currentIndex++;
        displayFlashcards();
    }
}

// Mark card status (know/study)
function markCard(status) {
    if (AppState.flashcards.length === 0) return;

    const currentCard = AppState.flashcards[AppState.currentIndex];
    AppState.cardStatuses.set(currentCard.id, status);

    // Visual feedback
    const message = status === 'know' ? 'Marked as known! ✅' : 'Added to study list! 📚';
    showMessage(message, 'success');

    // Auto-advance to next card after a brief delay
    setTimeout(() => {
        if (AppState.currentIndex < AppState.flashcards.length - 1) {
            nextCard();
        } else {
            showMessage('You\'ve reviewed all cards! Great job! 🎉', 'success');
        }
    }, 1000);
}

// Shuffle cards
function shuffleCards() {
    if (AppState.flashcards.length === 0) return;

    showMessage('Shuffling cards...', 'success');

    // Fisher-Yates shuffle algorithm
    for (let i = AppState.flashcards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [AppState.flashcards[i], AppState.flashcards[j]] =
            [AppState.flashcards[j], AppState.flashcards[i]];
    }

    AppState.currentIndex = 0;
    displayFlashcards();
}

// Save flashcards to backend/database
async function saveFlashcards() {
    if (AppState.flashcards.length === 0) {
        showMessage('No flashcards to save!', 'error');
        return;
    }

    const title = prompt('Enter a title for this flashcard set:');
    if (!title || title.trim() === '') {
        showMessage('Save cancelled - no title provided', 'error');
        return;
    }

    try {
        const dataToSave = {
            title: title.trim(),
            original_text: DOMElements.studyNotes.value.trim(),
            flashcards: AppState.flashcards,
            card_statuses: Array.from(AppState.cardStatuses.entries()),
            created_at: new Date().toISOString()
        };

        showMessage('Saving flashcard set...', 'success');

        const response = await fetch(API_CONFIG.endpoints.saveFlashcards, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dataToSave)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Save failed: ${response.status} - ${errorData.error || 'Unknown error'}`);
        }

        const result = await response.json();

        AppState.savedSets++;
        updateStats();
        loadSavedCardSets(); // Refresh the sidebar

        showMessage(`Successfully saved "${title}" with ${AppState.flashcards.length} cards! 💾`, 'success');

    } catch (error) {
        console.error('Error saving flashcards:', error);

        // Fallback to local storage if backend fails
        try {
            const localData = {
                title: title.trim(),
                timestamp: new Date().toISOString(),
                cards: AppState.flashcards,
                totalCards: AppState.flashcards.length,
                cardStatuses: Array.from(AppState.cardStatuses.entries())
            };

            const existingSets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            existingSets.push(localData);
            localStorage.setItem('studyBuddyCardSets', JSON.stringify(existingSets));

            AppState.savedSets++;
            updateStats();
            loadSavedCardSets();

            showMessage(`Saved "${title}" locally (backend unavailable) 💾`, 'success');
        } catch (localError) {
            showMessage('Failed to save flashcards. Please try again.', 'error');
        }
    }
}

// Load saved flashcard sets
async function loadSavedCardSets() {
    if (!DOMElements.loadingSaved) return;

    DOMElements.loadingSaved.style.display = 'block';
    DOMElements.loadingSaved.textContent = 'Loading saved sets...';

    try {
        // Try to load from backend first
        const response = await fetch(API_CONFIG.endpoints.getFlashcards);

        if (response.ok) {
            const data = await response.json();
            displaySavedSets(data.flashcard_sets || []);
            AppState.savedSets = data.flashcard_sets ? data.flashcard_sets.length : 0;
        } else {
            throw new Error('Backend unavailable');
        }

    } catch (error) {
        console.warn('Backend load failed, trying local storage:', error);

        // Fallback to local storage
        try {
            const localSets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            displaySavedSets(localSets, true);
            AppState.savedSets = localSets.length;
        } catch (localError) {
            console.error('Failed to load from local storage:', localError);
            DOMElements.sidebarContent.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No saved sets found</p>';
        }
    }

    updateStats();
    DOMElements.loadingSaved.style.display = 'none';
}

// Display saved flashcard sets in sidebar
function displaySavedSets(sets, isLocal = false) {
    if (!sets || sets.length === 0) {
        DOMElements.sidebarContent.innerHTML = `
            <div style="text-align: center; color: #666; padding: 20px;">
                <p>📚 No saved sets yet</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Create some flashcards and save them to see them here!</p>
            </div>
        `;
        return;
    }

    const setsHTML = sets.map(set => {
        const cardCount = set.flashcards ? set.flashcards.length : set.totalCards || 0;
        const date = new Date(set.created_at || set.timestamp).toLocaleDateString();
        const setId = set.id || set.title; // Use id for backend, title for local

        return `
            <div class="saved-card-set" data-set-id="${setId}" data-is-local="${isLocal}">
                <div class="saved-set-title">${set.title}</div>
                <div class="saved-set-meta">
                    <span>${cardCount} cards</span>
                    <span>${date}</span>
                </div>
                <div class="saved-set-actions">
                    <button class="mini-btn load-btn" onclick="loadSavedSet('${setId}', ${isLocal})">
                        Load
                    </button>
                    <button class="mini-btn delete-btn" onclick="deleteSavedSet('${setId}', ${isLocal})">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');

    DOMElements.sidebarContent.innerHTML = setsHTML;
}

// Load a specific saved flashcard set
async function loadSavedSet(setId, isLocal = false) {
    try {
        showMessage('Loading flashcard set...', 'success');

        let setData = null;

        if (isLocal) {
            // Load from local storage
            const localSets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            setData = localSets.find(set => set.title === setId);
        } else {
            // Load from backend
            const response = await fetch(`${API_CONFIG.endpoints.getFlashcards}/${setId}`);
            if (response.ok) {
                setData = await response.json();
            }
        }

        if (setData) {
            // Load the flashcards
            AppState.flashcards = setData.cards || setData.flashcards || [];
            AppState.currentIndex = 0;
            AppState.cardStatuses = new Map(setData.cardStatuses || setData.card_statuses || []);

            // Update UI
            if (setData.original_text) {
                DOMElements.studyNotes.value = setData.original_text;
                updateWordCount();
            }

            if (AppState.flashcards.length > 0) {
                displayFlashcards();
                DOMElements.saveBtn.disabled = false;
                showMessage(`Loaded "${setData.title}" with ${AppState.flashcards.length} cards!`, 'success');

                // Close sidebar on mobile
                if (window.innerWidth <= 968) {
                    toggleSidebar();
                }
            } else {
                throw new Error('No cards found in set');
            }
        } else {
            throw new Error('Set not found');
        }

    } catch (error) {
        console.error('Error loading flashcard set:', error);
        showMessage('Failed to load flashcard set. It may have been deleted.', 'error');
        loadSavedCardSets(); // Refresh the list
    }
}

// Delete a saved flashcard set
async function deleteSavedSet(setId, isLocal = false) {
    if (!confirm('Are you sure you want to delete this flashcard set?')) {
        return;
    }

    try {
        showMessage('Deleting flashcard set...', 'success');

        if (isLocal) {
            // Delete from local storage
            const localSets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            const filteredSets = localSets.filter(set => set.title !== setId);
            localStorage.setItem('studyBuddyCardSets', JSON.stringify(filteredSets));
        } else {
            // Delete from backend
            const response = await fetch(`${API_CONFIG.endpoints.deleteFlashcards}/${setId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete from backend');
            }
        }

        AppState.savedSets = Math.max(0, AppState.savedSets - 1);
        updateStats();
        loadSavedCardSets(); // Refresh the list
        showMessage('Flashcard set deleted successfully!', 'success');

    } catch (error) {
        console.error('Error deleting flashcard set:', error);
        showMessage('Failed to delete flashcard set. Please try again.', 'error');
    }
}

// Keyboard shortcuts handler
function handleKeyboardShortcuts(event) {
    // Don't trigger shortcuts when typing in text areas or inputs
    if (event.target.tagName === 'TEXTAREA' || event.target.tagName === 'INPUT') {
        return;
    }

    switch (event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            previousCard();
            break;
        case 'ArrowRight':
            event.preventDefault();
            nextCard();
            break;
        case ' ':
            event.preventDefault();
            flipCard();
            break;
        case 'g':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                generateFlashcards();
            }
            break;
        case 's':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                saveFlashcards();
            }
            break;
        case 'r':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                shuffleCards();
            }
            break;
        case 'Escape':
            if (AppState.sidebarOpen) {
                toggleSidebar();
            }
            break;
    }
}

// Export functions for testing (if using modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateFlashcards,
        flipCard,
        nextCard,
        previousCard,
        markCard,
        shuffleCards,
        saveFlashcards,
        loadSavedSet,
        deleteSavedSet,
        toggleSidebar
    };
}

// Add some helpful console methods for debugging
window.StudyBuddy = {
    state: AppState,
    generateDemo: () => {
        DOMElements.studyNotes.value = "Machine learning is a subset of artificial intelligence. It uses algorithms to identify patterns in data. Neural networks are inspired by biological neurons. Deep learning uses multiple layers to extract features from raw data. Supervised learning requires labeled training data. Unsupervised learning finds hidden patterns without labels.";
        updateWordCount();
        generateFlashcards();
    },
    loadDemo: loadSavedCardSets,
    clearData: () => {
        localStorage.removeItem('studyBuddyCardSets');
        showMessage('Local data cleared!', 'success');
        loadSavedCardSets();
    },
    toggleSidebar: toggleSidebar
};

console.log('AI Study Buddy loaded! Try: StudyBuddy.generateDemo() for a quick test.');