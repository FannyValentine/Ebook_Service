// rentals.js
import { supabase } from './supabase.js';
import { 
    registerUser, 
    loginUser, 
    logoutUser, 
    checkCurrentUser,
    getCurrentUser,
    resetPassword
} from './auth.js';

// ========== СОСТОЯНИЕ ==========
let allRentals = [];
let filteredRentals = [];

// ========== КОРЗИНА ==========
let cart = JSON.parse(localStorage.getItem('cart')) || [];

function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartBadge();
    renderCartDropdown();
}

function updateCartBadge() {
    const badge = document.querySelector('.cart-badge');
    if (badge) {
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        badge.innerText = totalItems;
        badge.style.display = totalItems > 0 ? 'flex' : 'none';
    }
}

function showToast(title, message, type = 'success') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-shopping-cart'}"></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    
    document.body.appendChild(toast);
    
    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    
    setTimeout(() => {
        if (toast && toast.remove) toast.remove();
    }, 3000);
}

function addToCart(book, type, price) {
    const existingItem = cart.find(item => item.id === book.id && item.type === type);
    
    if (existingItem) {
        existingItem.quantity++;
        showToast('Корзина обновлена', `${book.title} (${type === 'rent' ? 'Аренда' : 'Покупка'}) добавлено еще раз`, 'success');
    } else {
        cart.push({
            id: book.id,
            title: book.title,
            author: book.author,
            cover_image: book.cover_image,
            type: type,
            price: price,
            quantity: 1
        });
        showToast('Добавлено в корзину', `${book.title} - ${type === 'rent' ? 'Аренда' : 'Покупка'} за ${price} ₽`, 'success');
    }
    
    saveCart();
}

function removeFromCart(itemId, type) {
    cart = cart.filter(item => !(item.id === itemId && item.type === type));
    saveCart();
    showToast('Удалено из корзины', 'Товар удален из корзины', 'success');
}

function renderCartDropdown() {
    const cartItemsContainer = document.getElementById('cartItems');
    const cartTotalSpan = document.getElementById('cartTotal');
    
    if (!cartItemsContainer) return;
    
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="cart-empty">
                <i class="fas fa-shopping-cart"></i>
                <p>Корзина пуста</p>
                <small>Добавьте книги из каталога</small>
            </div>
        `;
        if (cartTotalSpan) cartTotalSpan.textContent = '0 ₽';
        return;
    }
    
    let total = 0;
    cartItemsContainer.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        const typeText = item.type === 'rent' ? 'Аренда' : 'Покупка';
        return `
            <div class="cart-item">
                <div class="cart-item-image">
                    <img src="${item.cover_image || 'https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖'}" 
                         alt="${escapeHtml(item.title)}"
                         onerror="this.src='https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖'">
                </div>
                <div class="cart-item-details">
                    <div class="cart-item-title">${escapeHtml(item.title)}</div>
                    <div class="cart-item-author">${escapeHtml(item.author || 'Автор не указан')}</div>
                    <div class="cart-item-price">
                        ${item.price} ₽ × ${item.quantity}
                        <span class="cart-item-type">${typeText}</span>
                    </div>
                </div>
                <button class="cart-item-remove" data-id="${item.id}" data-type="${item.type}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }).join('');
    
    if (cartTotalSpan) cartTotalSpan.textContent = total + ' ₽';
    
    document.querySelectorAll('.cart-item-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            const type = btn.dataset.type;
            removeFromCart(id, type);
        });
    });
}

function toggleCart() {
    const dropdown = document.getElementById('cartDropdown');
    if (dropdown) {
        dropdown.classList.toggle('show');
        renderCartDropdown();
    }
}

async function checkout() {
    if (cart.length === 0) {
        showToast('Корзина пуста', 'Добавьте книги перед оформлением', 'error');
        return;
    }
    
    const user = getCurrentUser();
    if (!user) {
        showToast('Требуется авторизация', 'Войдите в аккаунт для оформления заказа', 'error');
        setTimeout(() => openModal(), 1500);
        return;
    }
    
    showToast('Заказ оформлен', 'Спасибо за покупку!', 'success');
    cart = [];
    saveCart();
    toggleCart();
}

