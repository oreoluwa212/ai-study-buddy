// ==========================
// StudyPal - Frontend with Tier System Integration
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
    sidebarOpen: false,
    userEmail: null,
    userTier: 'free',
    premiumFeatures: {
        maxCards: 5,
        unlimitedSaves: false,
        premiumContent: false
    }
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
        deleteFlashcards: `${API_BASE_URL}/api/flashcards`,
        userTier: `${API_BASE_URL}/api/user/tier`,
        createPayment: `${API_BASE_URL}/api/payments/create-intent`,
        paymentStatus: `${API_BASE_URL}/api/payments`,
        validatePremium: `${API_BASE_URL}/api/premium/validate`
    }
};

// Payment Configuration
const PaymentConfig = {
    plans: {
        monthly: { amount: 500, currency: 'KES', period: 'month', description: 'StudyPal Premium - Monthly' },
        yearly: { amount: 5000, currency: 'KES', period: 'year', description: 'StudyPal Premium - Yearly' }
    },
    selectedPlan: 'monthly',
    isProcessing: false
};

// DOM Cache
const DOMElements = {};

// Initialize DOM Elements
function initializeDOMElements() {
    const ids = [
        'studyNotes', 'generateBtn', 'saveBtn', 'loading', 'messageArea', 'flashcardsContainer', 
        'controls', 'cardActions', 'wordCount', 'cardsGenerated', 'studySessions', 'savedSets', 
        'currentCard', 'totalCards', 'prevBtn', 'nextBtn', 'sidebar', 'sidebarContent', 
        'sidebarToggle', 'loadingSaved', 'userEmail', 'paymentModal', 'proceedPaymentBtn',
        'paymentLoading', 'paymentError', 'paymentSuccess'
    ];

    ids.forEach(id => {
        DOMElements[id] = document.getElementById(id);
        if (!DOMElements[id]) console.warn(`Missing DOM element: ${id}`);
    });
}

// ==========================
// User Management & Tier System
// ==========================

function initializeUser() {
    // Get user email from localStorage or prompt
    const storedEmail = localStorage.getItem('studypal_user_email');
    if (storedEmail) {
        AppState.userEmail = storedEmail;
        if (DOMElements.userEmail) {
            DOMElements.userEmail.value = storedEmail;
        }
    }
    
    // Check user tier
    if (AppState.userEmail) {
        checkUserTier();
    }
}

async function checkUserTier() {
    if (!AppState.userEmail) return;
    
    try {
        const response = await fetch(`${API_CONFIG.endpoints.userTier}?user_email=${encodeURIComponent(AppState.userEmail)}`);
        if (response.ok) {
            const data = await response.json();
            AppState.userTier = data.tier;
            updatePremiumFeatures();
            updateUIForTier();
        }
    } catch (error) {
        console.error('Failed to check user tier:', error);
    }
}

function updatePremiumFeatures() {
    if (AppState.userTier === 'premium') {
        AppState.premiumFeatures = {
            maxCards: 10,
            unlimitedSaves: true,
            premiumContent: true
        };
        showPremiumIndicator();
    } else {
        AppState.premiumFeatures = {
            maxCards: 5,
            unlimitedSaves: false,
            premiumContent: false
        };
        hidePremiumIndicator();
    }
}

function updateUIForTier() {
    // Update generate button text to show limits
    if (DOMElements.generateBtn) {
        const maxCards = AppState.premiumFeatures.maxCards;
        if (!AppState.isGenerating) {
            DOMElements.generateBtn.textContent = `Generate Flashcards (Max: ${maxCards})`;
        }
    }

    // Show/hide upgrade prompts
    if (AppState.userTier !== 'premium') {
        addUpgradeButton();
    }
}

