// ==========================
// StudyPal - Production Ready
// ==========================

// Application State
const AppState = {
    flashcards: [],
    currentIndex: 0,
    totalGenerated: 0,
    sessions: 1,
    savedSets: 0,
    isGenerating: false,
    cardStatuses: new Map(),
    sidebarOpen: false
};

// API Configuration
const API_BASE_URL = ['localhost', '127.0.0.1'].includes(window.location.hostname)
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

// DOM Cache
const DOMElements = {};

// Initialize DOM Elements
function initializeDOMElements() {
    const ids = [
        'studyNotes', 'generateBtn', 'saveBtn', 'loading', 'messageArea', 'flashcardsContainer', 'controls', 'cardActions',
        'wordCount', 'cardsGenerated', 'studySessions', 'savedSets', 'currentCard', 'totalCards', 'prevBtn', 'nextBtn',
        'sidebar', 'sidebarContent', 'sidebarToggle', 'loadingSaved'
    ];

    ids.forEach(id => {
        DOMElements[id] = document.getElementById(id);
        if (!DOMElements[id]) console.warn(`Missing DOM element: ${id}`);
    });
}

// ==========================
// UI Helpers
// ==========================
function updateWordCount() {
    if (!DOMElements.studyNotes || !DOMElements.wordCount) return;

    const text = DOMElements.studyNotes.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    DOMElements.wordCount.textContent = count;

    DOMElements.wordCount.style.color = count < 20 ? '#d32f2f' : count < 50 ? '#f57f17' : '#2e7d32';
}

function updateStats() {
    if (DOMElements.cardsGenerated) DOMElements.cardsGenerated.textContent = AppState.totalGenerated;
    if (DOMElements.studySessions) DOMElements.studySessions.textContent = AppState.sessions;
    if (DOMElements.savedSets) DOMElements.savedSets.textContent = AppState.savedSets;
}

function showMessage(text, type = 'success') {
    if (!DOMElements.messageArea) return;
    DOMElements.messageArea.innerHTML = `<div class="message ${type}">${text}</div>`;
    setTimeout(() => { if (DOMElements.messageArea) DOMElements.messageArea.innerHTML = ''; }, 5000);
}

// ==========================
// Sidebar
// ==========================
function toggleSidebar() {
    if (!DOMElements.sidebar) return;
    AppState.sidebarOpen = !AppState.sidebarOpen;
    DOMElements.sidebar.classList.toggle('open', AppState.sidebarOpen);
    if (AppState.sidebarOpen) setTimeout(loadSavedCardSets, 100);
}

function closeSidebar() {
    if (!DOMElements.sidebar) return;
    DOMElements.sidebar.classList.remove('open');
    AppState.sidebarOpen = false;
}