// ========== ЗАГРУЗКА АРЕНД ==========
async function loadRentals() {
    const user = getCurrentUser();
    if (!user) {
        allRentals = [];
        filteredRentals = [];
        renderRentals();
        return;
    }
    
    try {
        const { data: rentals, error } = await supabase
            .from('rentals')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Ошибка загрузки аренд:', error);
            allRentals = [];
            filteredRentals = [];
            renderRentals();
            return;
        }
        
        allRentals = rentals || [];
        filteredRentals = [...allRentals];
        renderRentals();
        console.log(`✅ Загружено ${allRentals.length} аренд`);
    } catch (error) {
        console.error('Ошибка:', error);
        allRentals = [];
        filteredRentals = [];
        renderRentals();
    }
}

// ========== ФИЛЬТРАЦИЯ ==========
function filterRentals() {
    const status = document.getElementById('statusFilter').value;
    
    if (status === 'all') {
        filteredRentals = [...allRentals];
    } else {
        filteredRentals = allRentals.filter(rental => {
            if (status === 'active') {
                return rental.is_active === true && !rental.is_returned;
            } else if (status === 'expired') {
                return rental.is_active === true && !rental.is_returned && new Date(rental.end_date) < new Date();
            } else if (status === 'returned') {
                return rental.is_returned === true;
            }
            return true;
        });
    }
    
    renderRentals();
}

// ========== ФУНКЦИИ ДЛЯ РАБОТЫ С АРЕНДОЙ ==========

// Возврат книги
async function returnBook(rentalId) {
    if (!confirm('Вы уверены, что хотите вернуть эту книгу?')) return;
    
    try {
        const { error } = await supabase
            .from('rentals')
            .update({ 
                is_active: false, 
                is_returned: true,
                updated_at: new Date()
            })
            .eq('id', rentalId);
        
        if (error) {
            console.error('Ошибка возврата:', error);
            showToast('Ошибка', 'Не удалось вернуть книгу', 'error');
            return;
        }
        
        showToast('Книга возвращена', 'Спасибо, что воспользовались нашей библиотекой!', 'success');
        await loadRentals();
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Ошибка', 'Не удалось вернуть книгу', 'error');
    }
}

// Продление аренды
async function extendRental(rentalId, currentEndDate) {
    const days = parseInt(prompt('На сколько дней продлить аренду? (7, 14 или 30 дней)', '7'));
    
    if (!days || isNaN(days) || days <= 0) {
        return;
    }
    
    const validDays = [7, 14, 30];
    if (!validDays.includes(days)) {
        showToast('Ошибка', 'Выберите 7, 14 или 30 дней', 'error');
        return;
    }
    
    const newEndDate = new Date(currentEndDate);
    newEndDate.setDate(newEndDate.getDate() + days);
    
    try {
        const { error } = await supabase
            .from('rentals')
            .update({ 
                end_date: newEndDate.toISOString(),
                updated_at: new Date()
            })
            .eq('id', rentalId);
        
        if (error) {
            console.error('Ошибка продления:', error);
            showToast('Ошибка', 'Не удалось продлить аренду', 'error');
            return;
        }
        
        showToast('Аренда продлена', `Книга доступна до ${newEndDate.toLocaleDateString()}`, 'success');
        await loadRentals();
    } catch (error) {
        console.error('Ошибка:', error);
        showToast('Ошибка', 'Не удалось продлить аренду', 'error');
    }
}

