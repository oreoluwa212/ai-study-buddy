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
const API_BASE_URL =
    window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'
        ? 'http://127.0.0.1:5000'
        : 'https://studypal-fikn.onrender.com';

const API_CONFIG = {
    baseUrl: API_BASE_URL,
    endpoints: {
        generateFlashcards: `${API_BASE_URL}/api/generate-flashcards`,
        saveFlashcards: `${API_BASE_URL}/api/flashcards`,
        getFlashcards: `${API_BASE_URL}/api/flashcards`,
        deleteFlashcards: `${API_BASE_URL}/api/flashcards`
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

// Initialize DOM elements with validation
function initializeDOMElements() {
    const elements = {
        studyNotes: 'studyNotes',
        generateBtn: 'generateBtn',
        saveBtn: 'saveBtn',
        loading: 'loading',
        messageArea: 'messageArea',
        flashcardsContainer: 'flashcardsContainer',
        controls: 'controls',
        cardActions: 'cardActions',
        wordCount: 'wordCount',
        cardsGenerated: 'cardsGenerated',
        studySessions: 'studySessions',
        savedSets: 'savedSets',
        currentCard: 'currentCard',
        totalCards: 'totalCards',
        prevBtn: 'prevBtn',
        nextBtn: 'nextBtn',
        sidebar: 'sidebar',
        sidebarContent: 'sidebarContent',
        sidebarToggle: 'sidebarToggle',
        loadingSaved: 'loadingSaved'
    };

    // Initialize and validate each element
    for (const [key, id] of Object.entries(elements)) {
        DOMElements[key] = document.getElementById(id);
        if (!DOMElements[key]) {
            console.error(`Missing DOM element: ${id}`);
        } else {
            console.log(`Found element: ${id}`);
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
    console.log('AI Study Buddy initializing...');

    initializeDOMElements();
    setupEventListeners();
    updateStats();
    updateWordCount();

    // Load saved sets after a short delay to ensure DOM is ready
    setTimeout(() => {
        loadSavedCardSets();
    }, 100);

    console.log('AI Study Buddy ready!');
});

// Setup event listeners
function setupEventListeners() {
    // Text area input listener
    if (DOMElements.studyNotes) {
        DOMElements.studyNotes.addEventListener('input', updateWordCount);
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Sidebar close when clicking outside
    document.addEventListener('click', function (event) {
        if (AppState.sidebarOpen &&
            DOMElements.sidebar &&
            DOMElements.sidebarToggle &&
            !DOMElements.sidebar.contains(event.target) &&
            !DOMElements.sidebarToggle.contains(event.target)) {
            toggleSidebar();
        }
    });
}

// Word count functionality
function updateWordCount() {
    if (!DOMElements.studyNotes || !DOMElements.wordCount) return;

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
    if (DOMElements.cardsGenerated) DOMElements.cardsGenerated.textContent = AppState.totalGenerated;
    if (DOMElements.studySessions) DOMElements.studySessions.textContent = AppState.sessions;
    if (DOMElements.savedSets) DOMElements.savedSets.textContent = AppState.savedSets;
}

// FIXED: Toggle sidebar with comprehensive debugging
function toggleSidebar() {
    console.log('Toggle sidebar called. Current state:', AppState.sidebarOpen);

    if (!DOMElements.sidebar) {
        console.error('Sidebar element not found, re-initializing...');
        initializeDOMElements();
        if (!DOMElements.sidebar) {
            console.error('Still no sidebar element!');
            return;
        }
    }

    AppState.sidebarOpen = !AppState.sidebarOpen;

    if (AppState.sidebarOpen) {
        console.log('Opening sidebar...');
        DOMElements.sidebar.classList.add('open');

        // Force reload the saved sets with delay
        setTimeout(() => {
            console.log('Loading saved sets after sidebar opened...');
            loadSavedCardSets();
        }, 150);

    } else {
        console.log('Closing sidebar...');
        DOMElements.sidebar.classList.remove('open');
    }
}

// Show message to user
function showMessage(text, type = 'success') {
    if (!DOMElements.messageArea) return;

    DOMElements.messageArea.innerHTML = `<div class="message ${type}">${text}</div>`;
    setTimeout(() => {
        if (DOMElements.messageArea) {
            DOMElements.messageArea.innerHTML = '';
        }
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
    if (!DOMElements.studyNotes) return;

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
    if (DOMElements.generateBtn) {
        DOMElements.generateBtn.disabled = true;
        DOMElements.generateBtn.textContent = 'Generating...';
    }
    if (DOMElements.loading) DOMElements.loading.style.display = 'block';
    if (DOMElements.messageArea) DOMElements.messageArea.innerHTML = '';

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
            if (DOMElements.saveBtn) DOMElements.saveBtn.disabled = false;
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
        if (DOMElements.generateBtn) {
            DOMElements.generateBtn.disabled = false;
            DOMElements.generateBtn.innerHTML = 'Generate Flashcards';
        }
        if (DOMElements.loading) DOMElements.loading.style.display = 'none';
    }
}

// Display flashcards in the UI
function displayFlashcards() {
    if (!DOMElements.flashcardsContainer) return;

    if (AppState.flashcards.length === 0) {
        DOMElements.flashcardsContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">📚</span>
                <h3>Ready to Learn?</h3>
                <p>Your AI-generated flashcards will appear here</p>
            </div>
        `;
        if (DOMElements.controls) DOMElements.controls.style.display = 'none';
        if (DOMElements.cardActions) DOMElements.cardActions.style.display = 'none';
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
    if (DOMElements.controls) DOMElements.controls.style.display = 'flex';
    if (DOMElements.cardActions) DOMElements.cardActions.style.display = 'flex';
    updateNavigationControls();
}

// Update navigation controls
function updateNavigationControls() {
    if (DOMElements.currentCard) DOMElements.currentCard.textContent = AppState.currentIndex + 1;
    if (DOMElements.totalCards) DOMElements.totalCards.textContent = AppState.flashcards.length;

    // Update button states
    if (DOMElements.prevBtn) DOMElements.prevBtn.disabled = AppState.currentIndex === 0;
    if (DOMElements.nextBtn) DOMElements.nextBtn.disabled = AppState.currentIndex === AppState.flashcards.length - 1;
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
    const message = status === 'know' ? 'Marked as known!' : 'Added to study list!';
    showMessage(message, 'success');

    // Auto-advance to next card after a brief delay
    setTimeout(() => {
        if (AppState.currentIndex < AppState.flashcards.length - 1) {
            nextCard();
        } else {
            showMessage('You\'ve reviewed all cards! Great job!', 'success');
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

// FIXED: Save flashcards with better error handling
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

        // Force reload saved sets after successful save
        setTimeout(() => {
            loadSavedCardSets();
        }, 200);

        showMessage(`Successfully saved "${title}" with ${AppState.flashcards.length} cards!`, 'success');

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

            showMessage(`Saved "${title}" locally (backend unavailable)`, 'success');
        } catch (localError) {
            showMessage('Failed to save flashcards. Please try again.', 'error');
        }
    }
}

// FIXED: Load saved flashcard sets with improved card count handling
async function loadSavedCardSets() {
    console.log('Loading saved card sets...');

    // CRITICAL: Wait for DOM to be ready
    if (!DOMElements.sidebarContent) {
        console.error('sidebarContent element not found, re-initializing DOM...');
        initializeDOMElements();

        if (!DOMElements.sidebarContent) {
            console.error('Still no sidebarContent element after re-init!');
            return;
        }
    }

    // Show loading state
    if (DOMElements.loadingSaved) {
        DOMElements.loadingSaved.style.display = 'block';
        DOMElements.loadingSaved.textContent = 'Loading saved sets...';
    }

    try {
        console.log('Fetching from:', API_CONFIG.endpoints.getFlashcards);
        const response = await fetch(API_CONFIG.endpoints.getFlashcards);
        console.log('Response status:', response.status);

        if (response.ok) {
            const data = await response.json();
            console.log('Full API Response:', data);

            const sets = data.flashcard_sets || [];
            console.log('Sets array:', sets);
            console.log('Number of sets:', sets.length);

            // Update the saved sets count in AppState
            AppState.savedSets = sets.length;
            updateStats();

            // CRITICAL: Force immediate display update
            if (sets.length > 0) {
                console.log('Calling displaySavedSets with', sets.length, 'sets');
                displaySavedSets(sets, false);

                // Double-check that content was actually updated
                setTimeout(() => {
                    console.log('Content after display:', DOMElements.sidebarContent.innerHTML.substring(0, 100));
                    if (DOMElements.sidebarContent.innerHTML.includes('No saved sets')) {
                        console.error('Content still shows empty state!');
                        // Force a retry
                        displaySavedSets(sets, false);
                    }
                }, 100);
            } else {
                console.log('No sets returned from API');
                displaySavedSets([], false);
            }

        } else {
            console.error('API Error:', response.status);
            const errorText = await response.text();
            console.error('Error details:', errorText);
            throw new Error(`API returned ${response.status}: ${errorText}`);
        }

    } catch (error) {
        console.warn('Backend failed, using localStorage:', error);

        // Fallback to localStorage
        try {
            const localSets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            console.log('Local sets found:', localSets.length);
            displaySavedSets(localSets, true);
            AppState.savedSets = localSets.length;
            updateStats();
        } catch (localError) {
            console.error('localStorage also failed:', localError);
            DOMElements.sidebarContent.innerHTML = '<p style="text-align: center; color: red; padding: 20px;">Error loading saved sets</p>';
        }
    }

    // Hide loading
    if (DOMElements.loadingSaved) {
        DOMElements.loadingSaved.style.display = 'none';
    }

    console.log('loadSavedCardSets completed');
}

// FIXED: Display saved sets with improved card count extraction
function displaySavedSets(sets, isLocal = false) {
    console.log('displaySavedSets called with:', sets.length, 'sets, isLocal:', isLocal);

    if (!DOMElements.sidebarContent) {
        console.error('sidebarContent element missing!');
        // Try to find it again
        DOMElements.sidebarContent = document.getElementById('sidebarContent');
        if (!DOMElements.sidebarContent) {
            console.error('Still cannot find sidebarContent element!');
            return;
        }
    }

    if (!sets || sets.length === 0) {
        console.log('No sets, showing empty state');
        const emptyHTML = `
            <div style="text-align: center; color: #666; padding: 20px;">
                <p>No saved sets yet</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Create some flashcards and save them!</p>
            </div>
        `;
        DOMElements.sidebarContent.innerHTML = emptyHTML;
        console.log('Empty state HTML set');
        return;
    }

    console.log('Processing', sets.length, 'sets for display');

    // Generate HTML for each set with FIXED card count logic
    const setsHTML = sets.map((set, index) => {
        // FIXED: Improved card count extraction with detailed logging
        let cardCount = 0;

        if (isLocal) {
            // Local storage format
            cardCount = set.cards?.length || set.flashcards?.length || set.totalCards || set.total_cards || 0;
        } else {
            // Backend format - directly use total_cards
            cardCount = set.total_cards || 0;
            console.log(`Backend set "${set.title}": total_cards = ${set.total_cards}, using cardCount = ${cardCount}`);
        }

        // Fallback check
        if (cardCount === 0) {
            console.warn(`Warning: Set "${set.title}" has 0 card count. Raw set data:`, set);
        }

        const date = new Date(set.created_at || set.timestamp).toLocaleDateString();
        const setId = set.id || set.title;

        console.log(`Set ${index + 1}: "${set.title}" -> ${cardCount} cards, id: ${setId}, date: ${date}`);

        return `
            <div class="saved-card-set" data-set-id="${setId}" style="margin-bottom: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; background: white;">
                <div class="saved-set-title" style="font-weight: bold; margin-bottom: 5px; color: #333;">${set.title}</div>
                <div class="saved-set-meta" style="font-size: 0.9rem; color: #666; margin-bottom: 10px;">
                    <span style="font-weight: 500;">${cardCount} cards</span> • <span>${date}</span>
                </div>
                <div class="saved-set-actions">
                    <button class="mini-btn load-btn" onclick="loadSavedSet('${setId}', ${isLocal})" style="background: #4CAF50; color: white; border: none; padding: 5px 10px; margin-right: 5px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
                        Load
                    </button>
                    <button class="mini-btn delete-btn" onclick="deleteSavedSet('${setId}', ${isLocal})" style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
                        Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');

    console.log('Generated HTML preview:', setsHTML.substring(0, 200) + '...');
    console.log('Total HTML length:', setsHTML.length);

    // CRITICAL: Force the content update with error handling
    try {
        // Clear content first
        DOMElements.sidebarContent.innerHTML = '';

        // Force a repaint
        DOMElements.sidebarContent.offsetHeight;

        // Set new content
        DOMElements.sidebarContent.innerHTML = setsHTML;
        console.log('innerHTML updated successfully');

        // Verify the update worked
        const updatedContent = DOMElements.sidebarContent.innerHTML;
        console.log('Verification - updated content length:', updatedContent.length);
        console.log('Verification - content preview:', updatedContent.substring(0, 150) + '...');

        // Force another repaint
        DOMElements.sidebarContent.offsetHeight;

        // Final verification after repaint
        setTimeout(() => {
            const finalContent = DOMElements.sidebarContent.innerHTML;
            if (finalContent.length < 100) {
                console.error('CRITICAL: Content appears to be empty or corrupted after update!');
                console.error('Final content:', finalContent);
                // Try one more time
                DOMElements.sidebarContent.innerHTML = setsHTML;
            } else {
                console.log('SUCCESS: Content verified to be properly displayed');
            }
        }, 50);

    } catch (updateError) {
        console.error('Failed to update innerHTML:', updateError);
    }
}

// FIXED: Load a specific saved flashcard set with proper card count update
async function loadSavedSet(setId, isLocal = false) {
    console.log(`Loading set: ${setId}, isLocal: ${isLocal}`);

    try {
        showMessage('Loading flashcard set...', 'success');

        let setData = null;

        if (isLocal) {
            // Load from local storage
            const localSets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            setData = localSets.find(set => set.title === setId);
            console.log('Found local set:', setData);
        } else {
            // Load from backend
            console.log(`Fetching from: ${API_CONFIG.endpoints.getFlashcards}/${setId}`);
            const response = await fetch(`${API_CONFIG.endpoints.getFlashcards}/${setId}`);
            console.log('Load response status:', response.status);

            if (response.ok) {
                setData = await response.json();
                console.log('Backend set data:', setData);
            } else {
                console.error('Backend load failed with status:', response.status);
                const errorText = await response.text();
                console.error('Error response:', errorText);
                throw new Error(`Failed to load set: ${response.status}`);
            }
        }

        if (setData) {
            console.log('Set data loaded:', {
                title: setData.title,
                cardsCount: setData.cards ? setData.cards.length : setData.flashcards ? setData.flashcards.length : 0,
                hasOriginalText: !!setData.original_text
            });

            // Load the flashcards - handle both formats
            AppState.flashcards = setData.cards || setData.flashcards || [];
            AppState.currentIndex = 0;
            AppState.cardStatuses = new Map(setData.cardStatuses || setData.card_statuses || []);

            console.log('Loaded flashcards:', AppState.flashcards);

            // Update UI
            if (setData.original_text && DOMElements.studyNotes) {
                DOMElements.studyNotes.value = setData.original_text;
                updateWordCount();
            }

            if (AppState.flashcards.length > 0) {
                // Ensure cards have proper structure
                AppState.flashcards = AppState.flashcards.map((card, index) => ({
                    ...card,
                    id: card.id || index + 1,
                    isFlipped: false // Reset flip state
                }));
                DOMElements.saveBtn.disabled = false;
                showMessage(`Loaded "${setData.title}" with ${AppState.flashcards.length} cards!`, 'success');

                // Close sidebar on mobile
                if (window.innerWidth <= 968) {
                    toggleSidebar();
                }
            } else {
                console.error('❌ No cards found in loaded set');
                throw new Error('No cards found in set');
            }
        } else {
            console.error('❌ Set data is null/undefined');
            throw new Error('Set not found');
        }

    } catch (error) {
        console.error('❌ Error loading flashcard set:', error);
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

function debugSidebar() {
    console.log('🔍 SIDEBAR DEBUG INFO:');
    console.log('- AppState.sidebarOpen:', AppState.sidebarOpen);
    console.log('- Sidebar element:', DOMElements.sidebar);
    console.log('- Sidebar classes:', DOMElements.sidebar?.className);
    console.log('- Sidebar content:', DOMElements.sidebarContent);
    console.log('- Content innerHTML length:', DOMElements.sidebarContent?.innerHTML.length);
    console.log('- Content HTML preview:', DOMElements.sidebarContent?.innerHTML.substring(0, 300));
    console.log('- CSS display:', window.getComputedStyle(DOMElements.sidebar).display);
    console.log('- CSS visibility:', window.getComputedStyle(DOMElements.sidebar).visibility);
}

// ENHANCED: Toggle sidebar with debugging
function toggleSidebar() {
    console.log('Toggle sidebar called. Current state:', AppState.sidebarOpen);

    if (!DOMElements.sidebar) {
        console.error('Sidebar element not found!');
        return;
    }

    AppState.sidebarOpen = !AppState.sidebarOpen;

    if (AppState.sidebarOpen) {
        console.log('Opening sidebar...');
        DOMElements.sidebar.classList.add('open');

        // Force reload the saved sets
        setTimeout(() => {
            loadSavedCardSets();
        }, 100);

    } else {
        console.log('Closing sidebar...');
        DOMElements.sidebar.classList.remove('open');
    }
}
// Add debugging helper to window object
window.StudyBuddyDebug = {
    debugSidebar,
    loadSavedCardSets,
    displaySavedSets,
    state: AppState,
    dom: DOMElements
};

console.log('🔧 Debug helpers available: window.StudyBuddyDebug');

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