// ==========================
// Flashcard Navigation
// ==========================
function displayFlashcards() {
    if (!DOMElements.flashcardsContainer) return;

    if (!AppState.flashcards.length) {
        DOMElements.flashcardsContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">📚</span>
                <h3>Ready to Learn?</h3>
                <p>Your AI-generated flashcards will appear here</p>
            </div>`;
        if (DOMElements.controls) DOMElements.controls.style.display = 'none';
        if (DOMElements.cardActions) DOMElements.cardActions.style.display = 'none';
        return;
    }

    const card = AppState.flashcards[AppState.currentIndex];
    const difficultyClass = `difficulty-${card.difficulty}`;
    DOMElements.flashcardsContainer.innerHTML = `
        <div class="flashcard ${card.isFlipped ? 'flipped' : ''}" onclick="flipCard()">
            <div class="flashcard-header">
                <span>${card.isFlipped ? '💡' : '❓'}</span>
                <span class="difficulty-badge ${difficultyClass}">${card.difficulty}</span>
            </div>
            <div class="flashcard-content">
                <h3>${card.isFlipped ? 'Answer' : 'Question'}</h3>
                <p>${card.isFlipped ? card.answer : card.question}</p>
            </div>
            <div class="flashcard-footer">
                Click to ${card.isFlipped ? 'see question' : 'reveal answer'}
            </div>
        </div>
    `;

    if (DOMElements.controls) DOMElements.controls.style.display = 'flex';
    if (DOMElements.cardActions) DOMElements.cardActions.style.display = 'flex';
    updateNavigationControls();
}

function updateNavigationControls() {
    if (DOMElements.currentCard) DOMElements.currentCard.textContent = AppState.currentIndex + 1;
    if (DOMElements.totalCards) DOMElements.totalCards.textContent = AppState.flashcards.length;
    if (DOMElements.prevBtn) DOMElements.prevBtn.disabled = AppState.currentIndex === 0;
    if (DOMElements.nextBtn) DOMElements.nextBtn.disabled = AppState.currentIndex === AppState.flashcards.length - 1;
}

function flipCard() {
    if (!AppState.flashcards.length) return;
    AppState.flashcards[AppState.currentIndex].isFlipped = !AppState.flashcards[AppState.currentIndex].isFlipped;
    displayFlashcards();
}

function previousCard() { if (AppState.currentIndex > 0) { AppState.currentIndex--; displayFlashcards(); } }
function nextCard() { if (AppState.currentIndex < AppState.flashcards.length - 1) { AppState.currentIndex++; displayFlashcards(); } }
function shuffleCards() {
    if (!AppState.flashcards.length) return;
    for (let i = AppState.flashcards.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [AppState.flashcards[i], AppState.flashcards[j]] = [AppState.flashcards[j], AppState.flashcards[i]];
    }
    AppState.currentIndex = 0;
    displayFlashcards();
}

// ==========================
// Flashcard Generation
// ==========================
async function callBackendAPI(text) {
    const res = await fetch(API_CONFIG.endpoints.generateFlashcards, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, num_cards: 5 })
    });
    if (!res.ok) throw new Error(`Backend error ${res.status}`);
    return res.json();
}

function parseBackendResponse(data) {
    if (!Array.isArray(data.flashcards)) return [];
    return data.flashcards.map((card, i) => ({
        id: i + 1,
        question: card.question.trim(),
        answer: card.answer.trim(),
        difficulty: card.difficulty || 'medium',
        type: card.type || 'general',
        isFlipped: false
    }));
}

function createFallbackCards() {
    const text = DOMElements.studyNotes.value.trim();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const fallback = [
        { question: "What is the main topic discussed?", answer: sentences[0] || "Key concepts." },
        { question: "Summarize key points.", answer: sentences.slice(0, 2).join('. ') || "Summary." }
    ];
    return fallback.map((c, i) => ({ ...c, id: i + 1, difficulty: 'medium', type: 'general', isFlipped: false }));
}

async function generateFlashcards() {
    if (!DOMElements.studyNotes) return;
    const text = DOMElements.studyNotes.value.trim();
    if (!text || text.length < 30) return showMessage('Enter at least 30 characters', 'error');

    AppState.isGenerating = true;
    if (DOMElements.generateBtn) { DOMElements.generateBtn.disabled = true; DOMElements.generateBtn.textContent = 'Generating...'; }
    if (DOMElements.loading) DOMElements.loading.style.display = 'block';
    if (DOMElements.messageArea) DOMElements.messageArea.innerHTML = '';

    try {
        let flashcards = [];
        try { flashcards = parseBackendResponse(await callBackendAPI(text)); }
        catch { flashcards = createFallbackCards(); }

        AppState.flashcards = flashcards;
        AppState.currentIndex = 0;
        AppState.totalGenerated += flashcards.length;
        displayFlashcards();
        if (DOMElements.saveBtn) DOMElements.saveBtn.disabled = false;
        updateStats();
        showMessage(`Generated ${flashcards.length} flashcards!`, 'success');

    } catch { showMessage('Failed to generate flashcards', 'error'); }
    finally {
        AppState.isGenerating = false;
        if (DOMElements.generateBtn) { DOMElements.generateBtn.disabled = false; DOMElements.generateBtn.textContent = 'Generate Flashcards'; }
        if (DOMElements.loading) DOMElements.loading.style.display = 'none';
    }
}

// ==========================
// Save/Load/Delete
// ==========================
async function saveFlashcards() {
    if (!AppState.flashcards.length) return showMessage('No flashcards to save!', 'error');
    const title = prompt('Enter a title for this flashcard set:');
    if (!title) return showMessage('Save cancelled', 'error');

    const dataToSave = {
        title: title.trim(),
        original_text: DOMElements.studyNotes.value.trim(),
        flashcards: AppState.flashcards,
        card_statuses: Array.from(AppState.cardStatuses.entries()),
        created_at: new Date().toISOString()
    };

    try {
        const res = await fetch(API_CONFIG.endpoints.saveFlashcards, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSave) });
        if (!res.ok) throw new Error('Save failed');
        AppState.savedSets++;
        updateStats();
        setTimeout(loadSavedCardSets, 200);
        showMessage(`Saved "${title}"!`, 'success');
    } catch {
        // fallback to localStorage
        const local = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
        local.push({ ...dataToSave, cards: AppState.flashcards });
        localStorage.setItem('studyBuddyCardSets', JSON.stringify(local));
        AppState.savedSets++;
        updateStats();
        loadSavedCardSets();
        showMessage(`Saved "${title}" locally`, 'success');
    }
}

async function loadSavedCardSets() {
    if (!DOMElements.sidebarContent) return;
    if (DOMElements.loadingSaved) DOMElements.loadingSaved.style.display = 'block';
    let sets = [];

    try {
        const res = await fetch(API_CONFIG.endpoints.getFlashcards);
        sets = res.ok ? (await res.json()).flashcard_sets || [] : [];
    } catch { sets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]'); }

    AppState.savedSets = sets.length;
    updateStats();
    displaySavedSets(sets, false);
    if (DOMElements.loadingSaved) DOMElements.loadingSaved.style.display = 'none';
}

function displaySavedSets(sets, isLocal = false) {
    if (!DOMElements.sidebarContent) return;
    if (!sets.length) {
        DOMElements.sidebarContent.innerHTML = `<p style="text-align:center;color:#666;padding:20px;">No saved sets</p>`;
        return;
    }

    DOMElements.sidebarContent.innerHTML = sets.map(set => {
        const count = isLocal ? (set.cards?.length || 0) : (set.total_cards || 0);
        const date = new Date(set.created_at || set.timestamp).toLocaleDateString();
        const setId = set.id || set.title;
        return `
        <div class="saved-card-set p-3 mb-2 border rounded-lg bg-gray-50 dark:bg-gray-800">
            <div class="saved-set-title font-semibold text-gray-900 dark:text-gray-100">${set.title}</div>
            <div class="saved-set-meta text-sm text-gray-500 dark:text-gray-400">${count} cards • ${date}</div>
            <div class="saved-set-actions mt-2 flex gap-2">
<button class="mini-btn load-btn" onclick="loadSavedSet('${setId}', ${isLocal})" 
        style="background: #4CAF50; color: white; border: none; padding: 5px 10px; margin-right: 5px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
    Load
</button>
<button class="mini-btn delete-btn" onclick="deleteSavedSet('${setId}', ${isLocal})" 
        style="background: #f44336; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">
    Delete
</button>

            </div>
        </div>`;
    }).join('');

}

async function loadSavedSet(setId, isLocal = false) {
    try {
        let setData;
        if (isLocal) {
            const local = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            setData = local.find(s => s.title === setId);
        } else {
            const res = await fetch(`${API_CONFIG.endpoints.getFlashcards}/${setId}`);
            setData = res.ok ? await res.json() : null;
        }
        if (!setData) return showMessage('Failed to load set', 'error');

        AppState.flashcards = (setData.cards || setData.flashcards || []).map((card, idx) => ({
            id: card.id || idx + 1, question: card.question, answer: card.answer,
            difficulty: card.difficulty || 'medium', type: card.type || 'general', isFlipped: false
        }));

        AppState.currentIndex = 0;
        AppState.cardStatuses = new Map(setData.cardStatuses || setData.card_statuses || []);
        if (DOMElements.studyNotes && setData.original_text) { DOMElements.studyNotes.value = setData.original_text; updateWordCount(); }

        displayFlashcards();
        updateStats();
        closeSidebar();
        showMessage(`Loaded set "${setData.title}"!`, 'success');
    } catch { showMessage('Failed to load flashcard set', 'error'); }
}

async function deleteSavedSet(setId, isLocal = false) {
    if (!confirm('Are you sure?')) return;

    try {
        if (isLocal) {
            const local = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            localStorage.setItem('studyBuddyCardSets', JSON.stringify(local.filter(s => s.title !== setId)));
        } else {
            const res = await fetch(`${API_CONFIG.endpoints.deleteFlashcards}/${setId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
        }
        AppState.savedSets = Math.max(0, AppState.savedSets - 1);
        updateStats();
        loadSavedCardSets();
        showMessage('Deleted successfully!', 'success');
    } catch { showMessage('Failed to delete set', 'error'); }
}