// ========== ОТРИСОВКА ==========
function renderRentals() {
    const container = document.getElementById('rentalsGrid');
    const emptyState = document.getElementById('emptyState');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!container) return;
    
    const now = new Date();
    
    if (filteredRentals.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (resultsCount) resultsCount.textContent = 'Нет аренд';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (resultsCount) resultsCount.textContent = `${filteredRentals.length} аренд`;
    
    container.innerHTML = filteredRentals.map(rental => {
        const endDate = new Date(rental.end_date);
        const daysLeft = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
        
        let statusClass = 'active';
        let statusText = 'Активна';
        let daysLeftClass = 'green';
        let daysLeftText = `${daysLeft} дн.`;
        
        if (rental.is_returned) {
            statusClass = 'returned';
            statusText = 'Возвращена';
            daysLeftClass = 'green';
            daysLeftText = 'Возвращена';
        } else if (daysLeft < 0) {
            statusClass = 'expired';
            statusText = 'Просрочена';
            daysLeftClass = 'red';
            daysLeftText = `Просрочена на ${Math.abs(daysLeft)} дн.`;
        } else if (daysLeft <= 3) {
            statusClass = 'expiring';
            statusText = 'Скоро закончится';
            daysLeftClass = 'yellow';
            daysLeftText = `${daysLeft} дн.`;
        } else {
            statusClass = 'active';
            statusText = 'Активна';
            daysLeftClass = 'green';
            daysLeftText = `${daysLeft} дн.`;
        }
        
        const startDate = new Date(rental.start_date);
        const endDateFormatted = endDate.toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        
        const canExtend = !rental.is_returned && rental.is_active && daysLeft > 0;
        const canReturn = !rental.is_returned && rental.is_active;
        
        return `
            <div class="rental-card">
                <div class="rental-cover">
                    <img src="${rental.book_cover || 'https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖'}" 
                         alt="${escapeHtml(rental.book_title)}"
                         onerror="this.src='https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖'">
                    <span class="rental-status ${statusClass}">${statusText}</span>
                </div>
                <div class="rental-info">
                    <div class="rental-title">${escapeHtml(rental.book_title)}</div>
                    <div class="rental-author">${escapeHtml(rental.book_author)}</div>
                    <div class="rental-details">
                        <div class="detail-item">
                            <i class="fas fa-calendar-day"></i>
                            <span>Аренда до: ${endDateFormatted}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-clock"></i>
                            <span>Дней: ${rental.rental_days}</span>
                        </div>
                        <div class="detail-item">
                            <i class="fas fa-ruble-sign"></i>
                            <span>Цена: ${rental.rental_price} ₽</span>
                        </div>
                        <div class="detail-item">
                            <span class="rental-days-left ${daysLeftClass}">${daysLeftText}</span>
                        </div>
                    </div>
                    ${!rental.is_returned ? `
                        <div class="rental-actions">
                            <button class="btn-return" onclick="window.returnBook(${rental.id})" ${!canReturn ? 'disabled' : ''}>
                                <i class="fas fa-undo"></i> Вернуть
                            </button>
                            <button class="btn-extend" onclick="window.extendRental(${rental.id}, '${rental.end_date}')" ${!canExtend ? 'disabled' : ''}>
                                <i class="fas fa-plus"></i> Продлить
                            </button>
                        </div>
                    ` : `
                        <div style="text-align: center; padding: 8px 0; color: #5a6e7c; font-size: 0.9rem;">
                            <i class="fas fa-check-circle" style="color: #10b981;"></i>
                            Книга возвращена
                        </div>
                    `}
                </div>
            </div>
        `;
    }).join('');
    
    // Добавляем обработчики для кнопок
    document.querySelectorAll('.btn-return').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(btn.dataset.id || btn.onclick?.toString().match(/\d+/)?.[0]);
            if (id) returnBook(id);
        });
    });
    
    document.querySelectorAll('.btn-extend').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = parseInt(btn.dataset.id || btn.onclick?.toString().match(/\d+/)?.[0]);
            const endDate = btn.dataset.endDate;
            if (id && endDate) extendRental(id, endDate);
        });
    });
}

// Глобальные функции для inline обработчиков
window.returnBook = returnBook;
window.extendRental = extendRental;

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function setupSearch() {
    const searchToggle = document.getElementById('searchToggle');
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    
    if (searchToggle && searchBar) {
        searchToggle.addEventListener('click', () => {
            searchBar.classList.toggle('open');
            if (searchBar.classList.contains('open')) {
                searchInput?.focus();
            }
        });
    }
    
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const query = e.target.value.toLowerCase();
                if (query.length === 0) {
                    filteredRentals = [...allRentals];
                } else {
                    filteredRentals = allRentals.filter(rental => 
                        rental.book_title.toLowerCase().includes(query) || 
                        rental.book_author.toLowerCase().includes(query)
                    );
                }
                renderRentals();
            }, 500);
        });
    }
}