function setUserEmail() {
    const email = DOMElements.userEmail ? DOMElements.userEmail.value.trim() : '';
    if (!email) {
        showMessage('Please enter your email address', 'error');
        return;
    }
    
    if (!isValidEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }
    
    AppState.userEmail = email;
    localStorage.setItem('studypal_user_email', email);
    checkUserTier();
    showMessage('Email saved! Checking your tier...', 'success');
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

function showPremiumIndicator() {
    let indicator = document.querySelector('.premium-indicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'premium-indicator';
        indicator.innerHTML = '⭐ Premium Active';
        indicator.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(45deg, #FFD700, #FFA500);
            color: #000;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            z-index: 1000;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(indicator);
    }
    indicator.style.display = 'block';
}

function hidePremiumIndicator() {
    const indicator = document.querySelector('.premium-indicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// ==========================
// Sidebar with Tier Support
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
// Flashcard Generation with Tier Limits
// ==========================
async function generateFlashcards() {
    if (!DOMElements.studyNotes) return;
    const text = DOMElements.studyNotes.value.trim();
    if (!text || text.length < 30) return showMessage('Enter at least 30 characters', 'error');

    // Check generation limits for free users
    if (AppState.userTier === 'free' && AppState.totalGenerated >= 15) {
        showUpgradePrompt('You\'ve reached the free limit of 15 flashcards. Upgrade to Premium for unlimited generation!');
        return;
    }

    AppState.isGenerating = true;
    if (DOMElements.generateBtn) { 
        DOMElements.generateBtn.disabled = true; 
        DOMElements.generateBtn.textContent = 'Generating...'; 
    }
    if (DOMElements.loading) DOMElements.loading.style.display = 'block';
    if (DOMElements.messageArea) DOMElements.messageArea.innerHTML = '';

    try {
        const requestData = {
            text: text,
            num_cards: AppState.premiumFeatures.maxCards,
            user_email: AppState.userEmail
        };

        const response = await fetch(API_CONFIG.endpoints.generateFlashcards, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Generation failed');
        }

        const data = await response.json();
        const flashcards = parseBackendResponse(data);

        AppState.flashcards = flashcards;
        AppState.currentIndex = 0;
        AppState.totalGenerated += flashcards.length;
        
        displayFlashcards();
        if (DOMElements.saveBtn) DOMElements.saveBtn.disabled = false;
        updateStats();
        updateUIForTier(); // Update UI after generation
        
        showMessage(`Generated ${flashcards.length} flashcards! (${data.user_tier} tier)`, 'success');

    } catch (error) {
        console.error('Generation failed:', error);
        showMessage(error.message || 'Failed to generate flashcards', 'error');
    } finally {
        AppState.isGenerating = false;
        if (DOMElements.generateBtn) { 
            DOMElements.generateBtn.disabled = false; 
            const maxCards = AppState.premiumFeatures.maxCards;
            DOMElements.generateBtn.textContent = `Generate Flashcards (Max: ${maxCards})`;
        }
        if (DOMElements.loading) DOMElements.loading.style.display = 'none';
    }
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

// ==========================
// Save/Load/Delete with Tier Support
// ==========================
async function saveFlashcards() {
    if (!AppState.flashcards.length) return showMessage('No flashcards to save!', 'error');
    
    // Check save limits for free users
    if (AppState.userTier === 'free' && AppState.savedSets >= 3) {
        showUpgradePrompt('You\'ve reached the free limit of 3 saved sets. Upgrade to Premium for unlimited saves!');
        return;
    }

    if (!AppState.userEmail) {
        showMessage('Please set your email address first', 'error');
        return;
    }

    const title = prompt('Enter a title for this flashcard set:');
    if (!title) return showMessage('Save cancelled', 'error');

    const dataToSave = {
        title: title.trim(),
        original_text: DOMElements.studyNotes.value.trim(),
        flashcards: AppState.flashcards,
        card_statuses: Array.from(AppState.cardStatuses.entries()),
        user_email: AppState.userEmail,
        tier_required: 'free' // You can make this dynamic based on content complexity
    };

    try {
        const response = await fetch(API_CONFIG.endpoints.saveFlashcards, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(dataToSave) 
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Save failed');
        }
        
        const result = await response.json();
        AppState.savedSets++;
        updateStats();
        setTimeout(loadSavedCardSets, 200);
        showMessage(`Saved "${title}"! (${result.storage_type})`, 'success');
        
    } catch (error) {
        console.error('Save failed:', error);
        showMessage(error.message || 'Failed to save flashcards', 'error');
    }
}

async function loadSavedCardSets() {
    if (!DOMElements.sidebarContent) return;
    if (DOMElements.loadingSaved) DOMElements.loadingSaved.style.display = 'block';
    
    let sets = [];
    
    try {
        const url = AppState.userEmail 
            ? `${API_CONFIG.endpoints.getFlashcards}?user_email=${encodeURIComponent(AppState.userEmail)}&include_locked=true`
            : API_CONFIG.endpoints.getFlashcards;
            
        const response = await fetch(url);
        if (response.ok) {
            const data = await response.json();
            sets = data.flashcard_sets || [];
            AppState.userTier = data.user_tier || 'free';
            updatePremiumFeatures();
            updateUIForTier();
        }
    } catch (error) {
        console.error('Failed to load sets:', error);
        // Fallback to localStorage
        sets = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
    }

    AppState.savedSets = sets.filter(set => set.can_access !== false).length;
    updateStats();
    displaySavedSets(sets);
    if (DOMElements.loadingSaved) DOMElements.loadingSaved.style.display = 'none';
}

function displaySavedSets(sets) {
    if (!DOMElements.sidebarContent) return;
    
    if (!sets.length) {
        DOMElements.sidebarContent.innerHTML = `
            <div style="text-align:center;color:#666;padding:20px;">
                <p>No saved sets yet</p>
                <small>Generate and save flashcards to see them here</small>
            </div>`;
        return;
    }

    DOMElements.sidebarContent.innerHTML = sets.map(set => {
        const count = set.total_cards || set.cards?.length || 0;
        const date = new Date(set.created_at || set.timestamp).toLocaleDateString();
        const setId = set.id || set.title;
        const isLocked = set.is_locked || !set.can_access;
        const tierRequired = set.tier_required || 'free';
        
        const lockIcon = isLocked ? '🔒' : '';
        const disabledClass = isLocked ? 'disabled' : '';
        const upgradeText = isLocked ? `<small style="color: #f44336;">Requires ${tierRequired} tier</small>` : '';
        
        return `
            <div class="saved-card-set ${disabledClass}" style="padding: 12px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 8px; background: ${isLocked ? '#f5f5f5' : '#fff'};">
                <div class="saved-set-title" style="font-weight: bold; display: flex; align-items: center; gap: 8px;">
                    ${lockIcon} ${set.title}
                </div>
                <div class="saved-set-meta" style="font-size: 0.9rem; color: #666; margin: 4px 0;">
                    ${count} cards • ${date}
                </div>
                ${upgradeText}
                <div class="saved-set-actions" style="margin-top: 8px; display: flex; gap: 8px;">
                    <button class="mini-btn load-btn" 
                            onclick="loadSavedSet('${setId}', false)" 
                            ${isLocked ? 'disabled' : ''}
                            style="background: ${isLocked ? '#ccc' : '#4CAF50'}; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; font-size: 0.85rem;">
                        ${isLocked ? 'Locked' : 'Load'}
                    </button>
                    <button class="mini-btn delete-btn" 
                            onclick="deleteSavedSet('${setId}', false)" 
                            ${isLocked ? 'disabled' : ''}
                            style="background: ${isLocked ? '#ccc' : '#f44336'}; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: ${isLocked ? 'not-allowed' : 'pointer'}; font-size: 0.85rem;">
                        Delete
                    </button>
                    ${isLocked ? '<button class="mini-btn upgrade-btn" onclick="openPaymentModal()" style="background: #FF9800; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 0.85rem;">Upgrade</button>' : ''}
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
            const url = AppState.userEmail 
                ? `${API_CONFIG.endpoints.getFlashcards}/${setId}?user_email=${encodeURIComponent(AppState.userEmail)}`
                : `${API_CONFIG.endpoints.getFlashcards}/${setId}`;
                
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 403) {
                    showMessage('This set requires a premium subscription', 'error');
                    setTimeout(openPaymentModal, 1500);
                    return;
                }
                throw new Error('Failed to load set');
            }
            setData = await response.json();
        }
        
        if (!setData) return showMessage('Failed to load set', 'error');
        if (setData.error) return showMessage(setData.error, 'error');

        AppState.flashcards = (setData.cards || setData.flashcards || []).map((card, idx) => ({
            id: card.id || idx + 1, 
            question: card.question, 
            answer: card.answer,
            difficulty: card.difficulty || 'medium', 
            type: card.type || 'general', 
            isFlipped: false
        }));

        AppState.currentIndex = 0;
        AppState.cardStatuses = new Map(setData.cardStatuses || setData.card_statuses || []);
        
        if (DOMElements.studyNotes && setData.original_text) { 
            DOMElements.studyNotes.value = setData.original_text; 
            updateWordCount(); 
        }

        displayFlashcards();
        updateStats();
        closeSidebar();
        showMessage(`Loaded set "${setData.title}"!`, 'success');
        
    } catch (error) {
        console.error('Load failed:', error);
        showMessage('Failed to load flashcard set', 'error');
    }
}

async function deleteSavedSet(setId, isLocal = false) {
    if (!confirm('Are you sure you want to delete this flashcard set?')) return;

    try {
        if (isLocal) {
            const local = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
            localStorage.setItem('studyBuddyCardSets', JSON.stringify(local.filter(s => s.title !== setId)));
        } else {
            const url = AppState.userEmail 
                ? `${API_CONFIG.endpoints.deleteFlashcards}/${setId}?user_email=${encodeURIComponent(AppState.userEmail)}`
                : `${API_CONFIG.endpoints.deleteFlashcards}/${setId}`;
                
            const response = await fetch(url, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Delete failed');
            }
        }
        
        AppState.savedSets = Math.max(0, AppState.savedSets - 1);
        updateStats();
        loadSavedCardSets();
        showMessage('Deleted successfully!', 'success');
        
    } catch (error) {
        console.error('Delete failed:', error);
        showMessage(error.message || 'Failed to delete set', 'error');
    }
}

// ==========================
// Payment System Integration
// ==========================
function showUpgradePrompt(message) {
    showMessage(message, 'error');
    
    // Create and show upgrade prompt
    const prompt = document.createElement('div');
    prompt.className = 'upgrade-prompt';
    prompt.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 1000;
        max-width: 400px;
        text-align: center;
    `;
    prompt.innerHTML = `
        <h3 style="margin-top: 0; color: #333;">Upgrade to Premium</h3>
        <p style="color: #666; margin: 15px 0;">${message}</p>
        <div style="display: flex; gap: 10px; justify-content: center;">
            <button onclick="openPaymentModal(); this.parentElement.parentElement.remove();" 
                    style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-weight: bold;">
                Upgrade Now
            </button>
            <button onclick="this.parentElement.parentElement.remove();" 
                    style="background: #ccc; color: #333; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer;">
                Maybe Later
            </button>
        </div>
    `;
    
    document.body.appendChild(prompt);
    
    // Auto remove after 10 seconds
    setTimeout(() => {
        if (prompt.parentNode) prompt.parentNode.removeChild(prompt);
    }, 10000);
}

function addUpgradeButton() {
    if (AppState.userTier === 'premium') return;
    if (document.querySelector('.upgrade-header-btn')) return;

    const header = document.querySelector('.header');
    if (header) {
        const upgradeBtn = document.createElement('button');
        upgradeBtn.className = 'btn btn-primary upgrade-header-btn';
        upgradeBtn.style.cssText = `
            position: absolute;
            top: 20px;
            left: 20px;
            padding: 10px 20px;
            font-size: 0.9rem;
            z-index: 100;
            background: linear-gradient(45deg, #FF6B6B, #4ECDC4);
            border: none;
            border-radius: 25px;
            color: white;
            font-weight: bold;
            cursor: pointer;
            transition: transform 0.2s;
        `;
        upgradeBtn.textContent = '⭐ Upgrade to Premium';
        upgradeBtn.onclick = openPaymentModal;
        upgradeBtn.onmouseover = () => upgradeBtn.style.transform = 'scale(1.05)';
        upgradeBtn.onmouseout = () => upgradeBtn.style.transform = 'scale(1)';
        
        header.style.position = 'relative';
        header.appendChild(upgradeBtn);
    }
}

function openPaymentModal() {
    const modal = DOMElements.paymentModal;
    if (modal) {
        modal.classList.add('show');
        resetPaymentModal();
        
        // Set user email if available
        const emailInput = document.getElementById('modalUserEmail');
        if (emailInput && AppState.userEmail) {
            emailInput.value = AppState.userEmail;
        }
        
        // Focus email input
        setTimeout(() => {
            if (emailInput) emailInput.focus();
        }, 300);
    }
}

function closePaymentModal() {
    const modal = DOMElements.paymentModal;
    if (modal) {
        modal.classList.remove('show');
        resetPaymentModal();
    }
}

function resetPaymentModal() {
    // Hide all status divs
    ['paymentLoading', 'paymentError', 'paymentSuccess'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });

    // Show payment button and reset state
    if (DOMElements.proceedPaymentBtn) {
        DOMElements.proceedPaymentBtn.style.display = 'block';
        DOMElements.proceedPaymentBtn.disabled = false;
        updatePaymentButtonText();
    }
    
    PaymentConfig.isProcessing = false;
}

function updatePaymentButtonText() {
    if (DOMElements.proceedPaymentBtn) {
        const planData = PaymentConfig.plans[PaymentConfig.selectedPlan];
        DOMElements.proceedPaymentBtn.textContent = `Pay ${planData.currency} ${planData.amount}`;
    }
}

async function initiatePayment() {
    if (PaymentConfig.isProcessing) return;

    const emailInput = document.getElementById('modalUserEmail');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email || !isValidEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return;
    }

    // Update app state with email
    AppState.userEmail = email;
    localStorage.setItem('studypal_user_email', email);

    PaymentConfig.isProcessing = true;
    showPaymentLoading();

    try {
        const planData = PaymentConfig.plans[PaymentConfig.selectedPlan];
        const paymentData = {
            amount: planData.amount,
            currency: planData.currency,
            description: planData.description,
            user_email: email,
            plan_type: PaymentConfig.selectedPlan
        };

        const response = await fetch(API_CONFIG.endpoints.createPayment, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create payment intent');
        }

        const data = await response.json();
        
        // Process payment with IntaSend
        await processIntaSendPayment(data, email);

    } catch (error) {
        console.error('Payment initiation failed:', error);
        showPaymentError(error.message || 'Payment failed. Please try again.');
    }
}

async function processIntaSendPayment(paymentData, email) {
    try {
        // Check if IntaSend is loaded
        if (typeof IntaSend === 'undefined') {
            throw new Error('Payment processor not loaded. Please refresh the page.');
        }

        const intasend = new IntaSend(
            paymentData.publishable_key,
            paymentData.intasend_config.base_url.includes('sandbox')
        );

        const paymentConfig = {
            first_name: email.split('@')[0],
            last_name: 'User',
            email: email,
            phone_number: '+254700000000', // Default phone
            address: '',
            city: '',
            state: '',
            zipcode: '',
            country: 'KE',
            currency: paymentData.intasend_config.currency,
            amount: paymentData.payment_intent.amount,
            narrative: paymentData.payment_intent.description,
            redirect_url: window.location.origin,
            api_ref: paymentData.payment_intent.reference
        };

        intasend.on('COMPLETE', function (results) {
            console.log('Payment completed:', results);
            handlePaymentSuccess(paymentData.payment_intent);
        });

        intasend.on('FAILED', function (results) {
            console.log('Payment failed:', results);
            handlePaymentFailure(results.failed_reason || 'Payment was cancelled or failed');
        });

        intasend.on('IN-PROGRESS', function (results) {
            console.log('Payment in progress:', results);
            showPaymentProcessing();
        });

        // Launch payment
        intasend.collect(paymentConfig);
        hidePaymentLoading();

    } catch (error) {
        console.error('IntaSend processing failed:', error);
        throw error;
    }
}

function handlePaymentSuccess(paymentIntent) {
    // Update user tier
    AppState.userTier = 'premium';
    updatePremiumFeatures();
    updateUIForTier();
    
    // Store premium access locally as backup
    const premiumData = {
        payment_id: paymentIntent.id,
        plan: PaymentConfig.selectedPlan,
        activated_at: new Date().toISOString(),
        expires_at: PaymentConfig.selectedPlan === 'yearly'
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    localStorage.setItem('studypal_premium', JSON.stringify(premiumData));

    // Show success state
    showPaymentSuccess();
    
    // Update UI
    showPremiumIndicator();
    removeUpgradeButton();

    // Close modal after 3 seconds
    setTimeout(() => {
        closePaymentModal();
        showMessage('Welcome to StudyPal Premium! Enjoy unlimited features.', 'success');
        // Refresh saved sets to show newly accessible content
        loadSavedCardSets();
    }, 3000);
}

function handlePaymentFailure(reason) {
    PaymentConfig.isProcessing = false;
    showPaymentError(reason || 'Payment failed. Please try again.');
}

function showPaymentLoading() {
    if (DOMElements.paymentLoading) DOMElements.paymentLoading.style.display = 'block';
    if (DOMElements.paymentError) DOMElements.paymentError.style.display = 'none';
    if (DOMElements.paymentSuccess) DOMElements.paymentSuccess.style.display = 'none';
    if (DOMElements.proceedPaymentBtn) DOMElements.proceedPaymentBtn.disabled = true;
}

function hidePaymentLoading() {
    if (DOMElements.paymentLoading) DOMElements.paymentLoading.style.display = 'none';
    if (DOMElements.proceedPaymentBtn) DOMElements.proceedPaymentBtn.disabled = false;
}

function showPaymentProcessing() {
    if (DOMElements.paymentLoading) {
        DOMElements.paymentLoading.style.display = 'block';
        DOMElements.paymentLoading.innerHTML = '<div class="spinner"></div><p>Processing your payment...</p>';
    }
}

function showPaymentError(message) {
    if (DOMElements.paymentLoading) DOMElements.paymentLoading.style.display = 'none';
    if (DOMElements.paymentError) {
        DOMElements.paymentError.style.display = 'block';
        DOMElements.paymentError.innerHTML = `<p style="color: #f44336;">${message}</p>`;
    }
    if (DOMElements.proceedPaymentBtn) {
        DOMElements.proceedPaymentBtn.disabled = false;
        DOMElements.proceedPaymentBtn.textContent = 'Try Again';
    }
    PaymentConfig.isProcessing = false;
}

function showPaymentSuccess() {
    if (DOMElements.paymentLoading) DOMElements.paymentLoading.style.display = 'none';
    if (DOMElements.paymentError) DOMElements.paymentError.style.display = 'none';
    if (DOMElements.paymentSuccess) {
        DOMElements.paymentSuccess.style.display = 'block';
        DOMElements.paymentSuccess.innerHTML = `
            <div style="text-align: center; color: #4CAF50;">
                <h3>Payment Successful!</h3>
                <p>Your premium subscription is now active.</p>
            </div>
        `;
    }
    if (DOMElements.proceedPaymentBtn) DOMElements.proceedPaymentBtn.style.display = 'none';
}

function removeUpgradeButton() {
    const upgradeBtn = document.querySelector('.upgrade-header-btn');
    if (upgradeBtn) {
        upgradeBtn.remove();
    }
}

// ==========================
// Flashcard Display with Premium Features
// ==========================
function displayFlashcards() {
    if (!DOMElements.flashcardsContainer) return;

    if (!AppState.flashcards.length) {
        DOMElements.flashcardsContainer.innerHTML = `
            <div class="empty-state">
                <span class="icon">📚</span>
                <h3>Ready to Learn?</h3>
                <p>Your AI-generated flashcards will appear here</p>
                ${AppState.userTier === 'free' ? '<small style="color: #666;">Free tier: Up to 5 cards per generation</small>' : ''}
            </div>`;
        if (DOMElements.controls) DOMElements.controls.style.display = 'none';
        if (DOMElements.cardActions) DOMElements.cardActions.style.display = 'none';
        return;
    }

    const card = AppState.flashcards[AppState.currentIndex];
    const difficultyClass = `difficulty-${card.difficulty}`;
    const premiumBadge = AppState.userTier === 'premium' ? '<span class="premium-badge">⭐</span>' : '';
    
    DOMElements.flashcardsContainer.innerHTML = `
        <div class="flashcard ${card.isFlipped ? 'flipped' : ''}" onclick="flipCard()">
            <div class="flashcard-header">
                <span>${card.isFlipped ? '💡' : '❓'}</span>
                <div class="badges">
                    <span class="difficulty-badge ${difficultyClass}">${card.difficulty}</span>
                    ${premiumBadge}
                </div>
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

function previousCard() { 
    if (AppState.currentIndex > 0) { 
        AppState.currentIndex--; 
        displayFlashcards(); 
    } 
}

function nextCard() { 
    if (AppState.currentIndex < AppState.flashcards.length - 1) { 
        AppState.currentIndex++; 
        displayFlashcards(); 
    } 
}

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
// Utility Functions
// ==========================
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

async function checkPaymentStatus(paymentId) {
    try {
        const response = await fetch(`${API_CONFIG.endpoints.paymentStatus}/${paymentId}/status`);
        if (response.ok) {
            return await response.json();
        }
        return { status: 'unknown' };
    } catch (error) {
        console.error('Payment status check failed:', error);
        return { status: 'unknown' };
    }
}

// ==========================
// Plan Selection
// ==========================
function setupPriceCardHandlers() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.price-card')) {
            const card = e.target.closest('.price-card');
            const plan = card.dataset.plan;

            // Remove active class from all cards
            document.querySelectorAll('.price-card').forEach(c => c.classList.remove('active'));

            // Add active class to clicked card
            card.classList.add('active');

            // Update selected plan
            PaymentConfig.selectedPlan = plan;
            updatePaymentButtonText();
        }
    });
}

// ==========================
// Keyboard Shortcuts
// ==========================
function handleKeyboardShortcuts(e) {
    if (['TEXTAREA', 'INPUT'].includes(e.target.tagName)) return;
    
    switch (e.key) {
        case 'ArrowLeft': 
            e.preventDefault(); 
            previousCard(); 
            break;
        case 'ArrowRight': 
            e.preventDefault(); 
            nextCard(); 
            break;
        case ' ': 
            e.preventDefault(); 
            flipCard(); 
            break;
        case 'g': 
            if (e.ctrlKey || e.metaKey) { 
                e.preventDefault(); 
                generateFlashcards(); 
            } 
            break;
        case 's': 
            if (e.ctrlKey || e.metaKey) { 
                e.preventDefault(); 
                saveFlashcards(); 
            } 
            break;
        case 'r': 
            if (e.ctrlKey || e.metaKey) { 
                e.preventDefault(); 
                shuffleCards(); 
            } 
            break;
        case 'Escape': 
            if (AppState.sidebarOpen) {
                toggleSidebar();
            } else if (DOMElements.paymentModal && DOMElements.paymentModal.classList.contains('show')) {
                closePaymentModal();
            }
            break;
    }
}

// ==========================
// Initialization
// ==========================
document.addEventListener('DOMContentLoaded', () => {
    initializeDOMElements();
    initializeUser();
    updateStats();
    updateWordCount();
    setupEventListeners();
    setupPriceCardHandlers();
    setTimeout(() => {
        loadSavedCardSets();
        // Check for premium features after loading
        if (AppState.userTier === 'premium') {
            showPremiumIndicator();
        } else {
            addUpgradeButton();
        }
    }, 100);
});

function setupEventListeners() {
    if (DOMElements.studyNotes) {
        DOMElements.studyNotes.addEventListener('input', updateWordCount);
    }
    
    // User email input handler
    if (DOMElements.userEmail) {
        DOMElements.userEmail.addEventListener('change', setUserEmail);
        DOMElements.userEmail.addEventListener('blur', setUserEmail);
    }
    
    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    // Click outside sidebar to close
    document.addEventListener('click', e => {
        if (AppState.sidebarOpen && DOMElements.sidebar && DOMElements.sidebarToggle &&
            !DOMElements.sidebar.contains(e.target) && !DOMElements.sidebarToggle.contains(e.target)) {
            toggleSidebar();
        }
        
        // Click outside payment modal to close
        const modal = DOMElements.paymentModal;
        if (modal && modal.classList.contains('show') && e.target === modal) {
            closePaymentModal();
        }
    });
}

// ==========================
// Debug and Testing Functions
// ==========================
function createFallbackCards() {
    const text = DOMElements.studyNotes.value.trim();
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const fallback = [
        { question: "What is the main topic discussed?", answer: sentences[0] || "Key concepts from your study material." },
        { question: "Summarize the key points.", answer: sentences.slice(0, 2).join('. ') || "Summary of main ideas." }
    ];
    return fallback.map((c, i) => ({ 
        ...c, 
        id: i + 1, 
        difficulty: 'medium', 
        type: 'general', 
        isFlipped: false 
    }));
}

// ==========================
// Global Exports for Testing
// ==========================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        generateFlashcards,
        flipCard,
        nextCard,
        previousCard,
        shuffleCards,
        saveFlashcards,
        loadSavedSet,
        deleteSavedSet,
        toggleSidebar,
        openPaymentModal,
        closePaymentModal,
        checkUserTier,
        setUserEmail
    };
}

// Global window object for console debugging
window.StudyBuddy = {
    state: AppState,
    config: PaymentConfig,
    api: API_CONFIG,
    
    // User functions
    setEmail: (email) => {
        if (DOMElements.userEmail) DOMElements.userEmail.value = email;
        setUserEmail();
    },
    checkTier: checkUserTier,
    
    // Payment functions
    openPayment: openPaymentModal,
    closePayment: closePaymentModal,
    
    // Demo functions
    generateDemo: () => { 
        if (DOMElements.studyNotes) { 
            DOMElements.studyNotes.value = "Machine learning is a subset of artificial intelligence that focuses on algorithms and statistical models that enable computers to improve their performance on a specific task through experience, without being explicitly programmed for every scenario."; 
            updateWordCount(); 
            generateFlashcards(); 
        } 
    },
    loadDemo: loadSavedCardSets,
    
    // Admin functions
    clearData: () => { 
        localStorage.removeItem('studyBuddyCardSets'); 
        localStorage.removeItem('studypal_premium');
        localStorage.removeItem('studypal_user_email');
        showMessage('All local data cleared!', 'success'); 
        location.reload();
    },
    
    // Debug functions
    setPremium: () => {
        const premiumData = {
            payment_id: 'debug_123',
            plan: 'monthly',
            activated_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        localStorage.setItem('studypal_premium', JSON.stringify(premiumData));
        AppState.userTier = 'premium';
        updatePremiumFeatures();
        updateUIForTier();
        showMessage('Debug: Premium activated!', 'success');
    },
    
    removePremium: () => {
        localStorage.removeItem('studypal_premium');
        AppState.userTier = 'free';
        updatePremiumFeatures();
        updateUIForTier();
        hidePremiumIndicator();
        addUpgradeButton();
        showMessage('Debug: Premium removed!', 'success');
    }
};

// ==========================
// Premium Content Validation
// ==========================
async function validatePremiumAccess(paymentId) {
    if (!paymentId || !AppState.userEmail) return false;
    
    try {
        const response = await fetch(API_CONFIG.endpoints.validatePremium, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                payment_id: paymentId,
                user_email: AppState.userEmail
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.is_premium) {
                AppState.userTier = data.tier;
                updatePremiumFeatures();
                return true;
            }
        }
    } catch (error) {
        console.error('Premium validation failed:', error);
    }
    
    return false;
}

// ==========================
// Enhanced Error Handling
// ==========================
function handleAPIError(error, context = 'Operation') {
    console.error(`${context} failed:`, error);
    
    if (error.message.includes('403') || error.message.includes('Premium subscription required')) {
        showUpgradePrompt('This feature requires a premium subscription.');
        return;
    }
    
    if (error.message.includes('401') || error.message.includes('unauthorized')) {
        showMessage('Please check your email and try again.', 'error');
        return;
    }
    
    if (error.message.includes('network') || error.message.includes('fetch')) {
        showMessage('Network error. Please check your connection and try again.', 'error');
        return;
    }
    
    showMessage(error.message || `${context} failed. Please try again.`, 'error');
}

// ==========================
// Local Storage Fallback with Tier Awareness
// ==========================
function saveToLocalStorage(dataToSave) {
    try {
        const local = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
        
        // Add tier information
        dataToSave.tier_required = 'free';
        dataToSave.can_access = true;
        dataToSave.user_email = AppState.userEmail;
        
        local.push(dataToSave);
        localStorage.setItem('studyBuddyCardSets', JSON.stringify(local));
        
        AppState.savedSets++;
        updateStats();
        loadSavedCardSets();
        showMessage(`Saved "${dataToSave.title}" locally`, 'success');
        
    } catch (error) {
        console.error('Local storage save failed:', error);
        showMessage('Failed to save flashcards', 'error');
    }
}

function loadFromLocalStorage() {
    try {
        const local = JSON.parse(localStorage.getItem('studyBuddyCardSets') || '[]');
        return local.map(set => ({
            ...set,
            can_access: true,
            is_locked: false,
            tier_required: set.tier_required || 'free'
        }));
    } catch (error) {
        console.error('Local storage load failed:', error);
        return [];
    }
}

// ==========================
// Initialization with Error Recovery
// ==========================
async function initializeApp() {
    try {
        initializeDOMElements();
        initializeUser();
        updateStats();
        updateWordCount();
        setupEventListeners();
        setupPriceCardHandlers();
        
        // Load saved sets after user initialization
        await loadSavedCardSets();
        
        // Set up premium features
        if (AppState.userTier === 'premium') {
            showPremiumIndicator();
            removeUpgradeButton();
        } else {
            addUpgradeButton();
        }
        
    } catch (error) {
        console.error('App initialization failed:', error);
        showMessage('App initialization failed. Some features may not work correctly.', 'error');
    }
}

// Replace the original DOMContentLoaded listener
document.addEventListener('DOMContentLoaded', initializeApp);