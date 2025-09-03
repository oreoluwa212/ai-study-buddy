// StudyPal - Production Frontend Script
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

const PaymentConfig = {
    plans: {
        monthly: { amount: 500, currency: 'KES', period: 'month', description: 'StudyPal Premium - Monthly' },
        yearly: { amount: 5000, currency: 'KES', period: 'year', description: 'StudyPal Premium - Yearly' }
    },
    selectedPlan: 'monthly',
    isProcessing: false,
    checkoutWindow: null
};

const DOMElements = {};

function initializeDOMElements() {
    const ids = [
        'studyNotes', 'generateBtn', 'saveBtn', 'loading', 'messageArea', 'flashcardsContainer',
        'controls', 'cardActions', 'wordCount', 'cardsGenerated', 'studySessions', 'savedSets',
        'currentCard', 'totalCards', 'prevBtn', 'nextBtn', 'sidebar', 'sidebarContent',
        'sidebarToggle', 'loadingSaved', 'paymentModal', 'proceedPaymentBtn',
        'paymentLoading', 'paymentError', 'paymentSuccess', 'modalUserEmail'
    ];

    ids.forEach(id => {
        DOMElements[id] = document.getElementById(id);
        if (!DOMElements[id]) console.warn(`Missing DOM element: ${id}`);
    });
}

function initializeUser() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlEmail = urlParams.get('email');

    const storedEmail = localStorage.getItem('studypal_user_email') || urlEmail;
    if (storedEmail) {
        AppState.userEmail = storedEmail;
        const emailInput = document.querySelector('#modalUserEmail');
        if (emailInput) {
            emailInput.value = storedEmail;
        }
    }

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
    if (DOMElements.generateBtn) {
        const maxCards = AppState.premiumFeatures.maxCards;
        if (!AppState.isGenerating) {
            DOMElements.generateBtn.textContent = `Generate Flashcards (Max: ${maxCards})`;
        }
    }

    if (AppState.userTier !== 'premium') {
        addUpgradeButton();
    }
}

function setUserEmail(email) {
    if (!email) {
        const emailInput = DOMElements.modalUserEmail;
        email = emailInput ? emailInput.value.trim() : '';
    }

    if (!email) {
        showMessage('Please enter your email address', 'error');
        return false;
    }

    if (!isValidEmail(email)) {
        showMessage('Please enter a valid email address', 'error');
        return false;
    }

    AppState.userEmail = email;
    localStorage.setItem('studypal_user_email', email);
    checkUserTier();
    showMessage('Email saved! Checking your tier...', 'success');
    return true;
}

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
        indicator.innerHTML = 'Premium Active';
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

async function initiatePayment() {
    if (PaymentConfig.isProcessing) return;

    const emailInput = DOMElements.modalUserEmail;
    const email = emailInput ? emailInput.value.trim() : '';

    if (!setUserEmail(email)) {
        return;
    }

    PaymentConfig.isProcessing = true;
    showPaymentLoading();

    try {
        const planData = PaymentConfig.plans[PaymentConfig.selectedPlan];
        const paymentData = {
            amount: planData.amount,
            currency: planData.currency,
            description: planData.description,
            user_email: email,
            plan_type: PaymentConfig.selectedPlan,
            redirect_url: window.location.origin + '/payment-success',
            cancel_url: window.location.origin + '/payment-cancel'
        };

        console.log('Creating payment...', paymentData);
        const response = await fetch(API_CONFIG.endpoints.createPayment, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create payment');
        }

        const data = await response.json();
        console.log('Payment created:', data);

        redirectToCheckout(data);

    } catch (error) {
        console.error('Payment creation failed:', error);
        showPaymentError(error.message || 'Payment failed. Please try again.');
    }
}