function mobileMenu() {
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.querySelector('.nav');
    const actions = document.querySelector('.header-actions');
    
    if (btn && nav && actions) {
        let isOpen = false;
        btn.addEventListener('click', () => {
            if (!isOpen) {
                nav.style.display = 'flex';
                actions.style.display = 'flex';
                nav.style.flexDirection = 'column';
                nav.style.position = 'absolute';
                nav.style.top = '70px';
                nav.style.left = '0';
                nav.style.width = '100%';
                nav.style.backgroundColor = 'white';
                nav.style.padding = '20px';
                nav.style.gap = '16px';
                actions.style.position = 'absolute';
                actions.style.top = '200px';
                actions.style.left = '0';
                actions.style.width = '100%';
                actions.style.justifyContent = 'center';
                actions.style.backgroundColor = 'white';
                actions.style.padding = '16px';
                isOpen = true;
            } else {
                nav.style.display = '';
                actions.style.display = '';
                nav.style = '';
                actions.style = '';
                isOpen = false;
            }
        });
    }
}

// ========== УПРАВЛЕНИЕ АВТОРИЗАЦИЕЙ ==========
const modal = document.getElementById('authModal');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const resetForm = document.getElementById('resetForm');
const modalTitle = document.getElementById('modalTitle');
const authMessage = document.getElementById('authMessage');

function openModal() {
    if (modal) {
        modal.style.display = 'block';
        showLoginForm();
    }
}

function closeModal() {
    if (modal) {
        modal.style.display = 'none';
        clearAuthMessage();
    }
}

function showLoginForm() {
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
    if (resetForm) resetForm.style.display = 'none';
    if (modalTitle) modalTitle.textContent = 'Вход в аккаунт';
    clearAuthMessage();
}

function showRegisterForm() {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
    if (resetForm) resetForm.style.display = 'none';
    if (modalTitle) modalTitle.textContent = 'Регистрация';
    clearAuthMessage();
}

function showResetForm() {
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';
    if (resetForm) resetForm.style.display = 'block';
    if (modalTitle) modalTitle.textContent = 'Сброс пароля';
    clearAuthMessage();
}

function showAuthMessage(text, isError = true) {
    if (authMessage) {
        authMessage.textContent = text;
        authMessage.className = `auth-message ${isError ? 'error' : 'success'}`;
        authMessage.style.display = 'block';
        setTimeout(() => {
            if (authMessage) {
                authMessage.style.display = 'none';
            }
        }, 3000);
    }
}

function clearAuthMessage() {
    if (authMessage) {
        authMessage.textContent = '';
        authMessage.className = 'auth-message';
        authMessage.style.display = 'none';
    }
}

async function updateUserUI() {
    const user = getCurrentUser();
    const authButtons = document.getElementById('authButtons');
    const userMenuContainer = document.getElementById('userMenuContainer');
    const userMenu = document.getElementById('userMenu');
    const userName = document.getElementById('userName');
    
    if (user) {
        if (authButtons) authButtons.style.display = 'none';
        if (userMenuContainer && userMenu) {
            userMenuContainer.appendChild(userMenu);
            userMenu.style.display = 'block';
            if (userName) userName.textContent = user.username || user.email?.split('@')[0] || 'Пользователь';
        }
    } else {
        if (authButtons) authButtons.style.display = 'block';
        if (userMenu) userMenu.style.display = 'none';
    }
}