// ==========================
// Keyboard Shortcuts
// ==========================
function handleKeyboardShortcuts(e) {
    if (['TEXTAREA', 'INPUT'].includes(e.target.tagName)) return;
    switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); previousCard(); break;
        case 'ArrowRight': e.preventDefault(); nextCard(); break;
        case ' ': e.preventDefault(); flipCard(); break;
        case 'g': if (e.ctrlKey || e.metaKey) { e.preventDefault(); generateFlashcards(); } break;
        case 's': if (e.ctrlKey || e.metaKey) { e.preventDefault(); saveFlashcards(); } break;
        case 'r': if (e.ctrlKey || e.metaKey) { e.preventDefault(); shuffleCards(); } break;
        case 'Escape': if (AppState.sidebarOpen) toggleSidebar(); break;
    }
}

// ==========================
// Initialization
// ==========================
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    updateStats();
    updateWordCount();
    setupEventListeners();
    setTimeout(loadSavedCardSets, 100);
});

function setupEventListeners() {
    if (DOMElements.studyNotes) DOMElements.studyNotes.addEventListener('input', updateWordCount);
    document.addEventListener('keydown', handleKeyboardShortcuts);
    document.addEventListener('click', e => {
        if (AppState.sidebarOpen && DOMElements.sidebar && DOMElements.sidebarToggle &&
            !DOMElements.sidebar.contains(e.target) && !DOMElements.sidebarToggle.contains(e.target)) {
            toggleSidebar();
        }
    });
}

// ==========================
// Export for Testing/Debugging
// ==========================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateFlashcards, flipCard, nextCard, previousCard, markCard: () => { }, shuffleCards, saveFlashcards, loadSavedSet, deleteSavedSet, toggleSidebar };
}

window.StudyBuddy = { state: AppState, toggleSidebar, generateDemo: () => { if (DOMElements.studyNotes) { DOMElements.studyNotes.value = "Machine learning is a subset of AI..."; updateWordCount(); generateFlashcards(); } }, loadDemo: loadSavedCardSets, clearData: () => { localStorage.removeItem('studyBuddyCardSets'); showMessage('Local data cleared!', 'success'); loadSavedCardSets(); } };