function redirectToCheckout(paymentData) {
    try {
        showPaymentRedirect();

        const checkoutUrl = paymentData.checkout_url ||
            `https://sandbox.intasend.com/checkout/${paymentData.payment_intent.reference}/`;

        const windowFeatures = 'width=800,height=600,scrollbars=yes,resizable=yes,status=yes';
        PaymentConfig.checkoutWindow = window.open(checkoutUrl, 'intasend_checkout', windowFeatures);

        if (!PaymentConfig.checkoutWindow) {
            showPaymentError('Popup blocked. Redirecting to payment page...');
            setTimeout(() => {
                window.location.href = checkoutUrl;
            }, 2000);
            return;
        }

        const checkInterval = setInterval(() => {
            try {
                if (PaymentConfig.checkoutWindow.closed) {
                    clearInterval(checkInterval);
                    setTimeout(() => {
                        checkPaymentStatusAfterClose(paymentData.payment_intent.id);
                    }, 1000);
                }
            } catch (e) {
                // Cross-origin error is expected
            }
        }, 1000);

        setTimeout(() => {
            if (PaymentConfig.checkoutWindow && !PaymentConfig.checkoutWindow.closed) {
                PaymentConfig.checkoutWindow.close();
                clearInterval(checkInterval);
                showPaymentTimeout();
            }
        }, 900000);

    } catch (error) {
        console.error('Checkout redirect failed:', error);
        showPaymentError('Failed to open payment page. Please try again.');
    }
}

async function checkPaymentStatusAfterClose(paymentId) {
    try {
        showPaymentStatusCheck();

        const response = await fetch(`${API_CONFIG.endpoints.paymentStatus}/${paymentId}/status`);

        if (response.ok) {
            const data = await response.json();
            console.log('Payment status:', data);

            if (data.status === 'completed') {
                handlePaymentSuccess({ id: paymentId }, data);
                return;
            } else if (data.status === 'failed' || data.status === 'cancelled') {
                handlePaymentFailure('Payment was not completed.');
                return;
            }
        }

        showPaymentConfirmation(paymentId);

    } catch (error) {
        console.error('Status check failed:', error);
        showPaymentConfirmation(paymentId);
    }
}

function showPaymentLoading() {
    if (DOMElements.paymentLoading) {
        DOMElements.paymentLoading.style.display = 'block';
        DOMElements.paymentLoading.innerHTML = `
            <div class="spinner"></div>
            <p>Setting up your payment...</p>
        `;
    }
    hideOtherPaymentStates();
    if (DOMElements.proceedPaymentBtn) DOMElements.proceedPaymentBtn.disabled = true;
}