async function handleRegister() {
    const username = document.getElementById('regUsername')?.value;
    const email = document.getElementById('regEmail')?.value;
    const password = document.getElementById('regPassword')?.value;
    const confirmPassword = document.getElementById('regConfirmPassword')?.value;
    
    if (!username || !email || !password) {
        showAuthMessage('Заполните все поля');
        return;
    }
    
    if (password !== confirmPassword) {
        showAuthMessage('Пароли не совпадают');
        return;
    }
    
    if (password.length < 6) {
        showAuthMessage('Пароль должен содержать минимум 6 символов');
        return;
    }
    
    const result = await registerUser(email, password, username);
    
    if (result.success) {
        showAuthMessage('Регистрация успешна! Теперь войдите в аккаунт.', false);
        setTimeout(() => {
            showLoginForm();
        }, 2000);
    } else {
        showAuthMessage(result.error || 'Ошибка регистрации');
    }
}

async function handleLogin() {
    const email = document.getElementById('loginEmail')?.value;
    const password = document.getElementById('loginPassword')?.value;
    
    if (!email || !password) {
        showAuthMessage('Заполните все поля');
        return;
    }
    
    const result = await loginUser(email, password);
    
    if (result.success) {
        showAuthMessage('Добро пожаловать!', false);
        setTimeout(async () => {
            closeModal();
            await updateUserUI();
            await loadRentals();
        }, 1500);
    } else {
        showAuthMessage(result.error || 'Неверный email или пароль');
    }
}

async function handleLogout() {
    const result = await logoutUser();
    if (result.success) {
        showToast('Выход из аккаунта', 'Вы успешно вышли', 'success');
        await updateUserUI();
        allRentals = [];
        filteredRentals = [];
        renderRentals();
        cart = [];
        saveCart();
    } else {
        alert('Ошибка выхода: ' + result.error);
    }
}

async function handleResetPassword() {
    const email = document.getElementById('resetEmail')?.value;
    
    if (!email) {
        showAuthMessage('Введите email');
        return;
    }
    
    const result = await resetPassword(email);
    
    if (result.success) {
        showAuthMessage('Инструкции по сбросу пароля отправлены на email', false);
        setTimeout(() => {
            showLoginForm();
        }, 3000);
    } else {
        showAuthMessage(result.error || 'Ошибка сброса пароля');
    }
}

function setupAuth() {
    const openModalBtn = document.getElementById('openLoginModal');
    if (openModalBtn) openModalBtn.addEventListener('click', openModal);
    
    const closeBtn = document.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    const forgotPassword = document.getElementById('forgotPassword');
    const backToLogin = document.getElementById('backToLogin');
    
    if (switchToRegister) switchToRegister.addEventListener('click', (e) => {
        e.preventDefault();
        showRegisterForm();
    });
    
    if (switchToLogin) switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });
    
    if (forgotPassword) forgotPassword.addEventListener('click', (e) => {
        e.preventDefault();
        showResetForm();
    });
    
    if (backToLogin) backToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });
    
    const registerBtn = document.getElementById('registerBtn');
    const loginBtn = document.getElementById('loginBtn');
    const resetBtn = document.getElementById('resetBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (resetBtn) resetBtn.addEventListener('click', handleResetPassword);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    const inputs = document.querySelectorAll('.auth-form input');
    inputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (loginForm && loginForm.style.display !== 'none') handleLogin();
                else if (registerForm && registerForm.style.display !== 'none') handleRegister();
                else if (resetForm && resetForm.style.display !== 'none') handleResetPassword();
            }
        });
    });
}

// ========== ИНИЦИАЛИЗАЦИЯ ==========
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Страница аренды загружена, инициализация...');
    
    setupAuth();
    
    await checkCurrentUser();
    await updateUserUI();
    await loadRentals();
    
    setupSearch();
    mobileMenu();
    
    // Фильтры
    document.getElementById('applyFiltersBtn').addEventListener('click', filterRentals);
    document.getElementById('resetFiltersBtn').addEventListener('click', () => {
        document.getElementById('statusFilter').value = 'all';
        filterRentals();
    });
    
    // Корзина
    const cartBtn = document.querySelector('.cart-btn');
    if (cartBtn) {
        cartBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCart();
        });
    }
    
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('cartDropdown');
        const cartButton = document.querySelector('.cart-btn');
        if (dropdown && cartButton && !cartButton.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', checkout);
    
    updateCartBadge();
});