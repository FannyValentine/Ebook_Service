// favorites.js
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
let favorites = [];
let allBooks = [];
let filteredBooks = [];

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

// ========== ЗАГРУЗКА КНИГ ==========
async function loadBooksFromSupabase() {
    try {
        const { data: books, error } = await supabase
            .from('books')
            .select('*');
        
        if (error) {
            console.error('Ошибка загрузки:', error);
            return [];
        }
        
        return books || [];
    } catch (error) {
        console.error('Ошибка подключения:', error);
        return [];
    }
}

// ========== РАБОТА С ИЗБРАННЫМ ==========
async function loadFavorites() {
    const user = getCurrentUser();
    if (!user) {
        favorites = [];
        return;
    }
    
    try {
        const { data, error } = await supabase
            .from('favorites')
            .select('book_id')
            .eq('user_id', user.id);
        
        if (error) {
            console.error('Ошибка загрузки избранного:', error);
            favorites = [];
            return;
        }
        
        favorites = data.map(item => item.book_id);
        return favorites;
    } catch (error) {
        console.error('Ошибка:', error);
        favorites = [];
        return [];
    }
}

async function addToFavorites(bookId) {
    const user = getCurrentUser();
    if (!user) {
        showToast('Требуется авторизация', 'Войдите, чтобы добавить в избранное', 'error');
        setTimeout(() => openModal(), 1500);
        return false;
    }
    
    try {
        const { error } = await supabase
            .from('favorites')
            .insert([{ user_id: user.id, book_id: bookId }]);
        
        if (error) {
            console.error('Ошибка добавления в избранное:', error);
            showToast('Ошибка', 'Не удалось добавить в избранное', 'error');
            return false;
        }
        
        favorites.push(bookId);
        showToast('Добавлено в избранное', 'Книга сохранена в избранном', 'success');
        // Исправлено: сохраняем книги и перерисовываем
        renderBooks();
        return true;
    } catch (error) {
        console.error('Ошибка:', error);
        return false;
    }
}

async function removeFromFavorites(bookId) {
    const user = getCurrentUser();
    if (!user) return false;
    
    try {
        const { error } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', user.id)
            .eq('book_id', bookId);
        
        if (error) {
            console.error('Ошибка удаления из избранного:', error);
            showToast('Ошибка', 'Не удалось удалить из избранного', 'error');
            return false;
        }
        
        favorites = favorites.filter(id => id !== bookId);
        showToast('Удалено из избранного', 'Книга удалена из избранного', 'success');
        // Исправлено: сохраняем книги и перерисовываем
        renderBooks();
        return true;
    } catch (error) {
        console.error('Ошибка:', error);
        return false;
    }
}

function isFavorite(bookId) {
    return favorites.includes(bookId);
}