function showPaymentRedirect() {
    if (DOMElements.paymentLoading) {
        DOMElements.paymentLoading.style.display = 'block';
        DOMElements.paymentLoading.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 20px;">🚀</div>
                <h4>Opening Payment Page...</h4>
                <p>You'll be taken to IntaSend's secure payment page</p>
                <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <strong>Payment Methods Available:</strong>
                    <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
                        <li>M-Pesa</li>
                        <li>Airtel Money</li>
                        <li>Credit/Debit Cards</li>
                        <li>Bank Transfer</li>
                    </ul>
                </div>
                <p><small>Complete your payment and return to this page</small></p>
            </div>
        `;
    }
}

function showPaymentStatusCheck() {
    if (DOMElements.paymentLoading) {
        DOMElements.paymentLoading.style.display = 'block';
        DOMElements.paymentLoading.innerHTML = `
            <div class="spinner"></div>
            <h4>Checking Payment Status...</h4>
            <p>Please wait while we confirm your payment</p>
        `;
    }
}

function showPaymentConfirmation(paymentId) {
    if (DOMElements.paymentLoading) {
        DOMElements.paymentLoading.style.display = 'block';
        DOMElements.paymentLoading.innerHTML = `
            <div style="text-align: center;">
                <div style="font-size: 48px; margin-bottom: 20px;">❓</div>
                <h4>Did you complete the payment?</h4>
                <p style="margin-bottom: 20px;">We couldn't automatically detect your payment status</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="handlePaymentSuccess({id: '${paymentId}'})" 
                            style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin: 5px;">
                        Yes, I completed payment
                    </button>
                    <button onclick="handlePaymentFailure('Payment cancelled')" 
                            style="background: #f44336; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin: 5px;">
                        No, I cancelled
                    </button>
                    <button onclick="checkPaymentStatusAfterClose('${paymentId}')" 
                            style="background: #2196F3; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin: 5px;">
                        Check again
                    </button>
                </div>
                <p><small style="color: #666; margin-top: 15px; display: block;">
                    Don't worry - if you paid, your premium access will be activated
                </small></p>
            </div>
        `;
    }
}

function showPaymentTimeout() {
    showPaymentError('Payment session expired. If you completed the payment, please click "Check Status" or contact support.');
}

function showPaymentError(message) {
    PaymentConfig.isProcessing = false;
    if (DOMElements.paymentError) {
        DOMElements.paymentError.style.display = 'block';
        DOMElements.paymentError.innerHTML = `
            <div style="color: #f44336; padding: 15px; background: #ffebee; border-radius: 8px; border-left: 4px solid #f44336;">
                <strong>Payment Error</strong>
                <p style="margin: 10px 0 0 0;">${message}</p>
            </div>
        `;
    }
    if (DOMElements.paymentLoading) DOMElements.paymentLoading.style.display = 'none';
    if (DOMElements.paymentSuccess) DOMElements.paymentSuccess.style.display = 'none';
    if (DOMElements.proceedPaymentBtn) {
        DOMElements.proceedPaymentBtn.disabled = false;
        DOMElements.proceedPaymentBtn.textContent = 'Try Again';
    }
}

function showPaymentSuccess() {
    hideOtherPaymentStates();
    if (DOMElements.paymentSuccess) {
        DOMElements.paymentSuccess.style.display = 'block';
        DOMElements.paymentSuccess.innerHTML = `
            <div style="text-align: center; color: #4CAF50;">
                <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                <h3 style="margin-bottom: 10px; color: #2e7d32;">Payment Successful!</h3>
                <p style="color: #4CAF50;">Your premium subscription is now active.</p>
                <p><small style="color: #666;">Enjoy unlimited flashcards and advanced features!</small></p>
            </div>
        `;
    }
    if (DOMElements.proceedPaymentBtn) DOMElements.proceedPaymentBtn.style.display = 'none';
}

function hideOtherPaymentStates() {
    if (DOMElements.paymentError) DOMElements.paymentError.style.display = 'none';
    if (DOMElements.paymentSuccess) DOMElements.paymentSuccess.style.display = 'none';
}

function handlePaymentSuccess(paymentIntent, results = {}) {
    console.log('Processing payment success:', paymentIntent, results);

    PaymentConfig.isProcessing = false;

    if (PaymentConfig.checkoutWindow && !PaymentConfig.checkoutWindow.closed) {
        PaymentConfig.checkoutWindow.close();
    }

    AppState.userTier = 'premium';
    updatePremiumFeatures();
    updateUIForTier();

    const premiumData = {
        payment_id: paymentIntent.id,
        plan: PaymentConfig.selectedPlan,
        activated_at: new Date().toISOString(),
        expires_at: PaymentConfig.selectedPlan === 'yearly'
            ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
    localStorage.setItem('studypal_premium', JSON.stringify(premiumData));

    showPaymentSuccess();
    showPremiumIndicator();
    removeUpgradeButton();

    setTimeout(() => {
        closePaymentModal();
        showMessage('Welcome to StudyPal Premium! Enjoy unlimited features.', 'success');
        loadSavedCardSets();
    }, 3000);
}

function handlePaymentFailure(reason) {
    console.log('Processing payment failure:', reason);
    PaymentConfig.isProcessing = false;
    if (PaymentConfig.checkoutWindow && !PaymentConfig.checkoutWindow.closed) {
        PaymentConfig.checkoutWindow.close();
    }
    showPaymentError(reason || 'Payment failed. Please try again.');
}

function openPaymentModal() {
    const modal = DOMElements.paymentModal;
    if (modal) {
        modal.classList.add('show');
        resetPaymentModal();

        const emailInput = DOMElements.modalUserEmail;
        if (emailInput && AppState.userEmail) {
            emailInput.value = AppState.userEmail;
        }

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
    if (PaymentConfig.checkoutWindow && !PaymentConfig.checkoutWindow.closed) {
        PaymentConfig.checkoutWindow.close();
    }
}

function resetPaymentModal() {
    hideOtherPaymentStates();
    if (DOMElements.paymentLoading) DOMElements.paymentLoading.style.display = 'none';

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
        DOMElements.proceedPaymentBtn.innerHTML = `
            <span>Pay ${planData.currency} ${planData.amount}</span>
            <small style="display: block; font-size: 0.8em;">via IntaSend</small>
        `;
    }
}

function setupPriceCardHandlers() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.price-card')) {
            const card = e.target.closest('.price-card');
            const plan = card.dataset.plan;

            document.querySelectorAll('.price-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');

            PaymentConfig.selectedPlan = plan;
            updatePaymentButtonText();
        }
    });
}

function showUpgradePrompt(message) {
    showMessage(message, 'error');

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
        upgradeBtn.textContent = 'Upgrade to Premium';
        upgradeBtn.onclick = openPaymentModal;
        upgradeBtn.onmouseover = () => upgradeBtn.style.transform = 'scale(1.05)';
        upgradeBtn.onmouseout = () => upgradeBtn.style.transform = 'scale(1)';

        header.style.position = 'relative';
        header.appendChild(upgradeBtn);
    }
}

function removeUpgradeButton() {
    const upgradeBtn = document.querySelector('.upgrade-header-btn');
    if (upgradeBtn) {
        upgradeBtn.remove();
    }
}

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

async function generateFlashcards() {
    if (!DOMElements.studyNotes) return;
    const text = DOMElements.studyNotes.value.trim();
    if (!text || text.length < 30) return showMessage('Enter at least 30 characters', 'error');

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
        updateUIForTier();

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

async function saveFlashcards() {
    if (!AppState.flashcards.length) return showMessage('No flashcards to save!', 'error');

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
        tier_required: 'free'
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

function markCard(status) {
    if (!AppState.flashcards.length) return;
    const cardId = AppState.flashcards[AppState.currentIndex].id;
    AppState.cardStatuses.set(cardId, status);

    showMessage(`Card marked as "${status}"`, 'success');

    if (AppState.currentIndex < AppState.flashcards.length - 1) {
        setTimeout(() => nextCard(), 500);
    }
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

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

document.addEventListener('DOMContentLoaded', async () => {
    console.log('StudyPal initializing...');

    initializeDOMElements();
    initializeUser();
    updateStats();
    updateWordCount();
    setupEventListeners();
    setupPriceCardHandlers();

    setTimeout(async () => {
        await loadSavedCardSets();
        if (AppState.userTier === 'premium') {
            showPremiumIndicator();
            removeUpgradeButton();
        } else {
            addUpgradeButton();
        }
    }, 100);

    console.log('StudyPal initialized successfully');
});

function setupEventListeners() {
    if (DOMElements.studyNotes) {
        DOMElements.studyNotes.addEventListener('input', updateWordCount);
    }

    document.addEventListener('keydown', handleKeyboardShortcuts);

    document.addEventListener('click', e => {
        if (AppState.sidebarOpen && DOMElements.sidebar && DOMElements.sidebarToggle &&
            !DOMElements.sidebar.contains(e.target) && !DOMElements.sidebarToggle.contains(e.target)) {
            toggleSidebar();
        }

        const modal = DOMElements.paymentModal;
        if (modal && modal.classList.contains('show') && e.target === modal) {
            closePaymentModal();
        }
    });
}

window.StudyBuddy = {
    state: AppState,
    config: PaymentConfig,
    api: API_CONFIG,
    setEmail: (email) => setUserEmail(email),
    checkTier: checkUserTier,
    openPayment: openPaymentModal,
    closePayment: closePaymentModal,
    generateDemo: () => {
        if (DOMElements.studyNotes) {
            DOMElements.studyNotes.value = "Machine learning is a subset of artificial intelligence that focuses on algorithms and statistical models that enable computers to improve their performance on a specific task through experience, without being explicitly programmed for every scenario.";
            updateWordCount();
            generateFlashcards();
        }
    },
    loadDemo: loadSavedCardSets,
    clearData: () => {
        localStorage.removeItem('studyBuddyCardSets');
        localStorage.removeItem('studypal_premium');
        localStorage.removeItem('studypal_user_email');
        showMessage('All local data cleared!', 'success');
        location.reload();
    },
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