// ========== ОТРИСОВКА ==========
function renderBooks() {
    const container = document.getElementById('booksGrid');
    const emptyState = document.getElementById('emptyState');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!container) return;
    
    // Проверяем, что allBooks загружены
    if (!allBooks || allBooks.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px;">📚 Загрузка книг...</div>';
        return;
    }
    
    // Фильтруем книги: показываем только избранные
    filteredBooks = allBooks.filter(book => isFavorite(book.id));
    
    if (filteredBooks.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        if (resultsCount) resultsCount.textContent = 'Нет избранных книг';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    if (resultsCount) resultsCount.textContent = `${filteredBooks.length} книг в избранном`;
    
    container.innerHTML = filteredBooks.map(book => `
        <div class="book-card" data-id="${book.id}">
            <div class="book-cover">
                <img src="${book.cover_image || 'https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖+No+Cover'}" 
                     alt="${book.title}" 
                     onerror="this.src='https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖+No+Cover'">
            </div>
            <div class="book-info">
                <div class="book-header">
                    <div class="book-title">${escapeHtml(book.title)}</div>
                    <button class="favorite-btn active" data-id="${book.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="book-author">${escapeHtml(book.author)}</div>
                <div class="book-description">${book.description ? escapeHtml(book.description.substring(0, 80)) + '...' : ''}</div>
                <div class="book-actions">
                    <span class="price">${book.purchase_price || book.price} ₽</span>
                    <div>
                        ${book.rent_price ? `<button class="rent-btn" data-id="${book.id}" data-title="${escapeHtml(book.title)}" data-author="${escapeHtml(book.author)}" data-cover="${book.cover_image || ''}" data-price="${book.rent_price}">Аренда ${book.rent_price} ₽</button>` : ''}
                        <button class="buy-btn" data-id="${book.id}" data-title="${escapeHtml(book.title)}" data-author="${escapeHtml(book.author)}" data-cover="${book.cover_image || ''}" data-price="${book.purchase_price || book.price}">Купить</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    
    // Обработчики для кнопок избранного
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const bookId = parseInt(btn.dataset.id);
            await removeFromFavorites(bookId);
        });
    });
    
    // Обработчики для кнопок корзины
    document.querySelectorAll('.rent-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const book = {
                id: parseInt(btn.dataset.id),
                title: btn.dataset.title,
                author: btn.dataset.author,
                cover_image: btn.dataset.cover
            };
            const price = parseInt(btn.dataset.price);
            addToCart(book, 'rent', price);
        });
    });
    
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const book = {
                id: parseInt(btn.dataset.id),
                title: btn.dataset.title,
                author: btn.dataset.author,
                cover_image: btn.dataset.cover
            };
            const price = parseInt(btn.dataset.price);
            addToCart(book, 'buy', price);
        });
    });
}

// ========== ПОИСК В ИЗБРАННОМ ==========
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const query = e.target.value.toLowerCase();
                const container = document.getElementById('booksGrid');
                const emptyState = document.getElementById('emptyState');
                const resultsCount = document.getElementById('resultsCount');
                
                if (!allBooks || allBooks.length === 0) {
                    return;
                }
                
                const filtered = allBooks.filter(book => 
                    isFavorite(book.id) &&
                    (book.title.toLowerCase().includes(query) || 
                     book.author.toLowerCase().includes(query))
                );
                
                if (filtered.length === 0) {
                    container.innerHTML = '';
                    if (emptyState) {
                        emptyState.style.display = 'block';
                        emptyState.innerHTML = `
                            <i class="fas fa-search" style="font-size: 4rem; color: #cbd5e1; margin-bottom: 20px; display: block;"></i>
                            <h2>Ничего не найдено</h2>
                            <p>Попробуйте изменить поисковый запрос</p>
                        `;
                    }
                    if (resultsCount) resultsCount.textContent = 'Ничего не найдено';
                } else {
                    if (emptyState) emptyState.style.display = 'none';
                    if (resultsCount) resultsCount.textContent = `${filtered.length} книг в избранном`;
                    container.innerHTML = filtered.map(book => `
                        <div class="book-card" data-id="${book.id}">
                            <div class="book-cover">
                                <img src="${book.cover_image || 'https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖+No+Cover'}" 
                                     alt="${book.title}" 
                                     onerror="this.src='https://placehold.co/300x400/e2e8f0/1e3c3a?text=📖+No+Cover'">
                            </div>
                            <div class="book-info">
                                <div class="book-header">
                                    <div class="book-title">${escapeHtml(book.title)}</div>
                                    <button class="favorite-btn active" data-id="${book.id}">
                                        <i class="fas fa-heart"></i>
                                    </button>
                                </div>
                                <div class="book-author">${escapeHtml(book.author)}</div>
                                <div class="book-description">${book.description ? escapeHtml(book.description.substring(0, 80)) + '...' : ''}</div>
                                <div class="book-actions">
                                    <span class="price">${book.purchase_price || book.price} ₽</span>
                                    <div>
                                        ${book.rent_price ? `<button class="rent-btn" data-id="${book.id}" data-title="${escapeHtml(book.title)}" data-author="${escapeHtml(book.author)}" data-cover="${book.cover_image || ''}" data-price="${book.rent_price}">Аренда ${book.rent_price} ₽</button>` : ''}
                                        <button class="buy-btn" data-id="${book.id}" data-title="${escapeHtml(book.title)}" data-author="${escapeHtml(book.author)}" data-cover="${book.cover_image || ''}" data-price="${book.purchase_price || book.price}">Купить</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('');
                    
                    document.querySelectorAll('.favorite-btn').forEach(btn => {
                        btn.addEventListener('click', async (e) => {
                            e.stopPropagation();
                            const bookId = parseInt(btn.dataset.id);
                            await removeFromFavorites(bookId);
                        });
                    });
                    
                    document.querySelectorAll('.rent-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const book = {
                                id: parseInt(btn.dataset.id),
                                title: btn.dataset.title,
                                author: btn.dataset.author,
                                cover_image: btn.dataset.cover
                            };
                            const price = parseInt(btn.dataset.price);
                            addToCart(book, 'rent', price);
                        });
                    });
                    
                    document.querySelectorAll('.buy-btn').forEach(btn => {
                        btn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            const book = {
                                id: parseInt(btn.dataset.id),
                                title: btn.dataset.title,
                                author: btn.dataset.author,
                                cover_image: btn.dataset.cover
                            };
                            const price = parseInt(btn.dataset.price);
                            addToCart(book, 'buy', price);
                        });
                    });
                }
            }, 500);
        });
    }
}

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
            userMenuContainer.innerHTML = '';
            userMenuContainer.appendChild(userMenu);
            userMenu.style.display = 'block';
            if (userName) userName.textContent = user.username || user.email?.split('@')[0] || 'Пользователь';
            
            const userInfo = userMenu.querySelector('.user-info');
            const dropdown = userMenu.querySelector('.user-dropdown');
            
            const newUserInfo = userInfo.cloneNode(true);
            userInfo.parentNode.replaceChild(newUserInfo, userInfo);
            
            newUserInfo.addEventListener('click', function(e) {
                e.stopPropagation();
                document.querySelectorAll('.user-dropdown.show').forEach(d => {
                    if (d !== dropdown) d.classList.remove('show');
                });
                dropdown.classList.toggle('show');
            });
            
            document.removeEventListener('click', window._closeUserMenu);
            window._closeUserMenu = function(e) {
                if (!userMenu.contains(e.target)) {
                    dropdown.classList.remove('show');
                }
            };
            document.addEventListener('click', window._closeUserMenu);
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
            await loadFavorites();
            allBooks = await loadBooksFromSupabase();
            renderBooks();
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
        favorites = [];
        allBooks = await loadBooksFromSupabase();
        renderBooks();
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
    console.log('🚀 Избранное загружено, инициализация...');
    
    setupAuth();
    
    await checkCurrentUser();
    await updateUserUI();
    await loadFavorites();
    
    allBooks = await loadBooksFromSupabase();
    renderBooks();
    
    setupSearch();
    mobileMenu();
    
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